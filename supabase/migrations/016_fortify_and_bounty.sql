-- ============================================================
-- Fortify + Bounty.
--
-- Until now a hex only ever had two states (level 1/2) and a finishing hit
-- flipped it straight to the attacker. This migration:
--
--  1. Lets an owner spend coins to raise a hex's defense ceiling
--     (max_level) up to 5 — fortify_hex(). Running over your own hex still
--     heals it, but now heals back to *your* fortified ceiling instead of
--     a hardcoded 2.
--  2. Changes what a finishing hit does: instead of flipping the hex to
--     the attacker, it now goes NEUTRAL (the row is deleted — unclaimed,
--     same as a hex nobody has ever touched). The attacker has to come
--     back and claim it like any other unclaimed hex if they want the
--     land itself. This is what makes a bounty meaningful: you can get
--     paid for clearing a well-defended hex even if you don't end up
--     owning it afterward.
--  3. Adds bounties: place_bounty() escrows coins split evenly across N
--     enemy-owned hexes, cancel_my_bounty() refunds an unclaimed one, and
--     claim_territory_from_run() pays out a hex's escrowed bounty (100%,
--     to whoever lands the finishing hit) the moment it goes neutral.
--
-- coin_transactions gets a `kind` column so the coin-history UI can tell
-- these new transaction types apart from a run reward or the daily login
-- bonus (previously inferred solely from run_id being null, which these
-- new kinds would otherwise collide with).
-- ============================================================

-- ── Fortification ───────────────────────────────────────────
alter table public.hex_claims add column if not exists max_level smallint not null default 2;

alter table public.hex_claims drop constraint if exists hex_claims_level_range;
alter table public.hex_claims add constraint hex_claims_level_range check (level >= 1 and level <= max_level);
alter table public.hex_claims add constraint hex_claims_max_level_range check (max_level >= 2 and max_level <= 5);

-- ── coin_transactions kind ──────────────────────────────────
alter table public.coin_transactions add column if not exists kind text not null default 'run';
alter table public.coin_transactions drop constraint if exists coin_transactions_kind_check;
alter table public.coin_transactions add constraint coin_transactions_kind_check
  check (kind in ('run', 'login', 'fortify', 'bounty_place', 'bounty_payout', 'bounty_refund'));

-- Backfill: the only null-run_id rows that exist before this migration are
-- claim_daily_login()'s, which the column default would otherwise mislabel
-- as 'run'.
update public.coin_transactions set kind = 'login' where run_id is null;

create or replace function public.claim_daily_login()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_last date;
  v_streak int;
  v_today date := current_date;
  v_coins int;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  select last_login_date, login_streak into v_last, v_streak
  from public.user_stats where user_id = v_user_id;

  if v_last = v_today then
    return jsonb_build_object('success', false, 'reason', 'already_claimed', 'streak', coalesce(v_streak, 0));
  end if;

  v_streak := case when v_last = v_today - 1 then coalesce(v_streak, 0) + 1 else 1 end;
  v_coins := least(v_streak, 7);

  update public.user_stats
    set coins = coins + v_coins,
        last_login_date = v_today,
        login_streak = v_streak
    where user_id = v_user_id;

  insert into public.coin_transactions (user_id, run_id, amount, distance_km, kind)
  values (v_user_id, null, v_coins, 0, 'login');

  return jsonb_build_object('success', true, 'coins_awarded', v_coins, 'streak', v_streak);
end;
$$;

