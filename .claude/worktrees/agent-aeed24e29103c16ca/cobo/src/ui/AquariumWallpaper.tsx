import { useEffect, useLayoutEffect, useRef, type ReactElement } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Live aquarium wallpaper for the Aquarium table theme.
 *
 * v2.18 — diverse creature roster
 * ===============================
 *
 * The simulation engine is unchanged from v2.17: each creature has its own
 * (pos, heading, facing) state, the requestAnimationFrame tick advances
 * physics with steering forces (patrol whim + edge repulsion + creature-
 * to-creature repulsion), position is ALWAYS updated forward along the
 * current heading (no backwards-motion code path), and `facing` is derived
 * from cos(heading) with a ±0.15 dead zone. The transform is applied
 * imperatively (`scaleX(-facing)`) so the SVG art (drawn facing LEFT by
 * convention) reads as facing the direction of travel.
 *
 * What's new in v2.18:
 *   • The previous 6 fish (ClownFish, BlueTang, YellowTang, Angelfish,
 *     NeonTetra, Gourami) are gone. They all looked like the same flat
 *     fish painted different colours.
 *   • 12 visually distinct sea creatures replace them — sized by real-world
 *     scale (Dolphin biggest, Shrimp smallest), with bespoke SVG silhouettes
 *     so each is recognisable at a glance.
 *   • Each creature carries its own Y-band (`yMin`, `yMax`) so surface
 *     dwellers (dolphin, seal) stay near the top of the tank, mid-water
 *     creatures (octopus, manta) hover at depth, and bottom-dwellers
 *     (crab, shrimp) patrol the sand. The edge-repulsion + hard-clamp
 *     blocks now read these per-creature bounds instead of the old global
 *     Y_MIN / Y_MAX.
 *
 * Decor (kelp, tunicates, oysters, coral, sand bed, light shafts, bubbles,
 * starfish) is unchanged from v2.17.
 *
 * Layering inside `.aquarium-wallpaper`:
 *   0 sand + light shafts → 1 creatures → 2 bubbles → 3 coral/kelp → 4 oyster/tunicate → 5 starfish
 *
 * Naming note: the simulation code (variables `fish`, `fishElsRef`,
 * `fishRepelX/Y`, the `.aquarium-fish` CSS class) keeps its v2.17 names
 * to minimise diff churn. Within the simulation a "fish" is shorthand for
 * any swimming creature.
 */

// ────────────────────────────────────────────────────────────────────────────
// CREATURE SVGs — each drawn FACING LEFT by convention (head/eye at small x,
// tail/back at large x). The simulation applies `scaleX(-facing)` so they
// flip to face right when moving right, matching their direction of travel.
// ────────────────────────────────────────────────────────────────────────────

interface CreatureProps { size?: number }

/** Dolphin — long sleek grey body, sickle dorsal fin, pointed rostrum. */
function Dolphin({ size = 160 }: CreatureProps): ReactElement {
  return (
    <svg viewBox="0 0 220 110" width={size} height={size * 0.5} aria-hidden="true">
      <defs>
        <linearGradient id="dolphinBelly" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#7a93a8" />
          <stop offset="60%" stopColor="#5d7689" />
          <stop offset="100%" stopColor="#3b5163" />
        </linearGradient>
        <linearGradient id="dolphinBack" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#3b5163" />
          <stop offset="50%" stopColor="#5d7689" />
          <stop offset="100%" stopColor="#9bb1c4" />
        </linearGradient>
      </defs>
      {/* Belly (lighter underside) */}
      <path d="M 24 64 Q 60 84 130 78 Q 180 70 198 64 Q 160 92 60 88 Z" fill="#dfe9f1" />
      {/* Main body */}
      <path
        d="M 14 52 Q 50 18 130 24 Q 180 30 198 50 Q 208 56 210 60 L 200 62 Q 160 56 130 60 Q 60 66 24 64 Q 8 60 14 52 Z"
        fill="url(#dolphinBack)"
      />
      {/* Pointed rostrum at the left (head) */}
      <path d="M 14 52 L 0 56 L 8 60 L 14 52 Z" fill="#5d7689" />
      {/* Dorsal fin */}
      <path d="M 92 28 Q 100 4 124 26 Q 110 28 92 28 Z" fill="url(#dolphinBack)" />
      {/* Pectoral fin */}
      <path d="M 76 60 Q 80 84 102 76 Q 94 68 80 62 Z" fill="url(#dolphinBelly)" />
      {/* Tail flukes */}
      <path d="M 200 50 Q 220 38 220 56 L 218 60 Q 220 76 200 62 Z" fill="url(#dolphinBack)" />
      {/* Eye */}
      <circle cx="22" cy="50" r="2.5" fill="#1c1d2b" />
      <circle cx="21" cy="49" r="0.9" fill="#fff" />
      {/* Mouth crease */}
      <path d="M 4 58 Q 12 60 22 58" stroke="#3b5163" strokeWidth="1" fill="none" />
    </svg>
  );
}

