import type { ReactElement } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Dawn Clouds wallpaper — saturated cerulean sky with volumetric cumulus.
 *
 * v2.18.2 retune
 * ==============
 *
 * The v2.18.1 pass fixed the colour/lighting problem (washed out → properly
 * shaded), but the user still saw the silhouettes as generic — every cloud
 * was a row of overlapping circles + dark underside. The screen also began
 * empty because every cloud entered from `-25vw`.
 *
 * This pass:
 *
 *   1. **Seven genuinely distinct cloud SHAPES**, not seven sizes of the
 *      same shape:
 *        • CloudHero      — wide anime cumulus arc (focal)
 *        • CloudWideStrat — long flat stratus deck (5:1 aspect)
 *        • CloudTower     — TALL vertical cumulus tower (taller than wide)
 *        • CloudClumpy    — irregular asymmetric — one big lobe + scattered puffs
 *        • CloudHook      — comma-shaped, heavy on the left, tapering tail right
 *        • CloudPuff      — small bumpy round puff
 *        • CloudWisp      — long thin atmospheric wisp (lighter palette)
 *
 *   2. **Clouds visible on screen from the very first frame** — each cloud
 *      has its own `startX` (in vw). When startX is in [0..100], the cloud
 *      is already on screen at page-load. The animation uses a 4-keyframe
 *      `times` trick (two keyframes at the same time) to "teleport" off-
 *      screen-right back to off-screen-left without tweening through the
 *      visible area, so the loop reads as continuous drift.
 *
 *   3. **Dramatic size + opacity variation** so the scene has a clear
 *      foreground / mid-ground / background depth.
 *
 * Three-tone volumetric shading from v2.18.1 is preserved (shadow base →
 * mid tone → highlight → specular accents). `useReducedMotion` still
 * collapses everything to a still tableau.
 */

interface CloudProps { size?: number }

// Shared palette so the whole sky reads as one scene.
const SHADOW = "#4d6a8c";
const MID    = "#8aa6c4";
const LIGHT  = "#e8eff8";
const WHITE  = "#ffffff";

// ────────────────────────────────────────────────────────────────────────────
// CLOUD VARIANTS — each one a distinct silhouette / aspect ratio
// ────────────────────────────────────────────────────────────────────────────

/** HERO — wide anime cumulus arc, 460×280 base (~1.64:1). The focal cloud. */
function CloudHero({ size = 460 }: CloudProps): ReactElement {
  return (
    <svg viewBox="0 0 480 280" width={size} height={size * 0.583} aria-hidden="true">
      <g fill={SHADOW}>
        <ellipse cx="100" cy="206" rx="60" ry="38" />
        <ellipse cx="170" cy="200" rx="68" ry="44" />
        <ellipse cx="240" cy="196" rx="74" ry="48" />
        <ellipse cx="312" cy="200" rx="68" ry="44" />
        <ellipse cx="378" cy="206" rx="58" ry="38" />
        <ellipse cx="240" cy="226" rx="180" ry="22" />
      </g>
      <g fill={MID}>
        <circle cx="108" cy="174" r="48" />
        <circle cx="160" cy="158" r="58" />
        <circle cx="222" cy="148" r="64" />
        <circle cx="284" cy="154" r="62" />
        <circle cx="346" cy="166" r="52" />
        <circle cx="396" cy="186" r="36" />
      </g>
      <g fill={LIGHT}>
        <circle cx="118" cy="156" r="38" />
        <circle cx="172" cy="134" r="50" />
        <circle cx="226" cy="120" r="56" />
        <circle cx="282" cy="128" r="52" />
        <circle cx="338" cy="146" r="42" />
        <circle cx="386" cy="172" r="28" />
      </g>
      <g fill={WHITE}>
        <ellipse cx="180" cy="118" rx="28" ry="22" />
        <ellipse cx="230" cy="104" rx="34" ry="26" />
        <ellipse cx="282" cy="116" rx="28" ry="22" />
      </g>
    </svg>
  );
}

