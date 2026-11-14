-- ============================================================
-- Explicit daily limit on Ghost Run.
--
-- Ghost Run (012_ghost_run.sql) has always only had one effect: skip the
-- attack_notifications insert for victims. Today it's *implicitly* capped
-- at once a day purely as a side effect of claim_territory_from_run's
-- unrelated "one successful claim per day" check (daily_limit_reached),
-- which runs first and blocks any second claim attempt outright. That
-- coupling is an accident, not a rule — if the claim-per-day limit is ever
-- relaxed, Ghost Run would silently become unlimited along with it.
--
-- This makes it an explicit, independent limit: user_stats.
-- last_ghost_run_date (same shape as last_login_date from daily_login).
-- A run requested as ghost downgrades to non-ghost (attack_notifications
-- fire normally) if the player already has a ghost claim on record for
-- today — the run and its territory capture still work exactly the same
-- either way, only the privacy perk is what's gated. Only a *successful*
-- claim consumes the day's allowance, same philosophy as the claim limit
-- itself (a failed/non-loop run costs nothing).
-- ============================================================

alter table public.user_stats add column if not exists last_ghost_run_date date;

create or replace function public.claim_territory_from_run(p_run_id uuid, p_place_label text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_user_id uuid;
  v_group_id uuid;
  v_username text;
  v_display_name text;
  v_route jsonb;
  v_is_ghost boolean;
  v_last_ghost_date date;
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
  v_neutralized_hexes int;
  v_bounty_earned int;
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

  if exists (
    select 1 from public.territory_claims
    where user_id = v_user_id and created_at::date = current_date
  ) then
    return jsonb_build_object('success', false, 'reason', 'daily_limit_reached');
  end if;

  -- Ghost Run's own daily allowance, independent of the claim limit above.
  -- Already used today -> this claim still proceeds, just not as a ghost:
  -- victims get notified normally.
  if v_is_ghost then
    select last_ghost_run_date into v_last_ghost_date from public.user_stats where user_id = v_user_id;
    if v_last_ghost_date = current_date then
      v_is_ghost := false;
    end if;
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

  select trail_color, username, display_name, active_group_id into v_color, v_username, v_display_name, v_group_id
  from public.profiles where id = v_user_id;
  v_color := coalesce(v_color, '#5B7EA4');

  v_poly3857 := extensions.ST_Transform(v_polygon, 3857);

  create temporary table tmp_before_hex (
    hex_col int, hex_row int, owner uuid, ogid uuid, lvl smallint
  ) on commit drop;

  insert into tmp_before_hex (hex_col, hex_row, owner, ogid, lvl)
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
  select cells.col, cells.h_row, hc.user_id, hc.owner_group_id, hc.level
  from cells
  left join public.hex_claims hc on hc.hex_col = cells.col and hc.hex_row = cells.h_row
  where extensions.ST_Intersects(public.hex_polygon(cells.col, cells.h_row), v_polygon)
  limit 5000;

  insert into public.hex_claims (hex_col, hex_row, user_id, run_id, level, max_level, owner_group_id, claimed_at)
  select hex_col, hex_row, v_user_id, p_run_id, 2, 2, v_group_id, now()
  from tmp_before_hex
  on conflict (hex_col, hex_row) do update
  set
    level = case
      when public.is_hex_ally(hex_claims.user_id, hex_claims.owner_group_id, v_user_id, v_group_id) then hex_claims.max_level
      else hex_claims.level - 1
    end,
    owner_group_id = case
      when public.is_hex_ally(hex_claims.user_id, hex_claims.owner_group_id, v_user_id, v_group_id) then v_group_id
      else hex_claims.owner_group_id
    end,
    user_id = case
      when public.is_hex_ally(hex_claims.user_id, hex_claims.owner_group_id, v_user_id, v_group_id) then v_user_id
      else hex_claims.user_id
    end,
    run_id = p_run_id,
    claimed_at = now()
  where public.is_hex_ally(hex_claims.user_id, hex_claims.owner_group_id, v_user_id, v_group_id) or hex_claims.level > 1;

  delete from public.hex_claims hc
  using tmp_before_hex t
  where hc.hex_col = t.hex_col and hc.hex_row = t.hex_row
    and t.owner is not null and not public.is_hex_ally(t.owner, t.ogid, v_user_id, v_group_id) and t.lvl = 1;

  select coalesce(sum(hb.amount), 0) into v_bounty_earned
  from public.hex_bounties hb
  join tmp_before_hex t on t.hex_col = hb.hex_col and t.hex_row = hb.hex_row
  where t.owner is not null and not public.is_hex_ally(t.owner, t.ogid, v_user_id, v_group_id) and t.lvl = 1;

  if v_bounty_earned > 0 then
    update public.user_stats set coins = coins + v_bounty_earned where user_id = v_user_id;

    insert into public.coin_transactions (user_id, run_id, amount, distance_km, kind)
    values (v_user_id, p_run_id, v_bounty_earned, 0, 'bounty_payout');

    delete from public.hex_bounties hb
    using tmp_before_hex t
    where hb.hex_col = t.hex_col and hb.hex_row = t.hex_row
      and t.owner is not null and not public.is_hex_ally(t.owner, t.ogid, v_user_id, v_group_id) and t.lvl = 1;
  end if;

  select count(*) into v_gained_hexes from tmp_before_hex where owner is null;

  select count(*) into v_weakened_hexes
  from tmp_before_hex
  where owner is not null and not public.is_hex_ally(owner, ogid, v_user_id, v_group_id) and lvl > 1;

  select count(*) into v_neutralized_hexes
  from tmp_before_hex
  where owner is not null and not public.is_hex_ally(owner, ogid, v_user_id, v_group_id) and lvl = 1;

  for v_victim in
    select owner as victim_id, count(*) as flipped_count
    from tmp_before_hex
    where owner is not null and not public.is_hex_ally(owner, ogid, v_user_id, v_group_id) and lvl = 1
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

  for v_affected_user in
    select v_user_id
    union
    select distinct owner from tmp_before_hex where owner is not null and not public.is_hex_ally(owner, ogid, v_user_id, v_group_id) and lvl = 1
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

  -- Only a claim that actually proceeds as ghost (not downgraded above)
  -- spends today's allowance.
  if v_is_ghost then
    update public.user_stats set last_ghost_run_date = current_date where user_id = v_user_id;
  end if;

  insert into public.territory_claims (user_id, run_id, geom, area_m2, stolen_from)
  values (v_user_id, p_run_id, v_polygon, round((v_gained_hexes * v_hex_area_m2)::numeric, 1), v_stolen);

  return jsonb_build_object(
    'success', true,
    'claimed_area_m2', round((v_gained_hexes * v_hex_area_m2)::numeric, 1),
    'weakened_count', v_weakened_hexes,
    'neutralized_count', v_neutralized_hexes,
    'bounty_earned', v_bounty_earned,
    'total_area_m2', round(coalesce((select area_m2 from public.user_territory where user_id = v_user_id), 0)::numeric, 1),
    'stolen', v_stolen,
    'ghost_active', v_is_ghost
  );
end;
$function$;

revoke all on function public.claim_territory_from_run(uuid, text) from public;
revoke all on function public.claim_territory_from_run(uuid, text) from anon;
grant execute on function public.claim_territory_from_run(uuid, text) to authenticated;
