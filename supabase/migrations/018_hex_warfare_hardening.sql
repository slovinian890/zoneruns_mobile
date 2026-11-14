-- Advisor cleanup for 017_clan_hex_warfare.sql: is_hex_ally was missing its
-- search_path pin (every other function here sets one), and
-- validate_active_group — a trigger-only function, same as
-- clear_active_group_on_member_leave right next to it — never got the
-- direct-execute revoke its sibling did, leaving it callable via
-- /rest/v1/rpc/validate_active_group (Postgres would reject actually
-- running it outside a trigger context, but it shouldn't be reachable at
-- all per this project's established convention).

alter function public.is_hex_ally(uuid, uuid, uuid, uuid) set search_path = public;

revoke execute on function public.validate_active_group() from public, anon, authenticated, service_role;
