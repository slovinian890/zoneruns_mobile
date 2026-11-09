-- ============================================================
-- "Under attack" notifications: fired whenever a run steals territory
-- from another runner.
--
-- A row is inserted transactionally inside claim_territory_from_run —
-- the same place that already computes who lost what to whom — so the
-- record of "this happened" is always correct even if push delivery
-- itself fails later. Push (via the send-attack-push Edge Function) and
-- the realtime in-app banner are both best-effort deliveries layered on
-- top of this table, not the source of truth.
-- ============================================================

-- One push token per installed app (re-upserted on login/app start).
-- Keyed by token, not (user_id, token): if the same device later logs
-- into a different account, the upsert just reassigns ownership.
create table if not exists public.push_tokens (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  token text not null unique,
  platform text,
  updated_at timestamptz default now() not null
);

create index if not exists idx_push_tokens_user on public.push_tokens(user_id);

alter table public.push_tokens enable row level security;

create policy "Users manage their own push tokens"
on public.push_tokens for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Attacker identity is denormalized (same pattern as user_territory.color)
-- so a victim's notification list never needs a join and still reads fine
-- even if the attacker later renames.
create table if not exists public.attack_notifications (
  id uuid default gen_random_uuid() primary key,
  victim_id uuid references public.profiles(id) on delete cascade not null,
  attacker_id uuid references public.profiles(id) on delete cascade not null,
  attacker_username text not null,
  attacker_display_name text,
  run_id uuid references public.runs(id) on delete cascade,
  area_m2 numeric not null,
  zones_lost integer not null default 1,
  place_label text,
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz default now() not null,
  check (victim_id <> attacker_id)
);

create index if not exists idx_attack_notifications_victim on public.attack_notifications(victim_id, created_at desc);
create index if not exists idx_attack_notifications_run on public.attack_notifications(run_id);

alter table public.attack_notifications enable row level security;

-- No insert/delete policy for regular users on purpose, matching
-- territory_claims: the only writer is the SECURITY DEFINER function
-- below (runs as the table owner, which bypasses RLS) and the
-- send-attack-push Edge Function (service_role, also bypasses RLS).
create policy "Victims can view their own attack notifications"
on public.attack_notifications for select
using (auth.uid() = victim_id);

create policy "Victims can mark their own attack notifications read"
on public.attack_notifications for update
using (auth.uid() = victim_id)
with check (auth.uid() = victim_id);

-- So an open app shows the alert the instant it happens, independent of
-- push delivery (which needs FCM/APNs credentials configured in EAS).
alter publication supabase_realtime add table public.attack_notifications;

-- ── Re-create claim_territory_from_run with an optional place label and
-- attack-notification fan-out. Signature changes (uuid) -> (uuid, text),
-- so the old overload must be dropped first or it'd just sit alongside
-- the new one, still reachable, with none of this logic. ─────────────
drop function if exists public.claim_territory_from_run(uuid);

