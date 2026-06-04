/**
 * Visual config for every card skin + the inline SVG for the racing-helmet
 * silhouette used by the McLaren tributes (no logos, no trademarks — just
 * colors and a generic helmet shape based on a side-profile racing helmet).
 *
 * Each skin describes how its FACE and BACK should look. `Card.tsx` reads
 * `useCardSkin()` and pulls the matching record from here. Adding a new skin
 * is: one entry in `SKIN_STYLES` here + one entry in `cardskin.ts`.
 */
import type { CardSkin } from "../state/cardskin";
import neonBack from "../assets/neon-back.png";

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
  /** Card back style — which renderer to use. */
  backCenter?: "cabo" | "helmet" | "handdrawn" | "royal" | "neon" | "minimalist" | "evolved";
  /** Card back background. */
  backBg: string;
  backBorder: string;
  /** Back border width in px. Default 3. */
  backBorderWidth?: number;
  /** Color of the "CABO" pill on the back when backCenter === "cabo". */
  caboColor?: string;
  /** Background of the CABO pill on the back. */
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

/** Hand-drawn crosshatch overlay (diagonal pen strokes). */
const CROSSHATCH = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14'><g stroke='%23262220' stroke-width='0.7' opacity='0.20'><line x1='0' y1='14' x2='14' y2='0'/><line x1='-7' y1='7' x2='7' y2='-7'/><line x1='7' y1='21' x2='21' y2='7'/></g></svg>")`;

/** Carbon-fibre pinstripe pattern overlay — diagonal weave. */
const CARBON_PINSTRIPE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'><g stroke='%23000' stroke-width='0.4' opacity='0.18'><line x1='0' y1='8' x2='8' y2='0'/><line x1='-4' y1='4' x2='4' y2='-4'/><line x1='4' y1='12' x2='12' y2='4'/></g></svg>")`;

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

  // ── Royal — deep velvet with crown & gold filigree back ────────────
  royal: {
    faceBg:
      "radial-gradient(circle at 30% 18%, rgba(255,221,150,0.20) 0%, transparent 55%), linear-gradient(160deg, #7c1a26 0%, #5b1019 60%, #3d0911 100%)",
    faceBorder: "#d4af37",
    suitColor: { red: "#f4cf5b", black: "#f4cf5b" },
    font: FONT,
    jesterBg: "#7c1a26",
    backBg:
      "radial-gradient(circle at 30% 18%, rgba(255,221,150,0.22) 0%, transparent 60%), linear-gradient(160deg, #7c1a26 0%, #4a0d15 100%)",
    backBorder: "#d4af37",
    backCenter: "royal",
  },

  // ── Neon — player's pink/cyan "lightning CABO" art (back) + neon faces ─
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

  // ── Hand-drawn — sketched ink with crosshatch on BOTH face & back ──
  handdrawn: {
    faceBg: "#f3ead4",
    faceBorder: "#262220",
    suitColor: { red: "#262220", black: "#262220" },
    font: FONT,
    jesterBg: "#f3ead4",
    patternOverlay: CROSSHATCH,
    backBg:
      "linear-gradient(160deg, #f5ecd5 0%, #ede0bd 100%)",
    backBorder: "#262220",
    backCenter: "handdrawn",
    backPatternOverlay: CROSSHATCH,
  },

  // ── Minimalist — pure black & white, modernist diamond back ────────
  minimalist: {
    faceBg: "#ffffff",
    faceBorder: "#0a0a0a",
    suitColor: { red: "#0a0a0a", black: "#0a0a0a" },
    font: FONT,
    jesterBg: "#ffffff",
    backBg: "#ffffff",
    backBorder: "#0a0a0a",
    backCenter: "minimalist",
  },

  // ── McLaren Papaya — thicker border + pinstripe + top racing band ──
  mclaren_papaya: {
    faceBg:
      "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.22) 0%, transparent 55%), radial-gradient(circle at 50% 100%, rgba(0,0,0,0.15) 0%, transparent 60%), linear-gradient(160deg, #ff8a14 0%, #ff8000 50%, #e16a00 100%)",
    faceBorder: "#0a0a0a",
    faceBorderWidth: 5,
    suitColor: { red: "#0a0a0a", black: "#0a0a0a" },
    font: FONT,
    jesterBg: "#ff8000",
    patternOverlay: CARBON_PINSTRIPE,
    backBg:
      "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.22) 0%, transparent 60%), radial-gradient(circle at 50% 110%, rgba(0,0,0,0.30) 0%, transparent 65%), linear-gradient(160deg, #ff8a14 0%, #ff8000 55%, #d96500 100%)",
    backBorder: "#0a0a0a",
    backBorderWidth: 5,
    backCenter: "helmet",
  },

  // ── McLaren Senna Monaco '24 — yellow / green / blue tribute ───────
  mclaren_senna: {
    faceBg:
      "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.28) 0%, transparent 50%), linear-gradient(160deg, #ffe533 0%, #ffdd00 40%, #f0cc00 100%)",
    faceBorder: "#002776",
    faceBorderWidth: 5,
    suitColor: { red: "#002776", black: "#002776" },
    font: FONT,
    jesterBg: "#ffdd00",
    backBg:
      "linear-gradient(180deg, #ffdd00 0%, #ffdd00 16%, #002776 16%, #002776 20%, #ffdd00 20%, #ffdd00 70%, #009739 70%, #009739 82%, #ffdd00 82%, #ffdd00 100%)",
    backBorder: "#002776",
    backBorderWidth: 5,
    backCenter: "helmet",
    backBadge: { text: "1", color: "#ffdd00", bg: "#002776" },
  },

  // ── Cabo Evolved — unified sleek black + banana-yellow identity (both sides).
  //    Face: black field, banana rank/suit glyphs. Back ("Charge Line"): black
  //    field, banana CABO wordmark, a lightning-bolt divider, tracked EVOLVED.
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
   <HandDrawnBack /> — sketched notebook page (centring tightened).

   Reduced font size, letter spacing, rotation angle, and underline width
   so even on the smallest preview card (w=56) nothing kisses the edge.
   ─────────────────────────────────────────────────────────────────────── */
