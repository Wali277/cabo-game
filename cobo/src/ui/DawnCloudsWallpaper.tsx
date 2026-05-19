import type { ReactElement } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Dawn Clouds wallpaper — saturated cerulean sky with volumetric cumulus.
 *
 * v2.18.1 retune (from a REMATCH-style reference the user shared):
 * the v2.18 version was washed out — pale sky + flat white-on-white cloud
 * shapes that disappeared against the gradient. The new design:
 *
 *   • Sky stays in the saturated-blue family (handled by App.css).
 *   • Each cloud carries built-in three-tone volumetric shading rendered as
 *     stacked layers within the SVG:
 *        1. SHADOW BASE      — dark blue-gray silhouette
 *        2. MID TONE         — lighter blue-gray, offset up
 *        3. HIGHLIGHT        — off-white tufts catching the light
 *        4. SPECULAR ACCENTS — pure-white spots on the highest tufts
 *     This gives each cloud the same "puffy with dark underside" look the
 *     reference image carries — clouds read as round and three-dimensional
 *     instead of flat watermarks.
 *   • Sizes vary dramatically (one hero cloud + supporting puffs +
 *     distant strips) so the scene has clear visual hierarchy.
 *
 * Motion is unchanged from v2.18: each cloud drifts steadily left → right
 * on a long linear loop, staggered by per-cloud delays. `useReducedMotion`
 * collapses everything to a still tableau.
 */

interface CloudProps { size?: number }

// ────────────────────────────────────────────────────────────────────────────
// CLOUD VARIANTS
//
// Each cloud is built from three (sometimes four) stacked groups of
// overlapping ellipses/circles, each in a darker→lighter shade. The shadow
// group sits lowest, the highlight group sits highest, producing a
// "bottom-shadowed cumulus" silhouette.
//
// Palette (consistent across variants so the sky reads as one scene):
//   shadow  #4d6a8c   — muted blue-gray underside
//   mid     #8aa6c4   — transitional sky-shadow
//   light   #e8eff8   — off-white tufts
//   white   #ffffff   — specular accents on the highest puffs
// ────────────────────────────────────────────────────────────────────────────

/** The headline cloud — large dominant cumulus, ~460×280 base. */
function CloudHero({ size = 460 }: CloudProps): ReactElement {
  return (
    <svg viewBox="0 0 480 280" width={size} height={size * 0.583} aria-hidden="true">
      {/* SHADOW BASE — full puffy silhouette in dark blue-gray. Extends
          slightly below the upper layers so the underside is visible. */}
      <g fill="#4d6a8c">
        <ellipse cx="100" cy="206" rx="60" ry="38" />
        <ellipse cx="170" cy="200" rx="68" ry="44" />
        <ellipse cx="240" cy="196" rx="74" ry="48" />
        <ellipse cx="312" cy="200" rx="68" ry="44" />
        <ellipse cx="378" cy="206" rx="58" ry="38" />
        <ellipse cx="240" cy="226" rx="180" ry="22" />
      </g>

      {/* MID TONE — offset upward, slightly inset horizontally. */}
      <g fill="#8aa6c4">
        <circle cx="108" cy="174" r="48" />
        <circle cx="160" cy="158" r="58" />
        <circle cx="222" cy="148" r="64" />
        <circle cx="284" cy="154" r="62" />
        <circle cx="346" cy="166" r="52" />
        <circle cx="396" cy="186" r="36" />
      </g>

      {/* HIGHLIGHT — off-white tufts forming the top of the cloud. */}
      <g fill="#e8eff8">
        <circle cx="118" cy="156" r="38" />
        <circle cx="172" cy="134" r="50" />
        <circle cx="226" cy="120" r="56" />
        <circle cx="282" cy="128" r="52" />
        <circle cx="338" cy="146" r="42" />
        <circle cx="386" cy="172" r="28" />
      </g>

      {/* SPECULAR — bright-white pop on the tallest tufts only. */}
      <g fill="#ffffff">
        <ellipse cx="180" cy="118" rx="28" ry="22" />
        <ellipse cx="230" cy="104" rx="34" ry="26" />
        <ellipse cx="282" cy="116" rx="28" ry="22" />
      </g>
    </svg>
  );
}

/** Medium fluffy cumulus, ~260×170 base. */
function CloudFluffy({ size = 260 }: CloudProps): ReactElement {
  return (
    <svg viewBox="0 0 280 170" width={size} height={size * 0.607} aria-hidden="true">
      <g fill="#4d6a8c">
        <ellipse cx="64"  cy="120" r="36" />
        <ellipse cx="118" cy="116" r="46" />
        <ellipse cx="178" cy="118" r="44" />
        <ellipse cx="222" cy="126" r="34" />
        <ellipse cx="140" cy="142" rx="110" ry="14" />
      </g>
      <g fill="#8aa6c4">
        <circle cx="72"  cy="98"  r="30" />
        <circle cx="118" cy="86"  r="40" />
        <circle cx="170" cy="92"  r="38" />
        <circle cx="216" cy="106" r="28" />
      </g>
      <g fill="#e8eff8">
        <circle cx="80"  cy="82" r="22" />
        <circle cx="122" cy="68" r="34" />
        <circle cx="170" cy="76" r="30" />
        <circle cx="212" cy="92" r="22" />
      </g>
      <g fill="#ffffff">
        <ellipse cx="126" cy="62" rx="20" ry="16" />
        <ellipse cx="168" cy="68" rx="16" ry="13" />
      </g>
    </svg>
  );
}

