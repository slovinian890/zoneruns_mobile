-- Group chat: one broadcast thread per group, members-only.
create table if not exists public.group_messages (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references public.groups(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text not null check (char_length(btrim(content)) > 0 and char_length(content) <= 2000),
  created_at timestamptz default now() not null
);

create index if not exists idx_group_messages_group on public.group_messages(group_id, created_at desc);

alter table public.group_messages enable row level security;

create policy "Group members can view group messages"
on public.group_messages for select
using (exists (select 1 from public.group_members gm where gm.group_id = group_messages.group_id and gm.user_id = auth.uid()));

create policy "Group members can send group messages"
on public.group_messages for insert
with check (
  auth.uid() = sender_id
  and exists (select 1 from public.group_members gm where gm.group_id = group_messages.group_id and gm.user_id = auth.uid())
);

alter publication supabase_realtime add table public.group_messages;

-- Group territory: each public group's members' land, merged into one
-- shape, clipped to the current map viewport -- same shape/semantics as
-- get_territories_in_bounds, just aggregated per group instead of per user,
-- so the existing TerritoryMap component can render both without changes.
create or replace function public.get_group_territories_in_bounds(
  min_lat double precision, min_lng double precision,
  max_lat double precision, max_lng double precision
)
returns table (
  group_id uuid,
  name text,
  color text,
  area_m2 numeric,
  geojson text
)
language sql
stable
set search_path = public, extensions
as $$
  with envelope as (
    select extensions.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326) as env
  ),
  group_geom as (
    select
      g.id, g.name, g.color,
      sum(ut.area_m2) as area_m2,
      extensions.ST_Union(ut.geom) as geom
    from public.groups g
    join public.group_members gm on gm.group_id = g.id
    join public.user_territory ut on ut.user_id = gm.user_id
    where g.is_public = true
    group by g.id, g.name, g.color
  )
  select gg.id, gg.name, gg.color, gg.area_m2,
    extensions.ST_AsGeoJSON(extensions.ST_Intersection(gg.geom, e.env))
  from group_geom gg, envelope e
  where extensions.ST_Intersects(gg.geom, e.env);
$$;

grant execute on function public.get_group_territories_in_bounds(double precision, double precision, double precision, double precision) to authenticated;
-- Both revokes required -- CREATE FUNCTION grants EXECUTE to the PUBLIC
-- pseudo-role by default (separate from Supabase's anon/authenticated/
-- service_role auto-grant), and every role including anon inherits
-- whatever PUBLIC can do. Confirmed empirically when 006_groups.sql was
-- first applied -- revoking from anon alone left it still anon-executable.
revoke execute on function public.get_group_territories_in_bounds(double precision, double precision, double precision, double precision) from public, anon;
