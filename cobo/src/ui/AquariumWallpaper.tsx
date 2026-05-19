import { useEffect, useLayoutEffect, useRef, type ReactElement } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Live aquarium wallpaper for the Aquarium table theme.
 *
 * v2.17 — autonomous fish simulation
 * ===================================
 *
 * The previous waypoint-keyframe approach couldn't guarantee that fish faced
 * forward — Framer Motion smoothly interpolates `scaleX` between keyframes,
 * which caused the moonwalking / sideways-swimming glitch even with step-end
 * easing tricks.
 *
 * This version replaces the entire fish motion system with a small physics
 * simulation driven by `requestAnimationFrame`:
 *
 *   1. Each fish has its own `(pos, heading, facing)` state stored in a ref.
 *   2. Per frame we compute steering forces:
 *        • patrol whim    — gentle random heading changes over time
 *        • edge repulsion — push back inward when close to the viewport edges
 *        • fish repulsion — push away from any nearby fish (no overlap)
 *      Combined into a desired heading vector.
 *   3. The fish smoothly turns toward the desired heading, but turn rate is
 *      clamped (big fish turn slow, neon tetras turn fast).
 *   4. Position is ALWAYS updated forward along the current heading — there
 *      is no mechanism that can produce backwards motion. The worst case is
 *      a U-turn, which is a wide arc the fish swims out (not an instant flip).
 *   5. `facing` (+1 / -1) is derived from `cos(heading)` with a small dead
 *      zone around vertical so the fish doesn't jitter-flip mid-dive.
 *
 * The DOM transform is applied imperatively (`el.style.transform = ...`) so
 * the motion runs entirely on the compositor and never triggers a React
 * re-render. `useReducedMotion()` collapses everything to a still tableau.
 *
 * Decor (kelp, tunicates, oysters, coral, bubbles, starfish, sand bed, light
 * shafts) is unchanged from v2.16, except the starfish has been moved down
 * to actually sit on the sand bed instead of floating mid-tank.
 *
 * Layering (z-index inside `.aquarium-wallpaper`):
 *   0 sand + light shafts → 1 fish → 2 bubbles → 3 coral/kelp → 4 oyster/tunicate → 5 starfish
 */

// ────────────────────────────────────────────────────────────────────────────
// SVG SPECIES — each fish is drawn FACING RIGHT in its SVG. We mirror with
// `scaleX(-1)` at the wrapper level when the fish is moving leftward.
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
      <path d="M 26 50 Q 18 22 50 22 Q 78 30 78 50 Q 78 70 50 78 Q 18 78 26 50 Z" fill="#dfe6f0" />
      <path d="M 34 28 Q 36 50 30 72 L 38 70 Q 40 50 38 30 Z" fill="#1c1d2b" opacity="0.65" />
      <path d="M 50 24 Q 52 50 48 76 L 56 74 Q 58 50 54 26 Z" fill="#1c1d2b" opacity="0.65" />
      <path d="M 64 30 Q 66 50 62 70 L 70 68 Q 72 50 68 32 Z" fill="#1c1d2b" opacity="0.55" />
      <path d="M 38 22 Q 50 -2 70 14 Q 56 20 46 26 Z" fill="#bcc6d6" />
      <path d="M 38 78 Q 50 102 70 86 Q 56 80 46 74 Z" fill="#bcc6d6" />
      <path d="M 78 50 L 92 36 Q 88 50 92 64 Z" fill="#dfe6f0" />
      <path d="M 36 64 L 26 92" stroke="#bcc6d6" strokeWidth="1.6" fill="none" />
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
      <path d="M 10 20 Q 20 6 60 8 Q 86 12 88 20 Q 86 28 60 32 Q 20 34 10 20 Z" fill="#e8eef5" />
      <path d="M 18 16 Q 40 10 78 14 Q 80 18 78 20 Q 40 18 18 22 Z" fill="#39bdf2" />
      <path d="M 52 22 Q 70 22 84 24 L 86 26 Q 70 30 52 28 Z" fill="#ff4b6e" />
      <path d="M 88 20 L 98 12 L 96 20 L 98 28 Z" fill="#cfd6e0" />
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
      <path d="M 18 36 Q 28 10 66 10 Q 94 16 94 36 Q 94 54 66 60 Q 28 60 18 36 Z" fill="#c8a4d6" />
      <circle cx="40" cy="26" r="3" fill="#a07ab4" opacity="0.65" />
      <circle cx="56" cy="36" r="2.4" fill="#a07ab4" opacity="0.65" />
      <circle cx="70" cy="22" r="3" fill="#a07ab4" opacity="0.6" />
      <circle cx="80" cy="42" r="2.6" fill="#a07ab4" opacity="0.6" />
      <circle cx="50" cy="48" r="2" fill="#a07ab4" opacity="0.6" />
      <path d="M 94 36 L 108 22 L 102 36 L 108 50 Z" fill="#b294c6" />
      <path d="M 48 10 Q 62 0 78 10 Z" fill="#a07ab4" />
      <path d="M 40 50 L 28 68" stroke="#c8a4d6" strokeWidth="1.4" fill="none" />
      <path d="M 44 52 L 36 70" stroke="#c8a4d6" strokeWidth="1.4" fill="none" />
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

