import type { ReactElement } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Live aquarium wallpaper for the Aquarium table theme.
 *
 * Replaces the v2.15 OceanWallpaper. Key upgrades over v2.15:
 *
 *  - Fish now face the direction they're swimming. Each fish's path is
 *    described as an array of waypoints; we pre-compute a `scaleX` (and a
 *    small `rotate` tilt) per leg so the fish flips horizontally at the
 *    waypoint where the heading changes — never moonwalking on the return
 *    leg.
 *  - 9 fish across 6 species (vs 3 fish across 3 species).
 *  - Multi-directional motion: horizontal cruises, diagonal sweeps, looping
 *    figure-8s, hovering, slow drifts — every fish has a unique path.
 *  - Richer decor: 3 kelp strands, 3 sea-tunicate clusters, 2 oysters, 2
 *    coral pieces, a sand bed band, plus the existing starfish, bubbles
 *    and caustic light shafts.
 *
 * Everything is inline SVG + Framer Motion. `pointer-events: none` is
 * inherited from `.table-bg`; per-element animations stay on the compositor
 * (transform/opacity only). `useReducedMotion()` collapses all keyframes to
 * a still tableau when the user prefers reduced motion.
 *
 * Layering (z-index inside `.aquarium-wallpaper`):
 *   0 light shafts → 1 fish → 2 bubbles → 3 coral/kelp → 4 sand/oyster/tunicate → 5 starfish
 */

// ────────────────────────────────────────────────────────────────────────────
// SVG SPECIES — each fish is a small inline SVG facing RIGHT by default. The
// per-fish `scaleX` keyframes from waypoint computation flip them visually.
// ────────────────────────────────────────────────────────────────────────────

function ClownFish({ size = 70 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 60" width={size} height={size * 0.6} aria-hidden="true">
      <ellipse cx="48" cy="30" rx="34" ry="18" fill="#ff7a2e" />
      <path d="M 26 16 Q 22 30 28 46 L 36 44 Q 32 30 36 18 Z" fill="#fff8ee" />
      <path d="M 56 16 Q 50 30 58 46 L 66 44 Q 62 30 66 18 Z" fill="#fff8ee" />
      <path d="M 82 30 L 100 16 L 96 30 L 100 44 Z" fill="#ff7a2e" />
      <path d="M 42 14 Q 50 4 60 14 Z" fill="#e85f1e" />
      <circle cx="22" cy="26" r="4" fill="#1c1d2b" />
      <circle cx="20.5" cy="24.5" r="1.4" fill="#fff" />
      <ellipse cx="48" cy="30" rx="34" ry="18" fill="none" stroke="#3d1700" strokeWidth="1.4" />
    </svg>
  );
}

function BlueTang({ size = 80 }: { size?: number }) {
  return (
    <svg viewBox="0 0 110 60" width={size} height={size * 0.55} aria-hidden="true">
      <path d="M 18 30 Q 30 6 70 8 Q 92 14 92 30 Q 92 46 70 52 Q 30 54 18 30 Z" fill="#2b7fd6" />
      <path d="M 30 18 Q 60 16 80 26 Q 60 36 30 38 Z" fill="#1a5aa3" opacity="0.55" />
      <path d="M 92 30 L 108 14 L 102 30 L 108 46 Z" fill="#ffd864" />
      <path d="M 52 8 Q 60 -2 70 8 Z" fill="#1a5aa3" />
      <circle cx="28" cy="26" r="3.5" fill="#1c1d2b" />
      <circle cx="26.7" cy="24.7" r="1.2" fill="#fff" />
      <path d="M 18 30 Q 30 6 70 8 Q 92 14 92 30 Q 92 46 70 52 Q 30 54 18 30 Z" fill="none" stroke="#0d3a78" strokeWidth="1.4" />
    </svg>
  );
}

