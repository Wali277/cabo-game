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
  /** 3px border color around the face. */
  faceBorder: string;
  /** Per-suit color override applied to corner rank, corner glyph,
   *  center glyph. `undefined` = use the default red/black behaviour. */
  suitColor?: { red: string; black: string };
  /** Font stack for the rank corners + center glyph. */
  font?: string;
  /** Card back style — which renderer to use for the centre logo. */
  backCenter?: "cabo" | "helmet" | "handdrawn";
  /** Card back background + border. */
  backBg: string;
  backBorder: string;
  /** Color of the "CABO" pill on the back when backCenter === "cabo". */
  caboColor?: string;
  /** Background of the CABO pill on the back. */
  caboPillBg?: string;
  /** Optional sticker on the card back — small badge in a corner. */
  backBadge?: { text: string; color: string; bg: string } | null;
  /** Optional inline SVG pattern overlay for the FACE (Hand-drawn crosshatch). */
  patternOverlay?: string;
  /** Same pattern overlay applied to the BACK (Hand-drawn). */
  backPatternOverlay?: string;
}

// All text on every skin now uses Fredoka — the user's request for
// "use the same font as on the classic". This keeps the project's
// single self-hosted font family in play (no Google Fonts hop) and
// lets each skin earn its personality through color/effects, not type.
const FONT = "'Fredoka', 'Fredoka One', system-ui, sans-serif";

/** Inline SVG crosshatch — diagonal pen strokes for the Hand-drawn skin. */
const CROSSHATCH = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14'><g stroke='%23262220' stroke-width='0.7' opacity='0.20'><line x1='0' y1='14' x2='14' y2='0'/><line x1='-7' y1='7' x2='7' y2='-7'/><line x1='7' y1='21' x2='21' y2='7'/></g></svg>")`;

