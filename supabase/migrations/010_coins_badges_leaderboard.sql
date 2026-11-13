-- ============================================================
-- Coins, Runner Rank badges, and leaderboards.
--
-- Coins: every saved run earns coins based on distance (tiered — see
-- award_run_coins() below). Awarded via an AFTER INSERT trigger on runs,
-- not a client-side call, so it can't be skipped by an offline-synced run
-- the way user_stats' client-recomputed fields sometimes are.
--
-- Badges: reuses the existing achievements/user_achievements tables (see
-- scheme.sql) instead of a parallel system — just adds a new 'Runner Rank'
-- category keyed on requirement_type 'total_runs', which
-- checkAndAwardAchievements() in statsService.ts already knows how to
-- check. Deliberately total lifetime runs, not a consecutive-day streak
-- (current_streak already covers that, under 'Consistency').
--
-- Leaderboards: solo + clan, each all-time (current held area) and weekly
-- (net area gained this week — captured minus stolen-from-them). The
-- weekly one is the "competitive" addition: an all-time-only leaderboard
-- lets whoever claimed land first stay unbeatable forever, which kills
-- the incentive for anyone who joins later. A rolling 7-day net score
-- gives everyone a reason to run this week regardless of their all-time
-- total.
-- ============================================================

-- ── Coins ───────────────────────────────────────────────────
alter table public.user_stats add column if not exists coins integer not null default 0;

create table if not exists public.coin_transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  run_id uuid references public.runs(id) on delete cascade,
  amount integer not null,
  distance_km numeric not null,
  created_at timestamptz default now() not null
);

create index if not exists idx_coin_transactions_user on public.coin_transactions(user_id, created_at desc);

alter table public.coin_transactions enable row level security;

-- Private, like profile_settings/push_tokens — no feature needs to read
-- anyone else's coin history. No insert policy: only the SECURITY DEFINER
-- trigger below (runs as table owner, bypasses RLS) writes rows.
create policy "Users can view their own coin transactions"
on public.coin_transactions for select
using (auth.uid() = user_id);

-- Tiered by distance: <5km = 1, 5-10km = 2, 10-15km = 3, and so on
-- (greatest(1, floor(km/5)+1)) — rewards longer runs more instead of
-- capping everything past 10km at the same payout.
create or replace function public.award_run_coins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coins integer;
begin
  v_coins := greatest(1, floor(new.distance_km / 5)::int + 1);

  insert into public.coin_transactions (user_id, run_id, amount, distance_km)
  values (new.user_id, new.id, v_coins, new.distance_km);

  update public.user_stats set coins = coins + v_coins where user_id = new.user_id;

  return new;
end;
$$;

drop trigger if exists trg_award_run_coins on public.runs;
create trigger trg_award_run_coins
after insert on public.runs
for each row execute function public.award_run_coins();

-- ── Runner Rank badges ─────────────────────────────────────
-- Total lifetime runs, not a login/consecutive-day streak — "however long
-- it takes to get there" is the point, per the existing requirement_type
-- 'total_runs' handling in checkAndAwardAchievements().
insert into public.achievements (title, description, icon, category, requirement_type, requirement_value)
select v.title, v.description, v.icon, 'Runner Rank', 'total_runs', v.requirement_value
from (values
  ('Centurion', 'Complete 100 runs — however long it takes to get there', 'faMedal', 100),
  ('Trailblazer', 'Complete 200 runs', 'faMedal', 200),
  ('Relentless', 'Complete 300 runs', 'faTrophy', 300),
  ('Full Circle', 'Complete 365 runs', 'faTrophy', 365),
  ('Unstoppable', 'Complete 500 runs', 'faStar', 500),
  ('Zone Legend', 'Complete 1000 runs', 'faStar', 1000)
) as v(title, description, icon, requirement_value)
where not exists (
  select 1 from public.achievements a where a.category = 'Runner Rank' and a.requirement_value = v.requirement_value
);

-- ── Leaderboards ────────────────────────────────────────────

-- Solo, all-time, ranked by currently-held territory.
create or replace function public.get_territory_leaderboard(p_limit int default 50)
returns table (
  user_id uuid, username text, display_name text, avatar_url text,
  trail_color text, area_m2 numeric, rank bigint
)
language sql stable
set search_path = public, extensions
as $$
  select p.id, p.username, p.display_name, p.avatar_url, ut.color, ut.area_m2,
         rank() over (order by ut.area_m2 desc)
  from public.user_territory ut
  join public.profiles p on p.id = ut.user_id
  order by ut.area_m2 desc
  limit p_limit;