function YellowTang({ size = 65 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 70" width={size} height={size * 0.7} aria-hidden="true">
      <path d="M 16 36 Q 30 8 64 8 Q 88 18 84 36 Q 88 54 64 64 Q 30 64 16 36 Z" fill="#ffd864" />
      <path d="M 84 36 L 100 22 L 96 36 L 100 50 Z" fill="#f5b830" />
      <path d="M 16 36 L 4 30 L 8 36 L 4 42 Z" fill="#f5b830" />
      <path d="M 46 8 Q 56 0 66 8 Z" fill="#f5b830" />
      <circle cx="34" cy="28" r="3.5" fill="#1c1d2b" />
      <circle cx="32.8" cy="26.8" r="1.2" fill="#fff" />
      <path d="M 16 36 Q 30 8 64 8 Q 88 18 84 36 Q 88 54 64 64 Q 30 64 16 36 Z" fill="none" stroke="#8a6500" strokeWidth="1.4" />
    </svg>
  );
}

/** Tall, vertically-striped freshwater classic — pointed top/bottom fins. */
function Angelfish({ size = 75 }: { size?: number }) {
  return (
    <svg viewBox="0 0 90 100" width={size * 0.9} height={size} aria-hidden="true">
      {/* Disc-shaped body */}
      <path d="M 26 50 Q 18 22 50 22 Q 78 30 78 50 Q 78 70 50 78 Q 18 78 26 50 Z" fill="#dfe6f0" />
      {/* Vertical stripes */}
      <path d="M 34 28 Q 36 50 30 72 L 38 70 Q 40 50 38 30 Z" fill="#1c1d2b" opacity="0.65" />
      <path d="M 50 24 Q 52 50 48 76 L 56 74 Q 58 50 54 26 Z" fill="#1c1d2b" opacity="0.65" />
      <path d="M 64 30 Q 66 50 62 70 L 70 68 Q 72 50 68 32 Z" fill="#1c1d2b" opacity="0.55" />
      {/* Top/bottom long fins */}
      <path d="M 38 22 Q 50 -2 70 14 Q 56 20 46 26 Z" fill="#bcc6d6" />
      <path d="M 38 78 Q 50 102 70 86 Q 56 80 46 74 Z" fill="#bcc6d6" />
      {/* Tail */}
      <path d="M 78 50 L 92 36 Q 88 50 92 64 Z" fill="#dfe6f0" />
      {/* Pelvic feelers */}
      <path d="M 36 64 L 26 92" stroke="#bcc6d6" strokeWidth="1.6" fill="none" />
      {/* Eye */}
      <circle cx="38" cy="44" r="3" fill="#1c1d2b" />
      <circle cx="36.8" cy="42.8" r="1" fill="#fff" />
      <path d="M 26 50 Q 18 22 50 22 Q 78 30 78 50 Q 78 70 50 78 Q 18 78 26 50 Z" fill="none" stroke="#7a8597" strokeWidth="1.2" />
    </svg>
  );
}

/** Tiny streamlined fish with iconic neon-blue + red horizontal stripe. */
function NeonTetra({ size = 45 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 40" width={size} height={size * 0.4} aria-hidden="true">
      {/* Slim silver body */}
      <path d="M 10 20 Q 20 6 60 8 Q 86 12 88 20 Q 86 28 60 32 Q 20 34 10 20 Z" fill="#e8eef5" />
      {/* Neon blue stripe (top) */}
      <path d="M 18 16 Q 40 10 78 14 Q 80 18 78 20 Q 40 18 18 22 Z" fill="#39bdf2" />
      {/* Red stripe (bottom-rear) */}
      <path d="M 52 22 Q 70 22 84 24 L 86 26 Q 70 30 52 28 Z" fill="#ff4b6e" />
      {/* Tail */}
      <path d="M 88 20 L 98 12 L 96 20 L 98 28 Z" fill="#cfd6e0" />
      {/* Eye */}
      <circle cx="20" cy="17" r="2" fill="#1c1d2b" />
      <circle cx="19.4" cy="16.4" r="0.6" fill="#fff" />
      <path d="M 10 20 Q 20 6 60 8 Q 86 12 88 20 Q 86 28 60 32 Q 20 34 10 20 Z" fill="none" stroke="#7a8597" strokeWidth="0.8" />
    </svg>
  );
}

