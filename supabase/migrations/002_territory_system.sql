-- ============================================================
-- ZoneRuns territory system: closed-loop polygon capture + steal
--
-- Replaces the old client-side hex-grid approximation. A run's route is
-- turned into a real polygon once it closes a loop (end point comes back
-- near its own start). That polygon is unioned into the runner's owned
-- MultiPolygon and subtracted from any other runner's territory it
-- overlaps — ST_Difference naturally handles both "steal a piece" and
-- "steal it all" when the new polygon fully contains the victim's land.
-- ============================================================

create extension if not exists postgis with schema extensions;

-- Current owned area per user (one row per user = their live MultiPolygon)
create table if not exists public.user_territory (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  area_m2 numeric not null default 0,
  color text default '#5B7EA4',
  updated_at timestamptz default now()
);

create index if not exists idx_user_territory_geom on public.user_territory using gist (geom);

alter table public.user_territory enable row level security;

create policy "Territories are viewable by everyone"
on public.user_territory for select
using (true);

-- Append-only history of each claim (for feed/stats; not the source of truth for ownership)
create table if not exists public.territory_claims (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  run_id uuid references public.runs(id) on delete cascade,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  area_m2 numeric not null default 0,
  stolen_from jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_territory_claims_user on public.territory_claims(user_id);
create index if not exists idx_territory_claims_run on public.territory_claims(run_id);

alter table public.territory_claims enable row level security;

create policy "Territory claims are viewable by everyone"
on public.territory_claims for select
using (true);

-- ── Core capture function ──────────────────────────────────
create or replace function public.claim_territory_from_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
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
  min_area_m2 constant numeric := 300;
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

  select trail_color into v_color from public.profiles where id = v_user_id;
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

      v_stolen := v_stolen || jsonb_build_object(
        'user_id', v_victim.user_id,
        'area_m2', round(v_victim_lost_area::numeric, 1)
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

-- ── Read territories within the visible map bounds, clipped to them ──
create or replace function public.get_territories_in_bounds(
  min_lat double precision, min_lng double precision,
  max_lat double precision, max_lng double precision
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  trail_color text,
  area_m2 numeric,
  geojson text
)
language sql
stable
set search_path = public, extensions
as $$
  select
    ut.user_id,
    p.username,
    p.display_name,
    ut.color,
    ut.area_m2,
    extensions.ST_AsGeoJSON(
      extensions.ST_Intersection(ut.geom, extensions.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326))
    )
  from public.user_territory ut
  join public.profiles p on p.id = ut.user_id
  where extensions.ST_Intersects(ut.geom, extensions.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326));
$$;

-- ── Current user's own territory total (for Profile stats) ─
create or replace function public.get_my_territory_stats()
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(
    (select jsonb_build_object('area_m2', round(area_m2::numeric, 1), 'updated_at', updated_at)
     from public.user_territory where user_id = auth.uid()),
    jsonb_build_object('area_m2', 0, 'updated_at', null)
  );
$$;

grant execute on function public.claim_territory_from_run(uuid) to authenticated;
grant execute on function public.get_territories_in_bounds(double precision, double precision, double precision, double precision) to authenticated;
grant execute on function public.get_my_territory_stats() to authenticated;
