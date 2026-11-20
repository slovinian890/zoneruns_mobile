-- Territory is entirely hex-based now (claim_territory_from_run only ever
-- grows user_territory.area_m2 by whole hexes — see 012_hex_defense_levels.sql
-- and later). area_m2 is a real ST_Area() in true-world square meters, which
-- shrinks with latitude (hex_polygon() builds each hex as a fixed 43.2m
-- circumradius in Web Mercator meters, not geographic ones), so it's not a
-- stable stand-in for "how many tiles do I own" the way the UI wants to show
-- it. Return the actual hex_claims row count instead so the client can
-- display a plain tile count rather than converting through area.

create or replace function public.get_my_territory_stats()
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'area_m2', coalesce((select round(area_m2::numeric, 1) from public.user_territory where user_id = auth.uid()), 0),
    'updated_at', (select updated_at from public.user_territory where user_id = auth.uid()),
    'hex_count', (select count(*) from public.hex_claims where user_id = auth.uid())
  );
$$;