/** Pearl gourami — long pelvic feelers, mottled body. */
function Gourami({ size = 80 }: { size?: number }) {
  return (
    <svg viewBox="0 0 110 70" width={size} height={size * 0.64} aria-hidden="true">
      {/* Body */}
      <path d="M 18 36 Q 28 10 66 10 Q 94 16 94 36 Q 94 54 66 60 Q 28 60 18 36 Z" fill="#c8a4d6" />
      {/* Mottled spots */}
      <circle cx="40" cy="26" r="3" fill="#a07ab4" opacity="0.65" />
      <circle cx="56" cy="36" r="2.4" fill="#a07ab4" opacity="0.65" />
      <circle cx="70" cy="22" r="3" fill="#a07ab4" opacity="0.6" />
      <circle cx="80" cy="42" r="2.6" fill="#a07ab4" opacity="0.6" />
      <circle cx="50" cy="48" r="2" fill="#a07ab4" opacity="0.6" />
      {/* Tail */}
      <path d="M 94 36 L 108 22 L 102 36 L 108 50 Z" fill="#b294c6" />
      {/* Dorsal fin */}
      <path d="M 48 10 Q 62 0 78 10 Z" fill="#a07ab4" />
      {/* Long pelvic feelers */}
      <path d="M 40 50 L 28 68" stroke="#c8a4d6" strokeWidth="1.4" fill="none" />
      <path d="M 44 52 L 36 70" stroke="#c8a4d6" strokeWidth="1.4" fill="none" />
      {/* Eye */}
      <circle cx="30" cy="30" r="3.5" fill="#1c1d2b" />
      <circle cx="28.8" cy="28.8" r="1.2" fill="#fff" />
      <path d="M 18 36 Q 28 10 66 10 Q 94 16 94 36 Q 94 54 66 60 Q 28 60 18 36 Z" fill="none" stroke="#6a4a82" strokeWidth="1.4" />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// DECOR SVGs
// ────────────────────────────────────────────────────────────────────────────

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
      <circle cx="50" cy="48" r="3.5" fill="#ffd0a8" />
      <circle cx="42" cy="58" r="2.5" fill="#ffd0a8" />
      <circle cx="58" cy="58" r="2.5" fill="#ffd0a8" />
      <circle cx="38" cy="38" r="2" fill="#ffd0a8" />
      <circle cx="62" cy="38" r="2" fill="#ffd0a8" />
    </svg>
  );
}

/** A single kelp strand — long stalk with rounded paddle leaves alternating. */
function Kelp({ height = 200 }: { height?: number }) {
  const w = 60;
  return (
    <svg viewBox={`0 0 ${w} 220`} width={w} height={height} aria-hidden="true">
      <defs>
        <linearGradient id="kelpStalk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3aa867" />
          <stop offset="100%" stopColor="#1d6840" />
        </linearGradient>
      </defs>
      <path
        d="M 30 220 Q 20 180 32 150 Q 44 120 22 90 Q 8 60 30 30 Q 44 12 28 0"
        stroke="url(#kelpStalk)"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Paddle leaves alternating on either side */}
      <ellipse cx="38" cy="200" rx="10" ry="5" fill="#3aa867" />
      <ellipse cx="22" cy="170" rx="11" ry="5" fill="#2d8e54" />
      <ellipse cx="40" cy="135" rx="11" ry="5" fill="#3aa867" />
      <ellipse cx="20" cy="105" rx="10" ry="5" fill="#2d8e54" />
      <ellipse cx="38" cy="75" rx="11" ry="5" fill="#3aa867" />
      <ellipse cx="22" cy="45" rx="10" ry="4" fill="#2d8e54" />
      <ellipse cx="34" cy="18" rx="9" ry="4" fill="#3aa867" />
    </svg>
  );
}

