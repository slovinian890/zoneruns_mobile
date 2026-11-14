-- Raise the fortify ceiling from 5 to 10.
--
-- 016_fortify_and_bounty.sql capped max_level at 5 with a 3-step cost curve
-- (15/30/60, doubling each step). This just continues that exact doubling
-- out to level 10 (120/240/480/960/1920) and widens the constraint to
-- match — nothing about the claim/heal/knockdown mechanics changes, a
-- higher ceiling just means more hits needed to crack a maxed-out hex.

alter table public.hex_claims drop constraint if exists hex_claims_max_level_range;
alter table public.hex_claims add constraint hex_claims_max_level_range check (max_level >= 2 and max_level <= 10);

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

  if v_max >= 10 then
    return jsonb_build_object('success', false, 'reason', 'max_level');
  end if;

  v_cost := case v_max + 1
    when 3 then 15
    when 4 then 30
    when 5 then 60
    when 6 then 120
    when 7 then 240
    when 8 then 480
    when 9 then 960
    when 10 then 1920
  end;

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
