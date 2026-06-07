-- =============================================================================
-- 0005_recolor_settings.sql
-- Lumo — Phase 7 "Settings (email change)" DB change.
-- -----------------------------------------------------------------------------
-- ONE small, idempotent change (no new tables):
--
--   SETTINGS (email change) — allow a third email-code purpose 'change_email'
--   so changing your account email can be re-verified with a 6-digit code to the
--   NEW address (same issue/verify RPCs as signup/reset).
--
-- NOTE on the "Recolor" (custom) skin:
--   An earlier draft of this file made the free "custom" card skin owned by
--   everyone (unlocked_skins default '{classic,custom}' + a backfill). That was
--   REVERTED — the custom/Recolor skin is now a LEVEL-2 REWARD, granted by
--   public.grant_xp when an account reaches level 2 (see 0006_level_rewards_redeem.sql).
--   So this migration no longer touches unlocked_skins; the 0001 default
--   ('{classic}') stands.
--
-- Safe to re-run.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Settings: add the 'change_email' code purpose.
-- -----------------------------------------------------------------------------
-- The 0002 CHECK was `purpose in ('signup','reset')` (auto-named
-- email_codes_purpose_check). Widen it to include 'change_email'.
alter table public.email_codes
  drop constraint if exists email_codes_purpose_check;
alter table public.email_codes
  add constraint email_codes_purpose_check
  check (purpose in ('signup', 'reset', 'change_email'));

-- =============================================================================
-- End of 0005_recolor_settings.sql
-- =============================================================================
