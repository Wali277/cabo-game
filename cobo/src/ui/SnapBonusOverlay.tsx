import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useStore } from "../state/store";

/**
 * Tiny "Snap bonus" overlay that only the player who earned the bonus
 * sees. Fires when the engine pushes a snap_bonus animation event whose
 * payload.playerId matches the local viewer. Auto-dismisses after ~2.6s.
 *
 * The bonus itself (−10 off the round score) is applied by endRound in
 * the engine; this overlay is the in-game feedback so the player knows
 * the reward landed before the round actually ends.
 */
export function SnapBonusOverlay() {
  const animations = useStore((s) => s.game?.animations);
  const humanId = useStore((s) => s.humanId);
  const reduced = useReducedMotion() ?? false;
  const [show, setShow] = useState<{ key: number } | null>(null);
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!animations) return;
    // Walk back to the most recent snap_bonus event addressed to me.
    for (let i = animations.length - 1; i >= 0; i -= 1) {
      const a = animations[i];
      if (a.id === handledRef.current) return; // already shown
      if (a.kind !== "snap_bonus") continue;
      if ((a.payload.playerId as string) !== humanId) return;
      handledRef.current = a.id;
      setShow({ key: Date.now() });
      return;
    }
  }, [animations, humanId]);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(null), reduced ? 1200 : 2600);
    return () => clearTimeout(t);
  }, [show, reduced]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={show.key}
          className="snap-bonus-overlay"
          initial={{ opacity: 0, y: 24, scale: 0.82 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.96, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
          transition={{ type: "spring", stiffness: 360, damping: 22 }}
          aria-live="polite"
          role="status"
        >
          <div className="snap-bonus-title">Snap bonus!</div>
          <div className="snap-bonus-sub">−10 off your total score</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
