/**
 * Visual config for every card skin + the inline SVG for the racing-helmet
 * silhouette used by the McLaren tributes (no logos, no trademarks — just
 * colors and a generic helmet shape).
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
  /** Renders the CENTER of the card. By default the suit glyph at 48% w.
   *  Override to render anything (e.g. the McLaren helmet). */
  centerOverride?: "helmet" | null;
  /** Optional SVG pattern URL or inline data: overlay on top of the face
   *  for textural skins (Hand-drawn crosshatch). */
  patternOverlay?: string;
  /** Decorative stripe across the face — used by McLaren Senna's Monaco
   *  green band. `null` = no stripe. */
  faceStripe?: { color: string; startPct: number; endPct: number } | null;
  /** Card back background + border + center logo style. */
  backBg: string;
  backBorder: string;
  /** What to render in the center of the card BACK.
   *   - "cabo": classic CABO wordmark (default)
   *   - "helmet": helmet silhouette (McLaren skins)
   *   - "mono-rank": just a single rank letter in skin color (Minimalist) */
  backCenter?: "cabo" | "helmet" | "monogram";
  /** Color of the "CABO" pill on the back when backCenter === "cabo". */
  caboColor?: string;
  /** Background of the CABO pill on the back. */
  caboPillBg?: string;
  /** Optional sticker on the card back — small badge in a corner. */
  backBadge?: { text: string; color: string; bg: string } | null;
}

const DEFAULT_FONT = "'Fredoka', 'Comic Sans MS', system-ui, sans-serif";