/** Manta Ray — flat diamond body, curled cephalic horns, long tail. */
function MantaRay({ size = 150 }: CreatureProps): ReactElement {
  return (
    <svg viewBox="0 0 220 110" width={size} height={size * 0.5} aria-hidden="true">
      <defs>
        <linearGradient id="mantaTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#222a36" />
          <stop offset="60%" stopColor="#3a4756" />
          <stop offset="100%" stopColor="#54657a" />
        </linearGradient>
      </defs>
      {/* Wing tips trailing back from a centre body */}
      <path
        d="M 20 56 Q 60 18 110 36 Q 160 22 200 56 Q 160 78 110 72 Q 60 80 20 56 Z"
        fill="url(#mantaTop)"
      />
      {/* Lighter underside hint along the bottom edge */}
      <path d="M 30 60 Q 110 80 190 60 Q 110 76 30 60 Z" fill="#aab9c8" opacity="0.55" />
      {/* Cephalic horns curling forward from the head (left side) */}
      <path d="M 24 56 Q 14 44 8 50 Q 12 56 22 60" stroke="#222a36" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M 26 60 Q 16 70 10 62 Q 14 60 24 60" stroke="#222a36" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* Long whip tail */}
      <path d="M 200 56 Q 218 56 214 50" stroke="#222a36" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M 200 60 Q 218 64 210 70" stroke="#222a36" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {/* Eye */}
      <circle cx="32" cy="52" r="2.2" fill="#0e1218" />
      {/* Wing patterning — subtle spots */}
      <circle cx="80" cy="44" r="2" fill="#0e1218" opacity="0.5" />
      <circle cx="130" cy="50" r="2.4" fill="#0e1218" opacity="0.5" />
      <circle cx="160" cy="58" r="2" fill="#0e1218" opacity="0.5" />
    </svg>
  );
}