/** WIDE STRATUS — long flat horizontal deck, 640×140 base (~4.6:1). */
function CloudWideStrat({ size = 640 }: CloudProps): ReactElement {
  return (
    <svg viewBox="0 0 680 140" width={size} height={size * 0.206} aria-hidden="true">
      {/* Long dark underside */}
      <g fill={SHADOW}>
        <ellipse cx="340" cy="106" rx="300" ry="22" />
        <ellipse cx="80"  cy="88" rx="40" ry="20" />
        <ellipse cx="150" cy="84" rx="46" ry="22" />
        <ellipse cx="230" cy="86" rx="44" ry="22" />
        <ellipse cx="310" cy="82" rx="50" ry="24" />
        <ellipse cx="400" cy="84" rx="48" ry="22" />
        <ellipse cx="490" cy="86" rx="44" ry="22" />
        <ellipse cx="570" cy="88" rx="48" ry="22" />
        <ellipse cx="640" cy="92" rx="36" ry="18" />
      </g>
      {/* Mid-tone bumpy ridge */}
      <g fill={MID}>
        <circle cx="88"  cy="72" r="22" />
        <circle cx="148" cy="64" r="30" />
        <circle cx="216" cy="66" r="28" />
        <circle cx="296" cy="60" r="36" />
        <circle cx="376" cy="64" r="32" />
        <circle cx="450" cy="62" r="30" />
        <circle cx="528" cy="68" r="32" />
        <circle cx="604" cy="74" r="26" />
      </g>
      {/* Off-white top bumps */}
      <g fill={LIGHT}>
        <circle cx="96"  cy="58" r="15" />
        <circle cx="156" cy="48" r="22" />
        <circle cx="220" cy="52" r="20" />
        <circle cx="298" cy="42" r="28" />
        <circle cx="378" cy="48" r="24" />
        <circle cx="452" cy="48" r="22" />
        <circle cx="530" cy="54" r="24" />
        <circle cx="606" cy="62" r="18" />
      </g>
      {/* Specular pop on a couple of the tallest tufts */}
      <g fill={WHITE}>
        <ellipse cx="300" cy="36" rx="18" ry="10" />
        <ellipse cx="454" cy="42" rx="14" ry="8" />
      </g>
    </svg>
  );
}

/** TOWER — TALL vertical cumulus, 260×360 base (~0.72:1). Taller than wide. */
function CloudTower({ size = 260 }: CloudProps): ReactElement {
  return (
    <svg viewBox="0 0 280 380" width={size} height={size * 1.357} aria-hidden="true">
      {/* Base — widest part at bottom */}
      <g fill={SHADOW}>
        <ellipse cx="140" cy="324" rx="120" ry="40" />
        <ellipse cx="92"  cy="306" rx="56" ry="34" />
        <ellipse cx="186" cy="306" rx="60" ry="36" />
      </g>
      {/* Mid tier — narrower */}
      <g fill={SHADOW}>
        <circle cx="100" cy="224" r="40" />
        <circle cx="170" cy="218" r="46" />
      </g>
      {/* Top tier — narrowest */}
      <g fill={SHADOW}>
        <circle cx="138" cy="132" r="42" />
        <circle cx="180" cy="116" r="34" />
      </g>

      {/* Mid-tone layer */}
      <g fill={MID}>
        <circle cx="100" cy="290" r="44" />
        <circle cx="156" cy="286" r="52" />
        <circle cx="200" cy="296" r="40" />
        <circle cx="106" cy="204" r="36" />
        <circle cx="160" cy="194" r="44" />
        <circle cx="200" cy="208" r="32" />
        <circle cx="138" cy="108" r="36" />
        <circle cx="176" cy="98"  r="30" />
      </g>

      {/* Highlight layer */}
      <g fill={LIGHT}>
        <circle cx="106" cy="270" r="34" />
        <circle cx="158" cy="264" r="42" />
        <circle cx="206" cy="278" r="30" />
        <circle cx="110" cy="186" r="28" />
        <circle cx="160" cy="174" r="36" />
        <circle cx="200" cy="190" r="26" />
        <circle cx="142" cy="92" r="28" />
        <circle cx="178" cy="80" r="22" />
      </g>

      {/* Specular pops — only the topmost tufts catch full light */}
      <g fill={WHITE}>
        <ellipse cx="156" cy="252" rx="22" ry="14" />
        <ellipse cx="160" cy="162" rx="20" ry="12" />
        <ellipse cx="148" cy="78" rx="18" ry="12" />
      </g>
    </svg>
  );
}

