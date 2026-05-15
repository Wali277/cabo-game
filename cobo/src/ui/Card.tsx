import { motion } from "framer-motion";
import type { Card as CardT } from "../engine/types";

interface Props {
  card?: CardT | null;
  faceUp: boolean;
  highlight?: "selectable" | "selected" | "winner" | "lost" | null;
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
  flipDuration?: number;
  shake?: boolean;
  layoutId?: string;
}

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const SUIT_COLOR: Record<string, string> = {
  S: "#1c1d2b",
  C: "#1c1d2b",
  H: "#e23a5e",
  D: "#e23a5e",
};

export function CardView({
  card,
  faceUp,
  highlight,
  onClick,
  size = "md",
  flipDuration = 0.5,
  shake = false,
  layoutId,
}: Props) {
  const w = size === "sm" ? 56 : size === "md" ? 80 : 110;
  const h = Math.round(w * 1.45);

  const isHl = highlight === "selectable" || highlight === "selected";

  return (
    <motion.div
      layoutId={layoutId}
      className={`card-wrap ${isHl ? "hl" : ""} ${highlight ?? ""}`}
      style={{
        width: w,
        height: h,
        cursor: onClick ? "pointer" : "default",
        perspective: 800,
      }}
      onClick={onClick}
      animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : {}}
      whileHover={onClick ? { y: -6, scale: 1.04 } : {}}
      transition={{
        layout: { type: "spring", stiffness: 110, damping: 18, mass: 1.1 },
        default: { type: "spring", stiffness: 300, damping: 24 },
      }}
    >
      <motion.div
        className="card-inner"
        initial={{ rotateY: faceUp ? 0 : 180 }}
        animate={{ rotateY: faceUp ? 0 : 180 }}
        transition={{ duration: flipDuration, type: "spring", stiffness: 160, damping: 18 }}
        style={{ width: "100%", height: "100%", transformStyle: "preserve-3d", position: "relative" }}
      >
        <CardFace card={card} w={w} h={h} />
        <CardBack w={w} h={h} />
      </motion.div>
    </motion.div>
  );
}

function CardFace({ card, w, h }: { card?: CardT | null; w: number; h: number }) {
  if (!card) {
    return (
      <div
        className="card-face"
        style={{
          width: w, height: h, position: "absolute", inset: 0,
          backfaceVisibility: "hidden",
          background: "#ffd86b",
          borderRadius: 12, border: "3px solid #1c1d2b",
        }}
      />
    );
  }

  // Joker — same yellow/black card design, jester face SVG in centre
  if (card.rank === "Joker") {
    const isRed = card.suit === "H" || card.suit === "D";
    const faceColor = isRed ? "#e23a5e" : "#1c1d2b";
    const jesterSize = w * 0.48;
    return (
      <div
        className="card-face"
        style={{
          width: w, height: h, position: "absolute", inset: 0,
          backfaceVisibility: "hidden",
          background: "#ffd86b",
          borderRadius: 12,
          border: "3px solid #1c1d2b",
          boxShadow: "0 6px 18px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "6px 8px",
          overflow: "hidden",
          fontFamily: "'Fredoka', 'Comic Sans MS', system-ui, sans-serif",
          color: faceColor,
        }}
      >
        {/* Top-left corner: just the "J" — matches reference */}
        <div style={{ fontSize: w * 0.26, lineHeight: 1, fontWeight: 800 }}>
          J
        </div>

        {/* Centre: jester face */}
        <div style={{ alignSelf: "center" }}>
          <JesterFace size={jesterSize} color={faceColor} />
        </div>

        {/* Bottom-right corner: rotated "J" */}
        <div style={{
          alignSelf: "flex-end",
          transform: "rotate(180deg)",
          fontSize: w * 0.26,
          lineHeight: 1,
          fontWeight: 800,
        }}>
          J
        </div>
      </div>
    );
  }

  const color = SUIT_COLOR[card.suit];
  const glyph = SUIT_GLYPH[card.suit];
  return (
    <div
      className="card-face"
      style={{
        width: w, height: h, position: "absolute", inset: 0,
        backfaceVisibility: "hidden",
        background: "#ffd86b",
        borderRadius: 12,
        border: `3px solid #1c1d2b`,
        boxShadow: "0 6px 18px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "6px 8px",
        overflow: "hidden",
        fontFamily: "'Fredoka', 'Comic Sans MS', system-ui, sans-serif",
        color,
      }}
    >
      {/* Top-left corner */}
      <div style={{ fontSize: w * 0.22, lineHeight: 1, fontWeight: 700 }}>
        {card.rank}
        <div style={{ fontSize: w * 0.17, lineHeight: 1 }}>{glyph}</div>
      </div>

      {/* Centre suit glyph */}
      <div
        style={{
          alignSelf: "center",
          fontSize: w * 0.48,
          lineHeight: 1,
          textShadow: `1px 2px 0 rgba(0,0,0,0.12)`,
        }}
      >
        {glyph}
      </div>

      {/* Bottom-right corner: rotated */}
      <div
        style={{
          alignSelf: "flex-end",
          transform: "rotate(180deg)",
          fontSize: w * 0.22,
          lineHeight: 1,
          fontWeight: 700,
        }}
      >
        {card.rank}
        <div style={{ fontSize: w * 0.17, lineHeight: 1 }}>{glyph}</div>
      </div>
    </div>
  );
}

