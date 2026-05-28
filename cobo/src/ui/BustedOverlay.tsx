import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useStore } from "../state/store";
import { ShatterGlass } from "./Particles";

// Key used to persist the "busted from room X" flag across page loads/refreshes.
// Cleared when the player explicitly dismisses the EliminatedOverlay.
export const BUSTED_ROOM_KEY = "cobo.mp.busted";

/**
 * BustedOverlay — two-beat cinematic when the local player gets eliminated.
 *
 *   beat 1  splash  (0   to 1.4s)  : screen dims hard, "BUSTED" stamp
 *                                    slams in at a -6° tilt with a chunky
 *                                    red shadow, glass shards radiate
 *                                    outward and fall under gravity
 *   beat 2  modal   (1.4s onward)  : the score / message / return-to-menu
 *                                    modal slides up from below
 */
export function BustedOverlay() {
  const game = useStore((s) => s.game!);
  const humanId = useStore((s) => s.humanId);
  const mp = useStore((s) => s.mp);
  const elim = useStore((s) => s.elim);
  const backToMenu = useStore((s) => s.backToMenu);
  const mode = useStore((s) => s.mode);
  const reduced = useReducedMotion() ?? false;

  // Mode-agnostic: read from elim (mirrored from MP room, computed locally in SP).
  // Always plays its splash when the human is in bustedThisRound — even if a
  // Glorious Victory landed on the same tick — so the cinematic isn't skipped.
  // The handoff to GameLostOverlay / GloriousVictory happens below, AFTER the
  // splash exit completes.
  const isBusted =
    game.phase === "round_over" &&
    elim.bustedThisRound.includes(humanId);

  useEffect(() => {
    // MP-only persistence: stores the room code so a refresh during a busted
    // state still shows the elimination screen on rejoin. SP has no room to
    // rejoin, so we skip this in SP.
    if (!isBusted || mode !== "mp" || !mp?.code) return;
    localStorage.setItem(BUSTED_ROOM_KEY, JSON.stringify({ code: mp.code }));
  }, [isBusted, mode, mp?.code]);

  // Cinematic stage. Skip straight to modal under reduced-motion.
  const [stage, setStage] = useState<"splash" | "modal">("splash");
  useEffect(() => {
    if (!isBusted) { setStage("splash"); return; }
    if (reduced) { setStage("modal"); return; }
    const t = setTimeout(() => setStage("modal"), 1400);
    return () => clearTimeout(t);
  }, [isBusted, reduced]);

  if (!isBusted) return null;
  // After the splash exits, if a Glorious Victory landed this round, hand off
  // to GameLostOverlay / GloriousVictory instead of showing the mid-game bust
  // modal (which is only the right UX when game continues with other players).
  if (stage === "modal" && elim.gloriosVictory) return null;

  const scores = game.scores[humanId] ?? [];
  const total = scores.reduce((a, b) => a + b, 0);

  return (
    <AnimatePresence>
      <motion.div
        className="overlay busted-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ zIndex: 300 }}
        onClick={stage === "splash" ? () => setStage("modal") : undefined}
      >
        <AnimatePresence mode="wait">
          {stage === "splash" ? (
            <motion.div
              key="splash"
              className="busted-splash-wrap"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.15, transition: { duration: 0.45, ease: [0.16, 0.7, 0.32, 1] } }}
            >
              <ShatterGlass color="#ff5b6e" />
              <motion.div
                className="busted-splash"
                initial={{ scale: 0.4, rotate: -14, opacity: 0 }}
                animate={{ scale: 1, rotate: -6, opacity: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 14, delay: 0.1 }}
              >
                Busted
              </motion.div>
              <motion.div
                className="busted-splash-sub"
                initial={{ y: 18, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.65, type: "spring", stiffness: 220, damping: 22 }}
              >
                {total} pts — over the 60 limit
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="modal"
              className="modal busted-modal"
              initial={{ scale: 0.85, y: 60, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-burst" style={{ position: "relative", zIndex: 1 }}>💥</div>
              <h2>You&apos;re Busted!</h2>
              <p className="modal-subtitle">Your total score reached {total} pts, over the 60 limit</p>
              <div className="busted-score">{total} pts</div>
              <p style={{ fontSize: "14px", color: "#888", marginBottom: "20px" }}>
                You&apos;ve been eliminated. Better luck next game!
              </p>
              <button className="btn primary big" onClick={backToMenu}>
                Return to menu
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
