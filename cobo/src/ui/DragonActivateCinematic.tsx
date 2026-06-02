import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useStore } from "../state/store";
import { DragonFace } from "./cardSkins";
import { Audio } from "../audio/sounds";

/**
 * DragonActivateCinematic — the dramatic beat when a Dragon is Activated.
 *
 * Fires off the `dragon_activate` animation event (pushed by the engine in
 * activateDragon, so it lands for SP and every MP client alike). Plays a
 * ~1.6s overlay: an ember ring bursts, the dragon roars up to scale, "DRAGON"
 * tracks out. It sits ABOVE the rank picker (z 350 > 340), so it briefly
 * covers the picker and then fades to reveal it — no extra coupling needed.
 *
 * Detection mirrors SnapCinematic: a handled-id ref dedupes so each activate
 * plays exactly once even as the animation queue churns. Reduced-motion gets a
 * fast crossfade. It plays its full beat, then auto-dismisses.
 */
export function DragonActivateCinematic() {
  const anims = useStore((s) => s.game?.animations);
  const reduced = useReducedMotion() ?? false;
  const handledId = useRef<string | null>(null);
  const [beat, setBeat] = useState<string | null>(null);

  useEffect(() => {
    if (!anims || anims.length === 0) return;
    let found: string | null = null;
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      if (a.id === handledId.current) break;
      if (a.kind === "dragon_activate") { found = a.id; break; }
    }
    if (!found) return;
    handledId.current = found;
    Audio.playSfx("cabo");
    setBeat(found);
  }, [anims]);

  useEffect(() => {
    if (!beat) return;
    const t = setTimeout(() => setBeat(null), reduced ? 500 : 1600);
    return () => clearTimeout(t);
  }, [beat, reduced]);

  return (
    <AnimatePresence>
      {beat && (
        <motion.div
          key={beat}
          className="overlay dragon-cine-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{ zIndex: 350 }}
        >
          {!reduced && (
            <motion.div
              className="dragon-cine-ring"
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: 2.4, opacity: [0, 0.75, 0] }}
              transition={{ duration: 1.3, ease: [0.16, 0.7, 0.32, 1] }}
            />
          )}
          <motion.div
            className="dragon-cine-art"
            initial={{ scale: 0.35, rotate: -14, opacity: 0, y: 24 }}
            animate={{ scale: 1, rotate: -3, opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0.2 } : { type: "spring", stiffness: 210, damping: 15, delay: 0.05 }}
          >
            <DragonFace size={150} />
          </motion.div>
          <motion.div
            className="dragon-cine-word"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduced ? 0.05 : 0.35, duration: 0.4 }}
          >
            DRAGON
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
