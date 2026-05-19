import { useEffect, useMemo, useState, type ReactElement } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

/**
 * Neon City wallpaper — wet-street Times-Square night scene with neon
 * billboards cycling through goofy bean-creature card-playing scenes.
 *
 * Visual layers (back → front):
 *   1. Night sky gradient (from CSS `.table-bg[data-theme="neon"]`)
 *   2. Far-back distant city silhouette (very dim)
 *   3. Mid-row of building silhouettes with grids of flickering window lights
 *   4. Four neon billboards, each cycling through 3 goofy card-player scenes
 *   5. Wet street at the bottom with neon reflections and puddle highlights
 *   6. A single street lamp on one side with a warm glow
 *
 * The billboards cycle via per-billboard `setInterval` swapping the active
 * scene index every 4–6 seconds (staggered between billboards so they
 * don't all swap at the same beat). `AnimatePresence` cross-fades the
 * old → new scene over ~0.6s. `useReducedMotion` freezes the carousel so
 * each billboard locks on its current scene.
 */

// ────────────────────────────────────────────────────────────────────────────
// PALETTE
// ────────────────────────────────────────────────────────────────────────────

const NEON_PINK   = "#ff3aa8";
const NEON_CYAN   = "#3ae8e8";
const NEON_YELLOW = "#ffd83a";
const NEON_PURPLE = "#a83aff";

// ────────────────────────────────────────────────────────────────────────────
// GOOFY CREATURE SCENES — each one is an inline SVG portrait that fills its
// billboard. The creatures are simple bean/pill bodies with two black dot
// eyes, no nose, and stick limbs. Each scene tells a tiny visual joke about
// a card-game moment.
// ────────────────────────────────────────────────────────────────────────────

interface SceneProps { tint: string; caption: string }

/** Pink bean wearing huge round glasses, holding a fan of cards, smug. */
function CardSharkGlasses({ tint, caption }: SceneProps): ReactElement {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden="true">
      {/* Neon tinted background */}
      <rect width="200" height="200" fill={tint} opacity="0.18" />
      {/* Bean body */}
      <ellipse cx="100" cy="110" rx="56" ry="62" fill="#ff8ab8" stroke="#1c1d2b" strokeWidth="2.4" />
      {/* Stick arms holding cards */}
      <line x1="58"  y1="120" x2="40"  y2="160" stroke="#1c1d2b" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="142" y1="120" x2="160" y2="160" stroke="#1c1d2b" strokeWidth="3.5" strokeLinecap="round" />
      {/* Fanned hand of cards in front */}
      <g stroke="#1c1d2b" strokeWidth="2" strokeLinejoin="round">
        <rect x="60"  y="150" width="22" height="30" fill="#fff8ee" transform="rotate(-22 71 165)" />
        <rect x="80"  y="148" width="22" height="32" fill="#fff8ee" transform="rotate(-8 91 164)" />
        <rect x="100" y="146" width="22" height="34" fill="#fff8ee" transform="rotate(8 111 163)" />
        <rect x="120" y="148" width="22" height="32" fill="#fff8ee" transform="rotate(22 131 164)" />
      </g>
      {/* Huge round glasses */}
      <circle cx="82" cy="92" r="22" fill="rgba(255,255,255,0.18)" stroke="#1c1d2b" strokeWidth="3" />
      <circle cx="118" cy="92" r="22" fill="rgba(255,255,255,0.18)" stroke="#1c1d2b" strokeWidth="3" />
      <line x1="104" y1="92" x2="96" y2="92" stroke="#1c1d2b" strokeWidth="3" />
      {/* Eyes (dots inside the glasses) */}
      <circle cx="82" cy="92" r="4" fill="#1c1d2b" />
      <circle cx="118" cy="92" r="4" fill="#1c1d2b" />
      {/* Smug straight-line smirk */}
      <path d="M 88 130 Q 100 138 112 130" stroke="#1c1d2b" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      {/* Caption */}
      <text x="100" y="195" textAnchor="middle" fontSize="14" fontWeight="900" fill="#fff" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", textShadow: "0 0 4px rgba(0,0,0,0.85)" }}>
        {caption}
      </text>
    </svg>
  );
}

