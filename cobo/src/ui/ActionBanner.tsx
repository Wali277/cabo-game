import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "../state/store";

/** Visual presentation of each action rank — label, emoji, colour. */
const ACTION_INFO: Record<string, { text: string; emoji: string; color: string }> = {
  "7":  { text: "PEEK OWN",    emoji: "👁",  color: "#67e0a3" },
  "8":  { text: "PEEK OWN",    emoji: "👁",  color: "#67e0a3" },
  "9":  { text: "SPY",          emoji: "🔍", color: "#7aa8ff" },
  "10": { text: "SPY",          emoji: "🔍", color: "#7aa8ff" },
  J:    { text: "BLIND SWAP",  emoji: "🔀", color: "#ff8ec0" },
  Q:    { text: "BLIND SWAP",  emoji: "🔀", color: "#ff8ec0" },
  K:    { text: "PEEK & SWAP", emoji: "👑", color: "#ffd86b" },
};

/** A small floating ribbon shown while an action ability is being executed.
 *  Buttons for triggering / skipping have moved into the left panel. */
export function ActionBanner() {
  const game = useStore((s) => s.game);

  // Determine whether an action is currently executing
  const isActiveAction =
    !!game && (
      game.phase === "action_peek_own" ||
      game.phase === "action_peek_other" ||
      game.phase === "action_blind_swap" ||
      game.phase === "action_peek_and_swap_pick" ||
      game.phase === "action_peek_and_swap_decide"
    );

  const src = game?.pendingActionSource;
  const info = src ? ACTION_INFO[src.rank] : null;

  return (
    <AnimatePresence>
      {info && isActiveAction && (
        <motion.div
          key={src!.id}
          className="action-banner"
          initial={{ scale: 0.3, opacity: 0, rotate: -12, y: 20 }}
          animate={{ scale: 1, opacity: 1, rotate: -4, y: 0 }}
          exit={{ scale: 1.4, opacity: 0, y: -10 }}
          transition={{ type: "spring", stiffness: 200, damping: 14 }}
          style={{ background: info.color }}
        >
          <span className="action-emoji">{info.emoji}</span>
          <span className="action-text">{info.text}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
