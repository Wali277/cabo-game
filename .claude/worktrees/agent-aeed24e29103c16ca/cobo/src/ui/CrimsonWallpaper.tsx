/**
 * CrimsonWallpaper — live animated overlay for the Royal Crimson table theme.
 *
 * Glowing embers drift upward from the base, fade out high up. A slow golden
 * shimmer sweeps the velvet surface at intervals. Tiny candlelight-warm orbs
 * pulse in the corners. All motion honoured by useReducedMotion().
 */
import { motion } from "framer-motion";
import { useReducedMotion } from "framer-motion";

// ─── Embers ────────────────────────────────────────────────────────────────
interface Ember {
  id: number;
  x: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
  color: string;
}
const EMBER_COLORS = [
  "rgba(255,140,30,OPC)",
  "rgba(255,80,20,OPC)",
  "rgba(255,200,60,OPC)",
  "rgba(240,60,30,OPC)",
];
function makeEmbers(n: number): Ember[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    x: 4 + (i * 7.8 + (i % 5) * 11.3) % 92,
    size: 2 + (i % 4) * 1.5,
    delay: (i * 0.6) % 7,
    duration: 5 + (i % 5) * 1.6,
    drift: (i % 2 === 0 ? 1 : -1) * (10 + (i % 5) * 8),
    color: EMBER_COLORS[i % 4].replace("OPC", String(0.55 + (i % 4) * 0.1)),
  }));
}
const EMBERS = makeEmbers(28);

// ─── Glowing orbs (candlelight warmth) ────────────────────────────────────
const ORBS = [
  { x: "8%",  y: "78%", size: 60,  delay: 0,   duration: 5, opacity: 0.12 },
  { x: "88%", y: "82%", size: 80,  delay: 1.8, duration: 6, opacity: 0.10 },
  { x: "18%", y: "12%", size: 50,  delay: 3.2, duration: 7, opacity: 0.08 },
  { x: "78%", y: "18%", size: 70,  delay: 0.9, duration: 5, opacity: 0.09 },
];

// ─── Shimmer sweeps ────────────────────────────────────────────────────────
const SHIMMERS = [
  { delay: 0,  duration: 9,  opacity: 0.06 },
  { delay: 5,  duration: 11, opacity: 0.04 },
  { delay: 10, duration: 8,  opacity: 0.05 },
];

export function CrimsonWallpaper() {
  const reduced = useReducedMotion();

  return (
    <div className="crimson-wallpaper" aria-hidden="true">

      {/* Rising embers */}
      {EMBERS.map((e) => (
        <motion.div
          key={e.id}
          className="crimson-ember"
          style={{
            position: "absolute",
            left: `${e.x}%`,
            bottom: "-3%",
            width: e.size,
            height: e.size,
            borderRadius: "50%",
            background: e.color,
            boxShadow: `0 0 ${e.size * 3}px ${e.color}, 0 0 ${e.size * 6}px ${e.color.replace("OPC", "0.25")}`,
            pointerEvents: "none",
            willChange: "transform, opacity",
          }}
          animate={reduced ? {} : {
            y: [0, -(window?.innerHeight ? window.innerHeight * 0.85 : 600)],
            x: [0, e.drift, -e.drift * 0.5, e.drift * 0.3, 0],
            opacity: [0, 0.9, 0.75, 0.4, 0],
            scale: [0.4, 1, 0.8, 0.5, 0.2],
          }}
          transition={reduced ? {} : {
            duration: e.duration,
            delay: e.delay,
            repeat: Infinity,
            repeatDelay: 0.5 + (e.id % 4) * 0.7,
            ease: "easeOut",
          }}
        />
      ))}

      {/* Pulsing warm candlelight orbs in corners */}
      {ORBS.map((o, i) => (
        <motion.div
          key={i}
          style={{
            position: "absolute",
            left: o.x,
            top: o.y,
            width: o.size,
            height: o.size,
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(255,160,40,${o.opacity * 2}) 0%, rgba(255,80,20,${o.opacity}) 40%, transparent 70%)`,
            filter: "blur(12px)",
            pointerEvents: "none",
            willChange: "opacity, transform",
          }}
          animate={reduced ? {} : {
            opacity: [o.opacity * 6, o.opacity * 8, o.opacity * 5, o.opacity * 7, o.opacity * 6],
            scale: [0.9, 1.1, 0.95, 1.05, 0.9],
          }}
          transition={reduced ? {} : {
            duration: o.duration,
            delay: o.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Golden diagonal shimmer across the velvet */}
      {!reduced && SHIMMERS.map((s, i) => (
        <motion.div
          key={i}
          className="crimson-shimmer"
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(
              108deg,
              transparent 25%,
              rgba(255,200,80,${s.opacity}) 50%,
              transparent 75%
            )`,
            pointerEvents: "none",
            willChange: "transform",
          }}
          animate={{
            x: ["-100%", "200%"],
          }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            repeatDelay: 8 + i * 3,
            ease: "linear",
          }}
        />
      ))}

      {/* Deep shadow vignette at top + bottom — static, always-on */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(ellipse 80% 35% at 50% 0%,   rgba(30,0,0,0.35) 0%, transparent 100%),
            radial-gradient(ellipse 80% 35% at 50% 100%, rgba(10,0,0,0.45) 0%, transparent 100%)
          `,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
