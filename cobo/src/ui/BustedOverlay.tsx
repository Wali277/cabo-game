import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../state/store";

// Key used to persist the "busted from room X" flag across page loads/refreshes.
// Cleared when the player explicitly dismisses the EliminatedOverlay.
export const BUSTED_ROOM_KEY = "cobo.mp.busted";

export function BustedOverlay() {
  const game = useStore((s) => s.game!);
  const humanId = useStore((s) => s.humanId);
  const mp = useStore((s) => s.mp);
  const backToMenu = useStore((s) => s.backToMenu);
  const mode = useStore((s) => s.mode);

  // Only show the "mid-game bust" overlay when:
  //  • the local player just busted this round, AND
  //  • the game is NOT over (no gloriosVictory declared).
  // When the game ends (gloriosVictory set), the loser sees GameLostOverlay instead.
  const isBusted =
    mode === "mp" &&
    !!mp &&
    game.phase === "round_over" &&
    mp.bustedThisRound.includes(humanId) &&
    !mp.gloriosVictory;

  // Persist a "busted from this room" marker in localStorage so that if the
  // player navigates back to the same link (after leaveRoom clears their
  // session), they still see the EliminatedOverlay instead of the lobby.
  useEffect(() => {
    if (!isBusted || !mp?.code) return;
    localStorage.setItem(BUSTED_ROOM_KEY, JSON.stringify({ code: mp.code }));
  }, [isBusted, mp?.code]);

  if (!isBusted) return null;

  const scores = game.scores[humanId] ?? [];
  const total = scores.reduce((a, b) => a + b, 0);

  return (
    <AnimatePresence>
      <motion.div
        className="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ zIndex: 300 }}
      >
        <motion.div
          className="modal busted-modal"
          initial={{ scale: 0.6, y: 20, rotate: -4 }}
          animate={{ scale: 1, y: 0, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
        >
          <div className="modal-burst">💥</div>
          <h2>You&apos;re Busted!</h2>
          <p className="modal-subtitle">Your total score reached {total} pts — over the 60 limit</p>
          <div className="busted-score">{total} pts</div>
          <p style={{ fontSize: "14px", color: "#888", marginBottom: "20px" }}>
            You&apos;ve been eliminated. Better luck next game!
          </p>
          <button className="btn primary big" onClick={backToMenu}>
            Return to Menu
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
