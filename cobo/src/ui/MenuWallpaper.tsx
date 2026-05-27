import { motion, useReducedMotion } from "framer-motion";
import { CardView } from "./Card";
import type { Card, Rank, Suit } from "../engine/types";

/**
 * Live animated wallpaper for the home/menu screen.
 *
 * Renders two scattered piles of cards (left + right edges) that gently float
 * and sway out of sync, with soft ambient glows beneath each pile for depth.
 * The center area stays clear so the title, username, and Play button remain
 * fully visible and unobscured.
 *
 * - `pointer-events: none` so clicks pass through to the menu UI.
 * - Each card has unique animation timing (duration + delay) so motion feels
 *   organic rather than synchronized.
 * - Respects `prefers-reduced-motion`: cards remain static in that case.
 */

interface WallpaperCard {
  /** Stable key for React reconciliation */
  id: string;
  /** Side of the screen */
  side: "left" | "right";
  /** Inset on the side (% of viewport) */
  inset: number;
  /** Vertical position (% of viewport) */
  top: number;
  /** Base rotation in degrees */
  rotate: number;
  /** Card size token */
  size: "sm" | "md" | "lg";
  /** Whether the card faces up; face-down shows the navy back */
  faceUp: boolean;
  /** Card value (omitted for face-down cards) */
  rank?: Rank;
  /** Card suit */
  suit?: Suit;
  /** Animation cycle duration in seconds */
  duration: number;
  /** Animation start delay in seconds (de-syncs motion) */
  delay: number;
  /** Float distance multiplier (1 = baseline, 1.5 = drifts more) */
  driftScale: number;
  /** Opacity for depth — back layer cards recede slightly */
  opacity: number;
  /** Marks "inner" cards that hide on narrow screens to prevent UI overlap */
  inner?: boolean;
  /** A few cards also pulse scale slightly for extra subtlety */
  pulse?: boolean;
}

/**
 * Pre-tuned card composition. Positions and rotations are chosen by hand so
 * the pile looks like a deliberate, premium arrangement rather than random
 * scatter. Inner cards are flagged so we can hide them on narrow screens.
 */
const CARDS: WallpaperCard[] = [
  // ───────── LEFT PILE ─────────
  // Outermost (closest to viewport edge) — receding, slightly transparent.
  { id: "L1", side: "left",  inset: -6,  top: 10, rotate: -22, size: "lg", faceUp: false,                       duration: 11, delay: 0.4, driftScale: 1.0, opacity: 0.82 },
  { id: "L2", side: "left",  inset: -5,  top: 76, rotate:  18, size: "lg", faceUp: true, rank: "5",  suit: "H", duration: 13, delay: 1.2, driftScale: 1.1, opacity: 0.85 },
  { id: "L3", side: "left",  inset:  2,  top: 26, rotate:  12, size: "lg", faceUp: true, rank: "K",  suit: "S", duration: 9,  delay: 0.0, driftScale: 1.0, opacity: 0.92 },
  { id: "L4", side: "left",  inset:  1,  top: 60, rotate: -28, size: "lg", faceUp: true, rank: "2",  suit: "D", duration: 10, delay: 2.1, driftScale: 0.9, opacity: 0.9 },
  // Mid-layer
  { id: "L5", side: "left",  inset:  8,  top: 44, rotate:   6, size: "md", faceUp: false,                       duration: 14, delay: 0.7, driftScale: 1.2, opacity: 0.95, pulse: true },
  { id: "L6", side: "left",  inset:  9,  top: 16, rotate: -14, size: "md", faceUp: true, rank: "A",  suit: "H", duration: 8,  delay: 1.8, driftScale: 1.0, opacity: 1 },
  // Innermost (closest to UI — hide on narrow screens)
  { id: "L7", side: "left",  inset: 14,  top: 70, rotate:  22, size: "md", faceUp: true, rank: "7",  suit: "C", duration: 12, delay: 0.3, driftScale: 1.1, opacity: 1, inner: true },
  { id: "L8", side: "left",  inset: 16,  top: 36, rotate: -10, size: "md", faceUp: false,                       duration: 9,  delay: 2.6, driftScale: 0.8, opacity: 0.95, inner: true, pulse: true },

  // ───────── RIGHT PILE (mirrored) ─────────
  { id: "R1", side: "right", inset: -6,  top: 12, rotate:  24, size: "lg", faceUp: true, rank: "10", suit: "S", duration: 12, delay: 0.9, driftScale: 1.0, opacity: 0.83 },
  { id: "R2", side: "right", inset: -4,  top: 78, rotate: -20, size: "lg", faceUp: false,                       duration: 14, delay: 0.2, driftScale: 1.1, opacity: 0.85 },
  { id: "R3", side: "right", inset:  2,  top: 28, rotate: -16, size: "lg", faceUp: true, rank: "J",  suit: "H", duration: 9,  delay: 1.5, driftScale: 0.9, opacity: 0.92 },
  { id: "R4", side: "right", inset:  3,  top: 58, rotate:  28, size: "lg", faceUp: true, rank: "9",  suit: "C", duration: 11, delay: 0.6, driftScale: 1.0, opacity: 0.9 },
  // Mid-layer
  { id: "R5", side: "right", inset:  9,  top: 42, rotate:  -8, size: "md", faceUp: true, rank: "Joker", suit: "H", duration: 13, delay: 2.3, driftScale: 1.3, opacity: 0.95, pulse: true },
  { id: "R6", side: "right", inset: 10,  top: 18, rotate:  14, size: "md", faceUp: false,                       duration: 10, delay: 1.1, driftScale: 1.0, opacity: 1 },
  // Innermost
  { id: "R7", side: "right", inset: 15,  top: 68, rotate: -24, size: "md", faceUp: true, rank: "3",  suit: "D", duration: 8,  delay: 2.0, driftScale: 1.1, opacity: 1, inner: true },
  { id: "R8", side: "right", inset: 17,  top: 34, rotate:  10, size: "md", faceUp: true, rank: "Q",  suit: "S", duration: 12, delay: 0.5, driftScale: 0.9, opacity: 0.95, inner: true, pulse: true },
];

