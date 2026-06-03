import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../state/store";

export function EliminatedOverlay() {
  const eliminated = useStore((s) => s.eliminatedFromRoom);
  const backToMenu = useStore((s) => s.backToMenu);

  return (
    <AnimatePresence>
      {eliminated && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ zIndex: 300 }}
        >
          <motion.div
            className="modal busted-modal"
            initial={{ scale: 0.6, y: 20, rotate: -4 }}
            animate={{ scale: 1, y: 0, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
          >
            <div className="modal-burst">🚫</div>
            <h2>You Were Eliminated</h2>
            <p className="modal-subtitle">
              You busted out of this game and can&apos;t rejoin.
            </p>
            <p style={{ fontSize: "14px", color: "#888", marginBottom: "24px" }}>
              Your score exceeded the limit and you were kicked from the room.
              Better luck in the next game!
            </p>
            <button className="btn primary big" onClick={backToMenu}>
              Return to Menu
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
