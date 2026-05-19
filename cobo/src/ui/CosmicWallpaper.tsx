/**
 * CosmicWallpaper — live animated overlay for the Cosmic Legacy table theme.
 *
 * Deep space atmosphere: twinkling stars at varied distances, slow-drifting
 * nebula colour patches, and occasional shooting stars. Layered on top of the
 * existing bgDrift CSS animation on the base gradient. All motion honoured by
 * useReducedMotion().
 */
import { motion } from "framer-motion";
import { useReducedMotion } from "framer-motion";

// ─── Stars ─────────────────────────────────────────────────────────────────
interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  color: string;
}
const STAR_COLORS = [
  "rgba(255,255,255,OPC)",
  "rgba(180,200,255,OPC)",
  "rgba(255,220,180,OPC)",
  "rgba(160,180,255,OPC)",
];
function makeStars(n: number): Star[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    x: (i * 8.17 + (i % 7) * 5.3) % 100,
    y: (i * 11.43 + (i % 5) * 7.9) % 100,
    size: 1 + (i % 4) * 0.8,
    delay: (i * 0.43) % 5,
    duration: 2 + (i % 5) * 0.8,
    color: STAR_COLORS[i % 4].replace("OPC", String(0.5 + (i % 5) * 0.1)),
  }));
}
const STARS = makeStars(55);

// ─── Nebula blobs ──────────────────────────────────────────────────────────
const NEBULAE = [
  { x: "15%", y: "20%",  w: 280, h: 160, color: "rgba(120,60,220,0.06)",  delay: 0,   dur: 30 },
  { x: "60%", y: "15%",  w: 320, h: 180, color: "rgba(60,100,255,0.05)",  delay: 8,   dur: 36 },
  { x: "5%",  y: "55%",  w: 240, h: 140, color: "rgba(200,80,255,0.04)",  delay: 15,  dur: 28 },
  { x: "70%", y: "60%",  w: 300, h: 200, color: "rgba(80,180,255,0.05)",  delay: 5,   dur: 32 },
  { x: "35%", y: "70%",  w: 350, h: 160, color: "rgba(160,60,200,0.04)",  delay: 20,  dur: 40 },
];

// ─── Shooting stars ────────────────────────────────────────────────────────
const SHOOTING_STARS = [
  { y: "18%",  delay: 4,   dur: 0.9, width: 120, angle: 20 },
  { y: "38%",  delay: 11,  dur: 0.7, width: 90,  angle: 18 },
  { y: "62%",  delay: 22,  dur: 1.1, width: 150, angle: 22 },
  { y: "12%",  delay: 35,  dur: 0.8, width: 100, angle: 15 },
];

// ─── Drifting cosmic particles ─────────────────────────────────────────────
interface CosmicParticle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  dx: number;
  dy: number;
}
function makeCosmicParticles(n: number): CosmicParticle[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    x: (i * 14.7 + (i % 6) * 9.2) % 100,
    y: (i * 19.3 + (i % 4) * 11.6) % 100,
    size: 1.5 + (i % 3) * 0.8,
    delay: (i * 0.9) % 8,
    duration: 12 + (i % 6) * 3,
    dx: (i % 2 === 0 ? 1 : -1) * (15 + (i % 5) * 8),
    dy: (i % 3 === 0 ? 1 : -1) * (10 + (i % 4) * 6),
  }));
}
const COSMIC_PARTICLES = makeCosmicParticles(20);

export function CosmicWallpaper() {
  const reduced = useReducedMotion();

  return (
    <div className="cosmic-wallpaper" aria-hidden="true">

      {/* Twinkling stars */}
      {STARS.map((s) => (
        <motion.div
          key={s.id}
          className="cosmic-star"
          style={{
            position: "absolute",
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            borderRadius: "50%",
            background: s.color,
            boxShadow: `0 0 ${s.size * 2}px ${s.color}`,
            pointerEvents: "none",
            willChange: "opacity",
          }}
          animate={reduced ? { opacity: 0.6 } : {
            opacity: [0.1, 1, 0.3, 0.8, 0.1],
            scale: [0.8, 1.2, 0.9, 1.1, 0.8],
          }}
          transition={reduced ? {} : {
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Slow-drifting nebula colour washes */}
      {NEBULAE.map((n, i) => (
        <motion.div
          key={i}
          className="cosmic-nebula"
          style={{
            position: "absolute",
            left: n.x,
            top: n.y,
            width: n.w,
            height: n.h,
            borderRadius: "50%",
            background: `radial-gradient(ellipse, ${n.color} 0%, transparent 70%)`,
            filter: "blur(30px)",
            pointerEvents: "none",
            willChange: "opacity, transform",
          }}
          animate={reduced ? {} : {
            opacity: [0.4, 1, 0.6, 1, 0.4],
            x: [0, 20, -10, 15, 0],
            y: [0, -15, 10, -8, 0],
            scale: [1, 1.08, 0.96, 1.04, 1],
          }}
          transition={reduced ? {} : {
            duration: n.dur,
            delay: n.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Drifting cosmic dust particles */}
      {!reduced && COSMIC_PARTICLES.map((p) => (
        <motion.div
          key={p.id}
          className="cosmic-particle"
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: `rgba(200,180,255,0.5)`,
            pointerEvents: "none",
            willChange: "transform, opacity",
          }}
          animate={{
            x: [0, p.dx, -p.dx * 0.6, p.dx * 0.3, 0],
            y: [0, p.dy, -p.dy * 0.8, p.dy * 0.4, 0],
            opacity: [0, 0.7, 0.4, 0.6, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Shooting stars — streak across the sky periodically */}
      {!reduced && SHOOTING_STARS.map((ss, i) => (
        <motion.div
          key={i}
          style={{
            position: "absolute",
            top: ss.y,
            left: "-5%",
            width: ss.width,
            height: 1.5,
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.9) 60%, rgba(255,255,255,0.3) 100%)",
            borderRadius: 2,
            pointerEvents: "none",
            rotate: ss.angle,
            willChange: "transform, opacity",
          }}
          animate={{
            x: ["0vw", "110vw"],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: ss.dur,
            delay: ss.delay,
            repeat: Infinity,
            repeatDelay: 18 + i * 8,
            ease: "easeIn",
          }}
        />
      ))}

      {/* Ambient deep-space vignette — always-on static overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(ellipse 100% 50% at 50% 0%,   rgba(80,40,160,0.08) 0%, transparent 100%),
            radial-gradient(ellipse 100% 50% at 50% 100%, rgba(20,10,60,0.30) 0%, transparent 100%)
          `,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
