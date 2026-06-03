import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";

/**
 * Brief "SNAP!" overlay that fires when an actionSnapOther / actionSnapSelf
 * event lands. Reads from game.animations and consumes the snap_correct /
 * snap_wrong events. Independent from the per-card flip reveals — those are
 * handled by the existing reveal pipeline.
 *
 * Variants:
 *  - correct: green/gold burst, satisfying snap sfx
 *  - wrong:   red shake + buzz sfx; the penalty draw is rendered separately
 *             by its own snap_penalty_draw event handler
 *
 * IMPORTANT: a wrong snap pushes TWO animation events back-to-back:
 *   1) snap_wrong   (the actual outcome we want to render)
 *   2) snap_penalty_draw   (the card flying into snapper's hand)
 * If we only inspected animations[last], we'd see snap_penalty_draw and miss
 * the cinematic entirely. So we scan the array from the end looking for the
 * first snap_correct / snap_wrong event and use that. We also dedupe via the
 * event's id so we don't replay it when other animations arrive afterwards.
 */
type SnapMoment = {
  kind: "correct" | "wrong";
  snapperId: string;
  isSelf: boolean;
  expectedRank?: string;
  key: number;
};

export function SnapCinematic() {
  const game = useStore((s) => s.game);
  const reduced = useReducedMotion() ?? false;
  const [moment, setMoment] = useState<SnapMoment | null>(null);
  const handledEventId = useRef<string | null>(null);

  useEffect(() => {
    if (!game) return;
    const anims = game.animations;
    if (anims.length === 0) return;
    // Walk back to find the most recent snap_correct/snap_wrong event. Stop
    // at the last id we've already handled so the same wrong snap doesn't
    // re-render when its trailing snap_penalty_draw animation lands.
    let found: typeof anims[number] | null = null;
    for (let i = anims.length - 1; i >= 0; i -= 1) {
      const a = anims[i];
      if (a.id === handledEventId.current) break;
      if (a.kind === "snap_correct" || a.kind === "snap_wrong") {
        found = a;
        break;
      }
    }
    if (!found) return;
    handledEventId.current = found.id;
    if (found.kind === "snap_correct") {
      Audio.playSfx("snap_correct");
      setMoment({
        kind: "correct",
        snapperId: String(found.payload.snapperId),
        isSelf: !!found.payload.isSelf,
        key: Date.now(),
      });
    } else {
      Audio.playSfx("snap_wrong");
      setMoment({
        kind: "wrong",
        snapperId: String(found.payload.snapperId),
        isSelf: !!found.payload.isSelf,
        expectedRank: found.payload.expectedRank as string | undefined,
        key: Date.now(),
      });
    }
  }, [game?.animations]);

  // Auto-dismiss after a beat. Correct = 1.4s (linger to celebrate), wrong
  // = 1.6s (slightly longer to acknowledge the penalty).
  useEffect(() => {
    if (!moment) return;
    const dur = moment.kind === "correct" ? 1400 : 1600;
    const t = setTimeout(() => setMoment(null), reduced ? 800 : dur);
    return () => clearTimeout(t);
  }, [moment, reduced]);

  return (
    <AnimatePresence>
      {moment && (
        <motion.div
          key={moment.key}
          className={`snap-cine snap-cine-${moment.kind}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
        >
          {/* Particle burst — radial spokes that scale + fade outward */}
          {!reduced && (
            <div className="snap-burst" aria-hidden>
              {Array.from({ length: 14 }).map((_, i) => (
                <motion.span
                  key={i}
                  className="snap-spoke"
                  style={{
                    transform: `rotate(${(i * 360) / 14}deg) translateY(0)`,
                  }}
                  initial={{ opacity: 0, scaleY: 0.4 }}
                  animate={{ opacity: [0, 1, 0], scaleY: [0.4, 1.4, 0.6] }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                />
              ))}
            </div>
          )}
          <motion.div
            className="snap-cine-word"
            initial={{ scale: 0.4, rotate: -6, opacity: 0 }}
            animate={{ scale: 1, rotate: -3, opacity: 1 }}
            exit={{ scale: 1.12, opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 16 }}
          >
            {moment.kind === "correct" ? "SNAP!" : "MISS!"}
          </motion.div>
          {moment.kind === "wrong" && moment.expectedRank && (
            <motion.div
              className="snap-cine-sub"
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.18, ease: [0.22, 1, 0.36, 1], duration: 0.35 }}
            >
              The top card was {moment.expectedRank}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
