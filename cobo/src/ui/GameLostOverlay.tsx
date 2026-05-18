import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";

/**
 * Shown to the loser(s) when the game is fully over (gloriosVictory is set)
 * and they are not the winner. Replaces BustedOverlay for game-ending eliminations.
 *
 * Distinct from BustedOverlay (mid-game bust, game continues with others)
 * and GloriousVictory (the winner's screen).
 */
export function GameLostOverlay() {
  const mp = useStore((s) => s.mp);
  const humanId = useStore((s) => s.humanId);
  const game = useStore((s) => s.game);
  const backToMenu = useStore((s) => s.backToMenu);
  const mode = useStore((s) => s.mode);

  const gloriosVictory = mp?.gloriosVictory ?? null;

  // Show when: game is over AND I am not the winner AND I was eliminated.
  const iAmEliminated =
    (mp?.bustedThisRound.includes(humanId) ?? false) ||
    (mp?.kickedIds.includes(humanId) ?? false);

  const show =
    mode === "mp" &&
    !!gloriosVictory &&
    gloriosVictory !== humanId &&
    iAmEliminated;

  // Play lose SFX once when the overlay appears.
  useEffect(() => {
    if (show) Audio.playSfx("lose");
  }, [show]);

  if (!show) return null;

  // Look up the winner's name from the current game or the room member list.
  const victorName =
    game?.players.find((p) => p.id === gloriosVictory)?.name ??
    mp?.members.find((m) => m.id === gloriosVictory)?.name ??
    "Your opponent";

  return (
    <AnimatePresence>
      <motion.div
        className="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ zIndex: 350 }}
      >
        <motion.div
          className="modal busted-modal"
          initial={{ scale: 0.6, y: 20, rotate: -4 }}
          animate={{ scale: 1, y: 0, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
        >
          <div className="modal-burst">🏁</div>
          <h2>{victorName} Won!</h2>
          <p className="modal-subtitle">They were the last one standing</p>
          <p style={{ fontSize: "14px", color: "#888", marginBottom: "24px" }}>
            You were eliminated from the game.
            <br />
            Better luck next time!
          </p>
          <button className="btn primary big" onClick={backToMenu}>
            Return to Menu
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