/** Red bean with V-shaped angry eyes, throwing a chair above its head. */
function AngryChairThrow({ tint, caption }: SceneProps): ReactElement {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden="true">
      <rect width="200" height="200" fill={tint} opacity="0.18" />
      {/* Steam/anger puffs */}
      <g fill="#ffffff" opacity="0.6">
        <circle cx="42" cy="32" r="8" />
        <circle cx="158" cy="34" r="6" />
        <circle cx="50" cy="22" r="5" />
      </g>
      {/* Bean body */}
      <ellipse cx="100" cy="124" rx="50" ry="58" fill="#ff5a4a" stroke="#1c1d2b" strokeWidth="2.4" />
      {/* Arms raised holding a chair */}
      <line x1="68"  y1="100" x2="48" y2="50" stroke="#1c1d2b" strokeWidth="4" strokeLinecap="round" />
      <line x1="132" y1="100" x2="152" y2="50" stroke="#1c1d2b" strokeWidth="4" strokeLinecap="round" />
      {/* Chair shape held above */}
      <g stroke="#1c1d2b" strokeWidth="2.4" strokeLinejoin="round" fill="#7a4a2a">
        <rect x="56" y="22" width="88" height="14" />
        <rect x="56" y="36" width="14" height="22" />
        <rect x="130" y="36" width="14" height="22" />
        <rect x="60" y="14" width="80" height="8" />
      </g>
      {/* V-shaped angry eyes */}
      <path d="M 70 105 L 84 113 L 70 121" stroke="#1c1d2b" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M 130 105 L 116 113 L 130 121" stroke="#1c1d2b" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {/* Open shouting mouth */}
      <ellipse cx="100" cy="148" rx="10" ry="13" fill="#1c1d2b" />
      <ellipse cx="100" cy="150" rx="5" ry="6" fill="#7a1010" />
      {/* Scattered cards at the bottom */}
      <g stroke="#1c1d2b" strokeWidth="1.6" strokeLinejoin="round">
        <rect x="36"  y="180" width="14" height="20" fill="#fff8ee" transform="rotate(-30 43 190)" />
        <rect x="58"  y="178" width="14" height="20" fill="#fff8ee" transform="rotate(20 65 188)" />
        <rect x="130" y="180" width="14" height="20" fill="#fff8ee" transform="rotate(-15 137 190)" />
        <rect x="156" y="178" width="14" height="20" fill="#fff8ee" transform="rotate(40 163 188)" />
      </g>
      <text x="100" y="195" textAnchor="middle" fontSize="14" fontWeight="900" fill="#fff" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", textShadow: "0 0 4px rgba(0,0,0,0.85)" }}>
        {caption}
      </text>
    </svg>
  );
}

/** Blue bean with twin tear streams, sad mouth, scattered cards. */
function CryingFlop({ tint, caption }: SceneProps): ReactElement {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden="true">
      <rect width="200" height="200" fill={tint} opacity="0.18" />
      <ellipse cx="100" cy="112" rx="54" ry="62" fill="#5aaef5" stroke="#1c1d2b" strokeWidth="2.4" />
      {/* Stick arms drooping down */}
      <line x1="56"  y1="118" x2="36"  y2="170" stroke="#1c1d2b" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="144" y1="118" x2="164" y2="170" stroke="#1c1d2b" strokeWidth="3.5" strokeLinecap="round" />
      {/* Closed sad eyes */}
      <path d="M 74 92 Q 84 100 94 92" stroke="#1c1d2b" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M 106 92 Q 116 100 126 92" stroke="#1c1d2b" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* Big tear streams */}
      <path d="M 80 100 Q 76 130 80 155" stroke="#3aa8ff" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.85" />
      <path d="M 120 100 Q 124 130 120 155" stroke="#3aa8ff" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.85" />
      <circle cx="80" cy="158" r="5" fill="#3aa8ff" />
      <circle cx="120" cy="158" r="5" fill="#3aa8ff" />
      {/* Downturned mouth */}
      <path d="M 86 134 Q 100 124 114 134" stroke="#1c1d2b" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* Scattered cards on the "ground" */}
      <g stroke="#1c1d2b" strokeWidth="1.6">
        <rect x="20"  y="174" width="16" height="22" fill="#fff8ee" transform="rotate(-25 28 185)" />
        <rect x="170" y="172" width="16" height="22" fill="#fff8ee" transform="rotate(30 178 183)" />
      </g>
      <text x="100" y="195" textAnchor="middle" fontSize="14" fontWeight="900" fill="#fff" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", textShadow: "0 0 4px rgba(0,0,0,0.85)" }}>
        {caption}
      </text>
    </svg>
  );
}

