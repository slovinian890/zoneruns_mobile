-- ============================================================
-- Heroes: collectible pixel-art characters, unlocked and upgraded with
-- coins (see migration 010 for the coins system). Each hero has 15 visual
-- tiers sliced client-side from a single evolution-style sprite sheet
-- (constants/hero-sprites.ts) — only the catalog metadata and each user's
-- ownership/tier live in the database; tier artwork is a bundled asset,
-- not a column.
--
-- Every account starts with one random hero at tier 1, granted lazily by
-- get_my_heroes() the first time it's called for a user who owns none —
-- this covers brand-new signups AND every account that predates this
-- feature with the same code path, no backfill migration needed.
-- ============================================================

create table if not exists public.heroes (
  id uuid default gen_random_uuid() primary key,
  slug text unique not null,
  name text not null,
  rarity text not null check (rarity in ('common', 'rare', 'epic', 'legendary')),
  unlock_cost int not null,
  sort_order int not null default 0
);

alter table public.heroes enable row level security;

create policy "Heroes catalog is viewable by everyone"
on public.heroes for select
using (true);

create table if not exists public.user_heroes (
  user_id uuid references public.profiles(id) on delete cascade not null,
  hero_id uuid references public.heroes(id) on delete cascade not null,
  tier int not null default 1 check (tier >= 1 and tier <= 15),
  unlocked_at timestamptz default now() not null,
  primary key (user_id, hero_id)
);

create index if not exists idx_user_heroes_user on public.user_heroes(user_id);

alter table public.user_heroes enable row level security;

-- Public read, matching this project's established norm (territory_claims,
-- group_members, etc. are all public-read) — another user's active hero
-- needs to be visible so it renders correctly wherever their profile shows
-- up to other people. No insert/update policy — only the SECURITY DEFINER
-- functions below write these rows.
create policy "User heroes are viewable by everyone"
on public.user_heroes for select
using (true);

alter table public.profiles add column if not exists active_hero_id uuid references public.heroes(id);

-- 10 + tier*2 per upgrade step (tier 1->2 costs 12, ..., 14->15 costs 38 —
-- maxing one hero from scratch costs 350 coins on top of its unlock price).
create or replace function public.hero_upgrade_cost(p_tier int)
returns int
language sql
immutable
as $$
  select 10 + p_tier * 2;
$$;