/** Seal — torpedo body, rounded head, big dark eye, two front flippers. */
function Seal({ size = 130 }: CreatureProps): ReactElement {
  return (
    <svg viewBox="0 0 200 100" width={size} height={size * 0.5} aria-hidden="true">
      <defs>
        <linearGradient id="sealBack" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#5b6678" />
          <stop offset="60%" stopColor="#7d8a9d" />
          <stop offset="100%" stopColor="#a8b3c2" />
        </linearGradient>
      </defs>
      {/* Belly underside */}
      <path d="M 30 70 Q 90 90 160 78 Q 170 74 170 64 Q 100 80 30 70 Z" fill="#d8dfe8" />
      {/* Main body */}
      <path
        d="M 20 50 Q 28 24 60 26 Q 100 28 150 42 Q 175 50 180 60 Q 175 78 150 78 Q 100 84 60 74 Q 28 70 20 50 Z"
        fill="url(#sealBack)"
      />
      {/* Rounded head (left) */}
      <path d="M 18 44 Q 8 36 12 50 Q 8 64 22 56 Z" fill="url(#sealBack)" />
      {/* Tail fluke */}
      <path d="M 178 56 Q 196 50 196 64 Q 196 76 180 70 Z" fill="url(#sealBack)" />
      {/* Front flipper */}
      <path d="M 78 70 Q 80 90 110 84 Q 100 72 82 68 Z" fill="#5b6678" />
      {/* Eye */}
      <circle cx="22" cy="46" r="3.5" fill="#0e1218" />
      <circle cx="20.6" cy="44.6" r="1.2" fill="#fff" />
      {/* Whiskers */}
      <path d="M 14 54 L 4 56" stroke="#3a414c" strokeWidth="0.7" />
      <path d="M 14 56 L 4 60" stroke="#3a414c" strokeWidth="0.7" />
      {/* Mouth */}
      <path d="M 12 56 Q 16 60 22 58" stroke="#3a414c" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

/** Octopus — round mantle, big round eye, 8 curling tentacles. */
function Octopus({ size = 115 }: CreatureProps): ReactElement {
  return (
    <svg viewBox="0 0 180 130" width={size} height={size * 0.72} aria-hidden="true">
      <defs>
        <radialGradient id="octMantle" cx="35%" cy="30%" r="65%">
          <stop offset="0%"  stopColor="#f08aa5" />
          <stop offset="70%" stopColor="#c44a78" />
          <stop offset="100%" stopColor="#7a1f4a" />
        </radialGradient>
      </defs>
      {/* Mantle (bulbous head) */}
      <ellipse cx="64" cy="48" rx="50" ry="38" fill="url(#octMantle)" />
      {/* 8 tentacles curling back toward the right (trailing) */}
      <g stroke="#c44a78" strokeWidth="6" fill="none" strokeLinecap="round">
        <path d="M 60 84  Q 100 96  140 86" />
        <path d="M 70 90  Q 110 110 150 96" />
        <path d="M 80 92  Q 120 116 160 108" />
        <path d="M 92 92  Q 130 118 170 118" />
        <path d="M 50 88  Q 80 108  120 110" />
        <path d="M 40 84  Q 60 104  98 116" />
        <path d="M 30 76  Q 40 102  76 122" />
        <path d="M 24 64  Q 20 100  56 124" />
      </g>
      {/* Suction cup dots */}
      <g fill="#f7b3c8">
        <circle cx="100" cy="92" r="1.6" />
        <circle cx="120" cy="100" r="1.6" />
        <circle cx="140" cy="98" r="1.6" />
        <circle cx="90"  cy="104" r="1.6" />
        <circle cx="110" cy="112" r="1.6" />
        <circle cx="60"  cy="106" r="1.6" />
      </g>
      {/* Eye */}
      <circle cx="32" cy="40" r="7" fill="#fff8ee" />
      <circle cx="30" cy="40" r="4" fill="#1c1d2b" />
      <circle cx="29" cy="39" r="1.4" fill="#fff" />
      {/* Mantle highlight */}
      <ellipse cx="50" cy="30" rx="20" ry="8" fill="#fff4f8" opacity="0.45" />
    </svg>
  );
}

/** Sea Turtle — oval shell with hexagonal scutes, paddle flippers, small head. */
function SeaTurtle({ size = 105 }: CreatureProps): ReactElement {
  return (
    <svg viewBox="0 0 160 110" width={size} height={size * 0.69} aria-hidden="true">
      <defs>
        <linearGradient id="turtleShell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#4a8a3a" />
          <stop offset="60%" stopColor="#356428" />
          <stop offset="100%" stopColor="#1f3e16" />
        </linearGradient>
      </defs>
      {/* Shell — oval dome */}
      <ellipse cx="80" cy="58" rx="56" ry="34" fill="url(#turtleShell)" stroke="#1a3010" strokeWidth="1.6" />
      {/* Scutes (hexagonal pattern) */}
      <g stroke="#1a3010" strokeWidth="1.2" fill="#3e7430">
        <polygon points="80,40 92,46 92,58 80,64 68,58 68,46" />
        <polygon points="56,46 66,50 66,58 56,62 46,58 46,50" />
        <polygon points="104,46 114,50 114,58 104,62 94,58 94,50" />
        <polygon points="80,68 92,72 92,80 80,84 68,80 68,72" opacity="0.85" />
        <polygon points="58,68 66,72 66,78 58,82 50,78 50,72" opacity="0.85" />
        <polygon points="102,68 110,72 110,78 102,82 94,78 94,72" opacity="0.85" />
      </g>
      {/* Head poking out the left */}
      <ellipse cx="22" cy="58" rx="14" ry="11" fill="#4a8a3a" stroke="#1a3010" strokeWidth="1.4" />
      <circle cx="16" cy="55" r="2" fill="#1c1d2b" />
      <circle cx="15.4" cy="54.4" r="0.6" fill="#fff" />
      {/* Front-left paddle flipper */}
      <path d="M 36 40 Q 22 22 12 32 Q 22 46 38 46 Z" fill="#3e7430" stroke="#1a3010" strokeWidth="1.2" />
      {/* Back-left paddle flipper */}
      <path d="M 40 84 Q 28 100 14 90 Q 28 78 42 76 Z" fill="#3e7430" stroke="#1a3010" strokeWidth="1.2" />
      {/* Front-right paddle flipper */}
      <path d="M 124 40 Q 138 22 148 32 Q 138 46 122 46 Z" fill="#3e7430" stroke="#1a3010" strokeWidth="1.2" />
      {/* Back-right paddle flipper */}
      <path d="M 120 84 Q 132 100 146 90 Q 132 78 118 76 Z" fill="#3e7430" stroke="#1a3010" strokeWidth="1.2" />
      {/* Tail */}
      <path d="M 136 60 L 148 62 L 138 66 Z" fill="#3e7430" stroke="#1a3010" strokeWidth="1" />
    </svg>
  );
}

/** Pufferfish — round spiny body, tiny tail, surprised eye. */
function Pufferfish({ size = 65 }: CreatureProps): ReactElement {
  return (
    <svg viewBox="0 0 110 90" width={size} height={size * 0.82} aria-hidden="true">
      <defs>
        <radialGradient id="puffBody" cx="35%" cy="30%" r="70%">
          <stop offset="0%"  stopColor="#f4d57a" />
          <stop offset="60%" stopColor="#d49a32" />
          <stop offset="100%" stopColor="#8a5e14" />
        </radialGradient>
      </defs>
      {/* Round inflated body */}
      <circle cx="48" cy="46" r="32" fill="url(#puffBody)" stroke="#5a3e10" strokeWidth="1.4" />
      {/* Belly pale */}
      <ellipse cx="48" cy="60" rx="22" ry="10" fill="#fff8d8" opacity="0.55" />
      {/* Spikes — short triangles radiating outward */}
      <g fill="#d49a32" stroke="#5a3e10" strokeWidth="0.8">
        <polygon points="48,8 50,16 46,16" />
        <polygon points="20,18 28,22 22,26" />
        <polygon points="14,42 22,46 14,50" />
        <polygon points="22,72 28,68 28,76" />
        <polygon points="48,84 46,76 50,76" />
        <polygon points="74,72 80,76 80,68" />
        <polygon points="76,18 70,22 76,26" />
      </g>
      {/* Tail fin (small) */}
      <path d="M 78 46 L 96 36 L 92 46 L 96 56 Z" fill="#d49a32" stroke="#5a3e10" strokeWidth="1.2" />
      {/* Big surprised eye */}
      <circle cx="30" cy="38" r="6" fill="#fff" />
      <circle cx="28" cy="38" r="3.5" fill="#1c1d2b" />
      <circle cx="27" cy="37" r="1.2" fill="#fff" />
      {/* Tiny mouth */}
      <circle cx="14" cy="48" r="1.6" fill="#5a3e10" />
    </svg>
  );
}

/** Clownfish — iconic orange + white + black-trim aquarium fish. */
function Clownfish({ size = 55 }: CreatureProps): ReactElement {
  return (
    <svg viewBox="0 0 100 60" width={size} height={size * 0.6} aria-hidden="true">
      <ellipse cx="48" cy="30" rx="34" ry="18" fill="#ff7a2e" />
      <path d="M 26 16 Q 22 30 28 46 L 36 44 Q 32 30 36 18 Z" fill="#fff8ee" />
      <path d="M 56 16 Q 50 30 58 46 L 66 44 Q 62 30 66 18 Z" fill="#fff8ee" />
      <path d="M 82 30 L 100 16 L 96 30 L 100 44 Z" fill="#ff7a2e" />
      <path d="M 42 14 Q 50 4 60 14 Z" fill="#e85f1e" />
      <circle cx="22" cy="26" r="4" fill="#1c1d2b" />
      <circle cx="20.5" cy="24.5" r="1.4" fill="#fff" />
      <ellipse cx="48" cy="30" rx="34" ry="18" fill="none" stroke="#1c1d2b" strokeWidth="1.6" />
      {/* Black trim along the white stripes for that crisp clownfish look */}
      <path d="M 26 16 Q 22 30 28 46" stroke="#1c1d2b" strokeWidth="1.4" fill="none" />
      <path d="M 36 18 Q 32 30 36 44" stroke="#1c1d2b" strokeWidth="1.4" fill="none" />
      <path d="M 56 16 Q 50 30 58 46" stroke="#1c1d2b" strokeWidth="1.4" fill="none" />
      <path d="M 66 18 Q 62 30 66 44" stroke="#1c1d2b" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

/** Nautilus — spiral chambered shell with small tentacle tufts. */
function Nautilus({ size = 55 }: CreatureProps): ReactElement {
  return (
    <svg viewBox="0 0 100 90" width={size} height={size * 0.9} aria-hidden="true">
      <defs>
        <linearGradient id="nautilusShell" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stopColor="#f5e6c8" />
          <stop offset="100%" stopColor="#d2b682" />
        </linearGradient>
      </defs>
      {/* Outer shell — spiral */}
      <path
        d="M 50 14 Q 88 14 88 50 Q 88 86 50 86 Q 12 86 12 50 Q 12 22 38 18 Q 56 16 64 30 Q 70 42 60 50 Q 50 56 44 50 Q 40 46 44 42"
        fill="url(#nautilusShell)"
        stroke="#7a5c28"
        strokeWidth="1.6"
      />
      {/* Chamber separator lines */}
      <g stroke="#a8853c" strokeWidth="1.2" fill="none">
        <path d="M 50 14 Q 60 30 50 50" />
        <path d="M 88 50 Q 70 50 60 50" />
        <path d="M 50 86 Q 50 64 50 50" />
        <path d="M 12 50 Q 30 50 44 50" />
        <path d="M 22 22 Q 36 32 44 42" />
        <path d="M 78 22 Q 64 32 56 42" />
      </g>
      {/* Tentacle tufts emerging from the opening at the bottom-left */}
      <g stroke="#a8853c" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d="M 16 64 Q 6 70 4 76" />
        <path d="M 20 70 Q 8 76 4 84" />
        <path d="M 24 74 Q 14 84 12 88" />
        <path d="M 28 78 Q 22 86 22 90" />
      </g>
      {/* Eye in the head area */}
      <circle cx="22" cy="58" r="2.4" fill="#1c1d2b" />
      <circle cx="21" cy="57" r="0.8" fill="#fff" />
    </svg>
  );
}

/** Jellyfish — translucent bell + wavy trailing tentacles. */
function Jellyfish({ size = 60 }: CreatureProps): ReactElement {
  return (
    <svg viewBox="0 0 100 130" width={size} height={size * 1.3} aria-hidden="true">
      <defs>
        <radialGradient id="jellyBell" cx="50%" cy="40%" r="60%">
          <stop offset="0%"  stopColor="#fff" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#c6b7f0" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#7a64bf" stopOpacity="0.4" />
        </radialGradient>
      </defs>
      {/* Translucent bell (dome) */}
      <path
        d="M 10 60 Q 14 14 50 14 Q 86 14 90 60 Q 86 72 50 70 Q 14 72 10 60 Z"
        fill="url(#jellyBell)"
        stroke="#a392d8"
        strokeWidth="1.2"
      />
      {/* Inner organ hint */}
      <ellipse cx="50" cy="56" rx="14" ry="6" fill="#c6b7f0" opacity="0.4" />
      <ellipse cx="38" cy="50" rx="4" ry="3" fill="#fff" opacity="0.45" />
      <ellipse cx="60" cy="48" rx="3" ry="2.4" fill="#fff" opacity="0.45" />
      {/* Wavy trailing tentacles */}
      <g stroke="#a392d8" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.85">
        <path d="M 22 66 Q 16 80 24 96 Q 18 110 26 124" />
        <path d="M 36 70 Q 30 88 38 102 Q 32 116 40 128" />
        <path d="M 50 72 Q 46 88 52 104 Q 46 118 54 130" />
        <path d="M 62 70 Q 68 86 60 102 Q 66 116 58 128" />
        <path d="M 78 66 Q 84 82 76 96 Q 82 110 74 124" />
      </g>
      {/* Frilled bell underside */}
      <path d="M 14 64 Q 30 76 50 70 Q 70 76 86 64" stroke="#a392d8" strokeWidth="1" fill="none" />
    </svg>
  );
}

/** Seahorse — curled prehensile tail, tubular snout, dorsal fin. */
function Seahorse({ size = 50 }: CreatureProps): ReactElement {
  return (
    <svg viewBox="0 0 80 120" width={size * 0.67} height={size * 1.0} aria-hidden="true">
      <defs>
        <linearGradient id="horseBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#ffc04a" />
          <stop offset="100%" stopColor="#c46a14" />
        </linearGradient>
      </defs>
      {/* Curved S-body with rounded segments */}
      <path
        d="M 36 14 Q 18 22 22 42 Q 28 56 46 60 Q 60 64 56 80 Q 50 96 32 100 Q 18 104 22 116 Q 30 120 40 116"
        stroke="url(#horseBody)"
        strokeWidth="14"
        fill="none"
        strokeLinecap="round"
      />
      {/* Head bulge with eye */}
      <ellipse cx="30" cy="18" rx="10" ry="8" fill="#ffc04a" stroke="#8a4a08" strokeWidth="1.2" />
      <circle cx="22" cy="16" r="2" fill="#1c1d2b" />
      <circle cx="21" cy="15.2" r="0.6" fill="#fff" />
      {/* Snout (tubular, pointing left) */}
      <path d="M 22 22 L 6 24 L 8 28 L 22 28 Z" fill="#ffc04a" stroke="#8a4a08" strokeWidth="1.2" />
      {/* Dorsal fin running down the back */}
      <path d="M 44 36 Q 56 42 50 60 Q 44 56 40 44 Z" fill="#fff0c4" stroke="#8a4a08" strokeWidth="1" />
      {/* Tail curl segments */}
      <g stroke="#8a4a08" strokeWidth="1" fill="none">
        <path d="M 30 104 Q 22 110 28 116" />
        <path d="M 30 100 Q 26 96 32 90" />
        <path d="M 36 84 Q 32 80 40 74" />
      </g>
      {/* Body segment lines */}
      <g stroke="#8a4a08" strokeWidth="0.8" fill="none" opacity="0.7">
        <path d="M 24 32 L 30 30" />
        <path d="M 22 44 L 32 44" />
        <path d="M 28 56 L 38 56" />
        <path d="M 46 68 L 56 70" />
        <path d="M 50 82 L 60 80" />
      </g>
    </svg>
  );
}

/** Crab — squat shell, two eyestalks, two big claws (left-pointing). */
function Crab({ size = 50 }: CreatureProps): ReactElement {
  return (
    <svg viewBox="0 0 110 80" width={size} height={size * 0.73} aria-hidden="true">
      <defs>
        <radialGradient id="crabShell" cx="35%" cy="30%" r="70%">
          <stop offset="0%"  stopColor="#ff6f4a" />
          <stop offset="70%" stopColor="#c2331a" />
          <stop offset="100%" stopColor="#7a1f0e" />
        </radialGradient>
      </defs>
      {/* Side legs (4 — 2 per side) */}
      <g stroke="#7a1f0e" strokeWidth="3.5" fill="none" strokeLinecap="round">
        <path d="M 38 54 Q 28 64 22 70" />
        <path d="M 44 58 Q 36 70 30 76" />
        <path d="M 72 54 Q 82 64 88 70" />
        <path d="M 66 58 Q 74 70 80 76" />
      </g>
      {/* Squat oval shell */}
      <ellipse cx="55" cy="44" rx="32" ry="20" fill="url(#crabShell)" stroke="#7a1f0e" strokeWidth="1.6" />
      {/* Shell highlights */}
      <path d="M 32 38 Q 55 50 78 38" stroke="#ff9b78" strokeWidth="1.4" fill="none" opacity="0.7" />
      {/* Left claw (head end) — large pincer */}
      <g stroke="#7a1f0e" strokeWidth="1.6">
        <path d="M 28 44 Q 16 38 6 30 Q 14 28 22 32 Q 16 36 20 42 Z" fill="#c2331a" />
        <path d="M 6 30 Q 12 34 18 36" stroke="#7a1f0e" strokeWidth="1.2" fill="none" />
      </g>
      {/* Right claw */}
      <g stroke="#7a1f0e" strokeWidth="1.6">
        <path d="M 82 44 Q 94 38 104 30 Q 96 28 88 32 Q 94 36 90 42 Z" fill="#c2331a" />
      </g>
      {/* Two eyestalks on top */}
      <line x1="46" y1="28" x2="42" y2="14" stroke="#7a1f0e" strokeWidth="2.2" />
      <circle cx="42" cy="12" r="3" fill="#fff" stroke="#7a1f0e" strokeWidth="1" />
      <circle cx="41" cy="11" r="1.4" fill="#1c1d2b" />
      <line x1="64" y1="28" x2="68" y2="14" stroke="#7a1f0e" strokeWidth="2.2" />
      <circle cx="68" cy="12" r="3" fill="#fff" stroke="#7a1f0e" strokeWidth="1" />
      <circle cx="69" cy="11" r="1.4" fill="#1c1d2b" />
    </svg>
  );
}

/** Shrimp — small segmented body, long antennae, fan tail. */
function Shrimp({ size = 38 }: CreatureProps): ReactElement {
  return (
    <svg viewBox="0 0 100 50" width={size} height={size * 0.5} aria-hidden="true">
      <defs>
        <linearGradient id="shrimpBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#ffb6a0" />
          <stop offset="60%" stopColor="#ec6e58" />
          <stop offset="100%" stopColor="#a83320" />
        </linearGradient>
      </defs>
      {/* Arched segmented body */}
      <path
        d="M 18 32 Q 8 22 18 14 Q 30 8 50 12 Q 72 16 84 24 Q 88 30 84 34 Q 70 32 52 32 Q 32 32 18 32 Z"
        fill="url(#shrimpBody)"
        stroke="#7a1f10" strokeWidth="1.2"
      />
      {/* Body segments */}
      <g stroke="#7a1f10" strokeWidth="0.8" fill="none" opacity="0.65">
        <path d="M 28 14 L 28 32" />
        <path d="M 40 12 L 40 32" />
        <path d="M 52 12 L 52 32" />
        <path d="M 64 16 L 64 32" />
        <path d="M 74 20 L 74 32" />
      </g>
      {/* Fan tail (right side) */}
      <path d="M 80 22 Q 96 18 96 26 Q 96 34 80 34 Z" fill="#ec6e58" stroke="#7a1f10" strokeWidth="1.2" />
      {/* Head (left side) with eye */}
      <ellipse cx="18" cy="22" rx="6" ry="8" fill="#ec6e58" stroke="#7a1f10" strokeWidth="1.2" />
      <circle cx="14" cy="20" r="1.8" fill="#1c1d2b" />
      {/* Two long antennae trailing from the head */}
      <path d="M 14 18 Q 4 8 -4 14" stroke="#a83320" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <path d="M 14 24 Q 4 30 -4 30" stroke="#a83320" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      {/* Tiny legs underneath */}
      <g stroke="#7a1f10" strokeWidth="1" fill="none">
        <path d="M 30 32 L 30 38" />
        <path d="M 40 32 L 40 40" />
        <path d="M 50 32 L 50 40" />
        <path d="M 60 32 L 60 38" />
      </g>
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// DECOR SVGs (unchanged from v2.17)
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
// CREATURE SIMULATION
// ────────────────────────────────────────────────────────────────────────────

interface CreatureDef {
  id: string;
  Component: (props: { size?: number }) => ReactElement;
  size: number;
  /** Starting position (vw, vh). Place inside the creature's yMin..yMax band. */
  startX: number;
  startY: number;
  /** Initial heading in radians (0 = facing right, π = facing left). */
  startHeading: number;
  /** Cruise speed in vw/sec. */
  baseSpeed: number;
  /** Max turning rate in rad/sec. Big creatures turn slowly. */
  turnRate: number;
  opacity: number;
  /** Vertical band the creature is allowed in (vh). Surface dwellers get a
      low yMin; bottom-dwellers get a high yMin. */
  yMin: number;
  yMax: number;
}

interface CreatureState {
  pos: { x: number; y: number };
  heading: number;
  /** Last committed left/right facing (only flips when heading clearly horizontal). */
  facing: 1 | -1;
  /** Where the creature is currently choosing to swim toward. */
  patrolHeading: number;
  /** Seconds until next patrol decision. */
  patrolTimer: number;
}

// 12 creatures, sized by real-world scale, distributed across vertical bands
// so big surface dwellers stay near the top and bottom-feeders stay near the
// sand. Starting positions placed inside each creature's allowed yMin..yMax
// slot so they don't immediately fight edge repulsion.
const CREATURE_DEFS: CreatureDef[] = [
  // Surface band (yMin 14–30): biggest, fastest
  { id: "dolphin", Component: Dolphin,   size: 160, startX: 16, startY: 22, startHeading: 0,             baseSpeed: 5.5, turnRate: 0.55, opacity: 0.72, yMin: 14, yMax: 50 },
  { id: "seal",    Component: Seal,      size: 130, startX: 80, startY: 28, startHeading: Math.PI,       baseSpeed: 4.0, turnRate: 0.65, opacity: 0.72, yMin: 18, yMax: 55 },
  // Mid-water band (yMin 25–45): medium glide / drift
  { id: "manta",   Component: MantaRay,  size: 150, startX: 36, startY: 46, startHeading: 0.2,           baseSpeed: 2.8, turnRate: 0.40, opacity: 0.72, yMin: 30, yMax: 70 },
  { id: "turtle",  Component: SeaTurtle, size: 105, startX: 68, startY: 42, startHeading: Math.PI + 0.1, baseSpeed: 2.2, turnRate: 0.45, opacity: 0.72, yMin: 25, yMax: 70 },
  // Mid-depth band
  { id: "octopus", Component: Octopus,   size: 115, startX: 24, startY: 58, startHeading: 0.1,           baseSpeed: 1.8, turnRate: 0.50, opacity: 0.72, yMin: 35, yMax: 75 },
  { id: "puffer",  Component: Pufferfish,size: 65,  startX: 52, startY: 38, startHeading: 0.3,           baseSpeed: 2.5, turnRate: 0.85, opacity: 0.75, yMin: 30, yMax: 70 },
  { id: "clown",   Component: Clownfish, size: 55,  startX: 88, startY: 48, startHeading: Math.PI,       baseSpeed: 3.4, turnRate: 0.80, opacity: 0.75, yMin: 22, yMax: 65 },
  { id: "nautilus",Component: Nautilus,  size: 55,  startX: 44, startY: 64, startHeading: 0,             baseSpeed: 1.4, turnRate: 0.40, opacity: 0.78, yMin: 40, yMax: 75 },
  { id: "jelly",   Component: Jellyfish, size: 60,  startX: 12, startY: 38, startHeading: 0.05,          baseSpeed: 1.6, turnRate: 0.30, opacity: 0.78, yMin: 18, yMax: 70 },
  { id: "seahorse",Component: Seahorse,  size: 50,  startX: 76, startY: 60, startHeading: Math.PI + 0.1, baseSpeed: 1.8, turnRate: 0.65, opacity: 0.78, yMin: 35, yMax: 78 },
  // Sand band (yMin 70+): bottom-feeders
  { id: "crab",    Component: Crab,      size: 50,  startX: 32, startY: 76, startHeading: 0,             baseSpeed: 1.5, turnRate: 0.55, opacity: 0.78, yMin: 72, yMax: 82 },
  { id: "shrimp",  Component: Shrimp,    size: 38,  startX: 62, startY: 72, startHeading: Math.PI,       baseSpeed: 4.0, turnRate: 1.20, opacity: 0.78, yMin: 55, yMax: 80 },
];

// Horizontal viewport bounds (vw). Vertical bounds are now per-creature.
const X_MIN = -2;
const X_MAX = 102;
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
  // All creature SVGs are drawn facing LEFT (eye near x=0, tail at high x).
  // scaleX(-facing) flips them to face right when `facing = 1`, leaves them
  // unflipped (facing left) when `facing = -1`. CSS transform order is
  // right-to-left: rotate first, then scaleX, then translate.
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
  const statesRef = useRef<CreatureState[]>([]);

  // Lazily initialise simulation state once. Stored in a ref so the animation
  // frame loop can mutate it without triggering React re-renders.
  if (statesRef.current.length === 0) {
    statesRef.current = CREATURE_DEFS.map((def) => ({
      pos: { x: def.startX, y: def.startY },
      heading: def.startHeading,
      facing: Math.cos(def.startHeading) >= 0 ? 1 : -1,
      patrolHeading: def.startHeading,
      patrolTimer: 1 + Math.random() * 3,
    }));
  }

  // Set initial DOM transforms before paint so creatures don't flash at (0,0)
  // on the first frame.
  useLayoutEffect(() => {
    statesRef.current.forEach((fish, i) => {
      const el = fishElsRef.current[i];
      if (!el) return;
      // Tilt = vertical component of heading (positive → nose dips down).
      // No `facing` factor: the scaleX(-facing) in applyTransform already
      // handles mirroring.
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
      // Cap dt so a backgrounded tab doesn't catapult creatures across the
      // screen when it returns to the foreground.
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;

      const states = statesRef.current;
      const n = states.length;

      // Pass 1 — update each creature's physics.
      for (let i = 0; i < n; i++) {
        const fish = states[i];
        const def = CREATURE_DEFS[i];

        // Patrol whim: occasional small heading change, rare U-turn.
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

        // Edge repulsion using PER-CREATURE Y bounds so surface dwellers
        // (dolphin, seal) get pushed back up if they drift too deep, and
        // bottom-dwellers (crab, shrimp) get pushed back down if they rise
        // too high.
        let edgeRepelX = 0;
        let edgeRepelY = 0;
        if (fish.pos.x < X_MIN + EDGE_BUFFER) {
          edgeRepelX += (X_MIN + EDGE_BUFFER - fish.pos.x) / EDGE_BUFFER;
        }
        if (fish.pos.x > X_MAX - EDGE_BUFFER) {
          edgeRepelX -= (fish.pos.x - (X_MAX - EDGE_BUFFER)) / EDGE_BUFFER;
        }
        if (fish.pos.y < def.yMin + EDGE_BUFFER) {
          edgeRepelY += (def.yMin + EDGE_BUFFER - fish.pos.y) / EDGE_BUFFER;
        }
        if (fish.pos.y > def.yMax - EDGE_BUFFER) {
          edgeRepelY -= (fish.pos.y - (def.yMax - EDGE_BUFFER)) / EDGE_BUFFER;
        }

        // Creature-to-creature repulsion.
        let fishRepelX = 0;
        let fishRepelY = 0;
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const other = states[j];
          const odef = CREATURE_DEFS[j];
          const dx = fish.pos.x - other.pos.x;
          const dy = fish.pos.y - other.pos.y;
          const dist = Math.hypot(dx, dy);
          // Effective radius in vw-ish units, scaled to creature size.
          const radius = (def.size + odef.size) / 28;
          if (dist > 0.01 && dist < radius) {
            const force = (radius - dist) / radius;
            fishRepelX += (dx / dist) * force;
            fishRepelY += (dy / dist) * force;
          }
        }

        // Combine forces — fish repulsion strongest (collisions take priority).
        const totalX = patrolX * 1.0 + edgeRepelX * 4 + fishRepelX * 6;
        const totalY = patrolY * 1.0 + edgeRepelY * 4 + fishRepelY * 6;
        const desiredHeading = Math.atan2(totalY, totalX);

        // Turn smoothly toward desired heading, capped by turnRate.
        const diff = wrapAngle(desiredHeading - fish.heading);
        const maxTurn = def.turnRate * dt;
        fish.heading = wrapAngle(
          fish.heading + Math.sign(diff) * Math.min(Math.abs(diff), maxTurn),
        );

        // Slow down on sharp turns (mimics a real creature bracing into a curve).
        const speedScale = 1 - Math.min(0.4, (Math.abs(diff) / Math.PI) * 0.4);
        const moveDist = def.baseSpeed * dt * speedScale;

        // ALWAYS move FORWARD along current heading. No code path produces
        // backwards motion relative to the creature's facing.
        fish.pos.x += Math.cos(fish.heading) * moveDist;
        // Dampen vertical so creatures prefer horizontal motion (aquarium feel).
        fish.pos.y += Math.sin(fish.heading) * moveDist * 0.7;

        // Hard clamp (per-creature Y bounds) — rarely triggers thanks to repel.
        if (fish.pos.x < X_MIN) fish.pos.x = X_MIN;
        else if (fish.pos.x > X_MAX) fish.pos.x = X_MAX;
        if (fish.pos.y < def.yMin) fish.pos.y = def.yMin;
        else if (fish.pos.y > def.yMax) fish.pos.y = def.yMax;

        // Update facing only when heading is clearly horizontal.
        const cosH = Math.cos(fish.heading);
        if (cosH > 0.15) fish.facing = 1;
        else if (cosH < -0.15) fish.facing = -1;
      }

      // Pass 2 — flush physics into the DOM.
      for (let i = 0; i < n; i++) {
        const fish = states[i];
        const el = fishElsRef.current[i];
        if (!el) continue;
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

      {/* z=3 — coral */}
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

      {/* z=1 — autonomous creatures. Transform is applied imperatively by the
          simulation loop, NOT via React's style prop (so React re-renders
          don't reset positions). */}
      {CREATURE_DEFS.map((def, i) => (
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

      {/* z=2 — bubbles in front of the creatures */}
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
