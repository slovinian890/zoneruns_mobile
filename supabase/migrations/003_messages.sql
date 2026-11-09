-- ============================================================
-- ZoneRuns direct messages
-- ============================================================

create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  recipient_id uuid references public.profiles(id) on delete cascade not null,
  content text not null check (char_length(btrim(content)) > 0 and char_length(content) <= 2000),
  created_at timestamptz default now() not null,
  read_at timestamptz,
  check (sender_id <> recipient_id)
);

create index if not exists idx_messages_sender on public.messages(sender_id, created_at desc);
create index if not exists idx_messages_recipient on public.messages(recipient_id, created_at desc);
create index if not exists idx_messages_recipient_unread on public.messages(recipient_id) where read_at is null;

alter table public.messages enable row level security;

create policy "Users can view their own conversations"
on public.messages for select
using (auth.uid() = sender_id or auth.uid() = recipient_id);

create policy "Users can send messages"
on public.messages for insert
with check (auth.uid() = sender_id);

create policy "Recipients can mark messages read"
on public.messages for update
using (auth.uid() = recipient_id)
with check (auth.uid() = recipient_id);

-- ── List conversations: latest message + partner profile + unread count ──
create or replace function public.get_conversations()
returns table (
  partner_id uuid,
  username text,
  display_name text,
  avatar_url text,
  last_message text,
  last_message_at timestamptz,
  last_sender_id uuid,
  unread_count bigint
)
language sql
stable
set search_path = public
as $$
  with my_messages as (
    select
      case when sender_id = auth.uid() then recipient_id else sender_id end as partner_id,
      content,
      created_at,
      sender_id
    from public.messages
    where sender_id = auth.uid() or recipient_id = auth.uid()
  ),
  ranked as (
    select *,
      row_number() over (partition by partner_id order by created_at desc) as rn
    from my_messages
  )
  select
    r.partner_id,
    p.username,
    p.display_name,
    p.avatar_url,
    r.content as last_message,
    r.created_at as last_message_at,
    r.sender_id as last_sender_id,
    (select count(*) from public.messages m
       where m.recipient_id = auth.uid()
         and m.sender_id = r.partner_id
         and m.read_at is null) as unread_count
  from ranked r
  join public.profiles p on p.id = r.partner_id
  where r.rn = 1
  order by r.created_at desc;
$$;

-- ── Total unread count (for a badge) ──
create or replace function public.get_unread_message_count()
returns bigint
language sql
stable
set search_path = public
as $$
  select count(*) from public.messages
  where recipient_id = auth.uid() and read_at is null;
$$;

grant execute on function public.get_conversations() to authenticated;
grant execute on function public.get_unread_message_count() to authenticated;