create or replace function public.get_my_heroes()
returns table (
  hero_id uuid, slug text, name text, rarity text, unlock_cost int,
  owned boolean, tier int, is_active boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_starter_hero_id uuid;
begin
  if not exists (select 1 from public.user_heroes where user_id = v_user_id) then
    select id into v_starter_hero_id from public.heroes order by random() limit 1;
    if v_starter_hero_id is not null then
      insert into public.user_heroes (user_id, hero_id, tier) values (v_user_id, v_starter_hero_id, 1);
      update public.profiles set active_hero_id = v_starter_hero_id where id = v_user_id and active_hero_id is null;
    end if;
  end if;

  return query
  select h.id, h.slug, h.name, h.rarity, h.unlock_cost,
         (uh.user_id is not null),
         uh.tier,
         coalesce(p.active_hero_id = h.id, false)
  from public.heroes h
  left join public.user_heroes uh on uh.hero_id = h.id and uh.user_id = v_user_id
  left join public.profiles p on p.id = v_user_id
  order by h.sort_order;
end;
$$;

create or replace function public.unlock_hero(p_hero_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_cost int;
  v_coins int;
begin
  if exists (select 1 from public.user_heroes where user_id = v_user_id and hero_id = p_hero_id) then
    return jsonb_build_object('success', false, 'reason', 'already_owned');
  end if;

  select unlock_cost into v_cost from public.heroes where id = p_hero_id;
  if v_cost is null then
    return jsonb_build_object('success', false, 'reason', 'hero_not_found');
  end if;

  select coins into v_coins from public.user_stats where user_id = v_user_id;
  if coalesce(v_coins, 0) < v_cost then
    return jsonb_build_object('success', false, 'reason', 'not_enough_coins', 'cost', v_cost, 'coins', coalesce(v_coins, 0));
  end if;

  update public.user_stats set coins = coins - v_cost where user_id = v_user_id;
  insert into public.user_heroes (user_id, hero_id, tier) values (v_user_id, p_hero_id, 1);

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.upgrade_hero(p_hero_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier int;
  v_cost int;
  v_coins int;
begin
  select tier into v_tier from public.user_heroes where user_id = v_user_id and hero_id = p_hero_id;
  if v_tier is null then
    return jsonb_build_object('success', false, 'reason', 'not_owned');
  end if;

  if v_tier >= 15 then
    return jsonb_build_object('success', false, 'reason', 'max_tier');
  end if;

  v_cost := public.hero_upgrade_cost(v_tier);
  select coins into v_coins from public.user_stats where user_id = v_user_id;
  if coalesce(v_coins, 0) < v_cost then
    return jsonb_build_object('success', false, 'reason', 'not_enough_coins', 'cost', v_cost, 'coins', coalesce(v_coins, 0));
  end if;

  update public.user_stats set coins = coins - v_cost where user_id = v_user_id;
  update public.user_heroes set tier = tier + 1 where user_id = v_user_id and hero_id = p_hero_id;

  return jsonb_build_object('success', true, 'new_tier', v_tier + 1);
end;
$$;

create or replace function public.set_active_hero(p_hero_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not exists (select 1 from public.user_heroes where user_id = v_user_id and hero_id = p_hero_id) then
    return jsonb_build_object('success', false, 'reason', 'not_owned');
  end if;

  update public.profiles set active_hero_id = p_hero_id where id = v_user_id;

  return jsonb_build_object('success', true);
end;
$$;

insert into public.heroes (slug, name, rarity, unlock_cost, sort_order) values
  ('angel', 'Angel', 'common', 30, 0),
  ('paladin', 'Paladin', 'common', 30, 1),
  ('cherub', 'Cherub', 'common', 30, 2),
  ('fallen-angel', 'Fallen Angel', 'rare', 75, 3),
  ('cleric', 'Cleric', 'common', 30, 4),
  ('frost-mage', 'Frost Mage', 'rare', 75, 5),
  ('sun-king', 'Sun King', 'epic', 150, 6),
  ('demon-king', 'Demon King', 'epic', 150, 7),
  ('oracle', 'Oracle', 'rare', 75, 8),
  ('shadow-sovereign', 'Shadow Sovereign', 'epic', 150, 9),
  ('enchantress', 'Enchantress', 'rare', 75, 10),
  ('grim-reaper', 'Grim Reaper', 'epic', 150, 11),
  ('guardian-teddy', 'Guardian Teddy', 'common', 30, 12),
  ('feral-bear', 'Feral Bear', 'rare', 75, 13),
  ('king-slime', 'King Slime', 'common', 30, 14),
  ('rock-golem', 'Rock Golem', 'rare', 75, 15),
  ('kitsune', 'Kitsune', 'epic', 150, 16),
  ('fire-dragon', 'Fire Dragon', 'legendary', 300, 17),
  ('lich-king', 'Lich King', 'epic', 150, 18),
  ('pirate-captain', 'Pirate Captain', 'rare', 75, 19),
  ('mech', 'Mech', 'epic', 150, 20),
  ('world-tree', 'World Tree', 'rare', 75, 21),
  ('mushroom-king', 'Mushroom King', 'common', 30, 22),
  ('phoenix', 'Phoenix', 'legendary', 300, 23),
  ('sir-whiskers', 'Sir Whiskers', 'rare', 75, 24)
on conflict (slug) do nothing;

grant execute on function public.hero_upgrade_cost(int) to authenticated;
grant execute on function public.get_my_heroes() to authenticated;
grant execute on function public.unlock_hero(uuid) to authenticated;
grant execute on function public.upgrade_hero(uuid) to authenticated;
grant execute on function public.set_active_hero(uuid) to authenticated;

-- Same two-part revoke every new function in this project needs (see
-- migrations 005/006/010 for how this was found).
revoke execute on function public.hero_upgrade_cost(int) from public, anon;
revoke execute on function public.get_my_heroes() from public, anon;
revoke execute on function public.unlock_hero(uuid) from public, anon;
revoke execute on function public.upgrade_hero(uuid) from public, anon;
revoke execute on function public.set_active_hero(uuid) from public, anon;
