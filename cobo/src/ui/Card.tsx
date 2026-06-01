import { motion, useReducedMotion } from "framer-motion";
import { memo } from "react";
import type React from "react";
import type { Card as CardT } from "../engine/types";
import { useViewMode } from "../state/viewmode";
import { useCardSkin, type CardSkin } from "../state/cardskin";
import { useStore } from "../state/store";
import { SKIN_STYLES, HelmetIcon, HandDrawnBack, RoyalBack, NeonBack, MinimalistBack, EvolvedBack, DragonFace } from "./cardSkins";
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
  size?: "xs" | "sm" | "md" | "lg";
  flipDuration?: number;
  shake?: boolean;
  layoutId?: string;
  /** Override the user's chosen skin — used by the skin picker preview tiles. */
  skinOverride?: import("../state/cardskin").CardSkin;
}

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

const SIZE_PX: Record<"desktop" | "mobile", Record<"xs" | "sm" | "md" | "lg", number>> = {
  desktop: { xs: 44, sm: 56, md: 80, lg: 110 },
  // Mobile `xs` is consumed ONLY by the left/right side-player cards, now laid
  // out as a 2-column cluster toward centre. 44px (just shy of the top's sm=48)
  // is the largest that lets BOTH side clusters + the centre deck fit a 375px
  // phone with no overlap. Faces are legible. See PlayerSeat side cluster.
  mobile:  { xs: 42, sm: 48, md: 50, lg: 66 },
};

/** Pixel width of a card at a given size + view mode. Exported so seats can
 *  size their empty-slot ghosts to match the real cards. */
export function cardPx(size: "xs" | "sm" | "md" | "lg", viewMode: "desktop" | "mobile"): number {
  return SIZE_PX[viewMode][size];
}

function CardViewImpl({
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
  // Cabo Evolved locks every card to its dedicated purple/orange skin. A
  // skinOverride (the picker's preview tiles) still wins, so previews render
  // their own style regardless of the active game's variant.
  const evolvedLock = useStore((s) => s.game?.variant === "evolved");
  const skinId: CardSkin = skinOverride ?? (evolvedLock ? "evolved" : currentSkin);
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
        //     1.2s desktop tween so cards cross seats without
        //     spring bounce or end-of-path twitch.
        //   - Regular hand swap:
        //     1s desktop tween for a clear drawn-card-to-hand glide.
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
          : isActionCardSwap
          ? { type: "tween" as const, duration: 1.2,  ease: [0.22, 1, 0.36, 1] as const }
          : isHandSwap
          ? { type: "spring" as const, stiffness: 230, damping: 30, mass: 0.85 }
          : { type: "spring" as const, stiffness: 130, damping: 22, mass: 1.3 },
      }}
    >
      {/* Perspective-only scene wrapper. It MUST NOT receive any transform
          or will-change — putting perspective on the same element that Framer
          animates (or that CSS promotes to a compositing layer) causes mobile
          browsers to rasterize the subtree flat, breaking backface-visibility. */}
      <div className="card-scene">
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
            : viewMode === "mobile"
            // Mobile: a fixed-duration tween for the 3D rotateY flip. The spring
            // re-solves the (GPU-costly) 3D transform every frame until it
            // settles; a short tween is far cheaper and reads the same.
            ? { duration: flipDuration * 0.8, ease: "easeInOut" as const }
            : { duration: flipDuration, type: "spring", stiffness: 105, damping: 16, mass: 1.1 }
        }
        style={{ width: "100%", height: "100%", transformStyle: "preserve-3d", position: "relative" }}
      >
        <CardFace card={card} w={w} h={h} skin={skin} viewMode={viewMode} />
        <CardBack w={w} h={h} skin={skin} />
      </motion.div>
      </div>{/* end .card-scene */}
    </motion.div>
  );
}

/**
 * Memoised so a card only re-renders when something it actually DRAWS changes.
 * Without this, every card re-runs its (Framer-heavy: layoutId measurement, 3D
 * flip, skin) render on every game tick because the parent PlayerSeat re-renders
 * — and that cost scales with player/card count, which is why 3-4-player lagged.
 *
 * The comparator deliberately EXCLUDES `onClick`: the store's click actions
 * (clickOwnCard/clickOtherCard) read fresh state via get() and re-validate every
 * gate (snap phase, turn, targeting) at call time, and the closure only captures
 * the stable `idx`/player.id — so a "stale" onClick is harmless. Including it
 * would defeat the memo (a new closure every parent render). It also excludes
 * the internal store subscriptions (lastAnimKind etc.) — those live inside the
 * component via useStore and still trigger their own re-render when they change,
 * which is exactly what the flip-timing logic needs.
 *
 * Every prop the component renders FROM is compared, so a reveal/swap/flip/skin
 * change still re-renders correctly. (Card compared by id+rank+suit since clone()
 * hands us a fresh object reference every tick.)
 */
function cardViewPropsEqual(prev: Props, next: Props): boolean {
  return (
    prev.faceUp === next.faceUp &&
    prev.highlight === next.highlight &&
    prev.size === next.size &&
    prev.flipDuration === next.flipDuration &&
    prev.shake === next.shake &&
    prev.layoutId === next.layoutId &&
    prev.skinOverride === next.skinOverride &&
    (prev.card?.id ?? null) === (next.card?.id ?? null) &&
    (prev.card?.rank ?? null) === (next.card?.rank ?? null) &&
    (prev.card?.suit ?? null) === (next.card?.suit ?? null)
  );
}

