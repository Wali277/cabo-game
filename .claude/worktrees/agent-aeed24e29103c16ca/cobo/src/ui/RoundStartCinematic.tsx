import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";

/**
 * RoundStartCinematic — short (~1s) title flourish that plays at the start
 * of every round, including Round 1. Sits on top of the table during the
 * setup_peek phase, then fades out so players can tap their two peek cards
 * normally.
 *
 * Behaviour:
 *   - Triggers whenever the game's roundNumber changes (any round, not just
 *     the first). Detected by comparing the live roundNumber to the last
 *     value we showed for.
 *   - Only shows during phase === "setup_peek" — if the player rejoins mid
 *     round we don't blast a spurious cinematic over their game.
 *   - Auto-dismisses after 1.0s (reduced-motion: 350ms). Tap to skip.
 *   - Pointer events are off on the overlay backdrop so it doesn't block
 *     the setup-peek card taps underneath if the player is fast.
 */
export function RoundStartCinematic() {
  const game = useStore((s) => s.game);
  const reduced = useReducedMotion() ?? false;
  const [shownRound, setShownRound] = useState<number | null>(null);
  const lastShownFor = useRef<number | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!game) return;
    // Only fire during setup_peek — guarantees we don't interrupt mid-game
    // for a rejoin or a stray state update.
    if (game.phase !== "setup_peek") {
      // If we leave setup_peek before the timer fires, cancel and hide.
      if (shownRound !== null) {
        setShownRound(null);
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
      }
      return;
    }
    if (lastShownFor.current === game.roundNumber) return;
    lastShownFor.current = game.roundNumber;
    setShownRound(game.roundNumber);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    const holdMs = reduced ? 350 : 1000;
    dismissTimer.current = setTimeout(() => setShownRound(null), holdMs);
    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    };
  }, [game?.phase, game?.roundNumber, reduced]);

  const skip = () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setShownRound(null);
  };

  return (
    <AnimatePresence>
      {shownRound !== null && (
        <motion.div
          key={shownRound}
          className="round-start-cinematic"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4, ease: [0.16, 0.7, 0.32, 1] } }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          onClick={skip}
        >
          <div className="round-start-vignette" aria-hidden="true" />

          {/* Soft glow behind the title — gives it weight without darkening
              the whole screen as much as the action cinematic. */}
          <motion.div
            className="round-start-bloom"
            aria-hidden="true"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.7 }}
            exit={{ scale: 1.1, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 0.7, 0.32, 1] }}
          />

          <motion.div
            className="round-start-label"
            initial={{ opacity: 0, y: 18, letterSpacing: "0.5em" }}
            animate={{ opacity: 1, y: 0, letterSpacing: "0.32em" }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.25 } }}
            transition={{ duration: 0.45, ease: [0.16, 0.7, 0.32, 1] }}
          >
            ROUND
          </motion.div>

          <motion.h1
            className="round-start-number"
            initial={
              reduced
                ? { scale: 1, opacity: 0 }
                : { scale: 0.35, y: -40, rotate: -10, opacity: 0 }
            }
            animate={
              reduced
                ? { scale: 1, opacity: 1 }
                : {
                    scale: [0.35, 1.18, 1.0],
                    y: [-40, 0, 0],
                    rotate: [-10, 3, 0],
                    opacity: [0, 1, 1],
                  }
            }
            exit={{ scale: 0.9, opacity: 0, y: 8, transition: { duration: 0.3 } }}
            transition={
              reduced
                ? { duration: 0.25 }
                : { duration: 0.55, times: [0, 0.7, 1], ease: [0.16, 0.7, 0.32, 1] }
            }
          >
            {shownRound}
          </motion.h1>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