/** Long thin cloud strip — distant horizontal band, ~320×100 base. */
function CloudStrip({ size = 320 }: CloudProps): ReactElement {
  return (
    <svg viewBox="0 0 340 100" width={size} height={size * 0.294} aria-hidden="true">
      <g fill="#4d6a8c">
        <ellipse cx="60"  cy="68" rx="40" ry="20" />
        <ellipse cx="130" cy="64" rx="50" ry="22" />
        <ellipse cx="210" cy="66" rx="48" ry="20" />
        <ellipse cx="280" cy="68" rx="40" ry="18" />
        <ellipse cx="170" cy="78" rx="150" ry="8" />
      </g>
      <g fill="#8aa6c4">
        <ellipse cx="72"  cy="54" rx="32" ry="16" />
        <ellipse cx="138" cy="48" rx="42" ry="20" />
        <ellipse cx="210" cy="52" rx="40" ry="16" />
        <ellipse cx="278" cy="56" rx="32" ry="14" />
      </g>
      <g fill="#e8eff8">
        <ellipse cx="82"  cy="44" rx="24" ry="12" />
        <ellipse cx="140" cy="38" rx="34" ry="14" />
        <ellipse cx="208" cy="42" rx="30" ry="12" />
        <ellipse cx="274" cy="48" rx="22" ry="10" />
      </g>
      <g fill="#ffffff">
        <ellipse cx="140" cy="34" rx="20" ry="8" />
      </g>
    </svg>
  );
}

/** Small distant cloud — slightly muted (atmospheric perspective), ~140×80 base. */
function CloudDistant({ size = 140 }: CloudProps): ReactElement {
  return (
    <svg viewBox="0 0 160 80" width={size} height={size * 0.5} aria-hidden="true">
      <g fill="#6e89ab" opacity="0.85">
        <ellipse cx="38"  cy="56" rx="28" ry="14" />
        <ellipse cx="80"  cy="54" rx="32" ry="16" />
        <ellipse cx="120" cy="58" rx="26" ry="13" />
        <ellipse cx="80"  cy="64" rx="74" ry="7" />
      </g>
      <g fill="#a3bcd6">
        <circle cx="44" cy="44" r="20" />
        <circle cx="82" cy="38" r="26" />
        <circle cx="120" cy="46" r="20" />
      </g>
      <g fill="#e8eff8">
        <circle cx="52" cy="36" r="14" />
        <circle cx="84" cy="28" r="20" />
        <circle cx="118" cy="40" r="14" />
      </g>
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// CLOUD ROSTER — 8 instances, with one HERO cloud, several mid-sized fluffies,
// a couple of strips low on the horizon, and distant puffs for depth.
//
// Y values sweep across the vertical range so the sky has clear depth bands:
//   12–28vh → distant/strip clouds (smaller, lighter — feel "far away")
//   30–55vh → mid-tier fluffies + the hero cloud (the focal layer)
//   60–80vh → low strips drifting near the horizon
// ────────────────────────────────────────────────────────────────────────────

interface CloudConfig {
  id: string;
  Component: (p: CloudProps) => ReactElement;
  size: number;
  /** Vertical position in vh. */
  y: number;
  /** Seconds for a full left → right traversal. */
  duration: number;
  /** Per-cloud delay offset so they don't all align. */
  delay: number;
  /** Per-cloud opacity (distant clouds get lower values for atmospheric depth). */
  opacity: number;
}

const CLOUDS: CloudConfig[] = [
  // Hero cloud — large, focal layer
  { id: "hero",  Component: CloudHero,    size: 460, y: 30, duration: 140, delay: 0,  opacity: 1.0 },
  // Mid-tier fluffies — sprinkled at varied heights
  { id: "f1",    Component: CloudFluffy,  size: 280, y: 14, duration: 120, delay: 30, opacity: 0.96 },
  { id: "f2",    Component: CloudFluffy,  size: 220, y: 55, duration: 130, delay: 65, opacity: 0.94 },
  { id: "f3",    Component: CloudFluffy,  size: 240, y: 72, duration: 115, delay: 18, opacity: 0.92 },
  // Long strips — horizon band
  { id: "s1",    Component: CloudStrip,   size: 340, y: 44, duration: 155, delay: 80, opacity: 0.85 },
  { id: "s2",    Component: CloudStrip,   size: 280, y: 82, duration: 140, delay: 48, opacity: 0.78 },
  // Distant puffs — small + muted for depth
  { id: "d1",    Component: CloudDistant, size: 130, y: 22, duration: 165, delay: 12, opacity: 0.75 },
  { id: "d2",    Component: CloudDistant, size: 110, y: 64, duration: 150, delay: 95, opacity: 0.70 },
];

// ────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ────────────────────────────────────────────────────────────────────────────

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