export const CardView = memo(CardViewImpl, cardViewPropsEqual);

/** Pick a per-suit text color: skin override wins, else default red/black. */
function suitTextColor(suit: string, skin: import("./cardSkins").SkinStyle): string {
  const isRed = suit === "H" || suit === "D";
  if (skin.suitColor) return isRed ? skin.suitColor.red : skin.suitColor.black;
  return isRed ? "#e23a5e" : "#1c1d2b";
}

function CardFace({
  card, w, h, skin, viewMode,
}: {
  card?: CardT | null;
  w: number; h: number;
  skin: import("./cardSkins").SkinStyle;
  viewMode: "desktop" | "mobile";
}) {
  // Mobile cards are physically small; enlarge the rank/suit glyphs relative
  // to the card so they stay legible. Multipliers are tuned to the
  // space-between column budget below — 2*(rank + cornerSuit) + pip must stay
  // under the inner height (~1.45w − 2*pad) or the bottom corner clips.
  // Desktop keeps its original values.
  const mobile = viewMode === "mobile";

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

    const letterFs = w * (mobile ? 0.15 : 0.11);
    // Each letter sits in a fixed-width "cell" so the J/O/K/E/R stack
    // shares a single visual axis. Without this, the natural widths of
    // the letters (K and R are wide, J is narrow) leave a ragged
    // left edge — the user-visible "misalignment". Cells are slightly
    // wider than the widest letter at this font, giving small visual
    // breathing room on either side of each glyph.
    const cellSize = letterFs * 1.05;
    // Corner inset for the JOKER stacks. A fixed 6px is proportionally too
    // large on small phone cards; scale it down so the stacks clear the
    // centre jester while staying inside the card.
    const jokerInset = mobile ? Math.max(3, Math.round(w * 0.05)) : 6;
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

    const jesterSize = w * (mobile ? 0.48 : 0.56);

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
        <div style={{ position: "absolute", top: jokerInset, left: jokerInset, ...letterStyle }}>
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
          bottom: jokerInset,
          right: jokerInset,
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

  // Cabo Evolved Dragon (rank "D") — the approved filled dragon art with "D"
  // corners on the skin's black field. Special-cased like the Joker so it never
  // falls through to the generic rank-text + suit-glyph face.
  if (card.rank === "Dragon") {
    const dColor = suitTextColor(card.suit, skin);
    const letterFs = w * (mobile ? 0.2 : 0.17);
    const dInset = mobile ? Math.max(3, Math.round(w * 0.05)) : 6;
    const dragonW = w * (mobile ? 0.5 : 0.54);
    const cornerStyle: React.CSSProperties = {
      position: "absolute",
      fontSize: letterFs,
      fontWeight: 900,
      lineHeight: 1,
      color: dColor,
      userSelect: "none",
      fontFamily: skin.font ?? "'Fredoka', system-ui, sans-serif",
    };
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
          overflow: "hidden",
        }}
      >
        <div style={{ top: dInset, left: dInset, ...cornerStyle }}>D</div>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <DragonFace size={dragonW} color={dColor} />
        </div>
        <div style={{ bottom: dInset, right: dInset, transform: "rotate(180deg)", ...cornerStyle }}>D</div>
      </div>
    );
  }

  const color = suitTextColor(card.suit, skin);
  const glyph = SUIT_GLYPH[card.suit];
  const font = skin.font ?? "'Fredoka', system-ui, sans-serif";

  // Glyph sizes — enlarged on mobile (see budget note at top of CardFace).
  // 2*(rankFs + cornerSuitFs) + pipFs must stay under the inner height.
  const rankFs = w * (mobile ? 0.30 : 0.22);
  const cornerSuitFs = w * (mobile ? 0.19 : 0.17);
  const pipFs = w * (mobile ? 0.32 : 0.48);

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
        // Proportional padding so the rank/suit corners always fit inside the
        // card. A fixed 6px/8px was proportionally too large on the small
        // mobile cards (xs/sm), pushing the bottom corner past the edge.
        padding: `${Math.max(2, Math.round(w * 0.055))}px ${Math.max(2, Math.round(w * 0.073))}px`,
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
        fontSize: rankFs, lineHeight: 1, fontWeight: 700,
        whiteSpace: "nowrap", zIndex: 1, position: "relative",
      }}>
        {card.rank}
        <div style={{ fontSize: cornerSuitFs, lineHeight: 1 }}>{glyph}</div>
      </div>

      {/* Centre suit glyph */}
      <div
        style={{
          alignSelf: "center",
          fontSize: pipFs,
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
          fontSize: rankFs,
          lineHeight: 1,
          fontWeight: 700,
          whiteSpace: "nowrap",
          zIndex: 1,
          position: "relative",
        }}
      >
        {card.rank}
        <div style={{ fontSize: cornerSuitFs, lineHeight: 1 }}>{glyph}</div>
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
  } else if (skin.backCenter === "evolved") {
    center = <EvolvedBack w={w} />;
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
        // translateZ pushes the back out of the front's plane so mobile GPUs
        // don't z-fight the coplanar faces (front bleeding through). Pairs
        // with `.card-face { transform: translateZ(1px) }` in App.css.
        backfaceVisibility: "hidden", transform: "rotateY(180deg) translateZ(1px)",
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
