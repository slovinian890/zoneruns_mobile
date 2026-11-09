-- Groups: unlimited create/join per user, 30-member cap, public(searchable) or
-- private(invite-code-only). Every group has a code regardless of visibility --
-- for public groups the code just travels along with the row once it's visible
-- via normal browsing; for private groups the code is the only way in, shared
-- out of band. One join RPC covers both paths uniformly.

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  color text not null default '#2196F3',
  is_public boolean not null default true,
  invite_code text unique not null default upper(substr(md5(random()::text), 1, 6)),
  member_count int not null default 0,
  created_by uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists public.group_members (
  group_id uuid references public.groups(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

create index if not exists idx_group_members_user on public.group_members(user_id);
create index if not exists idx_groups_public on public.groups(is_public) where is_public = true;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- groups: public rows visible to everyone; private rows visible only to members.
-- No direct INSERT policy -- creation goes through create_group() (SECURITY
-- DEFINER) so the group + owner membership row are created atomically.
create policy "Public groups visible to all, private to members"
on public.groups for select
using (
  is_public = true
  or exists (select 1 from public.group_members gm where gm.group_id = groups.id and gm.user_id = auth.uid())
);

create policy "Owner can update their group"
on public.groups for update
using (exists (select 1 from public.group_members gm where gm.group_id = groups.id and gm.user_id = auth.uid() and gm.role = 'owner'));

create policy "Owner can delete their group"
on public.groups for delete
using (exists (select 1 from public.group_members gm where gm.group_id = groups.id and gm.user_id = auth.uid() and gm.role = 'owner'));

-- group_members: public read (matches this project's existing norm -- posts,
-- followers, territory_claims are all public-read regardless of any privacy
-- concept elsewhere; a private group's membership isn't discoverable in
-- practice anyway since its group_id is never exposed to non-members).
create policy "Group membership is public"
on public.group_members for select
using (true);

-- No direct INSERT policy -- joining goes through join_group_by_code().
-- DELETE: a member can remove themself unless they're the owner (owner must
-- delete the whole group instead of leaving it ownerless); the owner can
-- remove anyone except themself (closes the same loophole from the other side).
create policy "Leave or be removed"
on public.group_members for delete
using (
  (auth.uid() = user_id and role != 'owner')
  or (
    role != 'owner'
    and exists (
      select 1 from public.group_members gm2
      where gm2.group_id = group_members.group_id
        and gm2.user_id = auth.uid()
        and gm2.role = 'owner'
    )
  )
);

-- Atomic, race-safe 30-cap: conditional UPDATE + NOT FOUND check, not a
-- read-then-write COUNT(*) (which could race under concurrent joins).
create or replace function public.enforce_group_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.groups set member_count = member_count + 1
  where id = new.group_id and member_count < 30;
  if not found then
    raise exception 'This group is full (max 30 members)';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_group_member_limit
before insert on public.group_members
for each row execute function public.enforce_group_member_limit();

create or replace function public.decrement_group_member_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.groups set member_count = greatest(member_count - 1, 0) where id = old.group_id;
  return old;
end;
$$;

create trigger trg_decrement_group_member_count
after delete on public.group_members
for each row execute function public.decrement_group_member_count();

-- Create a group + add the creator as owner, atomically.
create or replace function public.create_group(
  p_name text, p_description text default null, p_color text default '#2196F3', p_is_public boolean default true
)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare v_group public.groups;
begin
  insert into public.groups (name, description, color, is_public, created_by)
  values (p_name, p_description, p_color, p_is_public, auth.uid())
  returning * into v_group;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, auth.uid(), 'owner');

  return v_group;
end;
$$;

-- The one join path for both public and private groups (see header comment).
create or replace function public.join_group_by_code(p_code text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare v_group public.groups;
begin
  select * into v_group from public.groups where invite_code = upper(p_code);
  if v_group.id is null then
    raise exception 'Invalid invite code';
  end if;

  begin
    insert into public.group_members (group_id, user_id) values (v_group.id, auth.uid());
  exception when unique_violation then
    raise exception 'You are already in this group';
  end;

  return v_group;
end;
$$;

-- Public leaderboard -- public groups only (matches their general visibility).
create or replace function public.get_group_leaderboard(p_limit int default 20)
returns table (group_id uuid, name text, color text, member_count int, total_area_m2 numeric, rank bigint)
language sql stable
set search_path = public, extensions
as $$
  select g.id, g.name, g.color, g.member_count,
         coalesce(sum(ut.area_m2), 0) as total_area_m2,
         rank() over (order by coalesce(sum(ut.area_m2), 0) desc)
  from public.groups g
  join public.group_members gm on gm.group_id = g.id
  left join public.user_territory ut on ut.user_id = gm.user_id
  where g.is_public = true
  group by g.id, g.name, g.color, g.member_count
  order by total_area_m2 desc
  limit p_limit;
$$;

-- Per-group member breakdown (works for private groups too -- their own
-- detail screen needs this regardless of the public leaderboard).
create or replace function public.get_group_stats(p_group_id uuid)
returns table (user_id uuid, username text, display_name text, avatar_url text, area_m2 numeric)
language sql stable
set search_path = public, extensions
as $$
  select p.id, p.username, p.display_name, p.avatar_url, coalesce(ut.area_m2, 0)
  from public.group_members gm
  join public.profiles p on p.id = gm.user_id
  left join public.user_territory ut on ut.user_id = gm.user_id
  where gm.group_id = p_group_id
  order by coalesce(ut.area_m2, 0) desc;
$$;

-- Every new function here needs the SAME anon-revoke this project always
-- applies (ALTER DEFAULT PRIVILEGES auto-grants to anon/authenticated/
-- service_role -- see 005_security_hardening.sql) -- PLUS a revoke from
-- PUBLIC, which is a separate, vanilla-Postgres mechanism: CREATE FUNCTION
-- grants EXECUTE to the PUBLIC pseudo-role by default, and every role
-- (anon included) implicitly inherits whatever PUBLIC can do. Revoking only
-- from anon leaves anon able to execute via its PUBLIC inheritance --
-- confirmed empirically (pg_proc.proacl still showed a bare "=X/postgres"
-- entry after revoking "from anon" alone). Both revokes are required.
grant execute on function public.create_group(text, text, text, boolean) to authenticated;
grant execute on function public.join_group_by_code(text) to authenticated;
grant execute on function public.get_group_leaderboard(int) to authenticated;
grant execute on function public.get_group_stats(uuid) to authenticated;

revoke execute on function public.create_group(text, text, text, boolean) from public, anon;
revoke execute on function public.join_group_by_code(text) from public, anon;
revoke execute on function public.get_group_leaderboard(int) from public, anon;
revoke execute on function public.get_group_stats(uuid) from public, anon;
revoke execute on function public.enforce_group_member_limit() from public, anon, authenticated, service_role;
revoke execute on function public.decrement_group_member_count() from public, anon, authenticated, service_role;