/** Yellow bean with sweat drop, hand on chin, question mark. */
function SweatyThinker({ tint, caption }: SceneProps): ReactElement {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden="true">
      <rect width="200" height="200" fill={tint} opacity="0.18" />
      <ellipse cx="100" cy="114" rx="54" ry="60" fill="#ffd84a" stroke="#1c1d2b" strokeWidth="2.4" />
      {/* Question mark above the head */}
      <text x="148" y="48" fontSize="40" fontWeight="900" fill="#fff" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>?</text>
      <text x="148" y="48" fontSize="40" fontWeight="900" fill="#1c1d2b" stroke="#1c1d2b" strokeWidth="1.2" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>?</text>
      {/* Hand on chin */}
      <line x1="84" y1="138" x2="68" y2="120" stroke="#1c1d2b" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="64" cy="118" r="6" fill="#ffd84a" stroke="#1c1d2b" strokeWidth="2" />
      {/* Holding a couple of cards on the right */}
      <line x1="142" y1="118" x2="166" y2="148" stroke="#1c1d2b" strokeWidth="3.5" strokeLinecap="round" />
      <g stroke="#1c1d2b" strokeWidth="1.6">
        <rect x="158" y="140" width="18" height="26" fill="#fff8ee" transform="rotate(12 167 153)" />
        <rect x="166" y="138" width="18" height="26" fill="#fff8ee" transform="rotate(20 175 151)" />
      </g>
      {/* Concerned eyes (eyebrows tilted) */}
      <line x1="68" y1="86" x2="86" y2="92" stroke="#1c1d2b" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="132" y1="86" x2="114" y2="92" stroke="#1c1d2b" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="80" cy="100" r="4" fill="#1c1d2b" />
      <circle cx="120" cy="100" r="4" fill="#1c1d2b" />
      {/* Sweat drop */}
      <path d="M 50 92 Q 46 102 50 110 Q 54 102 50 92 Z" fill="#7ad0f5" stroke="#1c1d2b" strokeWidth="1.6" />
      {/* Tiny "hmm" mouth */}
      <path d="M 92 132 Q 100 128 108 132" stroke="#1c1d2b" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <text x="100" y="195" textAnchor="middle" fontSize="14" fontWeight="900" fill="#fff" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", textShadow: "0 0 4px rgba(0,0,0,0.85)" }}>
        {caption}
      </text>
    </svg>
  );
}

/** Green bean wearing sunglasses, leaning back, pile of chips at its feet. */
function SmugWinner({ tint, caption }: SceneProps): ReactElement {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden="true">
      <rect width="200" height="200" fill={tint} opacity="0.18" />
      {/* Slight tilt to read as "leaning back" */}
      <g transform="rotate(-6 100 100)">
        <ellipse cx="100" cy="110" rx="56" ry="60" fill="#7adf6a" stroke="#1c1d2b" strokeWidth="2.4" />
        {/* Sunglasses — rectangular */}
        <rect x="66" y="84" width="32" height="14" rx="2" fill="#1c1d2b" />
        <rect x="102" y="84" width="32" height="14" rx="2" fill="#1c1d2b" />
        <line x1="98" y1="91" x2="102" y2="91" stroke="#1c1d2b" strokeWidth="2.4" />
        {/* Highlight glint on each lens */}
        <line x1="70" y1="86" x2="76" y2="88" stroke="#fff" strokeWidth="2" />
        <line x1="106" y1="86" x2="112" y2="88" stroke="#fff" strokeWidth="2" />
        {/* Cocky grin */}
        <path d="M 84 130 Q 100 142 116 130" stroke="#1c1d2b" strokeWidth="3" fill="none" strokeLinecap="round" />
        <line x1="84" y1="130" x2="116" y2="130" stroke="#1c1d2b" strokeWidth="3" />
        {/* Arm casually behind head */}
        <line x1="142" y1="100" x2="160" y2="80" stroke="#1c1d2b" strokeWidth="3.5" strokeLinecap="round" />
      </g>
      {/* Pile of poker chips at the bottom */}
      <g stroke="#1c1d2b" strokeWidth="1.6">
        <ellipse cx="56" cy="184" rx="20" ry="6" fill="#ff5a4a" />
        <ellipse cx="56" cy="178" rx="20" ry="6" fill="#3a8aff" />
        <ellipse cx="56" cy="172" rx="20" ry="6" fill="#5adf5a" />
        <ellipse cx="100" cy="186" rx="22" ry="6" fill="#ffd84a" />
        <ellipse cx="100" cy="180" rx="22" ry="6" fill="#ff5a4a" />
        <ellipse cx="144" cy="184" rx="20" ry="6" fill="#a83aff" />
        <ellipse cx="144" cy="178" rx="20" ry="6" fill="#3a8aff" />
      </g>
      <text x="100" y="166" textAnchor="middle" fontSize="13" fontWeight="900" fill="#fff" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", textShadow: "0 0 4px rgba(0,0,0,0.85)" }}>
        {caption}
      </text>
    </svg>
  );
}

