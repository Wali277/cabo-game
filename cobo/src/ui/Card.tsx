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
          backfaceVisibility: "hidden", background: "#fff",
          borderRadius: 12, border: "2px solid #ddd",
        }}
      />
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
        background: "linear-gradient(155deg, #fffdf6 0%, #ffe9c0 100%)",
        borderRadius: 12,
        border: `3px solid ${color}`,
        boxShadow: "0 6px 14px rgba(0,0,0,0.25), inset 0 0 0 2px #fff",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "6px 8px",
        fontFamily: "'Fredoka', 'Comic Sans MS', system-ui, sans-serif",
        color,
      }}
    >
      <div style={{ fontSize: w * 0.28, lineHeight: 1, fontWeight: 700 }}>
        {card.rank}
        <div style={{ fontSize: w * 0.22, lineHeight: 1 }}>{glyph}</div>
      </div>
      <div
        style={{
          alignSelf: "center",
          fontSize: w * 0.55,
          lineHeight: 1,
          textShadow: `2px 2px 0 rgba(0,0,0,0.07)`,
        }}
      >
        {glyph}
      </div>
      <div
        style={{
          alignSelf: "flex-end",
          transform: "rotate(180deg)",
          fontSize: w * 0.28,
          lineHeight: 1,
          fontWeight: 700,
        }}
      >
        {card.rank}
        <div style={{ fontSize: w * 0.22, lineHeight: 1 }}>{glyph}</div>
      </div>
    </div>
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
        border: "3px solid #fff",
        background:
          "repeating-linear-gradient(45deg, #6a4cff 0 10px, #855dff 10px 20px)",
        boxShadow: "0 6px 14px rgba(0,0,0,0.25), inset 0 0 0 4px #ffd86b",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontFamily: "'Fredoka', system-ui, sans-serif",
        fontWeight: 900,
        fontSize: w * 0.35,
        letterSpacing: 1,
        textShadow: "2px 2px 0 rgba(0,0,0,0.25)",
      }}
    >
      <div
        style={{
          background: "#ffd86b",
          color: "#5b3aff",
          padding: "4px 8px",
          borderRadius: 8,
          transform: "rotate(-8deg)",
          boxShadow: "0 3px 0 #c98e00",
        }}
      >
        CABO
      </div>
    </div>
  );
}