/** A cluster of 4 tunicate tubes on a rock base. */
function Tunicates({ size = 80 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      {/* Rock base */}
      <ellipse cx="50" cy="92" rx="40" ry="8" fill="#3a3a4a" />
      {/* Tube 1 (tall, pink) */}
      <path d="M 26 90 Q 22 50 34 30 Q 40 26 38 30 Q 36 50 40 90 Z" fill="#ff7a9d" />
      <ellipse cx="32" cy="32" rx="5" ry="2.5" fill="#c44a6f" />
      {/* Tube 2 (orange) */}
      <path d="M 44 90 Q 42 60 50 44 Q 56 42 54 44 Q 52 60 56 90 Z" fill="#ff9d4a" />
      <ellipse cx="49" cy="46" rx="4.5" ry="2.2" fill="#c46a1e" />
      {/* Tube 3 (cyan) */}
      <path d="M 60 90 Q 56 56 66 38 Q 72 34 70 38 Q 68 56 72 90 Z" fill="#5bd8e0" />
      <ellipse cx="65" cy="40" rx="4.8" ry="2.3" fill="#2ea0a8" />
      {/* Tube 4 (purple, short) */}
      <path d="M 76 90 Q 76 70 82 60 Q 86 58 84 60 Q 82 70 84 90 Z" fill="#b07bff" />
      <ellipse cx="80" cy="62" rx="3.6" ry="1.8" fill="#7a4ad6" />
    </svg>
  );
}

/** A closed oyster with a pearl peeking at the seam. */
function Oyster({ size = 70 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 70" width={size} height={size * 0.7} aria-hidden="true">
      {/* Lower half */}
      <path d="M 8 38 Q 6 64 50 66 Q 94 64 92 38 Q 90 28 50 32 Q 10 28 8 38 Z" fill="#cfc4a8" stroke="#7a6a3a" strokeWidth="1.4" />
      {/* Upper half */}
      <path d="M 8 38 Q 6 14 50 12 Q 94 14 92 38 Q 90 30 50 30 Q 10 30 8 38 Z" fill="#e8dfc4" stroke="#7a6a3a" strokeWidth="1.4" />
      {/* Inner shell highlight */}
      <path d="M 14 38 Q 50 26 86 38" stroke="#ffd86b" strokeWidth="0.8" fill="none" opacity="0.7" />
      {/* Pearl */}
      <circle cx="50" cy="38" r="4" fill="#fff8ee" />
      <circle cx="48.6" cy="36.6" r="1.4" fill="#ffffff" opacity="0.8" />
    </svg>
  );
}

/** Staghorn coral — branching upward fingers. */
function CoralStaghorn({ size = 100 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 110" width={size} height={size * 0.92} aria-hidden="true">
      <g fill="#c2418a" stroke="#7a1f55" strokeWidth="1.4" strokeLinecap="round">
        <path d="M 60 108 Q 56 70 50 40 Q 46 20 40 4" strokeWidth="6" fill="none" />
        <path d="M 60 108 Q 64 80 72 56 Q 80 38 88 24" strokeWidth="6" fill="none" />
        <path d="M 50 40 Q 38 30 26 22" strokeWidth="5" fill="none" />
        <path d="M 72 56 Q 86 50 100 46" strokeWidth="5" fill="none" />
        <path d="M 40 4 Q 36 8 32 14" strokeWidth="4" fill="none" />
        <path d="M 88 24 Q 96 20 104 16" strokeWidth="4" fill="none" />
        <circle cx="40" cy="4"  r="3.5" />
        <circle cx="88" cy="24" r="3.5" />
        <circle cx="26" cy="22" r="3" />
        <circle cx="100" cy="46" r="3" />
      </g>
    </svg>
  );
}