/** Purple bean with googly eyes, holding cards upside-down, question marks. */
function ConfusedCards({ tint, caption }: SceneProps): ReactElement {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden="true">
      <rect width="200" height="200" fill={tint} opacity="0.18" />
      {/* Question marks scattered around the head */}
      <text x="34" y="40" fontSize="26" fontWeight="900" fill="#fff" stroke="#1c1d2b" strokeWidth="1" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>?</text>
      <text x="162" y="58" fontSize="22" fontWeight="900" fill="#fff" stroke="#1c1d2b" strokeWidth="1" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>?</text>
      <text x="48" y="76" fontSize="18" fontWeight="900" fill="#fff" stroke="#1c1d2b" strokeWidth="1" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>?</text>
      <ellipse cx="100" cy="118" rx="54" ry="60" fill="#b878f0" stroke="#1c1d2b" strokeWidth="2.4" />
      {/* Googly eyes — one cross-eyed */}
      <circle cx="82" cy="98" r="11" fill="#fff" stroke="#1c1d2b" strokeWidth="2" />
      <circle cx="84" cy="100" r="4" fill="#1c1d2b" />
      <circle cx="118" cy="98" r="11" fill="#fff" stroke="#1c1d2b" strokeWidth="2" />
      <circle cx="113" cy="96" r="4" fill="#1c1d2b" />
      {/* Wavy "huh?" mouth */}
      <path d="M 82 134 Q 90 130 100 134 Q 110 138 118 134" stroke="#1c1d2b" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      {/* Stick arms holding cards UPSIDE-DOWN */}
      <line x1="58"  y1="124" x2="36" y2="160" stroke="#1c1d2b" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="142" y1="124" x2="164" y2="160" stroke="#1c1d2b" strokeWidth="3.5" strokeLinecap="round" />
      <g stroke="#1c1d2b" strokeWidth="1.6">
        {/* Card on left — number "5" upside down */}
        <rect x="20" y="148" width="22" height="32" fill="#fff8ee" transform="rotate(180 31 164)" />
        <text x="31" y="170" textAnchor="middle" fontSize="13" fontWeight="900" fill="#c0312a" transform="rotate(180 31 164)">5</text>
        {/* Card on right — number "K" upside down */}
        <rect x="158" y="148" width="22" height="32" fill="#fff8ee" transform="rotate(180 169 164)" />
        <text x="169" y="170" textAnchor="middle" fontSize="13" fontWeight="900" fill="#1c1d2b" transform="rotate(180 169 164)">K</text>
      </g>
      <text x="100" y="195" textAnchor="middle" fontSize="14" fontWeight="900" fill="#fff" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", textShadow: "0 0 4px rgba(0,0,0,0.85)" }}>
        {caption}
      </text>
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SCENE REGISTRY — each scene has a creature SVG + a caption + a colour tint.
// ────────────────────────────────────────────────────────────────────────────

interface Scene {
  id: string;
  Component: (p: SceneProps) => ReactElement;
  caption: string;
  tint: string;
}

const SCENES: Record<string, Scene> = {
  shark:    { id: "shark",    Component: CardSharkGlasses, caption: "ALL IN",      tint: NEON_PINK },
  angry:    { id: "angry",    Component: AngryChairThrow,  caption: "REKT",        tint: "#ff5a4a" },
  crying:   { id: "crying",   Component: CryingFlop,       caption: "JUST CRYING", tint: NEON_CYAN },
  sweaty:   { id: "sweaty",   Component: SweatyThinker,    caption: "THINKING…",   tint: NEON_YELLOW },
  smug:     { id: "smug",     Component: SmugWinner,       caption: "EZ",          tint: "#7adf6a" },
  confused: { id: "confused", Component: ConfusedCards,    caption: "WHAT?",       tint: NEON_PURPLE },
};

// ────────────────────────────────────────────────────────────────────────────
// BILLBOARD LAYOUT
// ────────────────────────────────────────────────────────────────────────────

interface BillboardConfig {
  id: string;
  /** CSS positioning. Use either `left`/`right` and `top`. */
  position: { left?: string; right?: string; top: string };
  width: number;
  height: number;
  neon: string;
  /** Cycle of scene IDs the billboard rotates through. */
  cycle: string[];
  /** Per-billboard swap interval in milliseconds. */
  intervalMs: number;
  /** Initial scene index — staggers so all billboards don't show the same scene. */
  startIndex: number;
}

const BILLBOARDS: BillboardConfig[] = [
  {
    id: "bb1",
    position: { left: "5%", top: "8%" },
    width: 220,
    height: 180,
    neon: NEON_PINK,
    cycle: ["shark", "angry", "smug"],
    intervalMs: 4800,
    startIndex: 0,
  },
  {
    id: "bb2",
    position: { right: "5%", top: "6%" },
    width: 200,
    height: 260,
    neon: NEON_CYAN,
    cycle: ["sweaty", "confused", "crying"],
    intervalMs: 5400,
    startIndex: 1,
  },
  {
    id: "bb3",
    position: { left: "3%", top: "44%" },
    width: 180,
    height: 140,
    neon: NEON_YELLOW,
    cycle: ["smug", "shark", "sweaty"],
    intervalMs: 4400,
    startIndex: 2,
  },
  {
    id: "bb4",
    position: { right: "4%", top: "44%" },
    width: 240,
    height: 160,
    neon: NEON_PURPLE,
    cycle: ["angry", "crying", "confused"],
    intervalMs: 5800,
    startIndex: 1,
  },
];

// ────────────────────────────────────────────────────────────────────────────
// BUILDING / WINDOW GENERATION
// ────────────────────────────────────────────────────────────────────────────

interface BuildingDef {
  id: string;
  left: string;
  width: number;
  height: string;
  shade: string;
  cols: number;
  rows: number;
}

const BUILDINGS: BuildingDef[] = [
  { id: "b1",  left: "0%",   width: 9,  height: "55%", shade: "#0a1422", cols: 4,  rows: 14 },
  { id: "b2",  left: "9%",   width: 11, height: "62%", shade: "#0d1828", cols: 5,  rows: 16 },
  { id: "b3",  left: "20%",  width: 10, height: "50%", shade: "#0a1422", cols: 4,  rows: 12 },
  { id: "b4",  left: "30%",  width: 13, height: "68%", shade: "#131a2a", cols: 6,  rows: 18 },
  { id: "b5",  left: "43%",  width: 8,  height: "44%", shade: "#0a1422", cols: 3,  rows: 11 },
  { id: "b6",  left: "51%",  width: 11, height: "58%", shade: "#0d1828", cols: 5,  rows: 14 },
  { id: "b7",  left: "62%",  width: 9,  height: "48%", shade: "#0a1422", cols: 4,  rows: 12 },
  { id: "b8",  left: "71%",  width: 12, height: "66%", shade: "#131a2a", cols: 6,  rows: 17 },
  { id: "b9",  left: "83%",  width: 10, height: "52%", shade: "#0d1828", cols: 5,  rows: 13 },
  { id: "b10", left: "93%",  width: 7,  height: "46%", shade: "#0a1422", cols: 3,  rows: 11 },
];

const WINDOW_COLORS = ["#f5d854", "#f5d854", "#3a8ae8", "#ff8a4a", "#f5d854"]; // weighted warm-yellow

/**
 * Generate the stable list of window cells for all buildings on first render.
 * Each window gets a deterministic-pseudo-random delay and duration so the
 * flickering looks chaotic but doesn't churn React state.
 */
interface WindowCell {
  id: string;
  parentId: string;
  col: number;
  row: number;
  colWidth: number; // % of building width
  rowHeight: number; // % of building height
  color: string;
  delay: number;
  duration: number;
  baseOpacity: number;
}
function generateWindows(): WindowCell[] {
  const out: WindowCell[] = [];
  // Simple LCG so the result is stable across renders (no per-render Math.random churn).
  let seed = 1729;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed & 0x7fffffff) / 0x7fffffff;
  };
  for (const b of BUILDINGS) {
    const colWidth = 100 / b.cols;
    const rowHeight = 100 / b.rows;
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        // 60% of windows are populated (some buildings have dark gaps).
        if (rand() > 0.6) continue;
        out.push({
          id: `${b.id}-${r}-${c}`,
          parentId: b.id,
          col: c,
          row: r,
          colWidth,
          rowHeight,
          color: WINDOW_COLORS[Math.floor(rand() * WINDOW_COLORS.length)],
          delay: rand() * 6,
          duration: 1.5 + rand() * 4,
          baseOpacity: 0.45 + rand() * 0.5,
        });
      }
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// BILLBOARD COMPONENT — cycles through its scene list with a per-instance
// setInterval. Cross-fades via AnimatePresence.
// ────────────────────────────────────────────────────────────────────────────