/**
 * Inline SVG jester face — flat-icon style matching the reference design.
 *
 * Construction (drawn back-to-front so later elements layer on top):
 *   1. Two side "horn" peaks that swoop outward and downward, each ending in
 *      a bell circle (the floppy jester tendrils).
 *   2. A balloon-shaped centre peak rising straight up, capped with a bell.
 *   3. A rounded "cap" dome that ties the three peaks together over the head.
 *   4. A yellow face circle that "punches out" the face area.
 *   5. Two closed crescent-shaped smiling eyes.
 *   6. A wide upturned smile.
 *   7. A jagged 5-point downward-fanning collar at the chin.
 */
function JesterFace({ size, color }: { size: number; color: string }) {
  const bg = "#ffd86b"; // card background — yellow cutout for face
  return (
    <svg
      viewBox="0 0 100 110"
      width={size}
      height={size * 1.1}
      style={{ display: "block" }}
    >
      {/* ── Left horn: sweeps up-and-out from cap, droops down to bell ── */}
      <path
        d="M 33 38 Q 4 30 12 58 Q 22 56 33 44 Z"
        fill={color}
      />
      <circle cx="10" cy="58" r="5" fill={color} />

      {/* ── Right horn: mirror of left ── */}
      <path
        d="M 67 38 Q 96 30 88 58 Q 78 56 67 44 Z"
        fill={color}
      />
      <circle cx="90" cy="58" r="5" fill={color} />

      {/* ── Centre balloon peak: bulbous teardrop pointing up ── */}
      <path
        d="M 42 34 C 36 22 38 6 50 4 C 62 6 64 22 58 34 Z"
        fill={color}
      />
      <circle cx="50" cy="4" r="3.5" fill={color} />

      {/* ── Cap: rounded dome sitting over the top of the head ── */}
      <path
        d="M 28 40 Q 50 50 72 40 L 72 54 Q 50 60 28 54 Z"
        fill={color}
      />

      {/* ── Face cutout: yellow circle revealing the face area ── */}
      <circle cx="50" cy="64" r="14" fill={bg} />

      {/* ── Closed smiling eyes (crescent arcs) ── */}
      <path
        d="M 42 61 Q 45 65 48 61"
        stroke={color}
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 52 61 Q 55 65 58 61"
        stroke={color}
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />

      {/* ── Wide upturned smile ── */}
      <path
        d="M 43 67 Q 50 74 57 67"
        stroke={color}
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />

      {/* ── Pointed collar: 5 sharp triangular points fanning downward ── */}
      <path
        d="M 40 78
           L 30 95
           L 39 92
           L 35 104
           L 45 99
           L 50 107
           L 55 99
           L 65 104
           L 61 92
           L 70 95
           L 60 78
           Z"
        fill={color}
      />
    </svg>
  );
}

function CardBack({ w, h }: { w: number; h: number }) {
  return (
    <div
      className="card-back"
      style={{
        width: w, height: h, position: "absolute", inset: 0,
        backfaceVisibility: "hidden", transform: "rotateY(180deg)",
        borderRadius: 12,
        border: "3px solid #ffd86b",
        background: "#1c1d2b",
        boxShadow: "0 6px 18px rgba(0,0,0,0.4), inset 0 0 0 6px #2e2f45",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Fredoka', system-ui, sans-serif",
        fontWeight: 900,
        fontSize: w * 0.35,
        letterSpacing: 1,
      }}
    >
      <div
        style={{
          background: "#ffd86b",
          color: "#1c1d2b",
          padding: "4px 10px",
          borderRadius: 8,
          transform: "rotate(-8deg)",
          boxShadow: "0 3px 0 #c98e00, 0 6px 14px rgba(0,0,0,0.3)",
          fontWeight: 900,
          fontSize: w * 0.28,
          letterSpacing: 2,
        }}
      >
        CABO
      </div>
    </div>
  );
}