-- ── Bounties ────────────────────────────────────────────────
create table if not exists public.hex_bounties (
  id uuid primary key default gen_random_uuid(),
  hex_col int not null,
  hex_row int not null,
  placer_id uuid not null references public.profiles(id) on delete cascade,
  -- Snapshot of who owned the hex when the bounty was placed, for display
  -- only (e.g. "bounty on Ana's hex") — payout always uses the *current*
  -- hex_claims owner at the moment of the finishing hit, not this column.
  target_user_id uuid references public.profiles(id) on delete set null,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_hex_bounties_cell on public.hex_bounties (hex_col, hex_row);
create index if not exists idx_hex_bounties_placer on public.hex_bounties (placer_id);

alter table public.hex_bounties enable row level security;

drop policy if exists "Bounties are viewable by everyone" on public.hex_bounties;
create policy "Bounties are viewable by everyone"
on public.hex_bounties for select
using (true);

-- No insert/update/delete policies — only the SECURITY DEFINER RPCs below
-- (place_bounty / cancel_my_bounty / claim_territory_from_run's payout)
-- ever write to this table, same pattern as coin_transactions.

create or replace function public.fortify_hex(p_hex_col int, p_hex_row int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner uuid;
  v_max smallint;
  v_cost int;
  v_coins int;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  select user_id, max_level into v_owner, v_max
  from public.hex_claims
  where hex_col = p_hex_col and hex_row = p_hex_row
  for update;

  if v_owner is null then
    return jsonb_build_object('success', false, 'reason', 'not_claimed');
  end if;

  if v_owner <> v_user_id then
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

create or replace function public.place_bounty(p_hexes jsonb, p_total_amount int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
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

  v_count := coalesce(jsonb_array_length(p_hexes), 0);

  if v_count < 1 or v_count > 20 then
    return jsonb_build_object('success', false, 'reason', 'invalid_hex_count');
  end if;

  if p_total_amount is null or p_total_amount < v_count then
    return jsonb_build_object('success', false, 'reason', 'amount_too_small', 'min_amount', v_count);
  end if;

  -- Every targeted hex must currently be owned by someone other than the
  -- placer — can't put a bounty on your own land or on a neutral cell.
  select count(*) into v_bad_count
  from jsonb_array_elements(p_hexes) elem
  left join public.hex_claims hc
    on hc.hex_col = (elem->>'col')::int and hc.hex_row = (elem->>'row')::int
  where hc.user_id is null or hc.user_id = v_user_id;

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
    insert into public.hex_bounties (hex_col, hex_row, placer_id, target_user_id, amount)
    values (
      v_cell.col, v_cell.row, v_user_id,
      (select user_id from public.hex_claims where hex_col = v_cell.col and hex_row = v_cell.row),
      v_share
    );
  end loop;

  return jsonb_build_object('success', true, 'per_hex_amount', v_share, 'total_charged', v_charged, 'hex_count', v_count);
end;
$$;

create or replace function public.cancel_my_bounty(p_hex_col int, p_hex_row int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_refund int;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  select coalesce(sum(amount), 0) into v_refund
  from public.hex_bounties
  where hex_col = p_hex_col and hex_row = p_hex_row and placer_id = v_user_id;

  if v_refund <= 0 then
    return jsonb_build_object('success', false, 'reason', 'no_bounty');
  end if;

  delete from public.hex_bounties
  where hex_col = p_hex_col and hex_row = p_hex_row and placer_id = v_user_id;

  update public.user_stats set coins = coins + v_refund where user_id = v_user_id;

  insert into public.coin_transactions (user_id, run_id, amount, distance_km, kind)
  values (v_user_id, null, v_refund, 0, 'bounty_refund');

  return jsonb_build_object('success', true, 'refunded', v_refund);
end;
$$;

-- ── get_hexes_in_bounds: expose level/max_level + bounty totals ────────
-- Same grid-windowing as before (see 012_hex_defense_levels.sql), now also
-- returning each hex's defense level/ceiling and bounty amounts so the map
-- can render both without a second round trip per cell.
create or replace function public.get_hexes_in_bounds(min_lat double precision, min_lng double precision, max_lat double precision, max_lng double precision)
 returns table(hex_col integer, hex_row integer, user_id uuid, username text, trail_color text, level smallint, max_level smallint, bounty_total bigint, my_bounty bigint, geojson text)
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
    extensions.ST_AsGeoJSON(public.hex_polygon(cells.col, cells.h_row))
  from cells
  left join public.hex_claims hc on hc.hex_col = cells.col and hc.hex_row = cells.h_row
  left join public.profiles p on p.id = hc.user_id
  limit 4000;
$function$;

-- ── claim_territory_from_run: neutral-on-defeat + bounty payout ───────
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

  select trail_color, username, display_name into v_color, v_username, v_display_name
  from public.profiles where id = v_user_id;
  v_color := coalesce(v_color, '#5B7EA4');

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

  -- Resolve every touched hex that *stays a row*: unclaimed -> insert at
  -- base level 2; already yours -> heal to your own fortified ceiling;
  -- someone else's above level 1 -> knocked down by 1 (ownership
  -- unchanged). A hex at someone else's level 1 is deliberately excluded
  -- here (the WHERE on the conflict clause) — that's a finishing hit,
  -- handled by the DELETE below instead of an UPDATE, because it no
  -- longer flips to you; it goes neutral.
  insert into public.hex_claims (hex_col, hex_row, user_id, run_id, level, max_level, claimed_at)
  select hex_col, hex_row, v_user_id, p_run_id, 2, 2, now()
  from tmp_before_hex
  on conflict (hex_col, hex_row) do update
  set
    level = case
      when hex_claims.user_id = v_user_id then hex_claims.max_level
      else hex_claims.level - 1
    end,
    run_id = p_run_id,
    claimed_at = now()
  where hex_claims.user_id = v_user_id or hex_claims.level > 1;

  -- Finishing hits: someone else's hex that was already at level 1. Goes
  -- neutral (deleted) instead of flipping to the attacker.
  delete from public.hex_claims hc
  using tmp_before_hex t
  where hc.hex_col = t.hex_col and hc.hex_row = t.hex_row
    and t.owner is not null and t.owner <> v_user_id and t.lvl = 1;

  -- Pay out any escrowed bounty on every hex just neutralized, 100% to
  -- this run's owner (the one who landed the finishing hit), then settle
  -- (delete) those bounty rows. Must read tmp_before_hex (frozen before
  -- any of the above), not the now-mutated hex_claims.
  select coalesce(sum(hb.amount), 0) into v_bounty_earned
  from public.hex_bounties hb
  join tmp_before_hex t on t.hex_col = hb.hex_col and t.hex_row = hb.hex_row
  where t.owner is not null and t.owner <> v_user_id and t.lvl = 1;

  if v_bounty_earned > 0 then
    update public.user_stats set coins = coins + v_bounty_earned where user_id = v_user_id;

    insert into public.coin_transactions (user_id, run_id, amount, distance_km, kind)
    values (v_user_id, p_run_id, v_bounty_earned, 0, 'bounty_payout');

    delete from public.hex_bounties hb
    using tmp_before_hex t
    where hb.hex_col = t.hex_col and hb.hex_row = t.hex_row
      and t.owner is not null and t.owner <> v_user_id and t.lvl = 1;
  end if;

  -- Only a previously-unclaimed hex counts as "gained" now — a finishing
  -- hit no longer hands you the hex, just the bounty (if any).
  select count(*) into v_gained_hexes from tmp_before_hex where owner is null;

  select count(*) into v_weakened_hexes
  from tmp_before_hex
  where owner is not null and owner <> v_user_id and lvl > 1;

  select count(*) into v_neutralized_hexes
  from tmp_before_hex
  where owner is not null and owner <> v_user_id and lvl = 1;

  -- One attack_notifications row per victim who actually lost a hex to
  -- neutral this run (not for ones merely weakened). Ghost runs still
  -- neutralize/pay out below; they just skip alerting the victim.
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

  -- Rebuild user_territory for everyone whose owned-hex set changed: the
  -- runner (gained unclaimed hexes), plus any victim who had a hex
  -- neutralized (their union shrinks — weakening alone doesn't change it).
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

grant execute on function public.cancel_my_bounty(int, int) to authenticated;
revoke execute on function public.cancel_my_bounty(int, int) from public, anon;

grant execute on function public.get_hexes_in_bounds(double precision, double precision, double precision, double precision) to authenticated;
revoke execute on function public.get_hexes_in_bounds(double precision, double precision, double precision, double precision) from public, anon;

revoke all on function public.claim_territory_from_run(uuid, text) from public;
revoke all on function public.claim_territory_from_run(uuid, text) from anon;
grant execute on function public.claim_territory_from_run(uuid, text) to authenticated;

revoke all on function public.claim_daily_login() from public, anon;
grant execute on function public.claim_daily_login() to authenticated;
