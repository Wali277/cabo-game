/**
 * EmeraldWallpaper — live animated overlay for the Emerald Felt table theme.
 *
 * Floating card suit symbols (♠ ♥ ♦ ♣) drift upward and fade out, giving
 * the felt surface a living, casino-floor feel. A subtle shimmer pulse sweeps
 * across the felt at slow intervals. All motion honoured by useReducedMotion().
 */
import { motion, useReducedMotion } from "framer-motion";

const SUITS = ["♠", "♥", "♦", "♣"];

interface SuitParticle {
  id: number;
  suit: string;
  x: number;  // % from left
  startY: number; // % from top
  size: number;   // px font-size
  delay: number;  // s
  duration: number; // s
  opacity: number;
  color: string;
}

function makeSuits(count: number): SuitParticle[] {
  return Array.from({ length: count }, (_, i) => {
    const suit = SUITS[i % 4];
    const isRed = suit === "♥" || suit === "♦";
    return {
      id: i,
      suit,
      x: 5 + (i * 7.3 + (i % 3) * 11.1) % 90,
      startY: 20 + (i * 13.7 + (i % 5) * 8.3) % 65,
      size: 18 + (i % 4) * 8,
      delay: (i * 0.85) % 6,
      duration: 7 + (i % 5) * 1.4,
      opacity: 0.12 + (i % 4) * 0.04,
      color: isRed ? "rgba(220,60,60,VAL)" : "rgba(18,50,30,VAL)",
    };
  });
}

const SUIT_PARTICLES = makeSuits(18);

// Shimmer sweep configs
const SHIMMERS = [
  { delay: 0,    duration: 8,  x: "-120%", opacity: 0.07 },
  { delay: 3.5,  duration: 10, x: "-120%", opacity: 0.05 },
  { delay: 7,    duration: 9,  x: "-120%", opacity: 0.06 },
];

export function EmeraldWallpaper() {
  const reduced = useReducedMotion();

  return (
    <div className="emerald-wallpaper" aria-hidden="true">

      {/* Floating card suit symbols */}
      {SUIT_PARTICLES.map((p) => {
        const col = p.color.replace("VAL", String(p.opacity));
        return (
          <motion.div
            key={p.id}
            className="emerald-suit"
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: `${p.startY}%`,
              fontSize: `${p.size}px`,
              color: col,
              userSelect: "none",
              pointerEvents: "none",
              willChange: "transform, opacity",
              lineHeight: 1,
            }}
            animate={reduced ? {} : {
              y: [0, -(60 + p.size * 1.5)],
              opacity: [0, p.opacity * 1.6, p.opacity, 0],
              rotate: [0, (p.id % 2 === 0 ? 1 : -1) * (8 + (p.id % 4) * 3)],
            }}
            transition={reduced ? {} : {
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              repeatDelay: 0.5 + (p.id % 3) * 0.8,
              ease: "easeOut",
            }}
          >
            {p.suit}
          </motion.div>
        );
      })}

      {/* Diagonal shimmer sweeps across the felt surface */}
      {!reduced && SHIMMERS.map((s, i) => (
        <motion.div
          key={i}
          className="emerald-shimmer"
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(
              105deg,
              transparent 30%,
              rgba(255,255,255,${s.opacity}) 50%,
              transparent 70%
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
            repeatDelay: 6 + i * 2,
            ease: "linear",
          }}
        />
      ))}

      {/* Subtle corner vignette glow — static, always visible */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(ellipse at 0% 0%,   rgba(255,255,255,0.06) 0%, transparent 40%),
            radial-gradient(ellipse at 100% 100%, rgba(255,255,255,0.04) 0%, transparent 40%)
          `,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