export const SKIN_STYLES: Record<CardSkin, SkinStyle> = {
  // ── Classic — current yellow + black ───────────────────────────────
  classic: {
    faceBg: "#ffd86b",
    faceBorder: "#1c1d2b",
    font: FONT,
    backBg: "#1c1d2b",
    backBorder: "#ffd86b",
    backCenter: "cabo",
    caboColor: "#1c1d2b",
    caboPillBg: "#ffd86b",
  },

  // ── Royal — deep velvet red with gold gilt suits + gold border ─────
  royal: {
    faceBg:
      "radial-gradient(circle at 30% 18%, rgba(255,221,150,0.20) 0%, transparent 55%), linear-gradient(160deg, #7c1a26 0%, #5b1019 60%, #3d0911 100%)",
    faceBorder: "#d4af37",
    suitColor: { red: "#f4cf5b", black: "#f4cf5b" },
    font: FONT,
    backBg:
      "radial-gradient(circle at 30% 18%, rgba(255,221,150,0.22) 0%, transparent 60%), linear-gradient(160deg, #7c1a26 0%, #4a0d15 100%)",
    backBorder: "#d4af37",
    backCenter: "cabo",
    caboColor: "#7c1a26",
    caboPillBg: "#d4af37",
  },

  // ── Neon — cyber black with cyan/magenta glow ──────────────────────
  neon: {
    faceBg:
      "repeating-linear-gradient(180deg, #0a0a14 0px, #0a0a14 3px, #0d0d1a 3px, #0d0d1a 4px)",
    faceBorder: "#00e5ff",
    suitColor: { red: "#ff2dca", black: "#00e5ff" },
    font: FONT,
    backBg:
      "repeating-linear-gradient(180deg, #050510 0px, #050510 3px, #08081a 3px, #08081a 4px)",
    backBorder: "#ff2dca",
    backCenter: "cabo",
    caboColor: "#0a0a14",
    caboPillBg: "#00e5ff",
  },

  // ── Hand-drawn — sketched ink with crosshatch on BOTH face & back ──
  handdrawn: {
    faceBg: "#f3ead4",
    faceBorder: "#262220",
    suitColor: { red: "#262220", black: "#262220" },
    font: FONT,
    patternOverlay: CROSSHATCH,
    backBg:
      "linear-gradient(160deg, #f5ecd5 0%, #ede0bd 100%)",
    backBorder: "#262220",
    backCenter: "handdrawn",
    backPatternOverlay: CROSSHATCH,
  },

  // ── Minimalist — pure black-and-white version of Classic ───────────
  // Same layout as Classic: rank corners with suit glyph, big center
  // suit. Just stripped to monochrome — no red/black, no yellow.
  minimalist: {
    faceBg: "#ffffff",
    faceBorder: "#0a0a0a",
    suitColor: { red: "#0a0a0a", black: "#0a0a0a" },
    font: FONT,
    backBg: "#0a0a0a",
    backBorder: "#ffffff",
    backCenter: "cabo",
    caboColor: "#0a0a0a",
    caboPillBg: "#ffffff",
  },

  // ── McLaren Papaya — orange + black, helmet ONLY on back ───────────
  // Face is a normal playing card with black suits/ranks on papaya
  // orange. Helmet silhouette dominates the back.
  mclaren_papaya: {
    faceBg:
      // Sleek papaya: vertical gradient with a soft top highlight and a
      // bottom shadow so the card has subtle "race livery" depth.
      "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.22) 0%, transparent 55%), radial-gradient(circle at 50% 100%, rgba(0,0,0,0.15) 0%, transparent 60%), linear-gradient(160deg, #ff8a14 0%, #ff8000 50%, #e16a00 100%)",
    faceBorder: "#0a0a0a",
    suitColor: { red: "#0a0a0a", black: "#0a0a0a" },
    font: FONT,
    backBg:
      // Slightly more saturated for the back so the helmet pops harder.
      "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.22) 0%, transparent 60%), radial-gradient(circle at 50% 110%, rgba(0,0,0,0.30) 0%, transparent 65%), linear-gradient(160deg, #ff8a14 0%, #ff8000 55%, #d96500 100%)",
    backBorder: "#0a0a0a",
    backCenter: "helmet",
  },

  // ── McLaren Senna Monaco '24 — yellow / green / blue tribute ───────
  mclaren_senna: {
    faceBg:
      // Yellow base with a subtle top sheen — kept clean so the blue
      // suits read crisp.
      "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.28) 0%, transparent 50%), linear-gradient(160deg, #ffe533 0%, #ffdd00 40%, #f0cc00 100%)",
    faceBorder: "#002776",
    suitColor: { red: "#002776", black: "#002776" },
    font: FONT,
    // Layered horizontal bands evoke the Monaco livery: a thin blue
    // racing line near the top, a green band lower on the card, with
    // yellow dominating the rest.
    backBg:
      "linear-gradient(180deg, #ffdd00 0%, #ffdd00 16%, #002776 16%, #002776 20%, #ffdd00 20%, #ffdd00 70%, #009739 70%, #009739 82%, #ffdd00 82%, #ffdd00 100%)",
    backBorder: "#002776",
    backCenter: "helmet",
    backBadge: { text: "1", color: "#ffdd00", bg: "#002776" },
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   <HelmetIcon /> — generic racing-helmet silhouette.

   Side-profile racing helmet with an L-shaped visor opening carved into
   the lower-left. No logos, no McLaren wordmark. The path is taken from
   a public SVG (CC0/no-trademark) the user provided, and rendered as a
   single fill in `shellColor` (default black). The visor area is a notch
   in the outline itself, so whatever sits behind the SVG shows through.
   ─────────────────────────────────────────────────────────────────────── */
export function HelmetIcon({
  size,
  shellColor = "#0a0a0a",
}: {
  size: number;
  shellColor?: string;
}) {
  // Original viewBox 512×512. Path content actually extends slightly
  // outside (x reaches ~530), so we widen the viewBox to 540×480 with a
  // hair of margin and the SVG renders cleanly without clipping.
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
   <HandDrawnBack /> — full back design for the Hand-drawn skin.

   Cream paper background with crosshatch (added by Card.tsx as a pattern
   overlay layer), centre "CABO" sketched-style wordmark with a wavy
   underline, plus four small doodles in the corners so the back feels
   like a notebook scribble rather than the usual pill.
   ─────────────────────────────────────────────────────────────────────── */
export function HandDrawnBack({ w }: { w: number }) {
  const ink = "#262220";

  return (
    <div
      style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative",
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
        {/* Top-left flourish: tiny spiral */}
        <path
          d="M 14 14 q 5 -5 8 1 q -2 6 -6 2 q -1 -3 3 -3"
          stroke={ink} strokeWidth="1.2" fill="none" strokeLinecap="round"
          opacity="0.7"
        />
        {/* Top-right star */}
        <g stroke={ink} strokeWidth="1.1" fill="none" strokeLinecap="round" opacity="0.7">
          <line x1="84" y1="12" x2="84" y2="22" />
          <line x1="79" y1="17" x2="89" y2="17" />
          <line x1="80.5" y1="13.5" x2="87.5" y2="20.5" />
          <line x1="87.5" y1="13.5" x2="80.5" y2="20.5" />
        </g>
        {/* Bottom-left heart */}
        <path
          d="M 14 128 q -3 -4 0 -6 q 3 -2 4 1 q 1 -3 4 -1 q 3 2 0 6 q -3 4 -4 5 q -1 -1 -4 -5 z"
          fill={ink} opacity="0.6"
        />
        {/* Bottom-right dot cluster */}
        <g fill={ink} opacity="0.65">
          <circle cx="83" cy="128" r="1.6" />
          <circle cx="88" cy="131" r="1.1" />
          <circle cx="80" cy="133" r="1" />
        </g>
      </svg>

      {/* CABO sketched wordmark, slightly rotated */}
      <div
        style={{
          transform: "rotate(-6deg)",
          textAlign: "center",
          color: ink,
        }}
      >
        <div
          style={{
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontWeight: 900,
            fontSize: w * 0.34,
            letterSpacing: 2,
            lineHeight: 1,
            textShadow: "1px 1px 0 rgba(0,0,0,0.06)",
          }}
        >
          CABO
        </div>
        {/* Wavy hand-drawn underline */}
        <svg
          viewBox="0 0 80 10"
          style={{ width: w * 0.7, height: w * 0.12, marginTop: 2 }}
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
