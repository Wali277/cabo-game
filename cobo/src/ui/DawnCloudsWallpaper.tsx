import type { ReactElement } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Dawn Clouds wallpaper for the v2.18 table theme.
 *
 * Architecture parallels `NorthernLightsWallpaper` and `AquariumWallpaper`:
 * a single `.dawn-wallpaper` absolute layer hosting multiple `<motion.div>`
 * cloud instances that drift left → right across the viewport. Each cloud
 * picks one of four SVG silhouettes (small tuft, fluffy, wispy, towering)
 * so the scene doesn't look stamped from one shape.
 *
 * Motion is intentionally slow (90–140 second screen crossings) and steady
 * (linear easing — clouds shouldn't accelerate). Per-cloud `delay` offsets
 * stagger them so the screen is never empty and never simultaneously busy.
 *
 * `useReducedMotion()` collapses every `animate` prop to its initial value
 * so the scene becomes a still tableau when the user requests it.
 */

// ────────────────────────────────────────────────────────────────────────────
// CLOUD SVG VARIANTS — four distinct silhouettes so 10 clouds look varied
// rather than ten copies of the same shape. All use pure-white fills with a
// soft inner highlight + a faint pale-blue shadow band underneath so each
// cloud reads as solid + sunlit (not flat).
// ────────────────────────────────────────────────────────────────────────────

interface CloudProps { size?: number }

/** Small 3-blob tuft — ~80×40px at size=1. */
function CloudSmallTuft({ size = 80 }: CloudProps): ReactElement {
  return (
    <svg viewBox="0 0 120 60" width={size} height={size * 0.5} aria-hidden="true">
      <defs>
        <radialGradient id="tuftLite" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#f6f9ff" />
          <stop offset="100%" stopColor="#d8e6f3" />
        </radialGradient>
      </defs>
      {/* Faint pale-blue shadow band along the bottom edge */}
      <ellipse cx="60" cy="48" rx="48" ry="6" fill="#cbdcec" opacity="0.5" />
      {/* Three overlapping blobs */}
      <circle cx="32" cy="34" r="20" fill="url(#tuftLite)" />
      <circle cx="60" cy="26" r="24" fill="url(#tuftLite)" />
      <circle cx="92" cy="36" r="18" fill="url(#tuftLite)" />
    </svg>
  );
}

/** Wide multi-blob fluffy cumulus — ~160×70px at size=1. */
function CloudFluffy({ size = 160 }: CloudProps): ReactElement {
  return (
    <svg viewBox="0 0 240 110" width={size} height={size * 0.46} aria-hidden="true">
      <defs>
        <radialGradient id="fluffyLite" cx="32%" cy="28%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#f4f8ff" />
          <stop offset="100%" stopColor="#cfe0f1" />
        </radialGradient>
      </defs>
      <ellipse cx="120" cy="92" rx="100" ry="9" fill="#bdd0e3" opacity="0.55" />
      {/* Five overlapping blobs along a gentle arc */}
      <circle cx="50"  cy="64" r="30" fill="url(#fluffyLite)" />
      <circle cx="92"  cy="48" r="38" fill="url(#fluffyLite)" />
      <circle cx="140" cy="42" r="42" fill="url(#fluffyLite)" />
      <circle cx="186" cy="52" r="34" fill="url(#fluffyLite)" />
      <circle cx="218" cy="66" r="22" fill="url(#fluffyLite)" />
    </svg>
  );
}

/** Long horizontal smear — ~240×60px at size=1. */
function CloudWispy({ size = 240 }: CloudProps): ReactElement {
  return (
    <svg viewBox="0 0 320 80" width={size} height={size * 0.25} aria-hidden="true">
      <defs>
        <radialGradient id="wispyLite" cx="40%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#f7faff" />
          <stop offset="100%" stopColor="#d4e2f1" />
        </radialGradient>
      </defs>
      <ellipse cx="160" cy="64" rx="148" ry="6" fill="#c2d2e3" opacity="0.4" />
      <ellipse cx="60"  cy="44" rx="38" ry="22" fill="url(#wispyLite)" />
      <ellipse cx="120" cy="38" rx="50" ry="26" fill="url(#wispyLite)" />
      <ellipse cx="190" cy="42" rx="58" ry="22" fill="url(#wispyLite)" />
      <ellipse cx="260" cy="48" rx="44" ry="18" fill="url(#wispyLite)" />
    </svg>
  );
}

/** Taller cumulus tower — ~140×100px at size=1. */
function CloudTowering({ size = 140 }: CloudProps): ReactElement {
  return (
    <svg viewBox="0 0 180 150" width={size} height={size * 0.83} aria-hidden="true">
      <defs>
        <radialGradient id="towerLite" cx="28%" cy="22%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#f3f7ff" />
          <stop offset="100%" stopColor="#c7daed" />
        </radialGradient>
      </defs>
      <ellipse cx="90" cy="130" rx="74" ry="8" fill="#b5c8db" opacity="0.55" />
      {/* Stacked tiers forming a cumulus-tower silhouette */}
      <circle cx="60"  cy="100" r="34" fill="url(#towerLite)" />
      <circle cx="110" cy="96"  r="40" fill="url(#towerLite)" />
      <circle cx="148" cy="108" r="26" fill="url(#towerLite)" />
      <circle cx="80"  cy="62"  r="34" fill="url(#towerLite)" />
      <circle cx="120" cy="50"  r="32" fill="url(#towerLite)" />
      <circle cx="100" cy="22"  r="24" fill="url(#towerLite)" />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// CLOUD ROSTER — 10 instances, varied silhouette / size / y-position / speed
// / delay. Order in the array maps to z-order (later = on top). Y values
// sweep across the whole vertical range so the sky never has dead zones.
// ────────────────────────────────────────────────────────────────────────────

interface CloudConfig {
  id: string;
  Component: (p: CloudProps) => ReactElement;
  /** Pixel size of the underlying SVG (drift scales render proportionally). */
  size: number;
  /** Vertical position in vh. */
  y: number;
  /** Seconds for a full left-to-right traversal. */
  duration: number;
  /** Per-cloud delay offset (seconds) so they don't align. */
  delay: number;
  opacity: number;
}

const CLOUDS: CloudConfig[] = [
  { id: "c1",  Component: CloudFluffy,    size: 160, y: 12, duration: 90,  delay: 0,  opacity: 0.92 },
  { id: "c2",  Component: CloudSmallTuft, size: 56,  y: 24, duration: 110, delay: 18, opacity: 0.85 },
  { id: "c3",  Component: CloudWispy,     size: 264, y: 38, duration: 130, delay: 6,  opacity: 0.88 },
  { id: "c4",  Component: CloudTowering,  size: 133, y: 52, duration: 105, delay: 32, opacity: 0.95 },
  { id: "c5",  Component: CloudFluffy,    size: 192, y: 64, duration: 120, delay: 14, opacity: 0.90 },
  { id: "c6",  Component: CloudSmallTuft, size: 48,  y: 78, duration: 95,  delay: 40, opacity: 0.82 },
  { id: "c7",  Component: CloudWispy,     size: 216, y: 18, duration: 140, delay: 55, opacity: 0.80 },
  { id: "c8",  Component: CloudTowering,  size: 112, y: 44, duration: 100, delay: 70, opacity: 0.92 },
  { id: "c9",  Component: CloudFluffy,    size: 112, y: 72, duration: 115, delay: 22, opacity: 0.88 },
  { id: "c10", Component: CloudSmallTuft, size: 80,  y: 30, duration: 125, delay: 60, opacity: 0.85 },
];

// ── Component ──────────────────────────────────────────────────────────────

export function DawnCloudsWallpaper() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="dawn-wallpaper" aria-hidden="true">
      {CLOUDS.map((c) => (
        <motion.div
          key={c.id}
          className="dawn-cloud"
          style={{ top: `${c.y}vh`, opacity: c.opacity }}
          initial={{ x: "-25vw" }}
          animate={
            reduceMotion
              ? { x: "40vw" } // a settled mid-sky position when motion is off
              : { x: ["-25vw", "125vw"] }
          }
          transition={
            reduceMotion
              ? { duration: 0 }
              : {
                  x: {
                    duration: c.duration,
                    delay: c.delay,
                    repeat: Infinity,
                    ease: "linear",
                  },
                }
          }
        >
          <c.Component size={c.size} />
        </motion.div>
      ))}
    </div>
  );
}
