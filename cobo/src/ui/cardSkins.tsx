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
  backCenter?: "cabo" | "helmet" | "handdrawn" | "royal" | "neon" | "minimalist";
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

  // ── Neon — cyberpunk hex grid back ─────────────────────────────────
  neon: {
    faceBg:
      "repeating-linear-gradient(180deg, #0a0a14 0px, #0a0a14 3px, #0d0d1a 3px, #0d0d1a 4px)",
    faceBorder: "#00e5ff",
    suitColor: { red: "#ff2dca", black: "#00e5ff" },
    font: FONT,
    jesterBg: "#0a0a14",
    backBg:
      "repeating-linear-gradient(180deg, #050510 0px, #050510 3px, #08081a 3px, #08081a 4px)",
    backBorder: "#ff2dca",
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
   <NeonBack /> — cyberpunk hex with cyan/magenta glow.

   Glowing hexagon centerpiece, magenta inner triangle, scanline corners.
   "CABO" rendered with a layered cyan + magenta text-shadow for chromatic
   aberration vibes.
   ─────────────────────────────────────────────────────────────────────── */
export function NeonBack({ w }: { w: number }) {
  const cyan = "#00e5ff";
  const magenta = "#ff2dca";

  return (
    <div style={{
      width: "100%", height: "100%",
      position: "relative",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {/* Corner triangle accents — alternating cyan / magenta */}
      {(
        [
          { pos: { top: 5, left: 5 },    color: cyan,    points: "0,0 8,0 0,8" },
          { pos: { top: 5, right: 5 },   color: magenta, points: "8,0 0,0 8,8" },
          { pos: { bottom: 5, left: 5 }, color: magenta, points: "0,8 8,8 0,0" },
          { pos: { bottom: 5, right: 5 },color: cyan,    points: "8,8 0,8 8,0" },
        ] as const
      ).map((c, i) => (
        <svg key={i} style={{ position: "absolute", ...c.pos }} width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
          <polygon points={c.points} fill={c.color} opacity="0.85" style={{ filter: `drop-shadow(0 0 2px ${c.color})` }} />
        </svg>
      ))}

      {/* Central hex emblem + CABO */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <svg
          viewBox="0 0 100 100"
          width={w * 0.62}
          height={w * 0.62}
          style={{ display: "block" }}
          aria-hidden="true"
        >
          {/* Outer cyan hexagon */}
          <polygon
            points="50,10 84,30 84,70 50,90 16,70 16,30"
            fill="none"
            stroke={cyan}
            strokeWidth="2.2"
            style={{ filter: `drop-shadow(0 0 4px ${cyan})` }}
          />
          {/* Inner magenta triangle */}
          <polygon
            points="50,28 72,64 28,64"
            fill="none"
            stroke={magenta}
            strokeWidth="1.6"
            style={{ filter: `drop-shadow(0 0 3px ${magenta})` }}
          />
          {/* Smaller cyan inverted triangle inside */}
          <polygon
            points="36,40 64,40 50,60"
            fill="none"
            stroke={cyan}
            strokeWidth="1.2"
            opacity="0.7"
          />
          {/* Central dot */}
          <circle cx="50" cy="50" r="2.4" fill={cyan} style={{ filter: `drop-shadow(0 0 3px ${cyan})` }} />
        </svg>

        <div style={{
          fontSize: w * 0.15,
          color: cyan,
          fontWeight: 700,
          letterSpacing: w * 0.04,
          paddingLeft: w * 0.04,  // optical compensation for trailing tracking
          fontFamily: FONT,
          textShadow: `0 0 4px ${cyan}, 1.5px 0 0 ${magenta}, -1.5px 0 0 ${magenta}`,
          lineHeight: 1,
        }}>
          CABO
        </div>
      </div>
    </div>
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
