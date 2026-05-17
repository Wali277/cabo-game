import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../state/store";

export function BustedOverlay() {
  const game = useStore((s) => s.game!);
  const humanId = useStore((s) => s.humanId);
  const mp = useStore((s) => s.mp);
  const backToMenu = useStore((s) => s.backToMenu);
  const mode = useStore((s) => s.mode);

  if (mode !== "mp" || !mp) return null;
  if (game.phase !== "round_over") return null;
  if (!mp.bustedThisRound.includes(humanId)) return null;

  const scores = game.scores[humanId] ?? [];
  const total = scores.reduce((a, b) => a + b, 0);

  return (
    <AnimatePresence>
      <motion.div
        className="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ zIndex: 210 }}
      >
        <motion.div
          className="modal busted-modal"
          initial={{ scale: 0.6, y: 20, rotate: -4 }}
          animate={{ scale: 1, y: 0, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
        >
          <div className="modal-burst">💥</div>
          <h2>You&apos;re Busted!</h2>
          <p className="modal-subtitle">Your total score reached {total} pts — over the 100 limit</p>
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