export const SKIN_STYLES: Record<CardSkin, SkinStyle> = {
  classic: {
    faceBg: "#ffd86b",
    faceBorder: "#1c1d2b",
    font: DEFAULT_FONT,
    backBg: "#1c1d2b",
    backBorder: "#ffd86b",
    backCenter: "cabo",
    caboColor: "#1c1d2b",
    caboPillBg: "#ffd86b",
  },

  royal: {
    // Deep velvet red with a subtle radial sheen — looks like a tabletop
    // playing card from a high-end set.
    faceBg:
      "radial-gradient(circle at 30% 18%, rgba(255,221,150,0.18) 0%, transparent 55%), linear-gradient(160deg, #7c1a26 0%, #5b1019 60%, #3d0911 100%)",
    faceBorder: "#d4af37",
    suitColor: { red: "#f4cf5b", black: "#f4cf5b" },
    font: "'Cormorant Garamond', 'Times New Roman', Georgia, serif",
    backBg:
      "radial-gradient(circle at 30% 18%, rgba(255,221,150,0.20) 0%, transparent 60%), linear-gradient(160deg, #7c1a26 0%, #4a0d15 100%)",
    backBorder: "#d4af37",
    backCenter: "cabo",
    caboColor: "#7c1a26",
    caboPillBg: "#d4af37",
  },

  neon: {
    // Pure black with a subtle scan-line — the cyan/magenta glow comes
    // from the box-shadow on `.card-skin-neon` in App.css.
    faceBg:
      "repeating-linear-gradient(180deg, #0a0a14 0px, #0a0a14 3px, #0d0d1a 3px, #0d0d1a 4px)",
    faceBorder: "#00e5ff",
    suitColor: { red: "#ff2dca", black: "#00e5ff" },
    font: "'JetBrains Mono', 'Menlo', 'Consolas', monospace",
    backBg:
      "repeating-linear-gradient(180deg, #050510 0px, #050510 3px, #08081a 3px, #08081a 4px)",
    backBorder: "#ff2dca",
    backCenter: "cabo",
    caboColor: "#0a0a14",
    caboPillBg: "#00e5ff",
  },

  handdrawn: {
    faceBg: "#f3ead4",
    faceBorder: "#262220",
    suitColor: { red: "#262220", black: "#262220" }, // single-ink sketch
    font: "'Caveat', 'Patrick Hand', 'Bradley Hand', cursive",
    patternOverlay:
      // Inline SVG crosshatch — diagonal pen strokes at 35° and 145°.
      // Used as a CSS background image with very low opacity.
      `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14'><g stroke='%23262220' stroke-width='0.7' opacity='0.16'><line x1='0' y1='14' x2='14' y2='0'/><line x1='-7' y1='7' x2='7' y2='-7'/><line x1='7' y1='21' x2='21' y2='7'/></g></svg>")`,
    backBg: "#e8dcb8",
    backBorder: "#262220",
    backCenter: "cabo",
    caboColor: "#262220",
    caboPillBg: "#f3ead4",
  },

  minimalist: {
    faceBg: "#ffffff",
    faceBorder: "#0a0a0a",
    suitColor: { red: "#0a0a0a", black: "#0a0a0a" },
    font: "'Inter Tight', 'Helvetica Neue', system-ui, sans-serif",
    backBg: "#ffffff",
    backBorder: "#0a0a0a",
    backCenter: "monogram", // just a single big rank-less mark
    caboColor: "#0a0a0a",
    caboPillBg: "#ffffff",
  },

  mclaren_papaya: {
    // Iconic McLaren papaya orange.
    faceBg:
      "radial-gradient(circle at 50% 12%, rgba(255,255,255,0.12) 0%, transparent 55%), linear-gradient(160deg, #ff8000 0%, #ee6a00 100%)",
    faceBorder: "#0a0a0a",
    suitColor: { red: "#0a0a0a", black: "#0a0a0a" },
    font: "'Barlow Condensed', 'Oswald', 'Arial Narrow', sans-serif",
    centerOverride: "helmet",
    backBg:
      "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.10) 0%, transparent 55%), linear-gradient(160deg, #ff8000 0%, #d65a00 100%)",
    backBorder: "#0a0a0a",
    backCenter: "helmet",
  },

  mclaren_senna: {
    // Senna Monaco '24 livery: yellow base, green stripe, blue accents.
    faceBg:
      "radial-gradient(circle at 50% 8%, rgba(255,255,255,0.12) 0%, transparent 50%), linear-gradient(160deg, #ffdd00 0%, #f5cf00 100%)",
    faceBorder: "#002776",
    suitColor: { red: "#002776", black: "#002776" },
    font: "'Barlow Condensed', 'Oswald', 'Arial Narrow', sans-serif",
    centerOverride: "helmet",
    // Green stripe across the bottom third of the card — the unmistakable
    // band from the Monaco helmet/livery.
    faceStripe: { color: "#009739", startPct: 70, endPct: 86 },
    backBg:
      "linear-gradient(180deg, #ffdd00 0%, #ffdd00 64%, #009739 64%, #009739 80%, #ffdd00 80%, #ffdd00 100%)",
    backBorder: "#002776",
    backCenter: "helmet",
    backBadge: { text: "1", color: "#ffdd00", bg: "#002776" },
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   <HelmetIcon /> — generic racing-helmet silhouette.

   No logos, no McLaren wordmark. The helmet is drawn at viewBox 100×100;
   pass `size` to scale.  `visorBg` controls the visor inset color (used so
   the visor appears as a colored "window" against the helmet shell — pass
   the underlying card bg color and it looks like a knockout).
   ─────────────────────────────────────────────────────────────────────── */
export function HelmetIcon({
  size,
  shellColor = "#0a0a0a",
  visorBg = "#ff8000",
  highlightColor = "rgba(255,255,255,0.6)",
}: {
  size: number;
  shellColor?: string;
  visorBg?: string;
  highlightColor?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ display: "block" }}
      aria-hidden="true"
    >
      {/* Soft drop shadow underneath */}
      <ellipse cx="50" cy="86" rx="28" ry="3.2" fill="rgba(0,0,0,0.25)" />

      {/* Helmet shell — rounded racing form with slight rear bulge */}
      <path
        d="M 50 12
           C 28 12, 14 28, 14 52
           C 14 64, 18 74, 26 78
           L 30 80
           L 70 80
           L 74 78
           C 82 74, 86 64, 86 52
           C 86 28, 72 12, 50 12 Z"
        fill={shellColor}
      />

      {/* Subtle top highlight band to give the shell volume */}
      <path
        d="M 28 24 Q 50 14 72 24 Q 70 30 50 30 Q 30 30 28 24 Z"
        fill="rgba(255,255,255,0.10)"
      />

      {/* Visor — wraps low across the brow */}
      <path
        d="M 20 44
           C 22 38, 30 36, 42 36
           L 60 36
           C 72 36, 80 40, 80 46
           L 78 52
           C 73 56, 64 58, 50 58
           C 36 58, 27 56, 22 52 Z"
        fill={visorBg}
      />

      {/* Inner visor frame — thin dark line giving the visor edge definition */}
      <path
        d="M 20 44
           C 22 38, 30 36, 42 36
           L 60 36
           C 72 36, 80 40, 80 46"
        stroke={shellColor}
        strokeWidth="1.6"
        fill="none"
      />

      {/* Visor reflection — single highlight stroke top of the visor */}
      <path
        d="M 28 42 Q 50 39 72 42"
        stroke={highlightColor}
        strokeWidth="1.4"
        fill="none"
        opacity="0.85"
        strokeLinecap="round"
      />

      {/* Chin guard — small rectangle at the bottom front */}
      <path
        d="M 36 78 L 64 78 L 62 84 L 38 84 Z"
        fill={shellColor}
      />
      <rect x="42" y="78" width="16" height="1.5" fill="rgba(255,255,255,0.20)" />
    </svg>
  );
}
