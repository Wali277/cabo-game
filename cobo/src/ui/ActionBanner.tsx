import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";

/** Visual presentation of each action rank — label, emoji, colour, and a
 *  short description shown in the hover tooltip. */
const ACTION_INFO: Record<string, {
  text: string;
  emoji: string;
  color: string;
  description: string;
}> = {
  "7":  { text: "PEEK OWN",    emoji: "👁", color: "#67e0a3",
          description: "Look at one of YOUR own cards to remember it." },
  "8":  { text: "PEEK OWN",    emoji: "👁", color: "#67e0a3",
          description: "Look at one of YOUR own cards to remember it." },
  "9":  { text: "SPY",          emoji: "🔍", color: "#7aa8ff",
          description: "Spy on one of an OPPONENT'S cards." },
  "10": { text: "SPY",          emoji: "🔍", color: "#7aa8ff",
          description: "Spy on one of an OPPONENT'S cards." },
  J:    { text: "BLIND SWAP",  emoji: "🔀", color: "#ff8ec0",
          description: "Swap one of your cards with an opponent's without looking." },
  Q:    { text: "BLIND SWAP",  emoji: "🔀", color: "#ff8ec0",
          description: "Swap one of your cards with an opponent's without looking." },
  K:    { text: "PEEK & SWAP", emoji: "👑", color: "#ffd86b",
          description: "Look at an opponent's card, then choose to swap or pass." },
};

export function ActionBanner() {
  const game = useStore((s) => s.game);
  const humanId = useStore((s) => s.humanId);
  const triggerAction = useStore((s) => s.triggerAction);
  const skipAction = useStore((s) => s.skipAction);

  const src = game?.pendingActionSource;
  const info = src ? ACTION_INFO[src.rank] : null;

  const isMyTurn = !!game && game.players[game.currentPlayer]?.id === humanId;
  const isPending = game?.phase === "pending_action";
  const showActionButtons = isPending && isMyTurn && !!info;

  // When the action is firing (we left pending_action and entered action_*), still show
  // a small banner so the player knows what's happening.
  const isActiveAction =
    !!game && (
      game.phase === "action_peek_own" ||
      game.phase === "action_peek_other" ||
      game.phase === "action_blind_swap" ||
      game.phase === "action_peek_and_swap_pick" ||
      game.phase === "action_peek_and_swap_decide"
    );

  return (
    <>
      {/* Banner: shown both during pending_action AND during active action — */}
      <AnimatePresence>
        {info && src && (isActiveAction || isPending) && (
          <motion.div
            key={src.id}
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

      {/* Action / Skip buttons — only during pending_action on the human's turn */}
      <AnimatePresence>
        {showActionButtons && (
          <motion.div
            className="action-choice-row"
            initial={{ y: 40, opacity: 0, scale: 0.85 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
          >
            <button
              className="btn ghost-light action-skip-btn"
              onClick={() => { Audio.playSfx("click"); skipAction(); }}
            >
              ✕ Skip
            </button>

            {/* Tooltip is on a wrapper so it appears even when the button is disabled */}
            <div className="action-btn-wrap" data-tip={info!.description}>
              <button
                className="btn primary big action-confirm-btn"
                onClick={() => { Audio.playSfx("action_trigger"); triggerAction(); }}
                style={{ background: info!.color, color: "#1c1d2b" }}
              >
                <span className="action-emoji">{info!.emoji}</span>
                Use {info!.text}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
