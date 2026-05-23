import { motion, useReducedMotion } from "framer-motion";
import type React from "react";
import type { Card as CardT } from "../engine/types";
import { useViewMode } from "../state/viewmode";
import { useCardSkin } from "../state/cardskin";
import { SKIN_STYLES, HelmetIcon, HandDrawnBack, RoyalBack, NeonBack, MinimalistBack } from "./cardSkins";

interface Props {
  card?: CardT | null;
  faceUp: boolean;
  highlight?: "selectable" | "selected" | "winner" | "lost" | null;
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
  flipDuration?: number;
  shake?: boolean;
  layoutId?: string;
  /** Override the user's chosen skin — used by the skin picker preview tiles. */
  skinOverride?: import("../state/cardskin").CardSkin;
}

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

const SIZE_PX: Record<"desktop" | "mobile", Record<"sm" | "md" | "lg", number>> = {
  desktop: { sm: 56, md: 80, lg: 110 },
  mobile:  { sm: 40, md: 60, lg: 60  },
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
  skinOverride,
}: Props) {
  const viewMode = useViewMode();
  const w = SIZE_PX[viewMode][size];
  const h = Math.round(w * 1.45);
  const currentSkin = useCardSkin();
  const skinId = skinOverride ?? currentSkin;
  const skin = SKIN_STYLES[skinId];
  const reduced = useReducedMotion() ?? false;

  const isHl = highlight === "selectable" || highlight === "selected";

  return (
    <motion.div
      layoutId={layoutId}
      className={`card-wrap card-skin-${skinId} ${isHl ? "hl" : ""} ${highlight ?? ""}`}
      style={{
        width: w,
        height: h,
        cursor: onClick ? "pointer" : "default",
        perspective: 800,
      }}
      onClick={onClick}
      animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : {}}
      whileHover={onClick && viewMode === "desktop" ? { y: -6, scale: 1.04 } : {}}
      transition={{
        // Slower, more graceful layout spring — cards now glide between
        // positions instead of snapping. Reduced-motion users get a near-
        // instant crossfade-style transition instead.
        layout: reduced
          ? { duration: 0.15, ease: "easeOut" }
          : viewMode === "mobile"
          ? { type: "spring", stiffness: 180, damping: 28, mass: 1.05 }
          : { type: "spring", stiffness: 150, damping: 22, mass: 1.15 },
        default: reduced
          ? { duration: 0.15, ease: "easeOut" }
          : viewMode === "mobile"
          ? { type: "spring", stiffness: 220, damping: 28, mass: 1 }
          : { type: "spring", stiffness: 180, damping: 22, mass: 1.1 },
      }}
    >
      <motion.div
        className="card-inner"
        initial={{ rotateY: faceUp ? 0 : 180 }}
        animate={{ rotateY: faceUp ? 0 : 180 }}
        transition={{ duration: flipDuration, type: "spring", stiffness: 160, damping: 18 }}
        style={{ width: "100%", height: "100%", transformStyle: "preserve-3d", position: "relative" }}
      >
        <CardFace card={card} w={w} h={h} skin={skin} />
        <CardBack w={w} h={h} skin={skin} />
      </motion.div>
    </motion.div>
  );
}

/** Pick a per-suit text color: skin override wins, else default red/black. */
function suitTextColor(suit: string, skin: import("./cardSkins").SkinStyle): string {
  const isRed = suit === "H" || suit === "D";
  if (skin.suitColor) return isRed ? skin.suitColor.red : skin.suitColor.black;
  return isRed ? "#e23a5e" : "#1c1d2b";
}

function CardFace({
  card, w, h, skin,
}: {
  card?: CardT | null;
  w: number; h: number;
  skin: import("./cardSkins").SkinStyle;
}) {
  // Empty-slot placeholder (no card in this hand index).
  if (!card) {
    return (
      <div
        className="card-face"
        style={{
          width: w, height: h, position: "absolute", inset: 0,
          backfaceVisibility: "hidden",
          background: skin.faceBg,
          borderRadius: 12, border: `${skin.faceBorderWidth ?? 3}px solid ${skin.faceBorder}`,
        }}
      />
    );
  }

  // Joker — yellow card baseline, jester centre, "JOKER" in corners.
  // Joker keeps a fixed yellow face so the jester drawing stays recognisable
  // across every skin; the skin still affects the back of the card.
  if (card.rank === "Joker") {
    const isRed = card.suit === "H" || card.suit === "D";
    const faceColor = isRed ? "#e23a5e" : "#1c1d2b";

    const letterFs = w * 0.11;
    const letterStyle: React.CSSProperties = {
      fontSize: letterFs,
      lineHeight: 1.05,
      fontWeight: 900,
      color: faceColor,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      userSelect: "none",
    };

    const jesterSize = w * 0.56;

    return (
      <div
        className="card-face"
        style={{
          width: w, height: h,
          position: "absolute", inset: 0,
          backfaceVisibility: "hidden",
          background: "#ffd86b",
          borderRadius: 12,
          border: "3px solid #1c1d2b",
          boxShadow: "0 6px 18px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5)",
          overflow: "hidden",
          fontFamily: "'Fredoka', system-ui, sans-serif",
        }}
      >
        <div style={{ position: "absolute", top: 6, left: 8, ...letterStyle }}>
          {"JOKER".split("").map((ch, i) => <span key={i}>{ch}</span>)}
        </div>
        <div style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}>
          <JesterFace size={jesterSize} color={faceColor} />
        </div>
        <div style={{
          position: "absolute",
          bottom: 6,
          right: 8,
          transform: "rotate(180deg)",
          ...letterStyle,
        }}>
          {"JOKER".split("").map((ch, i) => <span key={i}>{ch}</span>)}
        </div>
      </div>
    );
  }

  const color = suitTextColor(card.suit, skin);
  const glyph = SUIT_GLYPH[card.suit];
  const font = skin.font ?? "'Fredoka', system-ui, sans-serif";

  return (
    <div
      className="card-face"
      style={{
        width: w, height: h, position: "absolute", inset: 0,
        backfaceVisibility: "hidden",
        background: skin.faceBg,
        borderRadius: 12,
        border: `${skin.faceBorderWidth ?? 3}px solid ${skin.faceBorder}`,
        boxShadow: "0 6px 18px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5)",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "space-between",
        textAlign: "left",
        padding: "6px 8px",
        overflow: "hidden",
        fontFamily: font,
        color,
      }}
    >
      {/* Optional pattern overlay (Hand-drawn crosshatch) */}
      {skin.patternOverlay && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: skin.patternOverlay,
            pointerEvents: "none",
            mixBlendMode: "multiply",
            zIndex: 0,
          }}
        />
      )}

      {/* Top-left corner */}
      <div style={{
        fontSize: w * 0.22, lineHeight: 1, fontWeight: 700,
        whiteSpace: "nowrap", zIndex: 1, position: "relative",
      }}>
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
          zIndex: 1,
          position: "relative",
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
          whiteSpace: "nowrap",
          zIndex: 1,
          position: "relative",
        }}
      >
        {card.rank}
        <div style={{ fontSize: w * 0.17, lineHeight: 1 }}>{glyph}</div>
      </div>
    </div>
  );
}