/** CLUMPY — irregular asymmetric, 400×220 base (~1.82:1). One big lobe + scattered. */
function CloudClumpy({ size = 400 }: CloudProps): ReactElement {
  return (
    <svg viewBox="0 0 420 240" width={size} height={size * 0.571} aria-hidden="true">
      {/* Shadow base — irregular outline */}
      <g fill={SHADOW}>
        <ellipse cx="90"  cy="178" rx="55" ry="34" />
        <ellipse cx="180" cy="170" rx="80" ry="48" />
        <ellipse cx="280" cy="186" rx="50" ry="32" />
        <ellipse cx="350" cy="176" rx="46" ry="30" />
        <ellipse cx="200" cy="202" rx="170" ry="14" />
        {/* Stray puff to the right, set down lower */}
        <circle cx="392" cy="192" r="22" />
      </g>
      {/* Mid tone — one BIG central lobe + a few smaller scattered ones */}
      <g fill={MID}>
        <circle cx="90"  cy="146" r="40" />
        <circle cx="170" cy="118" r="68" /> {/* The big central lobe */}
        <circle cx="244" cy="148" r="36" />
        <circle cx="290" cy="156" r="32" />
        <circle cx="342" cy="148" r="38" />
        <circle cx="392" cy="172" r="22" />
      </g>
      {/* Highlight — bright tufts mainly on the big lobe + on the right */}
      <g fill={LIGHT}>
        <circle cx="92"  cy="128" r="28" />
        <circle cx="158" cy="92"  r="58" /> {/* highlight on the big lobe */}
        <circle cx="234" cy="132" r="26" />
        <circle cx="288" cy="142" r="22" />
        <circle cx="340" cy="132" r="28" />
      </g>
      {/* Specular — only the very top of the big lobe */}
      <g fill={WHITE}>
        <ellipse cx="148" cy="76" rx="36" ry="20" />
        <ellipse cx="194" cy="68" rx="22" ry="14" />
      </g>
    </svg>
  );
}

/** HOOK — comma shape, heavy left + tapering right tail, 360×150 base (~2.4:1). */
function CloudHook({ size = 360 }: CloudProps): ReactElement {
  return (
    <svg viewBox="0 0 380 160" width={size} height={size * 0.421} aria-hidden="true">
      {/* Shadow — heavy head on the left, tapering tail to the right */}
      <g fill={SHADOW}>
        <ellipse cx="80"  cy="112" rx="58" ry="34" />
        <ellipse cx="148" cy="108" rx="44" ry="30" />
        <ellipse cx="208" cy="112" rx="32" ry="22" />
        <ellipse cx="262" cy="116" rx="22" ry="16" />
        <ellipse cx="306" cy="120" rx="16" ry="11" />
        <ellipse cx="344" cy="122" rx="10" ry="7" />
        <ellipse cx="180" cy="130" rx="160" ry="10" />
      </g>
      {/* Mid */}
      <g fill={MID}>
        <circle cx="78"  cy="82"  r="44" />
        <circle cx="138" cy="78"  r="36" />
        <circle cx="196" cy="86"  r="26" />
        <circle cx="248" cy="98"  r="18" />
        <circle cx="294" cy="108" r="12" />
      </g>
      {/* Highlight */}
      <g fill={LIGHT}>
        <circle cx="78"  cy="62" r="32" />
        <circle cx="134" cy="58" r="28" />
        <circle cx="190" cy="72" r="20" />
        <circle cx="240" cy="88" r="13" />
      </g>
      {/* Specular */}
      <g fill={WHITE}>
        <ellipse cx="78" cy="50" rx="22" ry="14" />
        <ellipse cx="130" cy="48" rx="18" ry="12" />
      </g>
    </svg>
  );
}

