-- =============================================================================
-- 0008_skin_rename.sql
-- Lumo — migrate retired card-skin ids to their successors (no purchase lost).
-- -----------------------------------------------------------------------------
-- The catalog change (cobo/src/state/cosmetics.ts + server/src/auth/cosmetics.ts)
-- replaced two legendary minimalist skins:
--
--   * 'minimalist' → 'ivory'
--   * 'handdrawn'  → 'eclipse'
--
-- The art is new, but the slot is the same purchase, so any player who already
-- OWNED a retired skin must keep an owned successor, and anyone who had a retired
-- skin EQUIPPED must switch to the successor (otherwise their active_skin would
-- reference a now-unknown id and the client would clamp to the default). The
-- client mirrors this with LEGACY_SKIN_ALIASES in cardskin.ts so stored / profile
-- values resolve forward even before this migration runs.
--
-- Safe to re-run (idempotent: array_replace is a no-op once the legacy ids are
-- gone; the equip UPDATEs only match the legacy ids).
-- =============================================================================

-- 1. Ownership: remap any owned legacy skin id to its successor in-place.
update public.profiles
   set unlocked_skins =
         array_replace(
           array_replace(unlocked_skins, 'minimalist', 'ivory'),
           'handdrawn', 'eclipse')
 where unlocked_skins && array['minimalist', 'handdrawn']::text[];

-- 2. Equipped skin: switch anyone still on a retired id to its successor.
update public.profiles set active_skin = 'ivory'   where active_skin = 'minimalist';
update public.profiles set active_skin = 'eclipse' where active_skin = 'handdrawn';

-- =============================================================================
-- End of 0008_skin_rename.sql
-- =============================================================================