function Billboard({ config, reduceMotion }: { config: BillboardConfig; reduceMotion: boolean }): ReactElement {
  const [idx, setIdx] = useState(config.startIndex % config.cycle.length);

  useEffect(() => {
    if (reduceMotion) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % config.cycle.length);
    }, config.intervalMs);
    return () => clearInterval(t);
  }, [config, reduceMotion]);

  const scene = SCENES[config.cycle[idx]];

  const positionStyle: React.CSSProperties = {
    top: config.position.top,
    width: config.width,
    height: config.height,
    ...(config.position.left ? { left: config.position.left } : {}),
    ...(config.position.right ? { right: config.position.right } : {}),
    ["--neon-glow" as string]: `${config.neon}cc`,
  };

  return (
    <div className="neon-billboard" style={positionStyle}>
      <AnimatePresence mode="wait">
        <motion.div
          key={scene.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          style={{ position: "absolute", inset: 0 }}
        >
          <scene.Component tint={config.neon} caption={scene.caption} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ────────────────────────────────────────────────────────────────────────────

export function NeonCityWallpaper() {
  const reduceMotion = useReducedMotion();
  // Memoise so we don't regenerate window cells on every re-render.
  const windows = useMemo(() => generateWindows(), []);

  return (
    <div className="neon-wallpaper" aria-hidden="true">
      {/* Distant city silhouette — very dim, sits behind everything else.
          A single SVG silhouette with no animated windows (atmospheric depth). */}
      <svg
        viewBox="0 0 1600 380"
        preserveAspectRatio="none"
        style={{ position: "absolute", left: 0, right: 0, top: "12%", width: "100%", height: "26%", opacity: 0.55 }}
        aria-hidden="true"
      >
        <path
          d="M 0 380 L 0 280 L 70 280 L 70 220 L 130 220 L 130 240 L 180 240 L 180 200 L 240 200 L 240 260 L 290 260 L 290 230 L 360 230 L 360 180 L 420 180 L 420 250 L 470 250 L 470 210 L 540 210 L 540 240 L 600 240 L 600 200 L 660 200 L 660 260 L 720 260 L 720 220 L 800 220 L 800 240 L 860 240 L 860 190 L 920 190 L 920 250 L 980 250 L 980 220 L 1050 220 L 1050 250 L 1110 250 L 1110 200 L 1170 200 L 1170 260 L 1230 260 L 1230 230 L 1300 230 L 1300 200 L 1370 200 L 1370 250 L 1440 250 L 1440 220 L 1500 220 L 1500 250 L 1560 250 L 1560 230 L 1600 230 L 1600 380 Z"
          fill="#0a0e1c"
        />
        {/* A few tiny dim window dots */}
        <g fill="#3a5a8a" opacity="0.6">
          <rect x="90"  y="240" width="3" height="3" />
          <rect x="200" y="220" width="3" height="3" />
          <rect x="310" y="250" width="3" height="3" />
          <rect x="440" y="200" width="3" height="3" />
          <rect x="560" y="230" width="3" height="3" />
          <rect x="700" y="240" width="3" height="3" />
          <rect x="840" y="210" width="3" height="3" />
          <rect x="980" y="240" width="3" height="3" />
          <rect x="1120" y="220" width="3" height="3" />
          <rect x="1260" y="220" width="3" height="3" />
          <rect x="1400" y="230" width="3" height="3" />
          <rect x="1520" y="240" width="3" height="3" />
        </g>
      </svg>

      {/* Mid building row with flickering windows */}
      {BUILDINGS.map((b) => (
        <div
          key={b.id}
          className="neon-building"
          style={{
            left: b.left,
            width: `${b.width}%`,
            bottom: "25vh",       // sits ON the wet-street band, not inside it
            height: b.height,
            background: b.shade,
            // Slight darker top edge to suggest a rooftop / antenna line.
            boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.6), 0 0 1px rgba(0,0,0,0.9)",
          }}
        />
      ))}

      {/* Window grid — each window is a small motion.div with an opacity loop. */}
      {windows.map((w) => {
        const b = BUILDINGS.find((bb) => bb.id === w.parentId)!;
        return (
          <motion.div
            key={w.id}
            className="neon-window"
            style={{
              // Position is computed relative to the wallpaper, using the
              // building's `left`, `width%`, `bottom: 25vh`, and `height` to
              // place each cell. Keep the windows inset a bit so the
              // building's outer border still reads.
              left: `calc(${b.left} + ${(w.col + 0.18) * w.colWidth * (b.width / 100)}%)`,
              width: `calc(${w.colWidth * 0.66 * (b.width / 100)}%)`,
              height: `calc(${w.rowHeight * 0.55} * ${b.height})`,
              bottom: `calc(25vh + (${b.height} * ${(w.row + 0.22) / b.rows}))`,
              background: w.color,
              boxShadow: `0 0 4px ${w.color}`,
            }}
            initial={{ opacity: w.baseOpacity }}
            animate={
              reduceMotion
                ? { opacity: w.baseOpacity }
                : { opacity: [0, w.baseOpacity, w.baseOpacity * 0.5, 0, w.baseOpacity * 0.8, 0] }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    duration: w.duration,
                    delay: w.delay,
                    repeat: Infinity,
                    repeatType: "loop",
                    ease: "easeInOut",
                  }
            }
          />
        );
      })}

      {/* Street lamp on the left, with a warm glow */}
      <div className="neon-lamp" style={{ left: "10%", bottom: "20vh", width: 8, height: 180 }}>
        <svg viewBox="0 0 40 200" width="100%" height="100%">
          <rect x="18" y="0" width="4" height="160" fill="#3a3a48" />
          <ellipse cx="20" cy="10" rx="12" ry="6" fill="#5a5a6a" stroke="#1c1d2b" strokeWidth="1.4" />
          <rect x="14" y="160" width="12" height="40" fill="#3a3a48" />
        </svg>
      </div>
      <div
        className="neon-lamp-glow"
        style={{
          left: "calc(10% - 24px)",
          bottom: "calc(20vh + 168px)",
          width: 80,
          height: 80,
        }}
      />

      {/* Wet street base */}
      <div className="neon-street" />
      {/* Puddle highlights */}
      <div className="neon-puddle" style={{ left: "14%", bottom: "10vh", width: 140, height: 18, background: `radial-gradient(ellipse, ${NEON_PINK} 0%, transparent 70%)` }} />
      <div className="neon-puddle" style={{ left: "44%", bottom: "6vh",  width: 180, height: 22, background: `radial-gradient(ellipse, ${NEON_CYAN} 0%, transparent 70%)` }} />
      <div className="neon-puddle" style={{ right: "18%", bottom: "8vh", width: 160, height: 20, background: `radial-gradient(ellipse, ${NEON_YELLOW} 0%, transparent 70%)` }} />

      {/* Billboards — rendered last so they sit on top of buildings/windows */}
      {BILLBOARDS.map((b) => (
        <Billboard key={b.id} config={b} reduceMotion={!!reduceMotion} />
      ))}
    </div>
  );
}