/** PUFF — small round single bumpy puff, 140×100 base. */
function CloudPuff({ size = 140 }: CloudProps): ReactElement {
  return (
    <svg viewBox="0 0 160 110" width={size} height={size * 0.688} aria-hidden="true">
      <g fill={SHADOW}>
        <ellipse cx="48"  cy="78" rx="34" ry="20" />
        <ellipse cx="108" cy="78" rx="32" ry="20" />
        <ellipse cx="80"  cy="86" rx="68" ry="10" />
      </g>
      <g fill={MID}>
        <circle cx="52"  cy="64" r="26" />
        <circle cx="104" cy="60" r="30" />
      </g>
      <g fill={LIGHT}>
        <circle cx="56" cy="52" r="18" />
        <circle cx="100" cy="46" r="22" />
      </g>
      <g fill={WHITE}>
        <ellipse cx="98" cy="40" rx="14" ry="9" />
      </g>
    </svg>
  );
}

/** WISP — long thin atmospheric streak, 540×100 base (~5.4:1). Lighter palette. */
function CloudWisp({ size = 540 }: CloudProps): ReactElement {
  // Distant wisps use a slightly muted variant of the palette to read as
  // "atmospheric" — lower contrast between shadow and highlight.
  const wShadow = "#7a92ad";
  const wMid    = "#b1c3d8";
  return (
    <svg viewBox="0 0 580 110" width={size} height={size * 0.19} aria-hidden="true">
      {/* Long elongated lobes in a stretched horizontal arc */}
      <g fill={wShadow} opacity="0.85">
        <ellipse cx="80"  cy="74" rx="56" ry="14" />
        <ellipse cx="190" cy="70" rx="70" ry="16" />
        <ellipse cx="310" cy="72" rx="64" ry="14" />
        <ellipse cx="430" cy="74" rx="60" ry="14" />
        <ellipse cx="530" cy="78" rx="44" ry="10" />
        <ellipse cx="290" cy="84" rx="270" ry="6" />
      </g>
      <g fill={wMid}>
        <ellipse cx="84"  cy="60" rx="42" ry="10" />
        <ellipse cx="192" cy="56" rx="56" ry="13" />
        <ellipse cx="308" cy="58" rx="50" ry="11" />
        <ellipse cx="424" cy="60" rx="48" ry="10" />
        <ellipse cx="522" cy="64" rx="34" ry="8" />
      </g>
      <g fill={LIGHT}>
        <ellipse cx="86"  cy="50" rx="32" ry="7" />
        <ellipse cx="194" cy="44" rx="42" ry="9" />
        <ellipse cx="306" cy="46" rx="38" ry="8" />
        <ellipse cx="422" cy="50" rx="36" ry="7" />
      </g>
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// CLOUD ROSTER — 9 instances with deliberate size, shape, depth variety.
// `startX` is the cloud's initial vw position. When in [0..100] the cloud is
// already visible on first render — no waiting for the screen to populate.
// ────────────────────────────────────────────────────────────────────────────

interface CloudConfig {
  id: string;
  Component: (p: CloudProps) => ReactElement;
  /** Pixel size (passed straight to the SVG component). */
  size: number;
  /** Vertical position in vh. */
  y: number;
  /** Initial horizontal position in vw. Range -25..125 (off-screen left to
      off-screen right). Values in [0..100] are visible at page-load. */
  startX: number;
  /** Seconds for a full 150vw traversal (entire -25 → 125 trip). */
  duration: number;
  opacity: number;
}

const CLOUDS: CloudConfig[] = [
  // Foreground focal layer — hero cloud, mid-screen at start
  { id: "hero",   Component: CloudHero,       size: 480, y: 30, startX: 32,  duration: 140, opacity: 1.00 },
  // Long flat stratus deck — right of centre, taking up the right third
  { id: "strat",  Component: CloudWideStrat,  size: 620, y: 16, startX: 65,  duration: 175, opacity: 0.95 },
  // Tall tower — visible on the left, dramatic vertical accent
  { id: "tower",  Component: CloudTower,      size: 230, y: 48, startX: 8,   duration: 135, opacity: 0.96 },
  // Clumpy asymmetric — right side, lower band
  { id: "clumpy", Component: CloudClumpy,     size: 380, y: 56, startX: 80,  duration: 145, opacity: 0.94 },
  // Hook — just entering from the left, will sweep across
  { id: "hook",   Component: CloudHook,       size: 320, y: 24, startX: -18, duration: 130, opacity: 0.92 },
  // Small puffs — high and low, each visible at start
  { id: "puff1",  Component: CloudPuff,       size: 130, y: 68, startX: 22,  duration: 120, opacity: 0.86 },
  { id: "puff2",  Component: CloudPuff,       size: 95,  y: 9,  startX: 88,  duration: 170, opacity: 0.72 },
  // Wispy streaks — long thin atmospheric depth
  { id: "wisp1",  Component: CloudWisp,       size: 520, y: 76, startX: 45,  duration: 170, opacity: 0.72 },
  { id: "wisp2",  Component: CloudWisp,       size: 360, y: 40, startX: -22, duration: 155, opacity: 0.62 },
];

// ────────────────────────────────────────────────────────────────────────────
// COMPONENT
//
// The animation uses a 4-keyframe trick to support arbitrary startX:
//   x = [startX, 125, -25, startX]   (positions in vw)
//   times = [0, tSplit, tSplit + ε, 1]
// At t=tSplit the cloud has reached the right edge (125vw); at t=tSplit+ε
// it has "teleported" back to the left edge (-25vw); for the rest of the
// loop it drifts back to startX. The two middle keyframes share the same
// time (offset by ε so Framer doesn't dedupe) — Framer can't really jump
// instantaneously but ε of 0.0001 is below the perceptible threshold.
// ────────────────────────────────────────────────────────────────────────────

const REENTRY_X = -25;
const EXIT_X = 125;
const TOTAL_DIST = EXIT_X - REENTRY_X; // 150vw

export function DawnCloudsWallpaper() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="dawn-wallpaper" aria-hidden="true">
      {CLOUDS.map((c) => {
        // What fraction of the total loop time is the "exit right" phase?
        const phase1 = EXIT_X - c.startX;
        const tSplit = Math.max(0.0001, Math.min(0.9998, phase1 / TOTAL_DIST));
        return (
          <motion.div
            key={c.id}
            className="dawn-cloud"
            style={{ top: `${c.y}vh`, opacity: c.opacity }}
            initial={{ x: `${c.startX}vw` }}
            animate={
              reduceMotion
                ? { x: `${c.startX}vw` }
                : {
                    x: [
                      `${c.startX}vw`,
                      `${EXIT_X}vw`,
                      `${REENTRY_X}vw`,
                      `${c.startX}vw`,
                    ],
                  }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    x: {
                      duration: c.duration,
                      repeat: Infinity,
                      ease: "linear",
                      // Two middle keyframes share (essentially) the same
                      // time so Framer reads it as a teleport.
                      times: [0, tSplit, tSplit + 0.0001, 1],
                    },
                  }
            }
          >
            <c.Component size={c.size} />
          </motion.div>
        );
      })}
    </div>
  );
}
