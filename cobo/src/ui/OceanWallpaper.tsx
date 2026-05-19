import type { ReactElement } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Live underwater wallpaper for the Midnight Ocean table theme.
 *
 * Cartoonish, low-opacity scene that lives BEHIND the game — three fish drift
 * along the edges, a starfish slowly rotates in a corner, two seaweed strands
 * sway, a few bubbles rise, and a pair of caustic light shafts pulse near the
 * top. Everything is intentionally subtle (opacity 0.30–0.45) and confined to
 * the outer band of the viewport so the player seats and centre cards stay
 * unobstructed.
 *
 * - `pointer-events: none` (set on `.table-bg` which is the parent).
 * - Each animated element uses transform/opacity only → 60fps on compositor.
 * - Respects `prefers-reduced-motion`: every element falls back to a static
 *   pose (no swimming, no bubbles, no sway) but the scene remains visible.
 *
 * Mirrors the architecture used by MenuWallpaper.tsx — same Framer Motion
 * patterns (motion.div with per-element duration/delay variance), same
 * approach to honouring reduced-motion.
 */

// ── Inline SVG fish ─────────────────────────────────────────────────────────
// Three distinct species: clownfish (orange + stripes), blue tang (blue with
// yellow tail), yellow tang (flat yellow oval). All face right by default;
// CSS `scaleX` flips them for the return-journey leg of the animation.

function ClownFish({ size = 70 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 60" width={size} height={size * 0.6} aria-hidden="true">
      {/* Body */}
      <ellipse cx="48" cy="30" rx="34" ry="18" fill="#ff7a2e" />
      {/* White stripes */}
      <path d="M 26 16 Q 22 30 28 46 L 36 44 Q 32 30 36 18 Z" fill="#fff8ee" />
      <path d="M 56 16 Q 50 30 58 46 L 66 44 Q 62 30 66 18 Z" fill="#fff8ee" />
      {/* Tail */}
      <path d="M 82 30 L 100 16 L 96 30 L 100 44 Z" fill="#ff7a2e" />
      {/* Fin (top) */}
      <path d="M 42 14 Q 50 4 60 14 Z" fill="#e85f1e" />
      {/* Eye */}
      <circle cx="22" cy="26" r="4" fill="#1c1d2b" />
      <circle cx="20.5" cy="24.5" r="1.4" fill="#fff" />
      {/* Outline strokes for cartoon feel */}
      <ellipse cx="48" cy="30" rx="34" ry="18" fill="none" stroke="#3d1700" strokeWidth="1.4" />
    </svg>
  );
}

function BlueTang({ size = 80 }: { size?: number }) {
  return (
    <svg viewBox="0 0 110 60" width={size} height={size * 0.55} aria-hidden="true">
      {/* Body */}
      <path d="M 18 30 Q 30 6 70 8 Q 92 14 92 30 Q 92 46 70 52 Q 30 54 18 30 Z" fill="#2b7fd6" />
      {/* Darker accent stripe */}
      <path d="M 30 18 Q 60 16 80 26 Q 60 36 30 38 Z" fill="#1a5aa3" opacity="0.55" />
      {/* Yellow tail */}
      <path d="M 92 30 L 108 14 L 102 30 L 108 46 Z" fill="#ffd864" />
      {/* Fin (top) */}
      <path d="M 52 8 Q 60 -2 70 8 Z" fill="#1a5aa3" />
      {/* Eye */}
      <circle cx="28" cy="26" r="3.5" fill="#1c1d2b" />
      <circle cx="26.7" cy="24.7" r="1.2" fill="#fff" />
      {/* Outline */}
      <path d="M 18 30 Q 30 6 70 8 Q 92 14 92 30 Q 92 46 70 52 Q 30 54 18 30 Z" fill="none" stroke="#0d3a78" strokeWidth="1.4" />
    </svg>
  );
}

function YellowTang({ size = 65 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 70" width={size} height={size * 0.7} aria-hidden="true">
      {/* Flat almond body */}
      <path d="M 16 36 Q 30 8 64 8 Q 88 18 84 36 Q 88 54 64 64 Q 30 64 16 36 Z" fill="#ffd864" />
      {/* Tail */}
      <path d="M 84 36 L 100 22 L 96 36 L 100 50 Z" fill="#f5b830" />
      {/* Pointed snout */}
      <path d="M 16 36 L 4 30 L 8 36 L 4 42 Z" fill="#f5b830" />
      {/* Fin (top) */}
      <path d="M 46 8 Q 56 0 66 8 Z" fill="#f5b830" />
      {/* Eye */}
      <circle cx="34" cy="28" r="3.5" fill="#1c1d2b" />
      <circle cx="32.8" cy="26.8" r="1.2" fill="#fff" />
      {/* Outline */}
      <path d="M 16 36 Q 30 8 64 8 Q 88 18 84 36 Q 88 54 64 64 Q 30 64 16 36 Z" fill="none" stroke="#8a6500" strokeWidth="1.4" />
    </svg>
  );
}

function Starfish({ size = 80 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <path
        d="M 50 6 L 60 36 L 92 38 L 66 58 L 78 90 L 50 70 L 22 90 L 34 58 L 8 38 L 40 36 Z"
        fill="#ff9555"
        stroke="#8a3300"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* Dotted highlights */}
      <circle cx="50" cy="48" r="3.5" fill="#ffd0a8" />
      <circle cx="42" cy="58" r="2.5" fill="#ffd0a8" />
      <circle cx="58" cy="58" r="2.5" fill="#ffd0a8" />
      <circle cx="38" cy="38" r="2" fill="#ffd0a8" />
      <circle cx="62" cy="38" r="2" fill="#ffd0a8" />
    </svg>
  );
}

