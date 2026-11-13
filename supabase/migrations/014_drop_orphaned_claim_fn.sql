-- ============================================================
-- Security fix: drop the orphaned single-arg claim_territory_from_run.
--
-- 009_attack_notifications.sql (and ghost_run after it) replaced this with
-- a (uuid, text) overload, but `create or replace function` with a
-- different signature creates a new overload rather than replacing the
-- old one — so the original (uuid) version was still sitting there with
-- its original grants, which never revoked anon. Nothing in the client
-- calls the 1-arg form any more (territoryService.ts always passes
-- p_place_label), and it was exploitable: called as anon, `auth.uid()` is
-- null, `v_user_id <> null` evaluates to NULL (not true) in plpgsql's
-- three-valued logic, so the "not_owner" guard silently never fired and
-- an unauthenticated caller could run the claim/steal logic for any run_id.
-- ============================================================

drop function if exists public.claim_territory_from_run(uuid);
