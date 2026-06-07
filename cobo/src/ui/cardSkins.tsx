/**
 * Visual config for every card skin. (Also includes a generic inline
 * racing-helmet silhouette SVG — no logos or trademarks — kept for potential
 * card-back art; not referenced by any current skin.)
 *
 * Each skin describes how its FACE and BACK should look. `Card.tsx` reads
 * `useCardSkin()` and pulls the matching record from here. Adding a new skin
 * is: one entry in `SKIN_STYLES` here + one entry in `cardskin.ts`.
 */
import { useId } from "react";
import { CUSTOM_SKIN_DEFAULTS, type CardSkin } from "../state/cardskin";
import neonBack from "../assets/neon-back.png";
import decoBack from "../assets/deco-back.svg";

/** Per-skin visual rules. Suit color override is by suit so red suits can
 *  pivot to gold (Royal), magenta (Neon) etc. while black suits get their
 *  own color. Defaults: red suits #e23a5e, black #1c1d2b. */
export interface SkinStyle {
  /** Card face background. CSS color or linear-gradient string. */
  faceBg: string;
  /** Face border color. */
  faceBorder: string;
  /** Face border width in px. Default 3. */
  faceBorderWidth?: number;
  /** Per-suit color override applied to corner rank, corner glyph,
   *  center glyph. `undefined` = use the default red/black behaviour. */
  suitColor?: { red: string; black: string };
  /** Font stack for the rank corners + center glyph. */
  font?: string;
  /** Card back style — which renderer to use. "deco" renders NO center art
   *  (the backBg image is the entire back). */
  backCenter?: "cabo" | "helmet" | "royal" | "neon" | "evolved" | "deco" | "ivory" | "eclipse" | "vesica" | "orbit";
  /** Card back background. */
  backBg: string;
  backBorder: string;
  /** Back border width in px. Default 3. */
  backBorderWidth?: number;
  /** Color of the "LUMO" pill on the back when backCenter === "cabo". */
  caboColor?: string;
  /** Background of the LUMO pill on the back. */
  caboPillBg?: string;
  /** Optional sticker on the card back — small badge in a corner. */
  backBadge?: { text: string; color: string; bg: string } | null;
  /** Optional inline SVG pattern overlay for the FACE. */
  patternOverlay?: string;
  /** Same pattern overlay applied to the BACK (Hand-drawn). */
  backPatternOverlay?: string;
  /** SOLID color used as the Joker's face cutout (it's an SVG fill —
   *  gradients are not valid here). Should approximate the dominant
   *  tone of faceBg so the jester face "cuts through" cleanly. */
  jesterBg?: string;
}

// Every skin uses Fredoka (the project's self-hosted font) for type
// consistency. Skin personality comes from layout, color, and accents.
const FONT = "'Fredoka', 'Fredoka One', system-ui, sans-serif";