/**
 * Inline SVG jester face — unchanged. Used only on Joker.
 */
function JesterFace({ size, color }: { size: number; color: string }) {
  const bg = "#ffd86b";
  return (
    <svg viewBox="0 0 100 110" width={size} height={size * 1.1} style={{ display: "block" }}>
      <path d="M 33 38 Q 4 30 12 58 Q 22 56 33 44 Z" fill={color} />
      <circle cx="10" cy="58" r="5" fill={color} />
      <path d="M 67 38 Q 96 30 88 58 Q 78 56 67 44 Z" fill={color} />
      <circle cx="90" cy="58" r="5" fill={color} />
      <path d="M 42 34 C 36 22 38 6 50 4 C 62 6 64 22 58 34 Z" fill={color} />
      <circle cx="50" cy="4" r="3.5" fill={color} />
      <path d="M 28 40 Q 50 50 72 40 L 72 54 Q 50 60 28 54 Z" fill={color} />
      <circle cx="50" cy="64" r="14" fill={bg} />
      <path d="M 42 61 Q 45 65 48 61" stroke={color} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M 52 61 Q 55 65 58 61" stroke={color} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M 43 67 Q 50 74 57 67" stroke={color} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M 40 78 L 30 95 L 39 92 L 35 104 L 45 99 L 50 107 L 55 99 L 65 104 L 61 92 L 70 95 L 60 78 Z" fill={color} />
    </svg>
  );
}

function CardBack({
  w, h, skin,
}: {
  w: number; h: number;
  skin: import("./cardSkins").SkinStyle;
}) {
  const font = skin.font ?? "'Fredoka', system-ui, sans-serif";

  let center: React.ReactNode;
  if (skin.backCenter === "helmet") {
    center = (
      <HelmetIcon size={w * 0.78} shellColor="#0a0a0a" />
    );
  } else if (skin.backCenter === "handdrawn") {
    center = <HandDrawnBack w={w} />;
  } else if (skin.backCenter === "royal") {
    center = <RoyalBack w={w} />;
  } else if (skin.backCenter === "neon") {
    center = <NeonBack w={w} />;
  } else if (skin.backCenter === "minimalist") {
    center = <MinimalistBack w={w} />;
  } else {
    // Default "CABO" pill
    center = (
      <div
        style={{
          background: skin.caboPillBg ?? "#ffd86b",
          color: skin.caboColor ?? "#1c1d2b",
          padding: "4px 10px",
          borderRadius: 8,
          transform: "rotate(-8deg)",
          boxShadow: "0 3px 0 rgba(0,0,0,0.25), 0 6px 14px rgba(0,0,0,0.3)",
          fontWeight: 900,
          fontSize: w * 0.28,
          letterSpacing: 2,
          fontFamily: font,
        }}
      >
        CABO
      </div>
    );
  }

  return (
    <div
      className="card-back"
      style={{
        width: w, height: h, position: "absolute", inset: 0,
        backfaceVisibility: "hidden", transform: "rotateY(180deg)",
        borderRadius: 12,
        border: `${skin.backBorderWidth ?? 3}px solid ${skin.backBorder}`,
        background: skin.backBg,
        boxShadow: "0 6px 18px rgba(0,0,0,0.4), inset 0 0 0 6px rgba(255,255,255,0.04)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Optional back pattern overlay (Hand-drawn crosshatch) */}
      {skin.backPatternOverlay && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: skin.backPatternOverlay,
            pointerEvents: "none",
            mixBlendMode: "multiply",
            zIndex: 0,
          }}
        />
      )}

      <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {center}
      </div>

      {skin.backBadge && (
        <div
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            background: skin.backBadge.bg,
            color: skin.backBadge.color,
            fontWeight: 900,
            fontSize: w * 0.18,
            width: w * 0.24,
            height: w * 0.24,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            fontFamily: font,
            zIndex: 2,
            boxShadow: "0 2px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3)",
            border: "1.5px solid rgba(255,255,255,0.25)",
          }}
        >
          {skin.backBadge.text}
        </div>
      )}
    </div>
  );
}