$$;

-- Solo, this week, ranked by net area change (claimed minus stolen-from-them)
-- so the board resets every 7 days instead of being locked in by whoever
-- grabbed land first. Only includes users with activity this week.
create or replace function public.get_weekly_leaderboard(p_limit int default 50)
returns table (
  user_id uuid, username text, display_name text, avatar_url text, trail_color text,
  gained_m2 numeric, lost_m2 numeric, net_m2 numeric, rank bigint
)
language sql stable
set search_path = public, extensions
as $$
  with gained as (
    select tc.user_id, sum(tc.area_m2) as gained_m2
    from public.territory_claims tc
    where tc.created_at >= now() - interval '7 days'
    group by tc.user_id
  ),
  lost as (
    select an.victim_id as user_id, sum(an.area_m2) as lost_m2
    from public.attack_notifications an
    where an.created_at >= now() - interval '7 days'
    group by an.victim_id
  )
  select p.id, p.username, p.display_name, p.avatar_url,
         coalesce(ut.color, p.trail_color),
         coalesce(g.gained_m2, 0), coalesce(l.lost_m2, 0),
         coalesce(g.gained_m2, 0) - coalesce(l.lost_m2, 0) as net_m2,
         rank() over (order by coalesce(g.gained_m2, 0) - coalesce(l.lost_m2, 0) desc)
  from public.profiles p
  left join gained g on g.user_id = p.id
  left join lost l on l.user_id = p.id
  left join public.user_territory ut on ut.user_id = p.id
  where coalesce(g.gained_m2, 0) > 0 or coalesce(l.lost_m2, 0) > 0
  order by net_m2 desc
  limit p_limit;
$$;

-- Clans, this week — same net-change idea as get_weekly_leaderboard, summed
-- per public group (mirrors get_group_leaderboard's join shape).
create or replace function public.get_weekly_group_leaderboard(p_limit int default 20)
returns table (
  group_id uuid, name text, color text, member_count int,
  gained_m2 numeric, lost_m2 numeric, net_m2 numeric, rank bigint
)
language sql stable
set search_path = public, extensions
as $$
  with gained as (
    select tc.user_id, sum(tc.area_m2) as gained_m2
    from public.territory_claims tc
    where tc.created_at >= now() - interval '7 days'
    group by tc.user_id
  ),
  lost as (
    select an.victim_id as user_id, sum(an.area_m2) as lost_m2
    from public.attack_notifications an
    where an.created_at >= now() - interval '7 days'
    group by an.victim_id
  )
  select g.id, g.name, g.color, g.member_count,
         coalesce(sum(ga.gained_m2), 0) as gained_m2,
         coalesce(sum(lo.lost_m2), 0) as lost_m2,
         coalesce(sum(ga.gained_m2), 0) - coalesce(sum(lo.lost_m2), 0) as net_m2,
         rank() over (order by coalesce(sum(ga.gained_m2), 0) - coalesce(sum(lo.lost_m2), 0) desc)
  from public.groups g
  join public.group_members gm on gm.group_id = g.id
  left join gained ga on ga.user_id = gm.user_id
  left join lost lo on lo.user_id = gm.user_id
  where g.is_public = true
  group by g.id, g.name, g.color, g.member_count
  having coalesce(sum(ga.gained_m2), 0) > 0 or coalesce(sum(lo.lost_m2), 0) > 0
  order by net_m2 desc
  limit p_limit;
$$;

grant execute on function public.get_territory_leaderboard(int) to authenticated;
grant execute on function public.get_weekly_leaderboard(int) to authenticated;
grant execute on function public.get_weekly_group_leaderboard(int) to authenticated;

-- Same two-part revoke every new function in this project needs (Supabase's
-- auto-grant to anon/authenticated/service_role, plus Postgres' own
-- separate implicit grant to the PUBLIC pseudo-role) — see migrations
-- 005/006 for how this was found.
revoke execute on function public.get_territory_leaderboard(int) from public, anon;
revoke execute on function public.get_weekly_leaderboard(int) from public, anon;
revoke execute on function public.get_weekly_group_leaderboard(int) from public, anon;
revoke execute on function public.award_run_coins() from public, anon, authenticated, service_role;
