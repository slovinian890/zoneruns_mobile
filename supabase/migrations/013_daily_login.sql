-- ============================================================
-- Daily login coins.
--
-- First claim_daily_login() call each calendar day (UTC) pays out coins,
-- scaled with a consecutive-day streak (capped at 7, so the reward settles
-- into "a week's worth" rather than growing without bound) and resets to 1
-- if a day is missed. Reuses user_stats.coins + coin_transactions (see
-- 010_coins_badges_leaderboard.sql) instead of a parallel ledger — a login
-- payout is just a coin_transactions row with run_id left null, which is
-- how the client (coinsService.ts/badges.tsx) tells a login bonus apart
-- from a run reward without needing a new column.
-- ============================================================

alter table public.user_stats add column if not exists last_login_date date;
alter table public.user_stats add column if not exists login_streak integer not null default 0;

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

  insert into public.coin_transactions (user_id, run_id, amount, distance_km)
  values (v_user_id, null, v_coins, 0);

  return jsonb_build_object('success', true, 'coins_awarded', v_coins, 'streak', v_streak);
end;
$$;

grant execute on function public.claim_daily_login() to authenticated;

-- Same two-part revoke every new function in this project needs (see
-- migrations 005/006/010).
revoke execute on function public.claim_daily_login() from public, anon;
