-- =============================================================================
-- 0007_wallpaper_defaults.sql
-- Lumo — swap the free DEFAULT table wallpaper from Emerald → Horizon.
-- -----------------------------------------------------------------------------
-- Emerald + Crimson used to be the free defaults; they are now TOKEN UNLOCKS
-- (catalog change in cosmetics.ts). Horizon is now the single free default. The
-- catalog/`free` flags handle the store + purchase side; this migration handles
-- the DB ownership/defaults:
--
--   * New signups: unlocked_wallpapers default '{horizon}', active 'horizon'.
--   * Backfill: everyone now OWNS Horizon (it's free) — add it to all profiles.
--   * Existing owners of Emerald/Crimson KEEP them (grandfathered in their
--     unlocked_wallpapers); we never remove an already-earned cosmetic.
--   * Anyone still on the OLD default ('emerald') is switched to the new default
--     ('horizon'); players who picked a different wallpaper keep their choice.
--
-- Safe to re-run (idempotent: defaults are declarative; the backfill is guarded).
-- =============================================================================

-- New-signup defaults.
alter table public.profiles
  alter column unlocked_wallpapers set default '{horizon}';
alter table public.profiles
  alter column active_wallpaper    set default 'horizon';

-- Backfill: Horizon is free now, so unlock it for every existing account.
update public.profiles
   set unlocked_wallpapers = array_append(unlocked_wallpapers, 'horizon')
 where not ('horizon' = any(unlocked_wallpapers));

-- Move anyone still on the previous default ('emerald') onto the new default.
-- They still OWN emerald (it stays in unlocked_wallpapers) and can re-equip it.
update public.profiles
   set active_wallpaper = 'horizon'
 where active_wallpaper = 'emerald';

-- Defensive consistency: any profile whose active_wallpaper isn't actually in
-- its unlocked_wallpapers (corruption / a future-removed id) is reset to the
-- free default, which every account now owns (backfilled above).
update public.profiles
   set active_wallpaper = 'horizon'
 where not (active_wallpaper = any(unlocked_wallpapers));

-- =============================================================================
-- End of 0007_wallpaper_defaults.sql
-- =============================================================================