/** Brain coral — rounded mound with internal squiggles. */
function CoralBrain({ size = 110 }: { size?: number }) {
  return (
    <svg viewBox="0 0 140 90" width={size} height={size * 0.64} aria-hidden="true">
      <ellipse cx="70" cy="78" rx="64" ry="14" fill="#7a3a2a" />
      <path d="M 10 60 Q 30 18 70 16 Q 110 18 130 60 Q 110 70 70 70 Q 30 70 10 60 Z" fill="#e26a4a" stroke="#7a2a18" strokeWidth="1.4" />
      <path d="M 20 56 Q 40 36 60 50 Q 70 60 90 44 Q 110 30 124 54" stroke="#a8341c" strokeWidth="1.6" fill="none" />
      <path d="M 28 64 Q 44 50 60 60 Q 76 70 92 56 Q 108 44 120 62" stroke="#a8341c" strokeWidth="1.2" fill="none" />
      <path d="M 36 50 Q 48 40 60 46" stroke="#a8341c" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// FISH PATH SYSTEM
//
// Each fish gets a closed loop of waypoints (in vw / vh). At each leg we
// derive the heading and set `scaleX` so the fish ALWAYS faces forward, and
// `rotate` so it tilts up/down a few degrees to match. The motion.div then
// receives synchronised keyframe arrays — flips happen exactly at waypoints
// so there's no on-leg moonwalking.
// ────────────────────────────────────────────────────────────────────────────

interface Waypoint { x: number; y: number; }

interface FishConfig {
  id: string;
  Component: (props: { size?: number }) => ReactElement;
  size: number;
  waypoints: Waypoint[];
  /** Full-loop duration in seconds (covers all legs). */
  duration: number;
  delay: number;
  opacity: number;
  /** Max tilt amplitude in degrees applied to direction-based rotate. */
  tilt: number;
}

interface FishKeyframes {
  x: string[];
  y: string[];
  scaleX: number[];
  rotate: number[];
  times: number[];
}

/**
 * Walk the waypoint loop and produce parallel keyframe arrays for the
 * Framer Motion `animate` config. Each waypoint produces one keyframe.
 * The final keyframe duplicates the first so the animation loops cleanly.
 */
function buildKeyframes(wp: Waypoint[], tilt: number): FishKeyframes {
  const n = wp.length;
  const x: string[] = [];
  const y: string[] = [];
  const scaleX: number[] = [];
  const rotate: number[] = [];

  for (let i = 0; i < n; i++) {
    const here = wp[i];
    // Next point (wrap to first to close the loop) — defines heading FROM
    // this waypoint, since framer holds the keyframe value until the next.
    const next = wp[(i + 1) % n];
    const dx = next.x - here.x;
    const dy = next.y - here.y;
    x.push(`${here.x}vw`);
    y.push(`${here.y}vh`);
    // Heading right → scaleX = 1, left → -1. Vertical-only legs keep the
    // previous facing.
    scaleX.push(dx > 0.5 ? 1 : dx < -0.5 ? -1 : (scaleX[i - 1] ?? 1));
    // Tilt the nose up/down a bit when the fish is climbing or diving.
    // dy positive (downward) means tilt DOWN visually → positive rotate for
    // right-facing fish, but since we apply scaleX first, a single positive
    // value works for both directions because the rotate is in element-local
    // space after the flip. Clamp.
    const tiltAmt = Math.max(-tilt, Math.min(tilt, (dy / 6) * tilt));
    rotate.push(tiltAmt);
  }

  // Close the loop by repeating the first keyframe so x/y/scaleX/rotate
  // return to their starting values smoothly (Framer reads the array
  // top-to-bottom and tweens between consecutive entries).
  x.push(x[0]);
  y.push(y[0]);
  scaleX.push(scaleX[0]);
  rotate.push(rotate[0]);

  // Evenly distribute keyframe times across the loop.
  const times: number[] = [];
  const step = 1 / (n);
  for (let i = 0; i <= n; i++) times.push(Math.min(1, i * step));

  return { x, y, scaleX, rotate, times };
}

// ── Per-fish path scripts ───────────────────────────────────────────────────
// Coordinates in (vw, vh). Fish stay in the outer ~22% bands so they never
// crowd the centre play area. Each fish has its own pattern.

const FISH: FishConfig[] = [
  // 1. Clownfish — slow horizontal cruise across the very top
  {
    id: "clown1", Component: ClownFish, size: 70,
    waypoints: [
      { x: -10, y: 14 }, { x: 30, y: 12 }, { x: 70, y: 16 }, { x: 110, y: 14 },
      { x: 70, y: 18 }, { x: 30, y: 16 },
    ],
    duration: 60, delay: 0, opacity: 0.45, tilt: 4,
  },
  // 2. Clownfish — opposite direction, bottom band
  {
    id: "clown2", Component: ClownFish, size: 60,
    waypoints: [
      { x: 105, y: 78 }, { x: 70, y: 82 }, { x: 30, y: 76 }, { x: -8, y: 80 },
      { x: 30, y: 84 }, { x: 70, y: 78 },
    ],
    duration: 72, delay: 8, opacity: 0.42, tilt: 4,
  },
  // 3. Blue Tang — diagonal sweep upper-left to lower-right and back
  {
    id: "blue1", Component: BlueTang, size: 78,
    waypoints: [
      { x: -8, y: 24 }, { x: 18, y: 36 }, { x: 0, y: 58 }, { x: -10, y: 42 },
    ],
    duration: 55, delay: 3, opacity: 0.42, tilt: 6,
  },
  // 4. Blue Tang — wide oval right edge
  {
    id: "blue2", Component: BlueTang, size: 72,
    waypoints: [
      { x: 90, y: 30 }, { x: 100, y: 48 }, { x: 92, y: 66 }, { x: 84, y: 48 },
    ],
    duration: 50, delay: 10, opacity: 0.40, tilt: 6,
  },
  // 5. Yellow Tang — lazy oval upper-right
  {
    id: "yellow", Component: YellowTang, size: 60,
    waypoints: [
      { x: 78, y: 22 }, { x: 92, y: 32 }, { x: 84, y: 44 }, { x: 70, y: 32 },
    ],
    duration: 42, delay: 1.5, opacity: 0.42, tilt: 5,
  },
  // 6. Angelfish — slow hover bottom-left
  {
    id: "angel", Component: Angelfish, size: 68,
    waypoints: [
      { x: 6, y: 62 }, { x: 12, y: 60 }, { x: 8, y: 66 }, { x: 2, y: 64 },
    ],
    duration: 28, delay: 4, opacity: 0.42, tilt: 3,
  },
  // 7. Neon Tetra — tight figure-8 upper-left
  {
    id: "tetra1", Component: NeonTetra, size: 40,
    waypoints: [
      { x: 4, y: 30 }, { x: 16, y: 26 }, { x: 22, y: 34 }, { x: 16, y: 42 },
      { x: 4, y: 38 }, { x: 0, y: 32 },
    ],
    duration: 22, delay: 0.6, opacity: 0.50, tilt: 8,
  },
  // 8. Neon Tetra — tight figure-8 lower-right
  {
    id: "tetra2", Component: NeonTetra, size: 38,
    waypoints: [
      { x: 90, y: 60 }, { x: 78, y: 64 }, { x: 72, y: 72 }, { x: 80, y: 80 },
      { x: 92, y: 76 }, { x: 96, y: 68 },
    ],
    duration: 24, delay: 5, opacity: 0.50, tilt: 8,
  },
  // 9. Gourami — slow rightward drift across mid-left band with vertical bob
  {
    id: "gourami", Component: Gourami, size: 76,
    waypoints: [
      { x: -10, y: 48 }, { x: 12, y: 44 }, { x: 22, y: 52 }, { x: 8, y: 56 },
    ],
    duration: 64, delay: 7, opacity: 0.40, tilt: 5,
  },
];

// ── Decor positions ────────────────────────────────────────────────────────

interface DecorPosition {
  id: string;
  /** Either a left or right inset percentage. */
  side: "left" | "right";
  inset: number;
  bottom: number;
}

const KELP: (DecorPosition & { height: number; duration: number; delay: number })[] = [
  { id: "k1", side: "left",  inset: 2,  bottom: -10, height: 220, duration: 8.5, delay: 0   },
  { id: "k2", side: "left",  inset: 12, bottom: -10, height: 180, duration: 9.5, delay: 1.4 },
  { id: "k3", side: "right", inset: 4,  bottom: -10, height: 210, duration: 8.0, delay: 0.7 },
];

const TUNICATES: (DecorPosition & { size: number; duration: number; delay: number })[] = [
  { id: "t1", side: "left",  inset: 5,  bottom: 4, size: 70, duration: 5.2, delay: 0   },
  { id: "t2", side: "right", inset: 9,  bottom: 4, size: 64, duration: 4.8, delay: 1.6 },
  { id: "t3", side: "left",  inset: 22, bottom: 2, size: 56, duration: 5.6, delay: 0.9 },
];

const OYSTERS: (DecorPosition & { size: number })[] = [
  { id: "o1", side: "left",  inset: 16, bottom: 1, size: 64 },
  { id: "o2", side: "right", inset: 18, bottom: 0, size: 70 },
];

const CORALS: (DecorPosition & { kind: "staghorn" | "brain"; size: number; opacity: number })[] = [
  { id: "c1", side: "left",  inset: 8,  bottom: 2, kind: "staghorn", size: 100, opacity: 0.45 },
  { id: "c2", side: "right", inset: 12, bottom: 1, kind: "brain",    size: 120, opacity: 0.45 },
];

const BUBBLES = [
  { id: "b1", left: "8%",  size: 10, duration: 16, delay: 0    },
  { id: "b2", left: "22%", size: 14, duration: 19, delay: 6.5  },
  { id: "b3", left: "78%", size: 9,  duration: 14, delay: 3.2  },
  { id: "b4", left: "92%", size: 12, duration: 17, delay: 9.8  },
  { id: "b5", left: "50%", size: 8,  duration: 20, delay: 12.6 },
];

// ── Component ──────────────────────────────────────────────────────────────

export function AquariumWallpaper() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="aquarium-wallpaper" aria-hidden="true">
      {/* z=0 — caustic light shafts at the top */}
      <motion.div
        className="aquarium-light-shaft"
        style={{ left: "18%" }}
        animate={reduceMotion ? undefined : { opacity: [0.06, 0.12, 0.06] }}
        transition={reduceMotion ? undefined : { duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="aquarium-light-shaft"
        style={{ left: "62%" }}
        animate={reduceMotion ? undefined : { opacity: [0.05, 0.10, 0.05] }}
        transition={reduceMotion ? undefined : { duration: 11, delay: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Sand bed at the very bottom (static) */}
      <div className="aquarium-sand" />

      {/* z=3 — coral (back layer of foreground) */}
      {CORALS.map((c) => {
        const sideStyle = c.side === "left" ? { left: `${c.inset}%` } : { right: `${c.inset}%` };
        return (
          <div
            key={c.id}
            className="aquarium-coral"
            style={{ ...sideStyle, bottom: `${c.bottom}%`, opacity: c.opacity }}
          >
            {c.kind === "staghorn" ? <CoralStaghorn size={c.size} /> : <CoralBrain size={c.size} />}
          </div>
        );
      })}

      {/* z=3 — kelp strands (back layer of foreground), gentle sway */}
      {KELP.map((k) => {
        const sideStyle = k.side === "left" ? { left: `${k.inset}%` } : { right: `${k.inset}%` };
        return (
          <motion.div
            key={k.id}
            className="aquarium-kelp"
            style={{ ...sideStyle, bottom: `${k.bottom}px` }}
            animate={reduceMotion ? undefined : { rotate: [-3, 3, -1.5, 2, -3] }}
            transition={reduceMotion ? undefined : { duration: k.duration, delay: k.delay, repeat: Infinity, ease: "easeInOut" }}
          >
            <Kelp height={k.height} />
          </motion.div>
        );
      })}

      {/* z=4 — tunicates (very front of foreground) */}
      {TUNICATES.map((t) => {
        const sideStyle = t.side === "left" ? { left: `${t.inset}%` } : { right: `${t.inset}%` };
        return (
          <motion.div
            key={t.id}
            className="aquarium-tunicate"
            style={{ ...sideStyle, bottom: `${t.bottom}%` }}
            animate={reduceMotion ? undefined : { scaleY: [1, 1.04, 1] }}
            transition={reduceMotion ? undefined : { duration: t.duration, delay: t.delay, repeat: Infinity, ease: "easeInOut" }}
          >
            <Tunicates size={t.size} />
          </motion.div>
        );
      })}

      {/* z=4 — oysters on the sand bed (static) */}
      {OYSTERS.map((o) => {
        const sideStyle = o.side === "left" ? { left: `${o.inset}%` } : { right: `${o.inset}%` };
        return (
          <div
            key={o.id}
            className="aquarium-oyster"
            style={{ ...sideStyle, bottom: `${o.bottom}%` }}
          >
            <Oyster size={o.size} />
          </div>
        );
      })}

      {/* z=5 — starfish (close to camera) */}
      <motion.div
        className="aquarium-starfish"
        animate={reduceMotion ? undefined : { rotate: [0, 360] }}
        transition={reduceMotion ? undefined : { duration: 90, repeat: Infinity, ease: "linear" }}
      >
        <Starfish />
      </motion.div>

      {/* z=1 — fish (between background and decor) */}
      {FISH.map((f) => {
        const kf = buildKeyframes(f.waypoints, f.tilt);
        return (
          <motion.div
            key={f.id}
            className="aquarium-fish"
            style={{ opacity: f.opacity, left: 0, top: 0 }}
            initial={{
              x: kf.x[0],
              y: kf.y[0],
              scaleX: kf.scaleX[0],
              rotate: kf.rotate[0],
            }}
            animate={
              reduceMotion
                ? { x: kf.x[0], y: kf.y[0], scaleX: kf.scaleX[0], rotate: kf.rotate[0] }
                : {
                    x: kf.x,
                    y: kf.y,
                    scaleX: kf.scaleX,
                    rotate: kf.rotate,
                  }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    // Per-property transitions let us snap scaleX at each
                    // waypoint without affecting the smooth x/y/rotate glide.
                    x: {
                      duration: f.duration,
                      delay: f.delay,
                      repeat: Infinity,
                      ease: "easeInOut",
                      times: kf.times,
                    },
                    y: {
                      duration: f.duration,
                      delay: f.delay,
                      repeat: Infinity,
                      ease: "easeInOut",
                      times: kf.times,
                    },
                    rotate: {
                      duration: f.duration,
                      delay: f.delay,
                      repeat: Infinity,
                      ease: "easeInOut",
                      times: kf.times,
                    },
                    // Step-at-end: hold the current facing for the entire leg,
                    // snap to the new facing only when the fish arrives at the
                    // next waypoint — eliminates the moonwalk / squish artifact
                    // caused by Framer smoothly interpolating 1 → -1.
                    scaleX: {
                      duration: f.duration,
                      delay: f.delay,
                      repeat: Infinity,
                      ease: (t: number) => (t > 0.9999 ? 1 : 0),
                      times: kf.times,
                    },
                  }
            }
          >
            <f.Component size={f.size} />
          </motion.div>
        );
      })}

      {/* z=2 — bubbles in front of the fish */}
      {BUBBLES.map((b) => (
        <motion.div
          key={b.id}
          className="aquarium-bubble"
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
                  opacity: [0, 0.55, 0.55, 0],
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
