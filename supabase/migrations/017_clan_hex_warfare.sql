-- ============================================================
-- Clan hex warfare.
--
-- Until now a group's "territory" was purely a derived view — the union of
-- its members' individually-owned hexes, with no clan-specific state and
-- no clan-specific actions. The hex battle mechanics added in
-- 016_fortify_and_bounty.sql (defense levels, fortify, bounty, neutral-on-
-- defeat) were individual-only; hex-battle-map.tsx even says so in its own
-- header comment. This migration gives clans the same hex-level combat
-- solo runners have, instead of just a passive area-sum comparison.
--
-- Design: a hex can be owned by an individual OR a clan — never both. Each
-- player picks at most one "active clan" at a time (profiles.
-- active_group_id, settable via set_active_group(); null = running solo,
-- the exact existing behavior). Whatever side is active when a run claims
-- or heals a hex is who that hex counts for from then on:
--
--  * Unclaimed hex -> claimed for your active clan (or you personally, if
--    solo), same as before.
--  * A hex already held by your active clan (any teammate could have
--    captured it) -> heals to its fortified ceiling and you become the
--    most recent toucher. Any member can fortify a clan hex for the same
--    reason — defense is shared, not personal.
--  * A hex you personally own and that isn't tagged to any clan -> still
--    always heals under your own touch, and gets tagged to your current
--    active clan in the same move (so your own old solo hexes gradually
--    enlist into a clan as you re-run your routes, nothing retroactive).
--  * Anything else (an enemy's, or your own former clan's hex after you've
--    gone back to solo) -> attacked exactly like today: knocked down a
--    level, or neutralized on a finishing hit at level 1.
--
-- is_hex_ally() centralizes that "is this mine to heal" test so claim/
-- fortify/bounty all agree on it. Clans still have no coin wallet of their
-- own (per 016's header note) — fortify cost and bounty payout stay on the
-- individual acting, exactly as for a personal hex.
-- ============================================================

-- ── Schema ──────────────────────────────────────────────────
alter table public.profiles add column if not exists active_group_id uuid references public.groups(id) on delete set null;

alter table public.hex_claims add column if not exists owner_group_id uuid references public.groups(id) on delete set null;
create index if not exists idx_hex_claims_owner_group on public.hex_claims (owner_group_id) where owner_group_id is not null;

alter table public.hex_bounties add column if not exists target_group_id uuid references public.groups(id) on delete set null;

-- ── Ownership predicate shared by claim/fortify/bounty ─────────────────
-- p_owner_* describes the hex's current state; p_actor_* describes whoever
-- is touching it right now (with their own active clan, if any). An
-- unclaimed hex (p_owner_user null) is never "ally" — callers special-case
-- unclaimed separately (it's a fresh claim, not a heal).
create or replace function public.is_hex_ally(
  p_owner_user uuid, p_owner_group uuid, p_actor_user uuid, p_actor_group uuid
) returns boolean
language sql
immutable
as $$
  select case
    when p_owner_user is null then false
    when p_actor_group is not null and p_owner_group is not null then p_owner_group = p_actor_group
    when p_actor_group is null and p_owner_group is null then p_owner_user = p_actor_user
    when p_actor_group is not null and p_owner_group is null then p_owner_user = p_actor_user
    else false
  end;
$$;

revoke execute on function public.is_hex_ally(uuid, uuid, uuid, uuid) from public, anon;

-- ── Active clan: set/clear + validated against direct column writes ───
create or replace function public.set_active_group(p_group_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  if p_group_id is not null and not exists (
    select 1 from public.group_members where group_id = p_group_id and user_id = v_user_id
  ) then
    return jsonb_build_object('success', false, 'reason', 'not_member');
  end if;

  update public.profiles set active_group_id = p_group_id where id = v_user_id;

  return jsonb_build_object('success', true, 'group_id', p_group_id);
end;
$$;

-- profiles' own "update own profile" RLS policy would otherwise let a
-- client UPDATE active_group_id straight through the table to any group
-- id at all, bypassing the membership check above entirely. A trigger
-- closes that regardless of which path (this RPC or a direct table write)
-- is used — belt and suspenders, same reasoning as the anon-RPC lockdowns
-- elsewhere in this project.
create or replace function public.validate_active_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active_group_id is not null and not exists (
    select 1 from public.group_members where group_id = new.active_group_id and user_id = new.id
  ) then
    raise exception 'Not a member of that group';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_active_group on public.profiles;
create trigger trg_validate_active_group
before update of active_group_id on public.profiles
for each row execute function public.validate_active_group();

-- Leaving a group (or having a group deleted out from under you, which
-- cascades to a group_members delete the same way) clears it as your
-- active clan if it was — group_members has no FK back to profiles for
-- this, so it needs its own trigger rather than an ON DELETE SET NULL.
create or replace function public.clear_active_group_on_member_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
    set active_group_id = null
    where id = old.user_id and active_group_id = old.group_id;
  return old;
end;
$$;

drop trigger if exists trg_clear_active_group_on_member_leave on public.group_members;
create trigger trg_clear_active_group_on_member_leave
after delete on public.group_members
for each row execute function public.clear_active_group_on_member_leave();

-- Caller's own active clan (id/name/color), or zero rows if running solo.
-- No SECURITY DEFINER needed — profiles/groups RLS already lets a user
-- read their own row and whatever group it points at (if they're active
-- for it, they're a member, and membership is what private-group select
-- already keys off).
create or replace function public.get_my_active_group()
returns table (group_id uuid, name text, color text)
language sql
stable
set search_path = public
as $$
  select g.id, g.name, g.color
  from public.profiles p
  join public.groups g on g.id = p.active_group_id
  where p.id = auth.uid();
$$;

revoke execute on function public.clear_active_group_on_member_leave() from public, anon, authenticated, service_role;

grant execute on function public.set_active_group(uuid) to authenticated;
revoke execute on function public.set_active_group(uuid) from public, anon;

grant execute on function public.get_my_active_group() to authenticated;
revoke execute on function public.get_my_active_group() from public, anon;

-- ── fortify_hex: any ally (clan teammate or yourself) may fortify ─────
create or replace function public.fortify_hex(p_hex_col int, p_hex_row int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_owner uuid;
  v_owner_group uuid;
  v_max smallint;
  v_cost int;
  v_coins int;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  select active_group_id into v_group_id from public.profiles where id = v_user_id;

  select user_id, owner_group_id, max_level into v_owner, v_owner_group, v_max
  from public.hex_claims
  where hex_col = p_hex_col and hex_row = p_hex_row
  for update;

  if v_owner is null then
    return jsonb_build_object('success', false, 'reason', 'not_claimed');
  end if;

  if not public.is_hex_ally(v_owner, v_owner_group, v_user_id, v_group_id) then
    return jsonb_build_object('success', false, 'reason', 'not_owner');
  end if;

  if v_max >= 5 then
    return jsonb_build_object('success', false, 'reason', 'max_level');
  end if;

  v_cost := case v_max + 1 when 3 then 15 when 4 then 30 when 5 then 60 end;

  select coins into v_coins from public.user_stats where user_id = v_user_id for update;

  if coalesce(v_coins, 0) < v_cost then
    return jsonb_build_object('success', false, 'reason', 'insufficient_coins', 'cost', v_cost, 'coins', coalesce(v_coins, 0));
  end if;

  update public.user_stats set coins = coins - v_cost where user_id = v_user_id;

  update public.hex_claims
    set max_level = v_max + 1, level = v_max + 1
    where hex_col = p_hex_col and hex_row = p_hex_row;

  insert into public.coin_transactions (user_id, run_id, amount, distance_km, kind)
  values (v_user_id, null, -v_cost, 0, 'fortify');

  return jsonb_build_object('success', true, 'new_level', v_max + 1, 'cost', v_cost);
end;
$$;

-- ── place_bounty: can't target an allied hex (personal or clan) ───────
create or replace function public.place_bounty(p_hexes jsonb, p_total_amount int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_count int;
  v_share int;
  v_charged int;
  v_coins int;
  v_bad_count int;
  v_cell record;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  select active_group_id into v_group_id from public.profiles where id = v_user_id;

  v_count := coalesce(jsonb_array_length(p_hexes), 0);

  if v_count < 1 or v_count > 20 then
    return jsonb_build_object('success', false, 'reason', 'invalid_hex_count');
  end if;

  if p_total_amount is null or p_total_amount < v_count then
    return jsonb_build_object('success', false, 'reason', 'amount_too_small', 'min_amount', v_count);
  end if;

  -- Every targeted hex must currently be owned by someone other than the
  -- placer's own side (personal or clan) — can't put a bounty on your own
  -- land, your clan's land, or a neutral cell.
  select count(*) into v_bad_count
  from jsonb_array_elements(p_hexes) elem
  left join public.hex_claims hc
    on hc.hex_col = (elem->>'col')::int and hc.hex_row = (elem->>'row')::int
  where hc.user_id is null or public.is_hex_ally(hc.user_id, hc.owner_group_id, v_user_id, v_group_id);

  if v_bad_count > 0 then
    return jsonb_build_object('success', false, 'reason', 'invalid_target');
  end if;

  -- Integer split so "150 across 3" is exactly 50 each. A non-divisible
  -- amount is rounded down to the nearest amount that *does* split evenly
  -- (e.g. 100 across 3 -> charges 99, not 100) rather than losing the
  -- remainder silently or distributing it unevenly.
  v_share := p_total_amount / v_count;
  v_charged := v_share * v_count;

  select coins into v_coins from public.user_stats where user_id = v_user_id for update;

  if coalesce(v_coins, 0) < v_charged then
    return jsonb_build_object('success', false, 'reason', 'insufficient_coins', 'cost', v_charged, 'coins', coalesce(v_coins, 0));
  end if;

  update public.user_stats set coins = coins - v_charged where user_id = v_user_id;

  insert into public.coin_transactions (user_id, run_id, amount, distance_km, kind)
  values (v_user_id, null, -v_charged, 0, 'bounty_place');

  for v_cell in select (elem->>'col')::int as col, (elem->>'row')::int as row
                from jsonb_array_elements(p_hexes) elem
  loop
    insert into public.hex_bounties (hex_col, hex_row, placer_id, target_user_id, target_group_id, amount)
    values (
      v_cell.col, v_cell.row, v_user_id,
      (select user_id from public.hex_claims where hex_col = v_cell.col and hex_row = v_cell.row),
      (select owner_group_id from public.hex_claims where hex_col = v_cell.col and hex_row = v_cell.row),
      v_share
    );
  end loop;

  return jsonb_build_object('success', true, 'per_hex_amount', v_share, 'total_charged', v_charged, 'hex_count', v_count);
end;
$$;

-- ── get_hexes_in_bounds: expose clan ownership too ─────────────────────
drop function if exists public.get_hexes_in_bounds(double precision, double precision, double precision, double precision);

create or replace function public.get_hexes_in_bounds(min_lat double precision, min_lng double precision, max_lat double precision, max_lng double precision)
 returns table(hex_col integer, hex_row integer, user_id uuid, username text, trail_color text, level smallint, max_level smallint, bounty_total bigint, my_bounty bigint, owner_group_id uuid, group_name text, group_color text, geojson text)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  with sz as (
    select public.hex_size_m() as size
  ),
  corners as (
    select
      extensions.ST_X(extensions.ST_Transform(extensions.ST_SetSRID(extensions.ST_MakePoint(min_lng, min_lat), 4326), 3857)) as min_x,
      extensions.ST_Y(extensions.ST_Transform(extensions.ST_SetSRID(extensions.ST_MakePoint(min_lng, min_lat), 4326), 3857)) as min_y,
      extensions.ST_X(extensions.ST_Transform(extensions.ST_SetSRID(extensions.ST_MakePoint(max_lng, max_lat), 4326), 3857)) as max_x,
      extensions.ST_Y(extensions.ST_Transform(extensions.ST_SetSRID(extensions.ST_MakePoint(max_lng, max_lat), 4326), 3857)) as max_y
  ),
  col_range as (
    select
      floor(c.min_x / (1.5 * sz.size))::int - 1 as col_min,
      ceil(c.max_x / (1.5 * sz.size))::int + 1 as col_max
    from corners c, sz
  ),
  cols as (
    select generate_series(col_min, least(col_max, col_min + 200)) as col from col_range
  ),
  cells as (
    select cols.col, gs.h_row
    from cols, corners c, sz,
    lateral generate_series(
      floor(least(c.min_y / (sz.size * sqrt(3.0)) - cols.col / 2.0, c.max_y / (sz.size * sqrt(3.0)) - cols.col / 2.0))::int - 1,
      ceil(greatest(c.min_y / (sz.size * sqrt(3.0)) - cols.col / 2.0, c.max_y / (sz.size * sqrt(3.0)) - cols.col / 2.0))::int + 1
    ) as gs(h_row)
  )
  select
    cells.col, cells.h_row,
    hc.user_id, p.username, p.trail_color, hc.level, hc.max_level,
    coalesce((select sum(hb.amount) from public.hex_bounties hb where hb.hex_col = cells.col and hb.hex_row = cells.h_row), 0),
    coalesce((select sum(hb.amount) from public.hex_bounties hb where hb.hex_col = cells.col and hb.hex_row = cells.h_row and hb.placer_id = auth.uid()), 0),
    hc.owner_group_id, g.name, g.color,
    extensions.ST_AsGeoJSON(public.hex_polygon(cells.col, cells.h_row))
  from cells
  left join public.hex_claims hc on hc.hex_col = cells.col and hc.hex_row = cells.h_row
  left join public.profiles p on p.id = hc.user_id
  left join public.groups g on g.id = hc.owner_group_id
  limit 4000;
$function$;

-- ── claim_territory_from_run: "mine" generalizes to "my side" ─────────
-- Same shape as 016's version; every place that used to compare
-- hex_claims.user_id/owner directly against v_user_id now goes through
-- is_hex_ally() against the runner's active clan (v_group_id) instead, so
-- a teammate's hex heals like your own and an enemy clan's hex is hostile
-- like an enemy individual's. attack_notifications still targets whichever
-- individual is stamped as the hex's most recent toucher (hex_claims.
-- user_id) — fanning a notification out to an entire clan is a bigger
-- schema change and not needed for the combat mechanic itself.
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

  -- Resolve every touched hex that *stays a row*: unclaimed -> insert
  -- tagged to the runner's current side; allied (own side, personal or
  -- clan) -> heal to the fortified ceiling and retag to the current side;
  -- hostile above level 1 -> knocked down by 1 (ownership unchanged).
  -- Hostile at level 1 is deliberately excluded here (the WHERE on the
  -- conflict clause) — that's a finishing hit, handled by the DELETE
  -- below instead of an UPDATE, because it no longer flips to the
  -- attacker; it goes neutral.
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

  -- Finishing hits: a hostile hex (not your side, personal or clan) that
  -- was already at level 1. Goes neutral (deleted) instead of flipping.
  delete from public.hex_claims hc
  using tmp_before_hex t
  where hc.hex_col = t.hex_col and hc.hex_row = t.hex_row
    and t.owner is not null and not public.is_hex_ally(t.owner, t.ogid, v_user_id, v_group_id) and t.lvl = 1;

  -- Pay out any escrowed bounty on every hex just neutralized, 100% to
  -- this run's owner (the one who landed the finishing hit), then settle
  -- (delete) those bounty rows. Must read tmp_before_hex (frozen before
  -- any of the above), not the now-mutated hex_claims.
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

  -- Only a previously-unclaimed hex counts as "gained" now — a finishing
  -- hit no longer hands you the hex, just the bounty (if any).
  select count(*) into v_gained_hexes from tmp_before_hex where owner is null;

  select count(*) into v_weakened_hexes
  from tmp_before_hex
  where owner is not null and not public.is_hex_ally(owner, ogid, v_user_id, v_group_id) and lvl > 1;

  select count(*) into v_neutralized_hexes
  from tmp_before_hex
  where owner is not null and not public.is_hex_ally(owner, ogid, v_user_id, v_group_id) and lvl = 1;

  -- One attack_notifications row per victim (the individual stamped as
  -- the hex's toucher) who actually lost a hex to neutral this run (not
  -- for ones merely weakened). Ghost runs still neutralize/pay out below;
  -- they just skip alerting the victim.
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

  -- Rebuild user_territory for everyone whose owned-hex set changed: the
  -- runner (gained unclaimed hexes), plus any victim who had a hex
  -- neutralized (their union shrinks — weakening alone doesn't change
  -- it). Unaffected by clan tagging — still keyed by hex_claims.user_id,
  -- exactly as before; group leaderboards derive from this unchanged.
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

  insert into public.territory_claims (user_id, run_id, geom, area_m2, stolen_from)
  values (v_user_id, p_run_id, v_polygon, round((v_gained_hexes * v_hex_area_m2)::numeric, 1), v_stolen);

  return jsonb_build_object(
    'success', true,
    'claimed_area_m2', round((v_gained_hexes * v_hex_area_m2)::numeric, 1),
    'weakened_count', v_weakened_hexes,
    'neutralized_count', v_neutralized_hexes,
    'bounty_earned', v_bounty_earned,
    'total_area_m2', round(coalesce((select area_m2 from public.user_territory where user_id = v_user_id), 0)::numeric, 1),
    'stolen', v_stolen
  );
end;
$function$;

-- ── Grants (same two-part revoke every new function here needs) ───────
grant execute on function public.fortify_hex(int, int) to authenticated;
revoke execute on function public.fortify_hex(int, int) from public, anon;

grant execute on function public.place_bounty(jsonb, int) to authenticated;
revoke execute on function public.place_bounty(jsonb, int) from public, anon;

grant execute on function public.get_hexes_in_bounds(double precision, double precision, double precision, double precision) to authenticated;
revoke execute on function public.get_hexes_in_bounds(double precision, double precision, double precision, double precision) from public, anon;

revoke all on function public.claim_territory_from_run(uuid, text) from public;
revoke all on function public.claim_territory_from_run(uuid, text) from anon;
grant execute on function public.claim_territory_from_run(uuid, text) to authenticated;
