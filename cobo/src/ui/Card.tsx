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
        {/* Top-left corner: rank "J" + star suit marker */}
        <div style={{ fontSize: w * 0.22, lineHeight: 1, fontWeight: 700 }}>
          J
          <div style={{ fontSize: w * 0.17, lineHeight: 1 }}>★</div>
        </div>

        {/* Centre: jester face */}
        <div style={{ alignSelf: "center" }}>
          <JesterFace size={jesterSize} color={faceColor} />
        </div>

        {/* Bottom-right corner: rotated */}
        <div style={{
          alignSelf: "flex-end",
          transform: "rotate(180deg)",
          fontSize: w * 0.22,
          lineHeight: 1,
          fontWeight: 700,
        }}>
          J
          <div style={{ fontSize: w * 0.17, lineHeight: 1 }}>★</div>
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
 * Inline SVG jester face:
 *   – Three rounded hat bells at the top
 *   – Hat body + brim
 *   – Round face (yellow "cutout" circle) with eyes and a smile
 *   – 8-point ruffled collar just below the face
 */
function JesterFace({ size, color }: { size: number; color: string }) {
  const bg = "#ffd86b"; // card background — used to punch out the face circle
  return (
    <svg
      viewBox="0 0 100 110"
      width={size}
      height={size * 1.1}
      style={{ display: "block" }}
    >
      {/* ── Hat bells (3 rounded peaks) ── */}
      <circle cx="22" cy="20" r="11" fill={color} />
      <circle cx="50" cy="9"  r="11" fill={color} />
      <circle cx="78" cy="20" r="11" fill={color} />

      {/* Hat body — concave-topped trapezoid joining the three bells */}
      <path d="M 11 29 Q 50 39 89 29 L 87 46 Q 50 53 13 46 Z" fill={color} />

      {/* Hat brim */}
      <ellipse cx="50" cy="46" rx="39" ry="7" fill={color} />

      {/* ── Ruffled collar — 8-pointed star drawn BEFORE the face so face sits on top ── */}
      {/*
        Center (50, 98), outer radius 11, inner radius 6, 8 points (16 polygon vertices).
        The top tips of the star peek out from behind the face circle for the "ruffled" look.
      */}
      <polygon
        points="50,87 52,93 58,90 56,96 61,98 56,100 58,106 52,104 50,109 48,104 42,106 44,100 39,98 44,96 42,90 48,93"
        fill={color}
      />

      {/* ── Face circle (yellow) — covers the collar centre, acts as the face ── */}
      <circle cx="50" cy="71" r="20" fill={bg} />

      {/* Eyes */}
      <circle cx="42" cy="66" r="2.5" fill={color} />
      <circle cx="58" cy="66" r="2.5" fill={color} />

      {/* Smile arc */}
      <path
        d="M 41 75 Q 50 84 59 75"
        stroke={color}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
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
