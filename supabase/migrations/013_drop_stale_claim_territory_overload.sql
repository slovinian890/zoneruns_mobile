-- migration 009 intended to drop this single-arg overload when it
-- introduced the (uuid, text) version, but it's still live: anon-callable
-- (its ownership check `v_user_id <> auth.uid()` is NULL, not TRUE, when
-- auth.uid() is NULL, so PL/pgSQL's `if` just falls through), predates
-- attack_notifications entirely, and has no is_ghost awareness. The app
-- always calls the 2-arg version, so this was dead weight even before
-- Ghost Run (012) — now it'd also be a way to silently bypass it.
drop function if exists public.claim_territory_from_run(uuid);
