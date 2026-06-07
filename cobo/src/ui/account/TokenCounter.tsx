import { motion } from "framer-motion";
import { useStore } from "../../state/store";
import { isAuthConfigured } from "../../state/auth";
import { Audio } from "../../audio/sounds";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * ACCOUNTS LAYER (Phase 3 — profile menu shell)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A fixed bottom-right pill showing the signed-in account's token balance
 * (🪙 + count). It mirrors the bottom-LEFT `<AccountMenuTab/>` on the opposite
 * corner so the menu has a symmetric account/token pair. Renders NOTHING for
 * guests or on guest-only builds.
 *
 * MENU ONLY: tokens are a menu/store concern, so App.tsx mounts this on the
 * menu screen alone — never during a game (SP or MP), where the play area must
 * stay clean. The pill opens the profile panel (where tokens are spent).
 */
export function TokenCounter() {
  const account = useStore((s) => s.account);
  const setProfilePanelOpen = useStore((s) => s.setProfilePanelOpen);

  if (!isAuthConfigured() || !account) return null;

  const tokens = account.profile.tokens;

  return (
    <motion.button
      className="token-counter on-menu"
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 20 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.94 }}
      onClick={() => {
        Audio.playSfx("click");
        setProfilePanelOpen(true);
      }}
      aria-label={`${tokens} tokens — spend on skins & wallpapers`}
      title="Tokens — spend on skins & wallpapers"
    >
      <span className="token-counter-coin" aria-hidden="true">
        🪙
      </span>
      <span className="token-counter-value">{tokens}</span>
    </motion.button>
  );
}