function Tunicates({ size = 80 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <ellipse cx="50" cy="92" rx="40" ry="8" fill="#3a3a4a" />
      <path d="M 26 90 Q 22 50 34 30 Q 40 26 38 30 Q 36 50 40 90 Z" fill="#ff7a9d" />
      <ellipse cx="32" cy="32" rx="5" ry="2.5" fill="#c44a6f" />
      <path d="M 44 90 Q 42 60 50 44 Q 56 42 54 44 Q 52 60 56 90 Z" fill="#ff9d4a" />
      <ellipse cx="49" cy="46" rx="4.5" ry="2.2" fill="#c46a1e" />
      <path d="M 60 90 Q 56 56 66 38 Q 72 34 70 38 Q 68 56 72 90 Z" fill="#5bd8e0" />
      <ellipse cx="65" cy="40" rx="4.8" ry="2.3" fill="#2ea0a8" />
      <path d="M 76 90 Q 76 70 82 60 Q 86 58 84 60 Q 82 70 84 90 Z" fill="#b07bff" />
      <ellipse cx="80" cy="62" rx="3.6" ry="1.8" fill="#7a4ad6" />
    </svg>
  );
}

function Oyster({ size = 70 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 70" width={size} height={size * 0.7} aria-hidden="true">
      <path d="M 8 38 Q 6 64 50 66 Q 94 64 92 38 Q 90 28 50 32 Q 10 28 8 38 Z" fill="#cfc4a8" stroke="#7a6a3a" strokeWidth="1.4" />
      <path d="M 8 38 Q 6 14 50 12 Q 94 14 92 38 Q 90 30 50 30 Q 10 30 8 38 Z" fill="#e8dfc4" stroke="#7a6a3a" strokeWidth="1.4" />
      <path d="M 14 38 Q 50 26 86 38" stroke="#ffd86b" strokeWidth="0.8" fill="none" opacity="0.7" />
      <circle cx="50" cy="38" r="4" fill="#fff8ee" />
      <circle cx="48.6" cy="36.6" r="1.4" fill="#ffffff" opacity="0.8" />
    </svg>
  );
}

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
// FISH SIMULATION
// ────────────────────────────────────────────────────────────────────────────

interface FishDef {
  id: string;
  Component: (props: { size?: number }) => ReactElement;
  size: number;
  /** Starting position (vw, vh). */
  startX: number;
  startY: number;
  /** Initial heading in radians (0 = facing right, π = facing left). */
  startHeading: number;
  /** Cruise speed in vw/sec (vertical is dampened — see TICK below). */
  baseSpeed: number;
  /** Max turning rate in rad/sec. Big fish turn slowly; tetras snap. */
  turnRate: number;
  opacity: number;
}

