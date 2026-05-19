import type { ReactElement } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Windmill wallpaper — painterly alpine valley scene.
 *
 * Visual layers (back → front):
 *   1. Sky gradient (from CSS `.table-bg[data-theme="windmill"]`)
 *   2. Soft sun glow in the upper-right
 *   3. Three layered mountain silhouettes (lightest far, darkest near)
 *   4. Distant forest belt
 *   5. Green grass valley with rolling hills
 *   6. River — flowing horizontally with animated CSS stripe pattern
 *   7. Windmill body + door + window (stone tower with cone roof)
 *   8. Rotating windmill rotor (4 sails, infinite linear rotation)
 *   9. A few small drifting clouds in the upper sky
 *
 * Motion is transform / background-position only (compositor-friendly).
 * `useReducedMotion` collapses every animation to a still tableau.
 */

// ────────────────────────────────────────────────────────────────────────────
// SVG building blocks
// ────────────────────────────────────────────────────────────────────────────

/** Three layered painterly mountain silhouettes. */
function Mountains(): ReactElement {
  return (
    <svg viewBox="0 0 1600 380" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="wm-mtn-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7e9bbb" />
          <stop offset="100%" stopColor="#5a7898" />
        </linearGradient>
        <linearGradient id="wm-mtn-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6a88a8" />
          <stop offset="100%" stopColor="#4a6a8a" />
        </linearGradient>
        <linearGradient id="wm-mtn-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5a7a8a" />
          <stop offset="100%" stopColor="#3a5a6a" />
        </linearGradient>
      </defs>
      {/* Back row */}
      <path
        d="M 0 380 L 0 220 Q 100 60 240 120 Q 400 40 540 150 Q 700 60 860 130 Q 1020 60 1180 140 Q 1340 50 1480 130 Q 1560 100 1600 130 L 1600 380 Z"
        fill="url(#wm-mtn-back)"
      />
      {/* Mid row */}
      <path
        d="M 0 380 L 0 280 Q 120 180 280 240 Q 440 160 600 250 Q 760 180 920 240 Q 1080 170 1240 250 Q 1400 180 1540 240 Q 1580 230 1600 240 L 1600 380 Z"
        fill="url(#wm-mtn-mid)"
      />
      {/* Snow tips on the highest peaks */}
      <path d="M 220 120 L 260 102 L 300 130 Z M 540 150 L 570 120 L 600 152 Z M 1180 140 L 1220 110 L 1260 142 Z" fill="#e8f0f6" opacity="0.85" />
      {/* Front row */}
      <path
        d="M 0 380 L 0 320 Q 160 260 320 310 Q 480 250 640 305 Q 800 250 960 305 Q 1120 250 1280 310 Q 1440 260 1600 310 L 1600 380 Z"
        fill="url(#wm-mtn-front)"
      />
    </svg>
  );
}

/** Distant forest belt — soft dark green silhouette. */
function ForestBelt(): ReactElement {
  return (
    <svg viewBox="0 0 1600 120" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="wm-forest" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a5a3a" />
          <stop offset="100%" stopColor="#1a4028" />
        </linearGradient>
      </defs>
      {/* Wavy tree-line silhouette */}
      <path
        d="M 0 120 L 0 60
           Q 30 30 60 50 Q 90 20 120 40 Q 160 10 200 38 Q 240 12 280 36 Q 320 8 360 32 Q 400 14 440 38 Q 480 8 520 32
           Q 560 14 600 36 Q 640 8 680 32 Q 720 16 760 38 Q 800 6 840 32 Q 880 14 920 36 Q 960 10 1000 34
           Q 1040 12 1080 36 Q 1120 8 1160 32 Q 1200 16 1240 36 Q 1280 8 1320 32 Q 1360 14 1400 38 Q 1440 10 1480 34
           Q 1520 12 1560 36 Q 1580 30 1600 40 L 1600 120 Z"
        fill="url(#wm-forest)"
      />
    </svg>
  );
}

/** Grass valley — rolling green hills with darker foreground. */
function GrassValley(): ReactElement {
  return (
    <svg viewBox="0 0 1600 360" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="wm-grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6a9a6a" />
          <stop offset="60%" stopColor="#5a8a3a" />
          <stop offset="100%" stopColor="#3a6a2a" />
        </linearGradient>
        <linearGradient id="wm-grass-fg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5a8a3a" />
          <stop offset="100%" stopColor="#2a4a1a" />
        </linearGradient>
      </defs>
      {/* Mid-ground hills */}
      <path
        d="M 0 360 L 0 110 Q 200 80 400 130 Q 600 60 800 120 Q 1000 50 1200 110 Q 1400 60 1600 110 L 1600 360 Z"
        fill="url(#wm-grass)"
      />
      {/* Foreground darker mound (where the windmill sits) */}
      <path
        d="M 0 360 L 0 240 Q 240 200 460 230 Q 700 180 940 230 Q 1180 200 1400 240 Q 1500 220 1600 250 L 1600 360 Z"
        fill="url(#wm-grass-fg)"
      />
      {/* Small grass tuft accents */}
      <g fill="#3a6a1a" opacity="0.55">
        <ellipse cx="200" cy="300" rx="22" ry="3" />
        <ellipse cx="380" cy="320" rx="26" ry="4" />
        <ellipse cx="640" cy="310" rx="20" ry="3" />
        <ellipse cx="780" cy="330" rx="28" ry="4" />
        <ellipse cx="1080" cy="300" rx="24" ry="3" />
        <ellipse cx="1320" cy="320" rx="22" ry="3" />
      </g>
    </svg>
  );
}

