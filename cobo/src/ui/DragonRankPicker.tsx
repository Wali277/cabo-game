import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";
import type { Rank } from "../engine/types";

/**
 * DragonRankPicker — Cabo Evolved Dragon activation step.
 *
 * After a human Activates a drawn Dragon (phase → "dragon_choose"), this
 * centered overlay lets them pick the rank the Dragon transforms into. The
 * chosen card becomes a free "extra card" and play returns to the normal
 * turn_drawn flow (keep it, or use its action). Bots resolve dragon_choose
 * themselves in botMove, so this only shows on the human's own turn.
 *
 * Deliberately a centered overlay (not the LeftPanel) so the 14-rank grid
 * never inflates the side panel's height.
 */
const RANKS: { rank: Rank; label: string; hint?: string }[] = [
  { rank: "A", label: "A", hint: "1" },
  { rank: "2", label: "2" },
  { rank: "3", label: "3" },
  { rank: "4", label: "4" },
  { rank: "5", label: "5" },
  { rank: "6", label: "6" },
  { rank: "7", label: "7", hint: "Peek/Spy" },
  { rank: "8", label: "8", hint: "Peek/Spy" },
  { rank: "9", label: "9", hint: "Peek+Spy" },
  { rank: "10", label: "10", hint: "Peek+Spy" },
  { rank: "J", label: "J", hint: "Swap" },
  { rank: "Q", label: "Q", hint: "Swap" },
  { rank: "K", label: "K", hint: "0" },
  { rank: "Joker", label: "★", hint: "Joker · 0" },
];

export function DragonRankPicker() {
  const game = useStore((s) => s.game);
  const humanId = useStore((s) => s.humanId);
  const dragonChooseRank = useStore((s) => s.dragonChooseRank);

  const open =
    !!game &&
    game.phase === "dragon_choose" &&
    game.players[game.currentPlayer]?.id === humanId;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay dragon-pick-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ zIndex: 340 }}
        >
          <motion.div
            className="dragon-pick-modal"
            initial={{ scale: 0.9, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 24 }}
            role="dialog"
            aria-modal="true"
            aria-label="Choose the Dragon's card"
          >
            <div className="dragon-pick-kicker">🐉 Dragon</div>
            <h2 className="dragon-pick-title">Become any card</h2>
            <p className="dragon-pick-sub">
              Pick a rank — it joins your turn as that card (a free extra card).
              Pick an action card to use its power, or a 0 to dump a high one.
            </p>
            <div className="dragon-pick-grid">
              {RANKS.map((r) => (
                <button
                  key={r.rank}
                  className="dragon-pick-btn"
                  onClick={() => { Audio.playSfx("action_trigger"); dragonChooseRank(r.rank); }}
                >
                  <span className="dragon-pick-rank">{r.label}</span>
                  {r.hint && <span className="dragon-pick-hint">{r.hint}</span>}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