export const SKIN_STYLES: Record<CardSkin, SkinStyle> = {
  // ── Classic — current yellow + black ───────────────────────────────
  classic: {
    faceBg: "#ffd86b",
    faceBorder: "#1c1d2b",
    font: FONT,
    jesterBg: "#ffd86b",
    backBg: "#1c1d2b",
    backBorder: "#ffd86b",
    backCenter: "cabo",
    caboColor: "#1c1d2b",
    caboPillBg: "#ffd86b",
  },

  // ── Custom (Recolor) — FREE skin the player tints (body + border). ──
  //    This is only the BASE used before any tint and as the render-time
  //    fallback; Card.tsx overrides faceBg ← body and faceBorder ← border
  //    from the signed-in profile's `custom_card_colors`. The back reuses the
  //    classic "LUMO" pill so an untinted Custom card reads as a finished card.
  custom: {
    faceBg: CUSTOM_SKIN_DEFAULTS.body, // body
    faceBorder: CUSTOM_SKIN_DEFAULTS.border, // border
    // No suitColor → the suits keep the default red/black behaviour.
    font: FONT,
    jesterBg: CUSTOM_SKIN_DEFAULTS.body, // body
    backBg: CUSTOM_SKIN_DEFAULTS.border, // border
    backBorder: CUSTOM_SKIN_DEFAULTS.body, // body
    backCenter: "cabo",
    caboColor: CUSTOM_SKIN_DEFAULTS.border, // border — LUMO text
    caboPillBg: CUSTOM_SKIN_DEFAULTS.body, // body — LUMO pill chip
  },

  // ── Royal — "Eclipse Royal": red + obsidian + gold (both sides). ───
  //    Face echoes the back's split-field colorway — a red→obsidian gradient
  //    framed in gold, with gold glyphs. The BACK is the full Eclipse Royal
  //    artwork (RoyalBack) painted edge-to-edge, so the card border is removed
  //    on the back and a dark fallback covers the ~1px clip inset (same
  //    full-bleed approach as Deco / Neon).
  royal: {
    faceBg:
      "linear-gradient(158deg, #a82236 0%, #7a1626 44%, #1d0a11 100%)",
    faceBorder: "#caa85a",
    faceBorderWidth: 3,
    // Gold glyphs on both suits — nudged lighter (#e9c879) so they stay legible
    // across both the red top and the obsidian bottom of the face gradient.
    suitColor: { red: "#e9c879", black: "#e9c879" },
    font: FONT,
    jesterBg: "#3a0a13",
    // Back is the artwork SVG (RoyalBack); dark fallback fills the clip inset.
    backBg: "#1a0810",
    backBorder: "transparent",
    backBorderWidth: 0,
    backCenter: "royal",
  },

  // ── Neon — player's pink/cyan "lightning LUMO" art (back) + neon faces ─
  neon: {
    faceBg: "#070710",
    faceBorder: "#ff3dd0",
    faceBorderWidth: 2,
    // ♥♦ glow pink, ♠♣ glow cyan — echoes the two-tone back.
    suitColor: { red: "#ff3dd0", black: "#34e6ff" },
    font: FONT,
    jesterBg: "#070710",
    // Back is the artwork image (see NeonBack); no card border so it fills clean.
    backBg: "#070710",
    backBorder: "transparent",
    backBorderWidth: 0,
    backCenter: "neon",
  },

  // ── Art Deco — PREMIUM (2 tokens). Near-black field with a gold frame and a
  //    crimson ♥♦ / emerald ♠♣ two-tone that echoes the back. The BACK is the
  //    full art-deco artwork (deco-back.svg) painted edge-to-edge, so it carries
  //    its own crimson border + gold/emerald deco — the card border is removed
  //    on the back so the artwork fills cleanly (same approach as Neon).
  deco: {
    faceBg:
      "radial-gradient(circle at 50% 10%, rgba(212,175,55,0.16) 0%, transparent 55%), linear-gradient(160deg, #16130b 0%, #0b0b0b 58%, #050505 100%)",
    faceBorder: "#c9a227",
    faceBorderWidth: 3,
    suitColor: { red: "#e2313f", black: "#1faa66" },
    font: FONT,
    jesterBg: "#0b0b0b",
    backBg: `url(${decoBack}) center / 100% 100% no-repeat, #000000`,
    backBorder: "transparent",
    backBorderWidth: 0,
    backCenter: "deco", // no center art — the artwork IS the whole back
  },

  // ── Ivory — LEGENDARY. Warm bone ground · solid ink diamond w/ inlay line.
  //    Faces mirror the back's warm-bone colorway; the ink mark is the accent.
  //    (Replaces the retired "Minimalist".) The back art is the full SVG
  //    (IvoryBack) painted edge-to-edge — no card border on the back.
  ivory: {
    faceBg:
      "radial-gradient(120% 90% at 50% 40%, #f0ebe0 0%, #e7e0d1 70%, #ddd5c2 100%)",
    faceBorder: "#16161b",
    faceBorderWidth: 3,
    suitColor: { red: "#16161b", black: "#16161b" },
    font: FONT,
    jesterBg: "#e7e0d1",
    backBg: "#ddd5c2",
    backBorder: "transparent",
    backBorderWidth: 0,
    backCenter: "ivory",
  },

  // ── Eclipse — LEGENDARY. Graphite ground · split disc, half bone solid.
  //    (Replaces the retired "Hand-drawn".) Faces mirror the graphite back;
  //    bone is the accent.
  eclipse: {
    faceBg:
      "radial-gradient(120% 90% at 50% 42%, #202127 0%, #16171b 60%, #0c0d10 100%)",
    faceBorder: "#e7e0d1",
    faceBorderWidth: 3,
    suitColor: { red: "#e7e0d1", black: "#e7e0d1" },
    font: FONT,
    jesterBg: "#16171b",
    backBg: "#0c0d10",
    backBorder: "transparent",
    backBorderWidth: 0,
    backCenter: "eclipse",
  },

  // ── Vesica — LEGENDARY. Plum ground · two interlocking champagne rings.
  //    Faces mirror the plum back; champagne is the accent.
  vesica: {
    faceBg:
      "radial-gradient(120% 90% at 50% 42%, #311a35 0%, #22132a 60%, #160c1c 100%)",
    faceBorder: "#cdb583",
    faceBorderWidth: 3,
    suitColor: { red: "#cdb583", black: "#cdb583" },
    font: FONT,
    jesterBg: "#22132a",
    backBg: "#160c1c",
    backBorder: "transparent",
    backBorderWidth: 0,
    backCenter: "vesica",
  },

  // ── Orbit — LEGENDARY. Petrol ground · thin ring with a single node.
  //    Faces mirror the petrol back; platinum is the accent.
  orbit: {
    faceBg:
      "radial-gradient(120% 90% at 50% 40%, #0f343a 0%, #0a262b 60%, #06181c 100%)",
    faceBorder: "#b9c2d4",
    faceBorderWidth: 3,
    suitColor: { red: "#b9c2d4", black: "#b9c2d4" },
    font: FONT,
    jesterBg: "#0a262b",
    backBg: "#06181c",
    backBorder: "transparent",
    backBorderWidth: 0,
    backCenter: "orbit",
  },

  // ── Lumo Evolved — unified sleek black + banana-yellow identity (both sides).
  //    Face: black field, banana rank/suit glyphs. Back ("Charge Line"): black
  //    field, banana LUMO wordmark, a lightning-bolt divider, tracked EVOLVED.
  //    Mode-exclusive: forced on in Evolved mode, never shown in the picker.
  evolved: {
    faceBg:
      "linear-gradient(158deg, #20202a 0%, #0e0e13 58%, #070709 100%)",
    faceBorder: "#ffe14d",
    faceBorderWidth: 3,
    // Both suits render in banana yellow on the black face — a clean two-colour
    // identity (suit is cosmetic in Cabo; the glyph SHAPE distinguishes ♥/♦/♠/♣).
    suitColor: { red: "#ffe14d", black: "#ffe14d" },
    font: FONT,
    // Solid black for the Joker face cutout, matching the black field.
    jesterBg: "#0c0c10",
    // Back shares the face's black field; the banana border frames it.
    backBg:
      "linear-gradient(158deg, #20202a 0%, #0e0e13 58%, #070709 100%)",
    backBorder: "#ffe14d",
    backBorderWidth: 3,
    backCenter: "evolved",
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   <HelmetIcon /> — generic racing-helmet silhouette (no logos).
   Side-profile, L-shaped visor cutout. Path from a CC0 SVG.
   ─────────────────────────────────────────────────────────────────────── */
export function HelmetIcon({
  size,
  shellColor = "#0a0a0a",
}: {
  size: number;
  shellColor?: string;
}) {
  return (
    <svg
      viewBox="-10 0 550 480"
      width={size}
      height={size * (480 / 550)}
      style={{ display: "block" }}
      aria-hidden="true"
    >
      <path
        fill={shellColor}
        fillRule="evenodd"
        d="M231.744,43.821C113.192,61.604,37.922,149.161,25.278,267.139H195.68c3.907,0,7.562,1.899,9.795,5.11
           c2.234,3.201,2.766,7.282,1.422,10.951l-15.116,58.123c-1.343,3.65-4.558,6.292-8.401,6.916L4.214,359.832L0,471.547h442.42
           c29.492-35.817,58.989-128.564,67.414-187.558C530.53,139.127,400.283,18.552,231.744,43.821z
           M156.534,143.135l-47.58,3.137c21.917-34.441,69.496-53.225,88.28-53.225C178.45,114.958,156.534,143.135,156.534,143.135z"
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Legendary minimalist card-backs — ported VERBATIM from the approved
   `cobo/public/skin-preview.html` (functions skinIvory / skinEclipse /
   skinVesica / skinOrbit + the open()/keyline()/diamond() helpers). Same
   440×640 viewBox, same gradients / paths / circles / keyline stroke+opacity.
   The string-built markup is translated to JSX; every internal id is uniquified
   per instance with `useId()` so multiple cards on the table don't collide on a
   shared gradient / clipPath / filter id (which would make the LAST-mounted
   instance's def win for all of them).
   ─────────────────────────────────────────────────────────────────────── */

/** keyline() helper — one quiet hairline keyline (the only framing element). */
function Keyline({ stroke, opacity = 0.5 }: { stroke: string; opacity?: number }) {
  return (
    <rect
      x="22" y="22" width="396" height="596" rx="30" ry="30"
      fill="none" stroke={stroke} strokeWidth="1.4" opacity={opacity}
    />
  );
}

/** diamond() helper — a rotated-square path centred at (cx,cy) with "radius" r. */
function diamondPath(cx: number, cy: number, r: number): string {
  return `M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`;
}

/* IVORY — warm bone ground · solid ink diamond w/ inlay line. */
export function IvoryBack() {
  const uid = useId().replace(/:/g, "");
  const clip = `cardclip${uid}`;
  const bg = `iv-bg${uid}`;
  const grain = `iv-grain${uid}`;
  const ink = "#16161b";
  const bone = "#ece6d9";
  const cx = 220, cy = 320;
  return (
    <svg viewBox="0 0 440 640" width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <clipPath id={clip}><rect x="6" y="6" width="428" height="628" rx="40" ry="40" /></clipPath>
        <radialGradient id={bg} cx="50%" cy="40%" r="80%">
          <stop offset="0" stopColor="#f0ebe0" />
          <stop offset="0.7" stopColor="#e7e0d1" />
          <stop offset="1" stopColor="#ddd5c2" />
        </radialGradient>
        <filter id={grain} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="5" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.03 0" />
          <feComposite operator="over" in2="SourceGraphic" />
        </filter>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x="6" y="6" width="428" height="628" rx="40" fill={`url(#${bg})`} filter={`url(#${grain})`} />
        <path d={diamondPath(cx, cy, 84)} fill={ink} />
        <path d={diamondPath(cx, cy, 66)} fill="none" stroke={bone} strokeWidth="1.3" opacity="0.9" />
      </g>
      <Keyline stroke={ink} opacity={0.5} />
    </svg>
  );
}

/* ECLIPSE — graphite ground · split disc, half bone solid. */
export function EclipseBack() {
  const uid = useId().replace(/:/g, "");
  const clip = `cardclip${uid}`;
  const bg = `ec-bg${uid}`;
  const bone = "#e7e0d1";
  const cx = 220, cy = 320, r = 78;
  return (
    <svg viewBox="0 0 440 640" width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <clipPath id={clip}><rect x="6" y="6" width="428" height="628" rx="40" ry="40" /></clipPath>
        <radialGradient id={bg} cx="50%" cy="42%" r="80%">
          <stop offset="0" stopColor="#202127" />
          <stop offset="0.6" stopColor="#16171b" />
          <stop offset="1" stopColor="#0c0d10" />
        </radialGradient>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x="6" y="6" width="428" height="628" rx="40" fill={`url(#${bg})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={bone} strokeWidth="1.4" />
        <path d={`M${cx} ${cy - r} A ${r} ${r} 0 0 0 ${cx} ${cy + r} Z`} fill={bone} />
      </g>
      <Keyline stroke={bone} opacity={0.32} />
    </svg>
  );
}

/* VESICA — plum ground · two interlocking champagne rings. */
export function VesicaBack() {
  const uid = useId().replace(/:/g, "");
  const clip = `cardclip${uid}`;
  const bg = `ve-bg${uid}`;
  const champ = "#cdb583";
  const cx = 220, cy = 320, r = 62, d = 36;
  return (
    <svg viewBox="0 0 440 640" width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <clipPath id={clip}><rect x="6" y="6" width="428" height="628" rx="40" ry="40" /></clipPath>
        <radialGradient id={bg} cx="50%" cy="42%" r="80%">
          <stop offset="0" stopColor="#311a35" />
          <stop offset="0.6" stopColor="#22132a" />
          <stop offset="1" stopColor="#160c1c" />
        </radialGradient>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x="6" y="6" width="428" height="628" rx="40" fill={`url(#${bg})`} />
        <circle cx={cx - d} cy={cy} r={r} fill="none" stroke={champ} strokeWidth="1.5" />
        <circle cx={cx + d} cy={cy} r={r} fill="none" stroke={champ} strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r="3.4" fill={champ} />
      </g>
      <Keyline stroke={champ} opacity={0.4} />
    </svg>
  );
}

/* ORBIT — petrol ground · thin ring with a single node. */
export function OrbitBack() {
  const uid = useId().replace(/:/g, "");
  const clip = `cardclip${uid}`;
  const bg = `or-bg${uid}`;
  const plat = "#b9c2d4";
  const cx = 220, cy = 320, r = 76;
  return (
    <svg viewBox="0 0 440 640" width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <clipPath id={clip}><rect x="6" y="6" width="428" height="628" rx="40" ry="40" /></clipPath>
        <radialGradient id={bg} cx="50%" cy="40%" r="80%">
          <stop offset="0" stopColor="#0f343a" />
          <stop offset="0.6" stopColor="#0a262b" />
          <stop offset="1" stopColor="#06181c" />
        </radialGradient>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x="6" y="6" width="428" height="628" rx="40" fill={`url(#${bg})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={plat} strokeWidth="1.3" />
        <circle cx={cx} cy={cy - r} r="7" fill={plat} />
        <circle cx={cx} cy={cy} r="3.4" fill={plat} />
      </g>
      <Keyline stroke={plat} opacity={0.38} />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   <RoyalBack /> — "Eclipse Royal".

   Ported VERBATIM from the approved `cobo/public/royal-preview.html`
   (the single SKINS 'eclipse' config + makeCard / ringSet). A split field of
   royal red and obsidian, with a gold disc that INVERTS the two fields
   wherever it overlaps, tied by a thin gold seam and gold ring linework with
   a central gem. Same 440×640 viewBox, same gradients / polys / circles /
   stroke widths / opacities. The string-built markup is translated to JSX and
   rendered full-bleed (like the Deco / Neon backs); every internal id is
   uniquified per instance with `useId()` so multiple cards on the table don't
   collide on a shared gradient / clipPath id.

   Geometry (from the config): reg = diagSplit(372,300) → the gold seam runs
   from (6,372) on the left to (434,300) on the right; disc at (220,326) r104;
   dust dots and ring radii exactly as authored. Colors: GOLD #caa85a,
   GOLD_LT #f0d89c, GOLD_DK #9c7d3e.
   ─────────────────────────────────────────────────────────────────────── */
export function RoyalBack() {
  const uid = useId().replace(/:/g, "");
  const cc = `cc${uid}`;
  const rId = `r${uid}`; // red radial gradient
  const oId = `o${uid}`; // obsidian radial gradient
  const gId = `g${uid}`; // gold linear gradient (gem)
  const disc = `disc${uid}`; // disc clipPath for the field inversion

  const GOLD = "#caa85a";
  const GOLD_LT = "#f0d89c";
  const GOLD_DK = "#9c7d3e";

  const redFill = `url(#${rId})`;
  const obFill = `url(#${oId})`;

  // reg = diagSplit(372,300):
  //   red region  = polygon (6,6)(434,6)(434,300)(6,372)
  //   ob  region  = polygon (6,372)(434,300)(434,634)(6,634)
  const redPoly = "M6 6 L434 6 L434 300 L6 372 Z";
  const obPoly = "M6 372 L434 300 L434 634 L6 634 Z";

  // dust dots: [cx, cy, r, opacity]
  const dust: [number, number, number, number][] = [
    [70, 470, 1.2, 0.5],
    [120, 560, 1, 0.4],
    [360, 520, 1.4, 0.55],
    [300, 590, 1, 0.4],
    [400, 452, 1.1, 0.45],
    [176, 520, 0.9, 0.32],
  ];

  // disc (ringSet) geometry
  const cx = 220, cy = 326, r = 104;
  const diamond = (dcx: number, dcy: number, dr: number) =>
    `M${dcx} ${dcy - dr} L${dcx + dr} ${dcy} L${dcx} ${dcy + dr} L${dcx - dr} ${dcy} Z`;

  return (
    <svg viewBox="0 0 440 640" width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <clipPath id={cc}><rect x="6" y="6" width="428" height="628" rx="40" ry="40" /></clipPath>
        <radialGradient id={rId} gradientUnits="userSpaceOnUse" cx="188" cy="176" r="540">
          <stop offset="0" stopColor="#a82236" />
          <stop offset="0.5" stopColor="#7a1626" />
          <stop offset="1" stopColor="#3a0a13" />
        </radialGradient>
        <radialGradient id={oId} gradientUnits="userSpaceOnUse" cx="252" cy="544" r="520">
          <stop offset="0" stopColor="#1d0a11" />
          <stop offset="1" stopColor="#120509" />
        </radialGradient>
        <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={GOLD_LT} />
          <stop offset="1" stopColor={GOLD_DK} />
        </linearGradient>
        <clipPath id={disc}><circle cx={cx} cy={cy} r={r} /></clipPath>
      </defs>
      <g clipPath={`url(#${cc})`}>
        {/* (a) full red-gradient field */}
        <rect x="6" y="6" width="428" height="628" fill={redFill} />
        {/* (b) obsidian lower region */}
        <path d={obPoly} fill={obFill} />
        {/* (c) gold dust */}
        {dust.map((d, i) => (
          <circle key={i} cx={d[0]} cy={d[1]} r={d[2]} fill={GOLD_LT} opacity={d[3]} />
        ))}
        {/* (d) inversion: inside the disc, swap the two fields */}
        <g clipPath={`url(#${disc})`}>
          <path d={redPoly} fill={obFill} />
          <path d={obPoly} fill={redFill} />
        </g>
        {/* (e) gold seam line */}
        <line x1="6" y1="372" x2="434" y2="300" stroke={GOLD} strokeWidth="1.4" opacity="0.85" />
        {/* (f) ringSet accents: 3 concentric gold rings + gem */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={GOLD} strokeWidth="2.6" />
        <circle cx={cx} cy={cy} r={r - 12} fill="none" stroke={GOLD} strokeWidth="0.8" opacity="0.5" />
        <circle cx={cx} cy={cy} r={r + 10} fill="none" stroke={GOLD} strokeWidth="0.7" opacity="0.28" />
        <path d={diamond(cx, cy, 17)} fill="none" stroke={GOLD_LT} strokeWidth="1.5" />
        <path d={diamond(cx, cy, 7.5)} fill={`url(#${gId})`} />
      </g>
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   <NeonBack /> — the player's neon "lightning LUMO" artwork.

   The card back is the uploaded image, stretched to fill the card. It's shown
   as-is with NO wordmark overlay — the previously baked-in text was removed
   from the source raster (cobo/src/assets/neon-back.png), so the back is now
   pure art.
   ─────────────────────────────────────────────────────────────────────── */
export function NeonBack() {
  return (
    <img
      src={neonBack}
      alt=""
      aria-hidden="true"
      style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   <EvolvedBack /> — Lumo Evolved back ("Charge Line").

   Banana-yellow on the black field (skin.backBg), matching the card face:
   a centred LUMO wordmark, a lightning-bolt divider (rule · bolt · rule),
   then a wide-tracked EVOLVED with a clear gap beneath the bolt. The card
   aspect is exactly 220:319 (w : 1.45w) so the fixed viewBox maps cleanly.
   ─────────────────────────────────────────────────────────────────────── */
export function EvolvedBack({ w }: { w: number }) {
  const banana = "#ffe14d";
  return (
    <svg
      viewBox="0 0 220 319"
      width={w}
      height={Math.round(w * 1.45)}
      style={{ display: "block" }}
      aria-hidden="true"
    >
      <defs>
        {/* Soft banana halo around the bolt — the one "electric" accent. */}
        <filter id="evBoltGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <text
        x="110" y="168" textAnchor="middle"
        fontFamily={FONT} fontWeight={700} fontSize="54"
        fill={banana} letterSpacing="0.5"
      >
        LUMO
      </text>

      {/* Lightning divider: rule · bolt · rule */}
      <line x1="46" y1="196" x2="92" y2="196" stroke={banana} strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
      <line x1="128" y1="196" x2="174" y2="196" stroke={banana} strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
      <g filter="url(#evBoltGlow)">
        <path
          d="M23 1 L7 31 L18.5 31 L15 57 L34 24 L21.5 24 Z"
          fill={banana}
          transform="translate(97.29 178.02) scale(0.62)"
        />
      </g>

      <text
        x="110" y="243" textAnchor="middle"
        fontFamily={FONT} fontWeight={600} fontSize="18"
        fill={banana} fillOpacity="0.92" letterSpacing="7"
      >
        EVOLVED
      </text>
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   <DragonFace /> — the Lumo Evolved Dragon (rank "D").

   A filled banana silhouette traced from the approved dragon art (the same
   art the user signed off on). Drawn on the card's black field with the
   black interior detail-lines reading as negative space. `size` is the WIDTH;
   height follows the art's natural aspect (≈1.745). viewBox is the traced
   art's bounding box so the dragon fills the SVG with no extra padding.
   ─────────────────────────────────────────────────────────────────────── */
export function DragonFace({ size, color = "#ffe14d" }: { size: number; color?: string }) {
  return (
    <svg
      viewBox="272 335 467 815"
      width={size}
      height={size * (815 / 467)}
      style={{ display: "block" }}
      aria-hidden="true"
    >
      <path
        fill={color}
        d="M 496.159 337.524 C 494.268 341.720, 482.898 358.923, 475.712 368.460 C 459.488 389.991, 404.143 439.457, 392.399 442.923 C 373.002 448.647, 360.362 461.585, 356.591 479.575 C 354.998 487.172, 354.301 488.037, 340.641 499.341 C 323.809 513.271, 303.247 526, 297.577 526 C 296.426 526, 293.382 524.881, 290.813 523.513 L 286.141 521.026 281.638 526.702 C 274.825 535.291, 271.941 541.664, 271.861 548.303 C 271.717 560.399, 279.015 573.604, 290 581.124 L 295.500 584.889 296.092 579.010 C 297.196 568.038, 301.201 564.926, 311.818 566.790 C 317.846 567.848, 318.598 567.793, 319.500 566.231 C 323.527 559.260, 336.856 550.872, 352.500 545.465 C 359.370 543.091, 362.407 542.652, 374 542.356 C 382.778 542.132, 386.626 542.326, 385 542.911 C 383.625 543.405, 378.675 545.033, 374 546.528 C 357.617 551.768, 340.339 561.669, 325.724 574.193 C 318.331 580.529, 317.922 580.645, 310.094 578.614 L 304.751 577.229 305.395 582.700 C 306.225 589.767, 308.022 593.112, 314.103 598.912 C 322.979 607.379, 338.609 613.878, 350.301 613.964 L 355.102 614 352.559 610.666 C 345.577 601.512, 350.775 590.445, 367.296 579.292 C 383.606 568.282, 400.989 563.025, 421.143 563.008 C 431.694 562.998, 443.713 560.650, 450.771 557.218 C 459.063 553.186, 459.100 552.749, 451.609 547.317 L 445.040 542.553 449.753 540.702 C 457.326 537.727, 462.983 537.438, 467.561 539.792 C 483.580 548.028, 486.278 570.972, 473.921 593.886 C 463.357 613.475, 446.228 629.005, 403.846 657.415 C 352.323 691.953, 331.965 712.368, 316.007 745.500 C 308.955 760.143, 305.033 773.269, 302.414 791 C 302.211 792.375, 302.036 799.702, 302.025 807.282 C 301.985 837.192, 311.929 864.799, 329.632 883.919 C 333.276 887.855, 336.454 890.879, 336.695 890.638 C 336.935 890.398, 335.795 887.058, 334.160 883.216 C 330.517 874.655, 327.202 861.691, 326.435 853 L 325.861 846.500 327.823 850.619 C 341.070 878.431, 371.582 899.863, 404.531 904.500 C 406.714 904.807, 409.437 905.260, 410.583 905.506 C 411.728 905.753, 422.719 906.415, 435.006 906.978 C 476.167 908.865, 492.888 913.480, 507.258 926.923 C 525.110 943.623, 525.272 967.185, 507.653 984.460 C 499.923 992.039, 487.807 998.255, 470.500 1003.519 C 443.020 1011.878, 435.918 1014.421, 424.500 1019.990 C 408.678 1027.707, 396.978 1037.230, 388.802 1049.047 C 387.114 1051.487, 387.105 1051.471, 387.052 1045.934 C 386.945 1034.583, 391.043 1021.690, 398.132 1011.073 L 400.420 1007.646 395.197 1010.489 C 369.799 1024.313, 355.194 1061.164, 362.860 1092.084 C 370.268 1121.962, 391.901 1143.490, 419.500 1148.450 L 423.500 1149.168 419 1145.961 C 391.382 1126.275, 386.658 1092.595, 408.262 1069.404 C 422.066 1054.587, 438.594 1047.825, 477.500 1041.078 C 513.143 1034.897, 528.903 1029.686, 546.027 1018.420 C 571.574 1001.613, 585.417 976.111, 585.341 946 C 585.278 921.328, 578.192 904.332, 560.500 886.421 C 537.856 863.496, 510.925 852.651, 457.500 844.941 C 411.486 838.301, 390.628 822.039, 390.790 792.929 C 390.947 764.978, 409.197 741.981, 459 706.980 C 501.488 677.120, 518.962 660.059, 531.234 636.450 C 534.972 629.259, 539.803 616.815, 540.633 612.242 C 540.886 610.845, 541.422 608.117, 541.825 606.180 L 542.557 602.657 545.745 609.133 C 548.656 615.047, 550.569 621.848, 552.740 634 L 553.544 638.500 556.263 631.218 C 562.782 613.755, 564.330 604.991, 564.339 585.500 C 564.350 562.868, 561.981 551.686, 552.515 529.681 C 551.770 527.948, 551.917 527.937, 555.616 529.463 C 563.274 532.621, 572.596 539.979, 580.374 549.005 L 584.248 553.500 583.579 548.170 C 580.484 523.518, 561.481 491.972, 540.051 475.907 L 536.601 473.322 543.051 470.153 C 550.266 466.608, 563.014 463.361, 573.364 462.432 L 580.227 461.816 577.103 459.916 C 572.094 456.870, 562.887 453.253, 553.871 450.788 C 542.823 447.768, 507.567 447.470, 494.643 450.287 C 483.571 452.701, 483.474 452.529, 493 447.374 C 541.488 421.133, 577.177 381.834, 589.103 341.547 C 590.125 338.094, 590.601 337.638, 580.283 350 C 566.544 366.462, 549.322 381.299, 526.811 396.068 C 512.008 405.780, 480.045 421.797, 467 426.041 C 465.625 426.488, 461.396 428.012, 457.603 429.427 C 453.810 430.842, 450.540 432, 450.337 432 C 450.133 432, 453.180 428.288, 457.107 423.750 C 474.576 403.566, 483.969 388.274, 490.811 368.881 C 494.431 358.620, 498.282 341.318, 497.825 337.365 L 497.500 334.548 496.159 337.524 M 404.469 475.294 C 397.303 478.190, 389.878 481.470, 387.969 482.584 C 384.976 484.330, 373.023 498.346, 373.006 500.130 C 373.003 500.476, 376.262 500.175, 380.250 499.461 C 384.238 498.747, 389.606 497.878, 392.180 497.531 C 398.239 496.712, 401.208 494.273, 406.712 485.593 C 409.186 481.692, 413.056 476.587, 415.313 474.250 C 420.476 468.903, 420.228 468.927, 404.469 475.294 M 611.220 516.135 C 612.049 518.301, 616.732 535.866, 618.384 543 C 621.324 555.703, 622.445 575.009, 621.045 588.830 C 614.914 649.378, 582.388 695.525, 516.728 736.835 C 484.716 756.976, 474.995 764.351, 463.166 777.473 C 457.537 783.718, 447.765 797.098, 448.382 797.715 C 448.511 797.844, 453.090 795.764, 458.558 793.092 C 508.772 768.555, 572.028 772.750, 593.530 802.042 C 597.913 808.012, 602.509 819.376, 603.473 826.628 L 604.154 831.757 607.827 828.351 C 620.954 816.177, 638.481 814.554, 650.423 824.406 C 667.961 838.876, 671.954 879.990, 659.318 916 C 657.871 920.125, 654.193 928.675, 651.145 935 C 648.097 941.325, 645.416 946.950, 645.188 947.500 C 644.960 948.050, 649.580 943.775, 655.455 938 C 702.656 891.606, 732.285 827.436, 738.106 759 C 740.059 736.036, 738.138 703.385, 733.634 683 C 726.563 650.995, 718.121 628.048, 704.754 604.500 C 684.689 569.153, 652.027 535.461, 623 520.168 C 613.865 515.355, 610.478 514.195, 611.220 516.135 M 288.494 541.252 C 286.730 542.769, 285.692 544.876, 285.311 547.715 L 284.746 551.927 288.728 548.213 C 292.282 544.899, 295 541.152, 295 539.566 C 295 538.146, 290.856 539.220, 288.494 541.252 M 640.756 589.794 C 641.429 594.373, 639.165 617.379, 636.993 628.035 C 628.020 672.066, 600.886 710.117, 560.282 735.609 C 549.874 742.143, 550.567 742.301, 564.710 736.616 C 597.696 723.360, 624.829 700.141, 636.235 675.411 L 638.500 670.500 638.828 676 C 640.064 696.723, 634.125 739.952, 626.433 766.227 C 621.187 784.146, 622.170 783.685, 630.369 764.380 C 651.653 714.263, 656.530 656.813, 644.281 600.500 C 641.880 589.462, 639.765 583.036, 640.756 589.794 M 669.007 618.224 C 669.003 618.622, 670.403 622.447, 672.118 626.724 C 676.830 638.474, 682.912 657.596, 687.950 676.500 C 702.235 730.102, 704.093 800.271, 692.398 844.500 C 690.665 851.052, 694.502 841.947, 697.454 832.500 C 703.022 814.682, 705.714 802.425, 708.434 782.500 C 713.248 747.240, 706.745 700.194, 691.881 662.739 C 686.591 649.409, 669.038 615.249, 669.007 618.224"
      />
    </svg>
  );
}
