import { motion, useReducedMotion } from "framer-motion";

/**
 * Live aurora-borealis wallpaper for the Northern Lights table theme.
 *
 * Renders three large, soft, blurred glowing ribbons that drift horizontally
 * across a dark starry sky — colours add over the base sky via
 * `mix-blend-mode: screen` so the ribbons feel luminous rather than painted
 * on. A sparse field of twinkling stars sits behind the aurora, and a faint
 * horizon glow at the bottom sells the "lights reflecting on the horizon"
 * feel.
 *
 * - `pointer-events: none` (inherited from the `.table-bg` parent).
 * - Animation is transform/opacity only → 60fps on the compositor thread.
 * - Respects `prefers-reduced-motion`: ribbons stop drifting, stars stop
 *   twinkling — the scene remains visible but completely static.
 *
 * Mirrors the architecture pattern used by OceanWallpaper.tsx and
 * MenuWallpaper.tsx.
 */

interface Ribbon {
  id: string;
  /** Vertical position as % of viewport. */
  top: string;
  /** Two-stop gradient for the ribbon body (left → right). */
  gradient: string;
  /** Horizontal travel range in vw (e.g. 22 → animates between -22vw and +22vw). */
  travel: number;
  /** Cycle duration in seconds. */
  duration: number;
  delay: number;
  /** Peak opacity for the breathe loop. */
  peakOpacity: number;
  /** Subtle skew wobble in degrees. */
  skew: number;
}

const RIBBONS: Ribbon[] = [
  {
    id: "r1",
    top: "10%",
    gradient: "linear-gradient(90deg, rgba(76,242,167,0) 0%, rgba(76,242,167,0.55) 35%, rgba(84,224,211,0.6) 65%, rgba(84,224,211,0) 100%)",
    travel: 18,
    duration: 72,
    delay: 0,
    peakOpacity: 0.7,
    skew: -3,
  },
  {
    id: "r2",
    top: "26%",
    gradient: "linear-gradient(90deg, rgba(84,224,211,0) 0%, rgba(76,242,167,0.55) 40%, rgba(196,120,255,0.55) 70%, rgba(196,120,255,0) 100%)",
    travel: 22,
    duration: 88,
    delay: 12,
    peakOpacity: 0.65,
    skew: 4,
  },
  {
    id: "r3",
    top: "42%",
    gradient: "linear-gradient(90deg, rgba(196,120,255,0) 0%, rgba(196,120,255,0.45) 30%, rgba(84,224,211,0.5) 65%, rgba(76,242,167,0) 100%)",
    travel: 20,
    duration: 96,
    delay: 6,
    peakOpacity: 0.6,
    skew: -2,
  },
];

interface Star {
  id: string;
  top: string;
  left: string;
  size: number;
  /** Twinkle cycle duration in seconds. */
  duration: number;
  delay: number;
}

// 15 stars sprinkled across the sky band (top 60% of the viewport — we leave
// the bottom 40% mostly dark so the horizon glow reads). Hand-tuned positions
// for a natural-looking scatter rather than a regular grid.
const STARS: Star[] = [
  { id: "s1",  top: "6%",  left: "8%",  size: 2,   duration: 4.0, delay: 0    },
  { id: "s2",  top: "12%", left: "18%", size: 1.5, duration: 5.2, delay: 1.4  },
  { id: "s3",  top: "4%",  left: "32%", size: 2.5, duration: 3.6, delay: 0.6  },
  { id: "s4",  top: "16%", left: "44%", size: 1.5, duration: 4.4, delay: 2.1  },
  { id: "s5",  top: "8%",  left: "56%", size: 2,   duration: 5.6, delay: 0.9  },
  { id: "s6",  top: "14%", left: "68%", size: 1.5, duration: 4.2, delay: 2.7  },
  { id: "s7",  top: "5%",  left: "78%", size: 2.5, duration: 3.8, delay: 1.1  },
  { id: "s8",  top: "10%", left: "90%", size: 2,   duration: 5.0, delay: 0.4  },
  { id: "s9",  top: "22%", left: "10%", size: 1.5, duration: 4.6, delay: 3.0  },
  { id: "s10", top: "30%", left: "26%", size: 2,   duration: 5.4, delay: 1.6  },
  { id: "s11", top: "38%", left: "50%", size: 1.5, duration: 3.4, delay: 2.4  },
  { id: "s12", top: "34%", left: "72%", size: 2,   duration: 4.8, delay: 0.2  },
  { id: "s13", top: "42%", left: "86%", size: 1.5, duration: 5.8, delay: 1.9  },
  { id: "s14", top: "48%", left: "16%", size: 1.5, duration: 4.0, delay: 2.5  },
  { id: "s15", top: "52%", left: "62%", size: 2,   duration: 5.2, delay: 0.8  },
];

export function NorthernLightsWallpaper() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="northern-wallpaper" aria-hidden="true">
      {/* Twinkling stars sit BEHIND the ribbons so the aurora glow softens
          stars it passes over. */}
      {STARS.map((s) => (
        <motion.div
          key={s.id}
          className="northern-star"
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
          }}
          animate={reduceMotion ? undefined : { opacity: [0.35, 1, 0.35] }}
          transition={
            reduceMotion
              ? undefined
              : {
                  duration: s.duration,
                  delay: s.delay,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
          }
        />
      ))}

      {/* Aurora ribbons — each drifts horizontally while breathing intensity. */}
      {RIBBONS.map((r) => (
        <motion.div
          key={r.id}
          className="northern-ribbon"
          style={{
            top: r.top,
            background: r.gradient,
          }}
          initial={{ x: `-${r.travel}vw`, opacity: r.peakOpacity * 0.6, skewY: r.skew }}
          animate={
            reduceMotion
              ? { x: 0, opacity: r.peakOpacity * 0.65, skewY: 0 }
              : {
                  x: [`-${r.travel}vw`, `${r.travel}vw`, `-${r.travel}vw`],
                  opacity: [r.peakOpacity * 0.55, r.peakOpacity, r.peakOpacity * 0.55],
                  skewY: [r.skew, -r.skew, r.skew],
                }
          }
          transition={
            reduceMotion
              ? { duration: 0 }
              : {
                  duration: r.duration,
                  delay: r.delay,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
          }
        />
      ))}

      {/* Faint green horizon glow at the bottom — static, sells the
          reflecting-aurora feel without competing with the table. */}
      <div className="northern-horizon" />
    </div>
  );
}
