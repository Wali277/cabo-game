/**
 * OceanWallpaper — live animated overlay for the Midnight Ocean table theme.
 *
 * Deep-sea atmosphere: rising bioluminescent bubbles, slow horizontal wave
 * bands drifting across the mid-layer, and drifting glowing particles that
 * mimic deep-sea bioluminescence. Intentionally dark and moody to stay out
 * of the way of the game UI. All motion honoured by useReducedMotion().
 */
import { motion } from "framer-motion";
import { useReducedMotion } from "framer-motion";

// ─── Bubbles ──────────────────────────────────────────────────────────────────
interface Bubble {
  id: number;
  x: number;
  startY: number;
  size: number;
  delay: number;
  duration: number;
  wobble: number;
}
function makeBubbles(n: number): Bubble[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    x: 3 + (i * 9.3 + (i % 5) * 7.1) % 94,
    startY: 40 + (i * 11.7 + (i % 4) * 9.2) % 50,
    size: 4 + (i % 5) * 2.5,
    delay: (i * 1.1) % 8,
    duration: 8 + (i % 6) * 1.8,
    wobble: (i % 2 === 0 ? 1 : -1) * (8 + (i % 4) * 5),
  }));
}
const BUBBLES = makeBubbles(20);

// ─── Bioluminescent particles ────────────────────────────────────────────────
interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  color: string;
}
const PARTICLE_COLORS = [
  "rgba(58,200,255,VAL)",
  "rgba(72,255,180,VAL)",
  "rgba(120,100,255,VAL)",
  "rgba(40,180,255,VAL)",
];
function makeParticles(n: number): Particle[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    x: 2 + (i * 13.1 + (i % 7) * 6.4) % 96,
    y: 5 + (i * 17.3 + (i % 6) * 8.8) % 88,
    size: 2 + (i % 3),
    delay: (i * 0.7) % 6,
    duration: 3 + (i % 4) * 1.2,
    color: PARTICLE_COLORS[i % 4].replace("VAL", String(0.3 + (i % 4) * 0.08)),
  }));
}
const PARTICLES = makeParticles(28);

// ─── Wave bands ───────────────────────────────────────────────────────────────
const WAVES = [
  { top: "28%", height: "4px", delay: 0,   duration: 18, opacity: 0.07 },
  { top: "42%", height: "3px", delay: 2.5, duration: 22, opacity: 0.05 },
  { top: "58%", height: "5px", delay: 5,   duration: 16, opacity: 0.06 },
  { top: "72%", height: "3px", delay: 8,   duration: 20, opacity: 0.04 },
];

export function OceanWallpaper() {
  const reduced = useReducedMotion();

  return (
    <div className="ocean-wallpaper" aria-hidden="true">

      {/* Horizontal wave-light bands drifting across */}
      {!reduced && WAVES.map((w, i) => (
        <motion.div
          key={i}
          className="ocean-wave"
          style={{
            position: "absolute",
            top: w.top,
            left: 0,
            right: 0,
            height: w.height,
            background: `linear-gradient(90deg,
              transparent 0%,
              rgba(58,180,255,${w.opacity}) 30%,
              rgba(120,220,255,${w.opacity * 1.5}) 50%,
              rgba(58,180,255,${w.opacity}) 70%,
              transparent 100%
            )`,
            filter: "blur(1px)",
            pointerEvents: "none",
            willChange: "transform, opacity",
          }}
          animate={{
            x: ["-30%", "30%", "-30%"],
            opacity: [0, w.opacity * 10, w.opacity * 8, 0, 0],
          }}
          transition={{
            duration: w.duration,
            delay: w.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Rising bubbles */}
      {BUBBLES.map((b) => (
        <motion.div
          key={b.id}
          className="ocean-bubble"
          style={{
            position: "absolute",
            left: `${b.x}%`,
            top: `${b.startY}%`,
            width: b.size,
            height: b.size,
            borderRadius: "50%",
            border: `1px solid rgba(100,200,255,0.35)`,
            background: "rgba(100,200,255,0.08)",
            pointerEvents: "none",
            willChange: "transform, opacity",
          }}
          animate={reduced ? {} : {
            y: [0, -(120 + b.size * 8)],
            x: [0, b.wobble, -b.wobble * 0.5, b.wobble * 0.3, 0],
            opacity: [0, 0.7, 0.6, 0.3, 0],
            scale: [0.5, 1, 1.1, 0.9, 0.7],
          }}
          transition={reduced ? {} : {
            duration: b.duration,
            delay: b.delay,
            repeat: Infinity,
            repeatDelay: 1 + (b.id % 4) * 0.8,
            ease: "easeOut",
          }}
        />
      ))}

      {/* Bioluminescent floating particles */}
      {PARTICLES.map((p) => (
        <motion.div
          key={p.id}
          className="ocean-particle"
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: p.color,
            boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
            pointerEvents: "none",
            willChange: "opacity, transform",
          }}
          animate={reduced ? {} : {
            opacity: [0, 1, 0.6, 1, 0],
            scale: [0.6, 1.2, 0.9, 1.1, 0.6],
            y: [0, -(8 + p.size * 3), 0],
          }}
          transition={reduced ? {} : {
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            repeatDelay: 0.5 + (p.id % 3) * 0.6,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Deep caustic light from above — static radial blobs */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(ellipse 40% 20% at 25% 15%, rgba(40,140,220,0.08) 0%, transparent 100%),
            radial-gradient(ellipse 50% 25% at 75% 10%, rgba(30,110,200,0.06) 0%, transparent 100%),
            radial-gradient(ellipse 60% 30% at 50% 95%, rgba(5,30,60,0.4) 0%, transparent 100%)
          `,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