function Seaweed({ height = 130 }: { height?: number }) {
  return (
    <svg viewBox="0 0 40 130" width={40} height={height} aria-hidden="true">
      <path
        d="M 20 130 Q 8 100 22 80 Q 36 60 18 40 Q 4 20 20 0"
        stroke="#2c8c54"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 20 130 Q 30 110 16 95 Q 6 80 22 65 Q 38 50 18 30 Q 6 12 22 0"
        stroke="#3aa867"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

// ── Static fish entries ─────────────────────────────────────────────────────
// Three fish in three corners. Each animates horizontally across its band —
// using `x` percentage so it scales with viewport width.

interface FishEntry {
  id: string;
  Component: (props: { size?: number }) => ReactElement;
  top: string;
  /** Initial side: "left" → starts off-screen left, swims right and back. */
  side: "left" | "right";
  /** Horizontal travel distance in vw. */
  travel: number;
  /** Full round-trip duration in seconds. */
  duration: number;
  delay: number;
  opacity: number;
}

const FISH: FishEntry[] = [
  { id: "clown", Component: ClownFish,  top: "14%", side: "left",  travel: 30, duration: 45, delay: 0,  opacity: 0.42 },
  { id: "blue",  Component: BlueTang,   top: "78%", side: "left",  travel: 28, duration: 52, delay: 6,  opacity: 0.40 },
  { id: "tang",  Component: YellowTang, top: "32%", side: "right", travel: 30, duration: 48, delay: 3,  opacity: 0.40 },
];

const BUBBLES = [
  { id: "b1", left: "8%",  size: 10, duration: 16, delay: 0    },
  { id: "b2", left: "22%", size: 14, duration: 19, delay: 6.5  },
  { id: "b3", left: "78%", size: 9,  duration: 14, delay: 3.2  },
  { id: "b4", left: "92%", size: 12, duration: 17, delay: 9.8  },
  { id: "b5", left: "50%", size: 8,  duration: 20, delay: 12.6 },
];

export function OceanWallpaper() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="ocean-wallpaper" aria-hidden="true">
      {/* Caustic light shafts — soft vertical white gradients near the top. */}
      <motion.div
        className="ocean-light-shaft"
        style={{ left: "18%" }}
        animate={reduceMotion ? undefined : { opacity: [0.05, 0.10, 0.05] }}
        transition={reduceMotion ? undefined : { duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="ocean-light-shaft"
        style={{ left: "62%" }}
        animate={reduceMotion ? undefined : { opacity: [0.04, 0.09, 0.04] }}
        transition={reduceMotion ? undefined : { duration: 11, delay: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Fish — each swims back and forth across the edge band. */}
      {FISH.map((f) => {
        const anchorStyle =
          f.side === "left"
            ? { left: "-8%", top: f.top }
            : { right: "-8%", top: f.top, transform: "scaleX(-1)" };
        return (
          <motion.div
            key={f.id}
            className="ocean-fish"
            style={{ ...anchorStyle, opacity: f.opacity }}
            animate={
              reduceMotion
                ? undefined
                : {
                    x: f.side === "left" ? [0, `${f.travel}vw`, 0] : [0, `-${f.travel}vw`, 0],
                    y: [0, -6, 0, 4, 0],
                    rotate: [0, 2, -2, 1, 0],
                  }
            }
            transition={
              reduceMotion
                ? undefined
                : {
                    duration: f.duration,
                    delay: f.delay,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }
            }
          >
            <f.Component />
          </motion.div>
        );
      })}

      {/* Starfish — slow rotation in the bottom-right corner. */}
      <motion.div
        className="ocean-starfish"
        animate={reduceMotion ? undefined : { rotate: [0, 360] }}
        transition={reduceMotion ? undefined : { duration: 90, repeat: Infinity, ease: "linear" }}
      >
        <Starfish />
      </motion.div>

      {/* Seaweed — two strands swaying at the bottom corners. */}
      <motion.div
        className="ocean-seaweed ocean-seaweed-left"
        animate={reduceMotion ? undefined : { rotate: [-3, 3, -2, 2, -3] }}
        transition={reduceMotion ? undefined : { duration: 7, repeat: Infinity, ease: "easeInOut" }}
      >
        <Seaweed />
      </motion.div>
      <motion.div
        className="ocean-seaweed ocean-seaweed-right"
        animate={reduceMotion ? undefined : { rotate: [3, -3, 2, -2, 3] }}
        transition={reduceMotion ? undefined : { duration: 8.5, delay: 1, repeat: Infinity, ease: "easeInOut" }}
      >
        <Seaweed height={110} />
      </motion.div>

      {/* Bubbles — rise from random bottom positions, fade out near the top. */}
      {BUBBLES.map((b) => (
        <motion.div
          key={b.id}
          className="ocean-bubble"
          style={{
            left: b.left,
            width: b.size,
            height: b.size,
          }}
          animate={
            reduceMotion
              ? undefined
              : {
                  y: ["0vh", "-100vh"],
                  opacity: [0, 0.5, 0.5, 0],
                  x: [0, 4, -4, 0],
                }
          }
          transition={
            reduceMotion
              ? undefined
              : {
                  duration: b.duration,
                  delay: b.delay,
                  repeat: Infinity,
                  ease: "linear",
                  times: [0, 0.1, 0.9, 1],
                }
          }
        />
      ))}
    </div>
  );
}