export function HandDrawnBack({ w }: { w: number }) {
  const ink = "#262220";

  return (
    <div
      style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative",
        padding: 4,
      }}
    >
      {/* Small doodles around the corners */}
      <svg
        viewBox="0 0 100 145"
        preserveAspectRatio="none"
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >
        <path
          d="M 14 14 q 5 -5 8 1 q -2 6 -6 2 q -1 -3 3 -3"
          stroke={ink} strokeWidth="1.2" fill="none" strokeLinecap="round"
          opacity="0.7"
        />
        <g stroke={ink} strokeWidth="1.1" fill="none" strokeLinecap="round" opacity="0.7">
          <line x1="84" y1="12" x2="84" y2="22" />
          <line x1="79" y1="17" x2="89" y2="17" />
          <line x1="80.5" y1="13.5" x2="87.5" y2="20.5" />
          <line x1="87.5" y1="13.5" x2="80.5" y2="20.5" />
        </g>
        <path
          d="M 14 128 q -3 -4 0 -6 q 3 -2 4 1 q 1 -3 4 -1 q 3 2 0 6 q -3 4 -4 5 q -1 -1 -4 -5 z"
          fill={ink} opacity="0.6"
        />
        <g fill={ink} opacity="0.65">
          <circle cx="83" cy="128" r="1.6" />
          <circle cx="88" cy="131" r="1.1" />
          <circle cx="80" cy="133" r="1" />
        </g>
      </svg>

      <div
        style={{
          transform: "rotate(-4deg)",
          textAlign: "center",
          color: ink,
          maxWidth: "82%",
        }}
      >
        <div
          style={{
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontWeight: 900,
            fontSize: w * 0.27,
            letterSpacing: 1,
            lineHeight: 1,
            textShadow: "1px 1px 0 rgba(0,0,0,0.06)",
          }}
        >
          CABO
        </div>
        <svg
          viewBox="0 0 80 10"
          style={{ width: w * 0.5, height: w * 0.08, marginTop: 3 }}
          aria-hidden="true"
        >
          <path
            d="M 2 5 Q 12 1, 22 5 T 42 5 T 62 5 T 78 5"
            stroke={ink}
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   <RoyalBack /> — gilt crown + filigree inner frame.

   Velvet red base (from skin.backBg) plus an inset 1.5px gold frame with
   small fleur-de-lis cap ornaments, a centred crown in gold with red
   jewels, and "CABO" beneath in spaced gold letters. Reads like an
   heirloom playing card from a baroque set.
   ─────────────────────────────────────────────────────────────────────── */
