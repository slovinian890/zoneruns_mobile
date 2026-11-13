-- ============================================================
-- Restore Ghost Run support (012_ghost_run.sql) on top of the hex-defense
-- claim_territory_from_run from 012_hex_defense_levels.sql.
--
-- Both migrations landed around the same time from two different sessions
-- working on this project concurrently, each doing `create or replace
-- function public.claim_territory_from_run(...)` against the *same*
-- signature — the later one (hex_defense_levels) fully replaced the
-- earlier one's body, silently dropping the is_ghost check with no error
-- on either side (full-body replace, not a merge).
--
-- This migration is the hex-defense version verbatim, with only two
-- additions: reading is_ghost off the run, and gating the
-- attack_notifications insert in the victim loop on it — exactly what
-- ghost_run.sql did to the pre-hex-defense version. Everything about hex
-- claiming, defense levels, and the daily limit is unchanged.
-- ============================================================

create or replace function public.claim_territory_from_run(p_run_id uuid, p_place_label text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
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
  v_poly3857 extensions.geometry;
  v_area_m2 numeric;
  v_color text;
  v_hex_sz double precision := public.hex_size_m();
  v_hex_area_m2 numeric := extensions.ST_Area(public.hex_polygon(0, 0)::extensions.geography);
  v_gained_hexes int;
  v_weakened_hexes int;
  v_victim record;
  v_affected_user uuid;
  v_union_geom extensions.geometry;
  v_hex_count int;
  v_stolen jsonb := '[]'::jsonb;
  min_area_m2 constant numeric := 300;
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

  -- One successful claim-run per player per day. Checked against
  -- territory_claims, which only ever gains a row on success below, so a
  -- run that fails validation (not a loop, too small, ...) never burns
  -- the day's slot.
  if exists (
    select 1 from public.territory_claims
    where user_id = v_user_id and created_at::date = current_date
  ) then
    return jsonb_build_object('success', false, 'reason', 'daily_limit_reached');
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

  -- Every hex the claimed loop actually touches, with its state *before*
  -- this run (owner/level), snapshotted so the upsert below can be
  -- compared against afterward. Same col/row windowing as
  -- get_hexes_in_bounds, just driven by the polygon's own bbox instead of
  -- the map viewport, and filtered to a real ST_Intersects.
  v_poly3857 := extensions.ST_Transform(v_polygon, 3857);

  create temporary table tmp_before_hex (
    hex_col int, hex_row int, owner uuid, lvl smallint
  ) on commit drop;

  insert into tmp_before_hex (hex_col, hex_row, owner, lvl)
  with cols as (
    select generate_series(
      floor(extensions.ST_XMin(v_poly3857) / (1.5 * v_hex_sz))::int - 1,
      ceil(extensions.ST_XMax(v_poly3857) / (1.5 * v_hex_sz))::int + 1
    ) as col
  ),
  cells as (
    select cols.col, gs.h_row
    from cols,
    lateral generate_series(
      floor(least(
        extensions.ST_YMin(v_poly3857) / (v_hex_sz * sqrt(3.0)) - cols.col / 2.0,
        extensions.ST_YMax(v_poly3857) / (v_hex_sz * sqrt(3.0)) - cols.col / 2.0
      ))::int - 1,
      ceil(greatest(
        extensions.ST_YMin(v_poly3857) / (v_hex_sz * sqrt(3.0)) - cols.col / 2.0,
        extensions.ST_YMax(v_poly3857) / (v_hex_sz * sqrt(3.0)) - cols.col / 2.0
      ))::int + 1
    ) as gs(h_row)
  )
  select cells.col, cells.h_row, hc.user_id, hc.level
  from cells
  left join public.hex_claims hc on hc.hex_col = cells.col and hc.hex_row = cells.h_row
  where extensions.ST_Intersects(public.hex_polygon(cells.col, cells.h_row), v_polygon)
  limit 5000;

  -- Resolve every touched hex in one upsert: unclaimed -> insert at level
  -- 2; already yours -> heal to level 2; someone else's at level 2 ->
  -- knocked down to level 1 (ownership unchanged); someone else's at
  -- level 1 -> flips to you at level 2.
  insert into public.hex_claims (hex_col, hex_row, user_id, run_id, level, claimed_at)
  select hex_col, hex_row, v_user_id, p_run_id, 2, now()
  from tmp_before_hex
  on conflict (hex_col, hex_row) do update
  set
    user_id = case
      when hex_claims.user_id = v_user_id then hex_claims.user_id
      when hex_claims.level <= 1 then v_user_id
      else hex_claims.user_id
    end,
    level = case
      when hex_claims.user_id = v_user_id then 2
      when hex_claims.level <= 1 then 2
      else hex_claims.level - 1
    end,
    run_id = p_run_id,
    claimed_at = now();

  -- Freshly-unclaimed hexes and ones that just flipped to you both count
  -- as "gained"; a hex you already owned (healed) doesn't, and neither
  -- does one you merely weakened but didn't take.
  select count(*) into v_gained_hexes
  from tmp_before_hex
  where owner is null or (owner <> v_user_id and lvl = 1);

  select count(*) into v_weakened_hexes
  from tmp_before_hex
  where owner is not null and owner <> v_user_id and lvl = 2;

  -- One attack_notifications row per victim who actually lost hexes this
  -- run (not for ones merely weakened) — zones_lost is now an exact hex
  -- count instead of an area/min-claim-size estimate. Ghost runs still
  -- flip the hexes below; they just skip alerting the victim.
  for v_victim in
    select owner as victim_id, count(*) as flipped_count
    from tmp_before_hex
    where owner is not null and owner <> v_user_id and lvl = 1
    group by owner
  loop
    v_stolen := v_stolen || jsonb_build_object(
      'user_id', v_victim.victim_id,
      'area_m2', round((v_victim.flipped_count * v_hex_area_m2)::numeric, 1),
      'zones_lost', v_victim.flipped_count
    );

    if not v_is_ghost then
      insert into public.attack_notifications
        (victim_id, attacker_id, attacker_username, attacker_display_name, run_id, area_m2, zones_lost, place_label)
      values
        (v_victim.victim_id, v_user_id, v_username, v_display_name, p_run_id,
         round((v_victim.flipped_count * v_hex_area_m2)::numeric, 1), v_victim.flipped_count, p_place_label);
    end if;
  end loop;

  -- Rebuild user_territory (what the map/stats/leaderboards actually
  -- read) for everyone whose owned-hex set changed this run: the runner,
  -- plus any victim who lost at least one hex.
  for v_affected_user in
    select v_user_id
    union
    select distinct owner from tmp_before_hex where owner is not null and owner <> v_user_id and lvl = 1
  loop
    select extensions.ST_Multi(extensions.ST_Union(public.hex_polygon(hex_col, hex_row))), count(*)
      into v_union_geom, v_hex_count
      from public.hex_claims
      where user_id = v_affected_user;

    if v_hex_count > 0 then
      insert into public.user_territory (user_id, geom, area_m2, color, updated_at)
      values (v_affected_user, v_union_geom, extensions.ST_Area(v_union_geom::extensions.geography),
              coalesce((select trail_color from public.profiles where id = v_affected_user), '#5B7EA4'), now())
      on conflict (user_id) do update
        set geom = excluded.geom, area_m2 = excluded.area_m2, updated_at = now();
    else
      delete from public.user_territory where user_id = v_affected_user;
    end if;
  end loop;

  insert into public.territory_claims (user_id, run_id, geom, area_m2, stolen_from)
  values (v_user_id, p_run_id, v_polygon, round((v_gained_hexes * v_hex_area_m2)::numeric, 1), v_stolen);

  return jsonb_build_object(
    'success', true,
    'claimed_area_m2', round((v_gained_hexes * v_hex_area_m2)::numeric, 1),
    'weakened_count', v_weakened_hexes,
    'total_area_m2', round(coalesce((select area_m2 from public.user_territory where user_id = v_user_id), 0)::numeric, 1),
    'stolen', v_stolen
  );
end;
$function$;

revoke all on function public.claim_territory_from_run(uuid, text) from public;
revoke all on function public.claim_territory_from_run(uuid, text) from anon;
grant execute on function public.claim_territory_from_run(uuid, text) to authenticated;
