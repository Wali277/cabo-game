import { motion } from "framer-motion";
import { useStore } from "../../state/store";
import { isAuthConfigured } from "../../state/auth";
import { xpToLevel } from "../../state/progression";
import { Audio } from "../../audio/sounds";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * ACCOUNTS LAYER (Phase 3 — profile menu shell)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The fixed bottom-LEFT affordance on the MAIN MENU. Two faces:
 *   - Guest (no account)  → a "log in or create an account" invite pill that
 *     routes to the auth flow (`setScreen("login")`).
 *   - Signed in (account) → a profile pill (avatar · username · "Lv N" · 🪙
 *     tokens · slim XP bar) that opens the large profile panel
 *     (`setProfilePanelOpen(true)`).
 *
 * Renders NOTHING when Supabase isn't configured, so guest-only builds never
 * show a dead-end account entry. App.tsx only mounts this on the menu screen,
 * so it never collides with the in-game FAB stack (bottom-right).
 *
 * Display-only: the XP math comes from `progression.ts` (a mirror of the
 * server-authoritative SQL); this component never writes anything.
 */
export function AccountMenuTab() {
  const account = useStore((s) => s.account);
  const setScreen = useStore((s) => s.setScreen);
  const setProfilePanelOpen = useStore((s) => s.setProfilePanelOpen);

  // Guest-only build: no auth entry point at all.
  if (!isAuthConfigured()) return null;

  // ── Guest: invite to sign in / create an account ──────────────────────────
  if (!account) {
    return (
      <motion.button
        className="account-tab account-tab-guest"
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.45, type: "spring", stiffness: 220, damping: 24 }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => {
          Audio.playSfx("click");
          setScreen("login");
        }}
        aria-label="Log in or create an account to save your progress"
      >
        <span className="account-tab-avatar" aria-hidden="true">
          👤
        </span>
        <span className="account-tab-text">
          <span className="account-tab-title">Log in or create an account</span>
          <span className="account-tab-sub">Save your progress &amp; cosmetics</span>
        </span>
      </motion.button>
    );
  }

  // ── Signed in: profile pill with a slim XP bar ────────────────────────────
  const { profile } = account;
  const { level, xpIntoLevel, xpForNext } = xpToLevel(profile.total_xp);
  const tokens = profile.tokens;
  // Cap the chip's visual length so a high token balance can't overflow the pill
  // on a narrow phone. Aria-label keeps the precise number for screen readers.
  const tokensLabel = tokens > 999 ? "999+" : String(tokens);
  const pct = xpForNext > 0 ? Math.min(100, (xpIntoLevel / xpForNext) * 100) : 0;

  return (
    <motion.button
      className="account-tab account-tab-profile"
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.45, type: "spring", stiffness: 220, damping: 24 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => {
        Audio.playSfx("click");
        setProfilePanelOpen(true);
      }}
      aria-label={`Open profile — ${profile.username}, level ${level}, ${tokens} tokens`}
    >
      <span className="account-tab-avatar" aria-hidden="true">
        👤
      </span>
      <span className="account-tab-text">
        <span className="account-tab-row">
          <span className="account-tab-name" title={profile.username}>
            {profile.username}
          </span>
          <span className="account-tab-level">Lv {level}</span>
          <span
            className="account-tab-tokens"
            title="Tokens — spend on skins & wallpapers"
          >
            <span className="account-tab-tokens-coin" aria-hidden="true">🪙</span>
            {tokensLabel}
          </span>
        </span>
        <span
          className="account-tab-xp"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={xpForNext}
          aria-valuenow={xpIntoLevel}
          aria-label="XP progress to next level"
        >
          <span className="account-tab-xp-fill" style={{ width: `${pct}%` }} />
        </span>
      </span>
    </motion.button>
  );
}