interface FishState {
  pos: { x: number; y: number };
  heading: number;
  /** Last committed left/right facing (only flips when heading clearly horizontal). */
  facing: 1 | -1;
  /** Where the fish is currently choosing to swim toward. */
  patrolHeading: number;
  /** Seconds until next patrol decision. */
  patrolTimer: number;
}

// 9 fish, varied sizes/speeds, spread across the viewport. Starting positions
// are well separated so the simulation doesn't begin with collisions.
const FISH_DEFS: FishDef[] = [
  { id: "clown1",  Component: ClownFish,  size: 60, startX: 12, startY: 22, startHeading: 0,             baseSpeed: 3.0, turnRate: 0.55, opacity: 0.60 },
  { id: "clown2",  Component: ClownFish,  size: 54, startX: 82, startY: 76, startHeading: Math.PI,       baseSpeed: 3.2, turnRate: 0.60, opacity: 0.58 },
  { id: "blue1",   Component: BlueTang,   size: 70, startX: 30, startY: 38, startHeading: 0.4,           baseSpeed: 3.6, turnRate: 0.65, opacity: 0.60 },
  { id: "blue2",   Component: BlueTang,   size: 64, startX: 68, startY: 52, startHeading: Math.PI + 0.3, baseSpeed: 3.4, turnRate: 0.60, opacity: 0.60 },
  { id: "yellow",  Component: YellowTang, size: 54, startX: 76, startY: 28, startHeading: -0.2,          baseSpeed: 4.2, turnRate: 0.80, opacity: 0.65 },
  { id: "angel",   Component: Angelfish,  size: 60, startX: 18, startY: 62, startHeading: 0.2,           baseSpeed: 1.8, turnRate: 0.45, opacity: 0.60 },
  { id: "tetra1",  Component: NeonTetra,  size: 36, startX: 24, startY: 30, startHeading: 0.2,           baseSpeed: 5.8, turnRate: 1.4,  opacity: 0.70 },
  { id: "tetra2",  Component: NeonTetra,  size: 34, startX: 72, startY: 66, startHeading: Math.PI + 0.3, baseSpeed: 6.2, turnRate: 1.5,  opacity: 0.70 },
  { id: "gourami", Component: Gourami,    size: 66, startX: 44, startY: 46, startHeading: 0.1,           baseSpeed: 2.0, turnRate: 0.50, opacity: 0.55 },
];

// Viewport bounds in (vw, vh). Fish are softly repelled before reaching the
// hard edges, then clamped as a last resort. Top/bottom leave room for the
// top-bar UI and the sand/decor strip respectively.
const X_MIN = -2;
const X_MAX = 102;
const Y_MIN = 10;
const Y_MAX = 82;
const EDGE_BUFFER = 12; // distance over which the soft-repel ramps up

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function applyTransform(
  el: HTMLElement,
  xVw: number,
  yVh: number,
  facing: number,
  tiltDeg: number,
) {
  // All fish SVGs are drawn facing LEFT (eye near x=0, tail at high x). We
  // flip them with scaleX(-1) so they face RIGHT. When `facing = 1` (moving
  // right) we want scaleX(-1); when `facing = -1` (moving left) we want
  // scaleX(1). Hence the negation: scaleX(-facing).
  // CSS transform order is right-to-left: rotate first, then scaleX, then translate.
  el.style.transform = `translate(${xVw}vw, ${yVh}vh) scaleX(${-facing}) rotate(${tiltDeg}deg)`;
}

// ────────────────────────────────────────────────────────────────────────────
// DECOR LAYOUT (positions/sizes static)
// ────────────────────────────────────────────────────────────────────────────

