import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../state/store";

/**
 * Shown ONLY when the room HOST removes you from the lobby (store flag
 * `kickedByHost`, set from the `room:kicked` socket event in mp.ts).
 *
 * Deliberately DISTINCT from the bust / "You Were Eliminated" screen: a door
 * icon + amber heading + host-removal copy, never "you busted". The single
 * action returns to the main menu, which also tears down the socket + clears
 * the room (backToMenu). zIndex sits above the bust/eliminated overlays.
 */
export function KickedOverlay() {
  const kicked = useStore((s) => s.kickedByHost);
  const backToMenu = useStore((s) => s.backToMenu);

  return (
    <AnimatePresence>
      {kicked && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ zIndex: 360 }}
          role="alertdialog"
          aria-modal="true"
          aria-label="Removed from the room"
        >
          <motion.div
            className="modal kicked-modal"
            initial={{ scale: 0.85, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 240, damping: 24 }}
          >
            <div className="modal-burst" aria-hidden="true">
              🚪
            </div>
            <h2>Removed from the room</h2>
            <p className="modal-subtitle">The host removed you</p>
            <p style={{ fontSize: "14px", color: "#6b6478", marginBottom: "24px" }}>
              The host removed you from this room. No worries — you can join
              another room or start your own from the menu.
            </p>
            <button className="btn primary big" onClick={backToMenu} autoFocus>
              Return to Main Menu
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
