/**
 * ────────────────────────────────────────────────────────────────────────────
 * ACCOUNT COSMETICS BRIDGE (Phase 2)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * One-way bridge that pushes the EFFECTIVE table wallpaper + card skin into the
 * local cosmetic stores (`theme.ts` / `cardskin.ts`) based on the signed-in
 * account. This is the seam where "what the account owns" becomes "what the
 * game actually renders":
 *
 *   - GUEST (`account` null) → forced defaults: horizon felt + classic cards.
 *     Guests don't get to customise (the in-game 🎨 picker is hidden for them),
 *     so we hard-reset to defaults in case a previous logged-in session left a
 *     non-default value in localStorage.
 *
 *   - ACCOUNT (set) → the profile's chosen cosmetics, CLAMPED to valid ids via
 *     `coerceTheme` / `coerceSkin`. An unknown / legacy / `evolved` id in the
 *     profile falls back to the default rather than breaking the render.
 *
 * Direction is account → cosmetic-store ONLY. Persisting the user's in-game
 * picker choices back onto the profile is Phase 6; until then a logged-in
 * player's local picker changes are session-local and get re-applied from the
 * profile on the next account change / reload.
 *
 * IMPORTANT: this only sets the user's CHOSEN skin via `setCardSkin`. The
 * Evolved render-override (Card.tsx forces the `evolved` skin at render time
 * during Evolved games) is a SEPARATE mechanism and is intentionally untouched.
 */
import { useEffect } from "react";
import { useStore } from "./store";
import { coerceTheme, setTheme, DEFAULT_THEME } from "./theme";
import { coerceSkin, setCardSkin, DEFAULT_SKIN } from "./cardskin";

/**
 * Subscribe to the store's `account` and apply the effective cosmetics whenever
 * the account identity or its active cosmetic ids change. Call ONCE near the top
 * of the app tree (App.tsx) alongside the other bootstrap effects.
 *
 * The effect is keyed on the account id + both active_* fields (not the
 * `account` object reference) so it re-applies when the profile's selection
 * changes — including the initial value and after `initAuth` restores a
 * session — without thrashing on unrelated re-renders.
 */
export function useAccountCosmetics(): void {
  const account = useStore((s) => s.account);

  const profileId = account?.profile.id ?? null;
  const activeWallpaper = account?.profile.active_wallpaper ?? null;
  const activeSkin = account?.profile.active_skin ?? null;

  useEffect(() => {
    if (!account) {
      // Guest: hard-reset to the FREE defaults (clears any leftover from a prior
      // login). Uses the DEFAULT_* constants so it always tracks the free default
      // wallpaper/skin (currently horizon / classic) rather than hardcoding —
      // emerald is now a paid wallpaper, so a guest must never be forced onto it.
      setTheme(DEFAULT_THEME);
      setCardSkin(DEFAULT_SKIN);
      return;
    }
    // Account: apply chosen cosmetics, clamped to valid ids.
    setTheme(coerceTheme(activeWallpaper));
    setCardSkin(coerceSkin(activeSkin));
    // Keyed on identity + active selections, not the object ref. `account` is
    // read inside but only its branch matters; the keys capture every value the
    // body depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, activeWallpaper, activeSkin]);
}