interface DecorPosition {
  id: string;
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

// ────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ────────────────────────────────────────────────────────────────────────────

export function AquariumWallpaper() {
  const reduceMotion = useReducedMotion();
  const fishElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const statesRef = useRef<FishState[]>([]);

  // Lazily initialise simulation state once. Stored in a ref so the animation
  // frame loop can mutate it without triggering React re-renders.
  if (statesRef.current.length === 0) {
    statesRef.current = FISH_DEFS.map((def) => ({
      pos: { x: def.startX, y: def.startY },
      heading: def.startHeading,
      facing: Math.cos(def.startHeading) >= 0 ? 1 : -1,
      patrolHeading: def.startHeading,
      patrolTimer: 1 + Math.random() * 3,
    }));
  }

  // Set initial DOM transforms before paint so fish don't flash at (0,0) on
  // the first frame.
  useLayoutEffect(() => {
    statesRef.current.forEach((fish, i) => {
      const el = fishElsRef.current[i];
      if (!el) return;
      // Tilt = vertical component of heading (positive → nose dips down).
      // No `facing` factor here: the scaleX(-facing) in applyTransform already
      // handles mirroring, so a positive sin always means "nose tilts down" for
      // both left- and right-facing fish after the flip is applied.
      const tilt = Math.sin(fish.heading) * 15;
      applyTransform(el, fish.pos.x, fish.pos.y, fish.facing, tilt);
    });
  }, []);

  // Main simulation loop. Updates physics + writes transforms each frame.
  useEffect(() => {
    if (reduceMotion) return;

    let lastT = performance.now();
    let frameId = 0;

    function tick(t: number) {
      // Cap dt so a backgrounded tab doesn't catapult fish across the screen
      // when it returns to the foreground.
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;

      const states = statesRef.current;
      const n = states.length;

      // Pass 1 — update each fish's physics.
      for (let i = 0; i < n; i++) {
        const fish = states[i];
        const def = FISH_DEFS[i];

        // Patrol whim: occasional small heading change. Rare U-turn so a fish
        // doesn't only ever drift in one direction.
        fish.patrolTimer -= dt;
        if (fish.patrolTimer <= 0) {
          if (Math.random() < 0.12) {
            // U-turn (smoothly executed by the turn-rate limiter)
            fish.patrolHeading = wrapAngle(fish.heading + Math.PI);
          } else {
            // Small perturbation up to ±60°
            fish.patrolHeading = wrapAngle(
              fish.heading + (Math.random() * 2 - 1) * (Math.PI / 3),
            );
          }
          fish.patrolTimer = 3 + Math.random() * 4;
        }

        const patrolX = Math.cos(fish.patrolHeading);
        const patrolY = Math.sin(fish.patrolHeading);

        // Edge repulsion: push back toward the inside of the viewport whenever
        // the fish gets within EDGE_BUFFER of a wall.
        let edgeRepelX = 0;
        let edgeRepelY = 0;
        if (fish.pos.x < X_MIN + EDGE_BUFFER) {
          edgeRepelX += (X_MIN + EDGE_BUFFER - fish.pos.x) / EDGE_BUFFER;
        }
        if (fish.pos.x > X_MAX - EDGE_BUFFER) {
          edgeRepelX -= (fish.pos.x - (X_MAX - EDGE_BUFFER)) / EDGE_BUFFER;
        }
        if (fish.pos.y < Y_MIN + EDGE_BUFFER) {
          edgeRepelY += (Y_MIN + EDGE_BUFFER - fish.pos.y) / EDGE_BUFFER;
        }
        if (fish.pos.y > Y_MAX - EDGE_BUFFER) {
          edgeRepelY -= (fish.pos.y - (Y_MAX - EDGE_BUFFER)) / EDGE_BUFFER;
        }

        // Fish-to-fish repulsion: any other fish within the sum-of-radii
        // pushes us away with a force proportional to overlap. Prevents
        // overlap and produces natural-looking swim-arounds.
        let fishRepelX = 0;
        let fishRepelY = 0;
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const other = states[j];
          const odef = FISH_DEFS[j];
          const dx = fish.pos.x - other.pos.x;
          const dy = fish.pos.y - other.pos.y;
          const dist = Math.hypot(dx, dy);
          // Effective radius in vw-ish units; the /28 divisor was tuned by
          // eye so the personal-space bubble matches the visual fish size.
          const radius = (def.size + odef.size) / 28;
          if (dist > 0.01 && dist < radius) {
            const force = (radius - dist) / radius;
            fishRepelX += (dx / dist) * force;
            fishRepelY += (dy / dist) * force;
          }
        }

        // Combine: patrol (gentle preference) + edge repulsion (medium) +
        // fish repulsion (strongest — collisions take priority). The result
        // vector's angle is the desired heading.
        const totalX = patrolX * 1.0 + edgeRepelX * 4 + fishRepelX * 6;
        const totalY = patrolY * 1.0 + edgeRepelY * 4 + fishRepelY * 6;
        const desiredHeading = Math.atan2(totalY, totalX);

        // Turn smoothly toward desired heading, capped by turnRate so big
        // fish don't snap-rotate.
        const diff = wrapAngle(desiredHeading - fish.heading);
        const maxTurn = def.turnRate * dt;
        fish.heading = wrapAngle(
          fish.heading + Math.sign(diff) * Math.min(Math.abs(diff), maxTurn),
        );

        // Slow down on sharp turns (mimics a real fish bracing into a curve).
        const speedScale = 1 - Math.min(0.4, (Math.abs(diff) / Math.PI) * 0.4);
        const moveDist = def.baseSpeed * dt * speedScale;

        // ALWAYS move FORWARD along current heading. There is no code path
        // that could move the fish backwards relative to its facing.
        fish.pos.x += Math.cos(fish.heading) * moveDist;
        // Dampen vertical so fish prefer horizontal motion (aquarium feel).
        fish.pos.y += Math.sin(fish.heading) * moveDist * 0.7;

        // Hard clamp — should rarely trigger thanks to edge repulsion.
        if (fish.pos.x < X_MIN) fish.pos.x = X_MIN;
        else if (fish.pos.x > X_MAX) fish.pos.x = X_MAX;
        if (fish.pos.y < Y_MIN) fish.pos.y = Y_MIN;
        else if (fish.pos.y > Y_MAX) fish.pos.y = Y_MAX;

        // Update facing only when heading is clearly horizontal. The dead
        // zone around ±90° prevents jittering during steep dives/climbs.
        const cosH = Math.cos(fish.heading);
        if (cosH > 0.15) fish.facing = 1;
        else if (cosH < -0.15) fish.facing = -1;
        // else keep last facing
      }

      // Pass 2 — flush physics into the DOM (single write phase).
      for (let i = 0; i < n; i++) {
        const fish = states[i];
        const el = fishElsRef.current[i];
        if (!el) continue;
        // Tilt: positive sin(heading) → fish is moving downward → nose dips
        // down. The scaleX(-facing) flip in applyTransform handles mirroring,
        // so a positive tilt always reads as "nose down" regardless of facing.
        const tilt = Math.sin(fish.heading) * 15;
        applyTransform(el, fish.pos.x, fish.pos.y, fish.facing, tilt);
      }

      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [reduceMotion]);

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

      {/* z=0 — sand bed at the very bottom */}
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

      {/* z=3 — kelp strands, gentle sway */}
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

      {/* z=4 — tunicates */}
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

      {/* z=4 — oysters on the sand bed */}
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

      {/* z=5 — starfish sitting ON the sand (very gentle rotation) */}
      <motion.div
        className="aquarium-starfish"
        animate={reduceMotion ? undefined : { rotate: [0, 360] }}
        transition={reduceMotion ? undefined : { duration: 120, repeat: Infinity, ease: "linear" }}
      >
        <Starfish />
      </motion.div>

      {/* z=1 — autonomous fish. Note: NO transform is set via React style here.
          The transform is applied imperatively in the simulation loop so
          React re-renders don't reset the fish positions. The opacity stays
          in JSX since it never changes per fish. */}
      {FISH_DEFS.map((def, i) => (
        <div
          key={def.id}
          ref={(el) => {
            fishElsRef.current[i] = el;
          }}
          className="aquarium-fish"
          style={{ opacity: def.opacity }}
        >
          <def.Component size={def.size} />
        </div>
      ))}

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
