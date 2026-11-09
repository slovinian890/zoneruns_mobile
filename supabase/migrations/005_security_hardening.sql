-- ============================================================
-- Lock down RPC functions to the `authenticated` role only.
--
-- Supabase grants EXECUTE to anon/authenticated/service_role on every new
-- function by default (ALTER DEFAULT PRIVILEGES), which is NOT limited by
-- `revoke ... from public` — that only strips the separate implicit PUBLIC
-- grant. You have to revoke from the named roles directly.
-- ============================================================

revoke execute on function public.claim_territory_from_run(uuid) from anon;
revoke execute on function public.get_territories_in_bounds(double precision, double precision, double precision, double precision) from anon;
revoke execute on function public.get_my_territory_stats() from anon;
revoke execute on function public.get_conversations() from anon;
revoke execute on function public.get_unread_message_count() from anon;

-- Trigger-only functions: never meant to be called directly via RPC
revoke execute on function public.handle_new_user() from anon, authenticated, service_role;
revoke execute on function public.handle_updated_at() from anon, authenticated, service_role;
