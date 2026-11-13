-- ============================================================
-- Ghost Run: an attacker-chosen flag on a run that still steals
-- territory normally, but skips the attack_notifications insert for
-- any victims — so neither the realtime in-app banner nor the push
-- (both of which only ever fire off rows in that table, written
-- transactionally inside claim_territory_from_run at the moment the
-- attacker's run is saved — see 009_attack_notifications.sql) reaches
-- the victim at all for this run's steals. Victims still see their
-- territory change on the map; they just aren't actively alerted.
-- ============================================================

alter table public.runs
  add column if not exists is_ghost boolean not null default false;

-- Re-create claim_territory_from_run (same signature as 009) with a
-- v_is_ghost lookup gating only the attack_notifications insert.
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
  v_is_ghost boolean;
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

  select user_id, route_data, is_ghost into v_user_id, v_route, v_is_ghost from public.runs where id = p_run_id;

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

      -- Ghost runs still steal the land — they just don't alert the victim.
      if not v_is_ghost then
        insert into public.attack_notifications
          (victim_id, attacker_id, attacker_username, attacker_display_name, run_id, area_m2, zones_lost, place_label)
        values
          (v_victim.user_id, v_user_id, v_username, v_display_name, p_run_id, round(v_victim_lost_area::numeric, 1), v_zones_lost, p_place_label);
      end if;

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
revoke execute on function public.claim_territory_from_run(uuid, text) from public, anon;