/** Stone windmill tower with peaked roof, door, and window. (Rotor is separate.) */
function MillTower(): ReactElement {
  return (
    <svg viewBox="0 0 220 360" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="wm-stone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d4c8b0" />
          <stop offset="60%" stopColor="#a89878" />
          <stop offset="100%" stopColor="#8a7a60" />
        </linearGradient>
        <linearGradient id="wm-stone-shadow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(0,0,0,0.32)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
        <linearGradient id="wm-roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a86a3a" />
          <stop offset="100%" stopColor="#6a3a1a" />
        </linearGradient>
      </defs>
      {/* Cylindrical body — slight taper toward the top, tile-stone fill */}
      <path
        d="M 36 320 L 50 100 L 170 100 L 184 320 Z"
        fill="url(#wm-stone)"
        stroke="#5a4a30"
        strokeWidth="2"
      />
      {/* Stone texture lines */}
      <g stroke="#7a6a4a" strokeWidth="1" opacity="0.65">
        <line x1="42" y1="140" x2="178" y2="140" />
        <line x1="44" y1="180" x2="176" y2="180" />
        <line x1="46" y1="220" x2="174" y2="220" />
        <line x1="48" y1="260" x2="172" y2="260" />
        <line x1="50" y1="300" x2="170" y2="300" />
      </g>
      {/* Right-side shadow band */}
      <path d="M 110 100 L 170 100 L 184 320 L 130 320 Z" fill="url(#wm-stone-shadow)" />
      {/* Roof — conical with dome shape */}
      <path
        d="M 40 100 Q 110 -20 180 100 Z"
        fill="url(#wm-roof)"
        stroke="#3a1a08"
        strokeWidth="2"
      />
      {/* Roof highlight */}
      <path d="M 60 90 Q 90 30 120 60" stroke="#d4986a" strokeWidth="2" fill="none" opacity="0.55" />
      {/* Hub / boss where the rotor attaches */}
      <circle cx="110" cy="100" r="10" fill="#3a1a08" />
      {/* Window — small arched window mid-tower */}
      <path d="M 96 170 L 96 200 Q 110 184 124 200 L 124 170 Z" fill="#2a3848" stroke="#5a4a30" strokeWidth="1.6" />
      <line x1="110" y1="172" x2="110" y2="200" stroke="#5a4a30" strokeWidth="1" />
      {/* Door — arched at the bottom */}
      <path d="M 86 320 L 86 270 Q 110 250 134 270 L 134 320 Z" fill="#3a1a08" stroke="#1a0a04" strokeWidth="1.6" />
      <circle cx="125" cy="295" r="2" fill="#d4c8b0" /> {/* doorknob */}
      {/* Foundation strip */}
      <rect x="32" y="316" width="156" height="12" fill="#6a5a40" stroke="#3a2a18" strokeWidth="1" />
    </svg>
  );
}

/** The 4-blade windmill rotor — drawn separately so it can rotate independently. */
function MillRotor(): ReactElement {
  return (
    <svg viewBox="-110 -110 220 220" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="wm-blade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0e8d0" />
          <stop offset="100%" stopColor="#a89878" />
        </linearGradient>
      </defs>
      {/* Four blades at 0°, 90°, 180°, 270° */}
      <g stroke="#5a4a30" strokeWidth="2">
        {/* Top blade */}
        <polygon points="-8,-12 8,-12 14,-100 -14,-100" fill="url(#wm-blade)" />
        <line x1="0" y1="-12" x2="0" y2="-100" />
        <line x1="-6" y1="-30" x2="-12" y2="-90" />
        <line x1="6"  y1="-30" x2="12"  y2="-90" />
        {/* Right blade */}
        <polygon points="12,-8 12,8 100,14 100,-14" fill="url(#wm-blade)" />
        <line x1="12"  y1="0" x2="100" y2="0" />
        <line x1="30" y1="-6" x2="90" y2="-12" />
        <line x1="30" y1="6"  x2="90" y2="12" />
        {/* Bottom blade */}
        <polygon points="-8,12 8,12 14,100 -14,100" fill="url(#wm-blade)" />
        <line x1="0" y1="12" x2="0" y2="100" />
        <line x1="-6" y1="30" x2="-12" y2="90" />
        <line x1="6"  y1="30" x2="12"  y2="90" />
        {/* Left blade */}
        <polygon points="-12,-8 -12,8 -100,14 -100,-14" fill="url(#wm-blade)" />
        <line x1="-12" y1="0" x2="-100" y2="0" />
        <line x1="-30" y1="-6" x2="-90" y2="-12" />
        <line x1="-30" y1="6"  x2="-90" y2="12" />
      </g>
      {/* Central hub */}
      <circle cx="0" cy="0" r="14" fill="#3a1a08" stroke="#0d0500" strokeWidth="2" />
      <circle cx="0" cy="0" r="6" fill="#a86a3a" />
    </svg>
  );
}