function makeCard(rank: Rank, suit: Suit, id: string): Card {
  return { id, rank, suit };
}

export function MenuWallpaper() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="menu-wallpaper" aria-hidden="true">
      {/* Aurora background — two drifting blobs (teal + coral) on a slow
          loop. Pure CSS animation so Firefox/Edge perform identically to
          Chrome (no framer-motion timeline crunch on the menu screen). */}
      <div className="menu-aurora">
        <div className="menu-aurora-blob menu-aurora-blob-teal" />
        <div className="menu-aurora-blob menu-aurora-blob-coral" />
        <div className="menu-aurora-grain" />
      </div>
      {/* Soft ambient under-light beneath each pile — coral on the left,
          teal on the right so the two halves of the screen each pick up a
          different accent. Pulses very slowly for that "alive" feel. */}
      <div className="menu-wallpaper-glow menu-wallpaper-glow-left" />
      <div className="menu-wallpaper-glow menu-wallpaper-glow-right" />

      {CARDS.map((c) => {
        const sideStyle =
          c.side === "left" ? { left: `${c.inset}%` } : { right: `${c.inset}%` };

        // Animation per-card. y/x drift values are small (±10/±4px) so motion
        // stays subtle. Rotation oscillates around the base tilt by a couple
        // degrees. The keyframe arrays loop indefinitely via `repeat: Infinity`.
        const dy = 10 * c.driftScale;
        const dx = 4 * c.driftScale;
        const baseR = c.rotate;

        const animateLoop = reduceMotion
          ? { rotate: baseR }
          : {
              y: [0, -dy, 0, dy * 0.6, 0],
              x: [0, dx, 0, -dx * 0.7, 0],
              rotate: [baseR, baseR + 2, baseR - 1, baseR + 1.2, baseR],
              ...(c.pulse ? { scale: [1, 1.015, 1, 0.99, 1] } : {}),
            };

        const cardData = c.faceUp && c.rank && c.suit
          ? makeCard(c.rank, c.suit, c.id)
          : null;

        return (
          <motion.div
            key={c.id}
            className={`menu-wallpaper-card${c.inner ? " inner" : ""}`}
            style={{
              ...sideStyle,
              top: `${c.top}%`,
              opacity: c.opacity,
              // Apply base rotation as an initial transform via Framer so the
              // first frame matches the animation's starting rotation.
            }}
            initial={{ rotate: baseR, y: 0, x: 0 }}
            animate={animateLoop}
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    duration: c.duration,
                    delay: c.delay,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }
            }
          >
            <CardView card={cardData} faceUp={c.faceUp} size={c.size} />
          </motion.div>
        );
      })}
    </div>
  );
}
