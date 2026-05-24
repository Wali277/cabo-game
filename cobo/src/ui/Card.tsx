import { motion, useReducedMotion } from "framer-motion";
import type React from "react";
import type { Card as CardT } from "../engine/types";
import { useViewMode } from "../state/viewmode";
import { useCardSkin } from "../state/cardskin";
import { useStore } from "../state/store";
import { SKIN_STYLES, HelmetIcon, HandDrawnBack, RoyalBack, NeonBack, MinimalistBack } from "./cardSkins";
import {
  cardLayoutTransition,
  isActionSwapKind,
  shouldSuppressCssTransformTransition,
} from "./cardMotion";

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

  // Subscribe ONLY to the kind of the most-recent animation event. The
  // selector returns a primitive, so this re-renders only when that
  // string changes — even though we mount on every card on the board.
  //
  // The Jack / Queen / King action moves (Blind Swap and Peek-and-Swap)
  // get a noticeably slower spring than the standard hand-swap so the
  // cards' path between seats is fully readable. Regular swap_hand is
  // also slowed a touch from before so it stops feeling hasty.
  const lastAnimKind = useStore((s) => {
    const anims = s.game?.animations;
    return anims && anims.length > 0 ? anims[anims.length - 1].kind : null;
  });
  const isActionCardSwap = isActionSwapKind(lastAnimKind);
  const isHandSwap = lastAnimKind === "swap_hand";
  const suppressCssTransformTransition =
    shouldSuppressCssTransformTransition(lastAnimKind, viewMode);

  const isHl = highlight === "selectable" || highlight === "selected";

  return (
    <motion.div
      layoutId={layoutId}
      className={`card-wrap card-skin-${skinId}${suppressCssTransformTransition ? " layout-glide" : ""} ${isHl ? "hl" : ""} ${highlight ?? ""}`}
      style={{
        width: w,
        height: h,
        cursor: onClick ? "pointer" : "default",
        perspective: 800,
      }}
      onClick={onClick}
      animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : {}}
      whileHover={
        onClick && viewMode === "desktop" && !suppressCssTransformTransition
          ? { y: -6, scale: 1.04 }
          : {}
      }
      transition={{
        // GLIDE, do not SNAP. Three tiers tuned slow-and-deliberate:
        //   - J / Q / K action swaps (blind_swap, peek_and_swap):
        //     1.04s desktop tween so cards cross seats without
        //     spring bounce or end-of-path twitch.
        //   - Regular hand swap:
        //     slower than before so it reads as a clear two-card glide.
        //   - Everything else (drawn-slot entry, discard pile shuffle):
        //     ~1.1s baseline glide.
        // Reduced-motion still drops to a 150ms crossfade.
        layout: cardLayoutTransition({
          kind: lastAnimKind,
          reduced,
          viewMode,
        }),
        default: reduced
          ? { duration: 0.15, ease: "easeOut" }
          : viewMode === "mobile"
          ? { type: "spring", stiffness: 170, damping: 28, mass: 1.1 }
          : { type: "spring",
              stiffness: isActionCardSwap ? 75 : isHandSwap ? 92 : 130,
              damping: 22, mass: 1.3 },
      }}
    >
      <motion.div
        className="card-inner"
        initial={{ rotateY: faceUp ? 0 : 180 }}
        animate={{ rotateY: faceUp ? 0 : 180 }}
        // Slower flip so peek/spy reveals are clearly visible — the edge
        // (rotateY ≈ 90°) needs to dwell long enough to read as a flip,
        // not a snap.
        transition={
          reduced
            ? { duration: 0.15 }
            : { duration: flipDuration, type: "spring", stiffness: 105, damping: 16, mass: 1.1 }
        }
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

  // Joker — jester centre + "JOKER" in corners.
  // Honors the active skin: the card bg, border, ink color (jester body),
  // and jester face cutout all pull from the skin's tokens so a Joker
  // looks consistent with the other ranks in every skin.
  if (card.rank === "Joker") {
    const faceColor = suitTextColor(card.suit, skin);
    // The jester face cutout has to be a SOLID color (SVG fill), even
    // when faceBg is a gradient — skin.jesterBg is precisely this.
    const jesterCutoutBg = skin.jesterBg ?? "#ffd86b";

    const letterFs = w * 0.11;
    // Each letter sits in a fixed-width "cell" so the J/O/K/E/R stack
    // shares a single visual axis. Without this, the natural widths of
    // the letters (K and R are wide, J is narrow) leave a ragged
    // left edge — the user-visible "misalignment". Cells are slightly
    // wider than the widest letter at this font, giving small visual
    // breathing room on either side of each glyph.
    const cellSize = letterFs * 1.05;
    const letterStyle: React.CSSProperties = {
      fontSize: letterFs,
      fontWeight: 900,
      color: faceColor,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      userSelect: "none",
    };
    const letterCellStyle: React.CSSProperties = {
      width: cellSize,
      height: cellSize,
      lineHeight: `${cellSize}px`,
      textAlign: "center",
      display: "block",
    };

    const jesterSize = w * 0.56;

    return (
      <div
        className="card-face"
        style={{
          width: w, height: h,
          position: "absolute", inset: 0,
          backfaceVisibility: "hidden",
          background: skin.faceBg,
          borderRadius: 12,
          border: `${skin.faceBorderWidth ?? 3}px solid ${skin.faceBorder}`,
          boxShadow: "0 6px 18px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5)",
          overflow: "hidden",
          fontFamily: skin.font ?? "'Fredoka', system-ui, sans-serif",
        }}
      >
        <div style={{ position: "absolute", top: 6, left: 6, ...letterStyle }}>
          {"JOKER".split("").map((ch, i) => (
            <span key={i} style={letterCellStyle}>{ch}</span>
          ))}
        </div>
        <div style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}>
          <JesterFace size={jesterSize} color={faceColor} bg={jesterCutoutBg} />
        </div>
        <div style={{
          position: "absolute",
          bottom: 6,
          right: 6,
          transform: "rotate(180deg)",
          ...letterStyle,
        }}>
          {"JOKER".split("").map((ch, i) => (
            <span key={i} style={letterCellStyle}>{ch}</span>
          ))}
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
 * Inline SVG jester face — used only on Joker. The `bg` is the solid
 * color used to "punch out" the face area; it should match the skin's
 * dominant face tone so the cutout reads as continuous with the card.
 */
function JesterFace({ size, color, bg = "#ffd86b" }: { size: number; color: string; bg?: string }) {
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
