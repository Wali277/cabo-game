import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";
import { useViewMode } from "../state/viewmode";

/**
 * Big "SNAP!" / "MISS!" overlay. Reads from game.animations and consumes
 * snap_correct / snap_wrong AND the new cinematic-first ARM events:
 *   - snap_armed_self  → plays the SNAP! overlay BEFORE the player picks
 *   - snap_armed_other → ditto, for rival-snap
 *   - snap_correct     → success cinematic AFTER the player picks
 *   - snap_wrong       → miss cinematic AFTER the player picks
 *
 * IMPORTANT: a wrong snap pushes TWO animation events back-to-back:
 *   1) snap_wrong   (the actual outcome we want to render)
 *   2) snap_penalty_draw   (the card flying into snapper's hand)
 * If we only inspected animations[last], we'd see snap_penalty_draw and miss
 * the cinematic entirely. So we scan the array from the end looking for the
 * first snap_armed_* / snap_correct / snap_wrong event and use that. We
 * dedupe via the event's id so we don't replay it when other animations
 * arrive afterwards (e.g. the snap_reveal flip following the arm).
 */
type SnapMoment = {
  kind: "armed" | "correct" | "wrong";
  snapperId: string;
  isSelf: boolean;
  expectedRank?: string;
  key: number;
};

export function SnapCinematic() {
  const game = useStore((s) => s.game);
  const reduced = useReducedMotion() ?? false;
  // Fewer radial spokes on mobile (each is a Framer keyframe loop) — still
  // reads as a burst, half the per-frame animation load. Desktop keeps 14.
  const spokeCount = useViewMode() === "mobile" ? 8 : 14;
  const [moment, setMoment] = useState<SnapMoment | null>(null);
  const handledEventId = useRef<string | null>(null);

  useEffect(() => {
    if (!game) return;
    const anims = game.animations;
    if (anims.length === 0) return;
    // Walk back to find the most recent snap event we care about. Stop at
    // the last id we've already handled so the same event doesn't replay
    // when a trailing event lands.
    let found: typeof anims[number] | null = null;
    for (let i = anims.length - 1; i >= 0; i -= 1) {
      const a = anims[i];
      if (a.id === handledEventId.current) break;
      if (
        a.kind === "snap_armed_self" ||
        a.kind === "snap_armed_other" ||
        a.kind === "snap_correct" ||
        a.kind === "snap_wrong"
      ) {
        found = a;
        break;
      }
    }
    if (!found) return;
    handledEventId.current = found.id;
    if (found.kind === "snap_armed_self" || found.kind === "snap_armed_other") {
      // Arm cinematic — same big "SNAP!" treatment but slightly shorter so
      // the player can pick their card while the buzz is still in the air.
      Audio.playSfx("snap_correct");
      setMoment({
        kind: "armed",
        snapperId: String(found.payload.snapperId),
        isSelf: found.kind === "snap_armed_self",
        key: Date.now(),
      });
    } else if (found.kind === "snap_correct") {
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

  // Auto-dismiss durations:
  //  - armed   = 1000ms (per spec ~1.0s — leave the picker enough beat to
  //              read "SNAP!" before they have to pick)
  //  - correct = 1400ms (linger on the success burst)
  //  - wrong   = 1600ms (slightly longer to acknowledge the penalty)
  useEffect(() => {
    if (!moment) return;
    const dur =
      moment.kind === "armed"   ? 1000 :
      moment.kind === "correct" ? 1400 :
                                  1600;
    const t = setTimeout(() => setMoment(null), reduced ? 600 : dur);
    return () => clearTimeout(t);
  }, [moment, reduced]);

  return (
    <AnimatePresence>
      {moment && (
        <motion.div
          key={moment.key}
          className={`snap-cine snap-cine-${moment.kind === "wrong" ? "wrong" : moment.kind === "correct" ? "correct" : "armed"}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
        >
          {/* Particle burst — radial spokes that scale + fade outward */}
          {!reduced && (
            <div className="snap-burst" aria-hidden>
              {Array.from({ length: spokeCount }).map((_, i) => (
                <motion.span
                  key={i}
                  className="snap-spoke"
                  style={{
                    transform: `rotate(${(i * 360) / spokeCount}deg) translateY(0)`,
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
            {moment.kind === "wrong" ? "MISS!" : "SNAP!"}
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