create or replace function public.claim_territory_from_run(p_run_id uuid, p_place_label text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_username text;
  v_display_name text;
  v_route jsonb;
  v_coords jsonb;
  v_n int;
  v_first extensions.geometry;
  v_last extensions.geometry;
  v_close_dist_m numeric;
  v_ring extensions.geometry;
  v_polygon extensions.geometry;
  v_area_m2 numeric;
  v_color text;
  v_existing extensions.geometry;
  v_new_total extensions.geometry;
  v_victim record;
  v_stolen jsonb := '[]'::jsonb;
  v_victim_new_geom extensions.geometry;
  v_victim_lost_area numeric;
  v_zones_lost int;
  min_area_m2 constant numeric := 300; -- smallest claimable patch; also doubles as the "1 zone" yardstick for notification copy below
  close_threshold_m constant numeric := 40;
  min_points constant int := 8;
begin
  if exists (select 1 from public.territory_claims where run_id = p_run_id) then
    return jsonb_build_object('success', false, 'reason', 'already_claimed');
  end if;

  select user_id, route_data into v_user_id, v_route from public.runs where id = p_run_id;

  if v_user_id is null then
    return jsonb_build_object('success', false, 'reason', 'run_not_found');
  end if;

  if v_user_id <> auth.uid() then
    return jsonb_build_object('success', false, 'reason', 'not_owner');
  end if;

  v_coords := v_route -> 'coordinates';
  v_n := coalesce(jsonb_array_length(v_coords), 0);

  if v_n < min_points then
    return jsonb_build_object('success', false, 'reason', 'too_few_points');
  end if;

  v_first := extensions.ST_SetSRID(extensions.ST_MakePoint(
    (v_coords->0->>'longitude')::double precision,
    (v_coords->0->>'latitude')::double precision), 4326);
  v_last := extensions.ST_SetSRID(extensions.ST_MakePoint(
    (v_coords->(v_n-1)->>'longitude')::double precision,
    (v_coords->(v_n-1)->>'latitude')::double precision), 4326);

  v_close_dist_m := extensions.ST_Distance(v_first::extensions.geography, v_last::extensions.geography);

  if v_close_dist_m > close_threshold_m then
    return jsonb_build_object('success', false, 'reason', 'loop_not_closed', 'gap_m', round(v_close_dist_m::numeric, 1));
  end if;

  select extensions.ST_MakeLine(array_agg(
    extensions.ST_SetSRID(extensions.ST_MakePoint(
      (pt->>'longitude')::double precision,
      (pt->>'latitude')::double precision), 4326)
    order by ord)
    || array[v_first]
  )
  into v_ring
  from jsonb_array_elements(v_coords) with ordinality as t(pt, ord);

  v_polygon := extensions.ST_MakeValid(extensions.ST_MakePolygon(v_ring));
  v_polygon := extensions.ST_CollectionExtract(v_polygon, 3);
  v_polygon := extensions.ST_Multi(v_polygon);

  if v_polygon is null or extensions.ST_IsEmpty(v_polygon) then
    return jsonb_build_object('success', false, 'reason', 'invalid_polygon');
  end if;

  v_area_m2 := extensions.ST_Area(v_polygon::extensions.geography);

  if v_area_m2 < min_area_m2 then
    return jsonb_build_object('success', false, 'reason', 'area_too_small', 'area_m2', round(v_area_m2::numeric, 1));
  end if;

  select trail_color, username, display_name into v_color, v_username, v_display_name
  from public.profiles where id = v_user_id;
  v_color := coalesce(v_color, '#5B7EA4');

  -- Steal from every other user whose territory overlaps the new polygon
  for v_victim in
    select user_id, geom from public.user_territory
    where user_id <> v_user_id and extensions.ST_Intersects(geom, v_polygon)
  loop
    v_victim_new_geom := extensions.ST_Difference(v_victim.geom, v_polygon);
    v_victim_lost_area := extensions.ST_Area(v_victim.geom::extensions.geography) - extensions.ST_Area(v_victim_new_geom::extensions.geography);

    if v_victim_lost_area > 1 then
      if v_victim_new_geom is null or extensions.ST_IsEmpty(v_victim_new_geom) then
        delete from public.user_territory where user_id = v_victim.user_id;
      else
        update public.user_territory
          set geom = extensions.ST_Multi(v_victim_new_geom),
              area_m2 = extensions.ST_Area(v_victim_new_geom::extensions.geography),
              updated_at = now()
          where user_id = v_victim.user_id;
      end if;

      -- "Zones" aren't a real grid in this engine (that was the old,
      -- replaced hex system) — this just buckets the stolen area into the
      -- same unit as the minimum claim size, purely so push copy can say
      -- "took 3 zones" instead of "took 914 m²".
      v_zones_lost := greatest(1, round(v_victim_lost_area / min_area_m2)::int);

      insert into public.attack_notifications
        (victim_id, attacker_id, attacker_username, attacker_display_name, run_id, area_m2, zones_lost, place_label)
      values
        (v_victim.user_id, v_user_id, v_username, v_display_name, p_run_id, round(v_victim_lost_area::numeric, 1), v_zones_lost, p_place_label);

      v_stolen := v_stolen || jsonb_build_object(
        'user_id', v_victim.user_id,
        'area_m2', round(v_victim_lost_area::numeric, 1),
        'zones_lost', v_zones_lost
      );
    end if;
  end loop;

  -- Merge into claimer's own territory
  select geom into v_existing from public.user_territory where user_id = v_user_id;
  v_new_total := extensions.ST_Multi(extensions.ST_Union(
    coalesce(v_existing, extensions.ST_GeomFromText('MULTIPOLYGON EMPTY', 4326)),
    v_polygon
  ));

  insert into public.user_territory (user_id, geom, area_m2, color, updated_at)
  values (v_user_id, v_new_total, extensions.ST_Area(v_new_total::extensions.geography), v_color, now())
  on conflict (user_id) do update
    set geom = excluded.geom, area_m2 = excluded.area_m2, color = excluded.color, updated_at = now();

  insert into public.territory_claims (user_id, run_id, geom, area_m2, stolen_from)
  values (v_user_id, p_run_id, v_polygon, v_area_m2, v_stolen);

  return jsonb_build_object(
    'success', true,
    'claimed_area_m2', round(v_area_m2::numeric, 1),
    'total_area_m2', round(extensions.ST_Area(v_new_total::extensions.geography)::numeric, 1),
    'stolen', v_stolen
  );
end;
$$;

grant execute on function public.claim_territory_from_run(uuid, text) to authenticated;

-- Supabase's own ALTER DEFAULT PRIVILEGES grant on new functions, plus the
-- separate implicit PUBLIC-pseudo-role grant, both need revoking by name —
-- `revoke ... from public` alone is not enough (see migration 005/006).
revoke execute on function public.claim_territory_from_run(uuid, text) from public, anon;