/** Small painterly cloud — reused for the 3 drifting clouds. */
function MiniCloud({ size = 120 }: { size?: number }): ReactElement {
  return (
    <svg viewBox="0 0 180 80" width={size} height={size * 0.44} aria-hidden="true">
      <defs>
        <radialGradient id="wm-cloud" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#f4f8fc" />
          <stop offset="100%" stopColor="#c0d4e4" />
        </radialGradient>
      </defs>
      <ellipse cx="90" cy="62" rx="80" ry="8" fill="#a8bccc" opacity="0.55" />
      <circle cx="40"  cy="46" r="22" fill="url(#wm-cloud)" />
      <circle cx="76"  cy="36" r="30" fill="url(#wm-cloud)" />
      <circle cx="120" cy="34" r="28" fill="url(#wm-cloud)" />
      <circle cx="156" cy="48" r="20" fill="url(#wm-cloud)" />
      <ellipse cx="82" cy="26" rx="20" ry="10" fill="#ffffff" />
      <ellipse cx="124" cy="22" rx="16" ry="8" fill="#ffffff" />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Cloud roster — only 3 clouds, slow drift
// ────────────────────────────────────────────────────────────────────────────

const CLOUDS = [
  { id: "c1", size: 180, top: "8%",  startX: 18, duration: 180, opacity: 0.92 },
  { id: "c2", size: 140, top: "16%", startX: 62, duration: 200, opacity: 0.86 },
  { id: "c3", size: 110, top: "5%",  startX: 84, duration: 220, opacity: 0.80 },
];
const REENTRY = -25;
const EXIT = 125;

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function WindmillWallpaper() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="windmill-wallpaper" aria-hidden="true">
      {/* Soft sun glow in the upper-right */}
      <div
        className="windmill-sun"
        style={{
          right: "8%",
          top: "6%",
          width: 220,
          height: 220,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255, 230, 170, 0.55) 0%, rgba(255, 200, 130, 0.25) 30%, transparent 65%)",
          filter: "blur(6px)",
        }}
      />

      {/* Distant mountains */}
      <div className="windmill-mountains" style={{ left: 0, right: 0, top: "22%", height: "26%" }}>
        <Mountains />
      </div>

      {/* Distant forest belt */}
      <div className="windmill-forest" style={{ left: 0, right: 0, top: "44%", height: "10%" }}>
        <ForestBelt />
      </div>

      {/* Grass valley */}
      <div className="windmill-grass" style={{ left: 0, right: 0, top: "54%", bottom: 0 }}>
        <GrassValley />
      </div>

      {/* River — flows across the lower mid band */}
      <div
        className="windmill-river"
        style={{
          left: "-2%",
          right: "-2%",
          top: "70%",
          height: "8%",
          borderRadius: "40% 40% 50% 50% / 60% 60% 40% 40%",
        }}
      />

      {/* Windmill tower (mounted on the foreground mound) */}
      <div
        className="windmill-mill"
        style={{ left: "48%", top: "44%", width: 220, height: 360, transform: "translateX(-50%)" }}
      >
        <MillTower />
      </div>

      {/* Rotor — positioned at the hub point of the tower */}
      <motion.div
        className="windmill-rotor"
        style={{
          left: "48%",
          top: "44%",
          width: 220,
          height: 220,
          // The tower's hub sits at viewBox (110, 100) of the 220×360 SVG,
          // which is 30.5% from the top. We translate so the rotor centre
          // overlaps the hub.
          transform: "translate(-50%, -25%)",
        }}
        animate={reduceMotion ? undefined : { rotate: [0, 360] }}
        transition={
          reduceMotion ? undefined : { duration: 10, repeat: Infinity, ease: "linear" }
        }
      >
        <MillRotor />
      </motion.div>

      {/* Drifting clouds — same 4-keyframe time-teleport trick as the
          retired Dawn Clouds so they appear ON the sky at first render,
          not waiting to drift in from -25vw. */}
      {CLOUDS.map((c) => {
        const phase1 = EXIT - c.startX;
        const tSplit = Math.max(0.0001, Math.min(0.9998, phase1 / (EXIT - REENTRY)));
        return (
          <motion.div
            key={c.id}
            className="windmill-cloud"
            style={{ top: c.top, opacity: c.opacity }}
            initial={{ x: `${c.startX}vw` }}
            animate={
              reduceMotion
                ? { x: `${c.startX}vw` }
                : { x: [`${c.startX}vw`, `${EXIT}vw`, `${REENTRY}vw`, `${c.startX}vw`] }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    x: {
                      duration: c.duration,
                      repeat: Infinity,
                      ease: "linear",
                      times: [0, tSplit, tSplit + 0.0001, 1],
                    },
                  }
            }
          >
            <MiniCloud size={c.size} />
          </motion.div>
        );
      })}
    </div>
  );
}