export function RoyalBack({ w }: { w: number }) {
  const gold = "#d4af37";
  const goldLight = "#f0d674";
  const velvet = "#7c1a26";

  return (
    <div style={{
      width: "100%", height: "100%",
      position: "relative",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {/* Gold inner frame */}
      <div style={{
        position: "absolute",
        inset: 5,
        border: `1.5px solid ${gold}`,
        borderRadius: 7,
        pointerEvents: "none",
        boxShadow: `inset 0 0 0 0.5px rgba(244,207,91,0.4)`,
      }} />

      {/* Corner fleur-de-lis dots */}
      {(["tl", "tr", "bl", "br"] as const).map((corner) => {
        const pos: React.CSSProperties =
          corner === "tl" ? { top: 9, left: 9 } :
          corner === "tr" ? { top: 9, right: 9 } :
          corner === "bl" ? { bottom: 9, left: 9 } :
                            { bottom: 9, right: 9 };
        return (
          <svg
            key={corner}
            viewBox="0 0 10 10"
            width={Math.max(7, w * 0.10)}
            height={Math.max(7, w * 0.10)}
            style={{ position: "absolute", ...pos }}
          >
            {/* Simple fleur-de-lis: three teardrop petals from a center point */}
            <path d="M 5 1 C 3 3, 3 5, 5 6 C 7 5, 7 3, 5 1 Z" fill={gold} />
            <path d="M 1.5 4 C 2.5 5, 4 6, 5 6 C 4 6.5, 2.5 6.5, 1.5 4 Z" fill={gold} />
            <path d="M 8.5 4 C 7.5 5, 6 6, 5 6 C 6 6.5, 7.5 6.5, 8.5 4 Z" fill={gold} />
            <circle cx="5" cy="6.5" r="0.8" fill={gold} />
          </svg>
        );
      })}

      {/* Central crown */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, transform: "translateY(-4%)" }}>
        <svg
          viewBox="0 0 100 60"
          width={w * 0.62}
          height={w * 0.37}
          style={{ display: "block", filter: `drop-shadow(0 1px 1px rgba(0,0,0,0.4))` }}
        >
          {/* Crown band */}
          <path d="M 18 38 L 82 38 L 78 48 L 22 48 Z" fill={gold} />
          {/* Three pointed spikes with cross at top centre */}
          <path
            d="M 18 38 L 26 22 L 33 34 L 42 14 L 50 30 L 58 14 L 67 34 L 74 22 L 82 38 Z"
            fill={gold}
            stroke={goldLight}
            strokeWidth="0.6"
          />
          {/* Small cross on top of centre spike */}
          <rect x="48.5" y="6" width="3" height="9" fill={gold} />
          <rect x="46" y="9" width="8" height="3" fill={gold} />
          {/* Jewels */}
          <circle cx="50" cy="43" r="2.6" fill={velvet} stroke={goldLight} strokeWidth="0.5" />
          <circle cx="34" cy="43" r="1.6" fill={velvet} />
          <circle cx="66" cy="43" r="1.6" fill={velvet} />
          {/* Jewel sparkles at spike tips */}
          <circle cx="26" cy="23" r="1.3" fill={velvet} />
          <circle cx="74" cy="23" r="1.3" fill={velvet} />
          <circle cx="42" cy="16" r="1.3" fill={velvet} />
          <circle cx="58" cy="16" r="1.3" fill={velvet} />
        </svg>

        <div style={{
          fontSize: w * 0.16,
          color: gold,
          fontWeight: 700,
          letterSpacing: w * 0.05,
          paddingLeft: w * 0.05,  // compensate for trailing letter-spacing
          fontFamily: FONT,
          textShadow: `0 1px 1px rgba(0,0,0,0.5), 0 0 4px rgba(212,175,55,0.3)`,
          lineHeight: 1,
        }}>
          CABO
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   <NeonBack /> — the player's neon "lightning CABO" artwork.

   The card back is the uploaded image, stretched to fill the card (the chosen
   "fill" fit). Imported via Vite so the URL resolves correctly in both the web
   build (absolute "/") and the Electron file:// build ("./").
   ─────────────────────────────────────────────────────────────────────── */
export function NeonBack(_props: { w: number }) {
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
   <MinimalistBack /> — modernist diamond + thin frame.

   White card with a thin 1px black inset frame, a single black diamond
   (rotated square) at the centre, and a small wide-tracked "cabo" in
   light grey at the bottom edge. Bauhaus restraint.
   ─────────────────────────────────────────────────────────────────────── */
export function MinimalistBack({ w }: { w: number }) {
  const ink = "#0a0a0a";
  const ghost = "#9a9a9a";

  return (
    <div style={{
      width: "100%", height: "100%",
      position: "relative",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {/* Thin inset frame */}
      <div style={{
        position: "absolute",
        inset: 4,
        border: `1px solid ${ink}`,
        borderRadius: 7,
        pointerEvents: "none",
      }} />

      {/* Central diamond */}
      <div style={{
        width: w * 0.22,
        height: w * 0.22,
        background: ink,
        transform: "rotate(45deg) translateY(-6%)",
      }} />

      {/* Bottom-edge cabo wordmark, lowercase, very small */}
      <div style={{
        position: "absolute",
        bottom: w * 0.11,
        fontSize: w * 0.09,
        color: ghost,
        fontWeight: 500,
        letterSpacing: w * 0.04,
        paddingLeft: w * 0.04,
        fontFamily: FONT,
        textTransform: "lowercase",
      }}>
        cabo
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   <EvolvedBack /> — Cabo Evolved back ("Charge Line").

   Banana-yellow on the black field (skin.backBg), matching the card face:
   a centred CABO wordmark, a lightning-bolt divider (rule · bolt · rule),
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
        CABO
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
   <DragonFace /> — the Cabo Evolved Dragon (rank "D").

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
