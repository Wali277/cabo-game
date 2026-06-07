import { useEffect } from "react";
import { useStore } from "./store";

/**
 * Accounts layer — token-purchase celebration watcher (frontend-only).
 *
 * Tokens bought via Ko-fi are credited server-side; the client learns about the
 * new balance by re-fetching the profile. This hook refreshes the profile and
 * runs `checkTokenGrant()` (the rise-detector) at the moments that matter — so a
 * purchase made in another tab pops the reveal as soon as the player comes back.
 *
 * It stays "live + on next open" WITHOUT any socket/backend:
 *   - immediately when the player is on the MENU (covers app open + returning
 *     from a game),
 *   - on window focus / tab `visibilitychange` (the key path: buy on the Ko-fi
 *     tab → switch back to Lumo → reveal), and
 *   - on a gentle poll while on the menu.
 *
 * Everything is gated to `screen === "menu"` so we never hit the network during
 * a game, and the effect keys on the stable account ID + screen (NOT the account
 * object, which changes reference on every refresh → would loop).
 */

// Gentle poll cadence while sitting on the menu. Long enough to be negligible
// load; short enough that a purchase shows within ~half a minute even without a
// focus event.
const POLL_MS = 25_000;

export function useTokenGrantWatch(): void {
  // Stable primitives only — depending on the `account` object would re-run the
  // effect on every refreshProfile() (new object ref) and loop.
  const accountId = useStore((s) => s.account?.profile.id ?? null);
  const screen = useStore((s) => s.screen);

  useEffect(() => {
    if (!accountId || screen !== "menu") return;

    const refreshAndCheck = () => {
      void (async () => {
        try {
          const auth = await import("./auth");
          const profile = await auth.getMyProfile();
          // Only UPDATE on a real profile — NEVER clear the account on a null
          // result. A flaky/offline fetch must not spuriously sign the player
          // out (the store's refreshProfile() clears on null, so we avoid it).
          if (profile) useStore.getState().setAccount(profile);
        } catch {
          /* offline / transient — try again on the next focus or poll tick */
        } finally {
          useStore.getState().checkTokenGrant();
        }
      })();
    };

    // Run once on entering the menu (app open, or returning after a game).
    refreshAndCheck();

    const onFocus = () => refreshAndCheck();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshAndCheck();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(refreshAndCheck, POLL_MS);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [accountId, screen]);
}
