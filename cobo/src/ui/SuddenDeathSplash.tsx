import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useStore } from "../state/store";

interface Ember {
  dx: number;
  dy: number;
  size: number;
}

function makeEmbers(count: number): Ember[] {
  const arr: Ember[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 360 + Math.random() * 20;
    const rad = (angle * Math.PI) / 180;
    const dist = 180 + Math.random() * 120;
    arr.push({
      dx: Math.cos(rad) * dist,
      dy: Math.sin(rad) * dist,
      size: 8 + Math.random() * 10,
    });
  }
  return arr;
}

/**
 * SuddenDeathSplash — golden two-beat cinematic that plays once when a
 * sudden-death tiebreaker round begins.
 *
 *   beat 1  splash  (0   to 1.5s)  : screen washes in dark gold, "SUDDEN
 *                                    DEATH" stamp slams in with golden
 *                                    ember particles. Subtitle lists the
 *                                    contestants by name.
 *   beat 2  fade    (1.5s onward)  : overlay fades to reveal the table.
 *
 * Reduced motion → skips straight to the fade-out (brief flash only).
 * Tap-anywhere advances to beat 2 early.
 */
export function SuddenDeathSplash() {
  const game = useStore((s) => s.game);
  const elim = useStore((s) => s.elim);
  const reduced = useReducedMotion() ?? false;

  // We've already shown the splash for this SD session (keyed on contestants).
  const shownForRef = useRef<string | null>(null);
  const [stage, setStage] = useState<"splash" | "done">("done");

  const sdActive = !!elim.suddenDeath?.active;
  // Stable key for this SD session — contestants stay frozen across repeat
  // SD rounds, so we only show the splash once per "entry" into SD.
  const sdKey = sdActive ? elim.suddenDeath!.contestants.join("|") : null;
  // Show only during gameplay (not during round_over, where the previous
  // round-end overlays take priority).
  const inPlay = !!game && game.phase !== "round_over";

  useEffect(() => {
    if (!sdActive) {
      // Reset when SD ends entirely (e.g. game over). Direct reset is fine
      // here — without an active SD the component returns null anyway.
      shownForRef.current = null;
      return;
    }
    if (!inPlay || !sdKey) return;
    if (shownForRef.current === sdKey) return;
    shownForRef.current = sdKey;
    setStage("splash");
    const duration = reduced ? 400 : 1500;
    const t = setTimeout(() => setStage("done"), duration);
    return () => clearTimeout(t);
  }, [sdActive, sdKey, inPlay, reduced]);

  // Embers are randomised once per mount of the splash, then stable.
  const embers = useMemo(() => makeEmbers(14), []);

  if (!sdActive || !inPlay) return null;
  if (stage !== "splash") return null;

  // Resolve contestant names for the subtitle.
  const names = (elim.suddenDeath?.contestants ?? [])
    .map((id) => game!.players.find((p) => p.id === id)?.name ?? id)
    .join(" vs ");

  return (
    <AnimatePresence>
      <motion.div
        key="sd-splash"
        className="overlay sudden-death-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ zIndex: 280 }}
        onClick={() => setStage("done")}
      >
        <div className="sudden-death-splash-wrap">
          {/* Expanding golden halo behind the wordmark */}
          {!reduced && (
            <motion.div
              className="sudden-death-halo"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1.4, opacity: [0, 0.85, 0.55] }}
              transition={{ duration: 1.4, ease: [0.16, 0.7, 0.32, 1] }}
            />
          )}
          {/* Ember particles — gold/orange radial scatter */}
          {!reduced && (
            <div className="sudden-death-embers" aria-hidden="true">
              {embers.map((e, i) => (
                <motion.span
                  key={i}
                  className="sudden-death-ember"
                  style={{
                    width: e.size,
                    height: e.size,
                  }}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                  animate={{
                    x: [0, e.dx * 0.5, e.dx],
                    y: [0, e.dy * 0.4, e.dy + 40],
                    opacity: [0, 1, 0],
                    scale: [0.4, 1, 0.7],
                  }}
                  transition={{
                    duration: 1.3,
                    ease: [0.16, 0.7, 0.32, 1],
                    delay: i * 0.025,
                  }}
                />
              ))}
            </div>
          )}
          <motion.div
            className="sudden-death-title"
            initial={{ scale: 0.35, rotate: -8, opacity: 0, y: 18 }}
            animate={{ scale: 1, rotate: -4, opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 14, delay: 0.15 }}
          >
            Sudden Death
          </motion.div>
          {names && (
            <motion.div
              className="sudden-death-sub"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.7, type: "spring", stiffness: 220, damping: 22 }}
            >
              {names}
            </motion.div>
          )}
          <motion.div
            className="sudden-death-hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.4 }}
          >
            tap to continue
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
