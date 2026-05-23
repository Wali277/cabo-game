import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { CardView } from "./Card";
import { useStore } from "../state/store";
import type { GameState } from "../engine/types";

/** Slow, premium-feeling spring for cards arriving at the centre slots.
 *  Cards GLIDE — they do not snap into place. */
const CARD_SPRING = { type: "spring" as const, stiffness: 115, damping: 22, mass: 1.25 };

/** How many cards of the discard pile are visibly rendered as a stack.
 *  Older cards exist in `game.discard` but stay invisibly buried. */
const VISIBLE_PILE_DEPTH = 5;

/**
 * Build a "fly + arc" trajectory for a card arriving in the drawn or
 * discard slot. Three-keyframe path so the card visibly lifts mid-flight.
 */
type Trajectory = {
  initial: { x: number; y: number; opacity: number; scale: number; rotate: number };
  animate: { x: number[]; y: number[]; opacity: number; scale: number; rotate: number };
};

function withArc(start: { x: number; y: number; rotate: number; scale: number }, lift: number): Trajectory {
  const midX = start.x / 2;
  const peakY = Math.min(start.y, 0) - lift;
  return {
    initial: { ...start, opacity: 0 },
    animate: {
      x: [start.x, midX, 0],
      y: [start.y, peakY, 0],
      opacity: 1,
      scale: 1,
      rotate: 0,
    },
  };
}

function drawnTrajectory(g: GameState): Trajectory {
  const last = g.animations[g.animations.length - 1];
  if (last?.kind === "draw_discard") {
    return withArc({ x: 110, y: -28, rotate: 8, scale: 0.85 }, 30);
  }
  return withArc({ x: -90, y: -50, rotate: -6, scale: 0.85 }, 35);
}

function discardTrajectory(g: GameState): Trajectory {
  const last = g.animations[g.animations.length - 1];
  switch (last?.kind) {
    case "discard_drawn":
      return withArc({ x: -100, y: -30, rotate: -10, scale: 0.85 }, 30);
    case "swap_hand":
      return withArc({ x: 0, y: 110, rotate: 6, scale: 0.85 }, 50);
    case "blind_swap":
      return withArc({ x: 0, y: 85, rotate: 4, scale: 0.85 }, 40);
    case "peek_and_swap":
      return withArc({ x: 0, y: 85, rotate: -4, scale: 0.85 }, 40);
    default:
      return {
        initial: { x: 0, y: 0, opacity: 0, scale: 0.7, rotate: 0 },
        animate: { x: [0, 0, 0], y: [0, 0, 0], opacity: 1, scale: 1, rotate: 0 },
      };
  }
}

/** Stable hash → [0,1) seeded by a string. Used for per-card jitter so
 *  every card on the pile sits in a unique but deterministic spot. */
function hash01(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) | 0;
  return Math.abs(h % 10000) / 10000;
}

/** Per-card settled rotation. The VERY first card on the pile (absolute
 *  index 0 in game.discard) lands STRAIGHT; every subsequent card gets
 *  a ±5° rotation seeded by its id so the pile reads as a real toss. */
function pileRotation(cardId: string, absoluteIndex: number): number {
  if (absoluteIndex === 0) return 0;
  return hash01(cardId + "rot") * 18 - 9; // ±9°
}

/** x/y jitter per card so the pile builds visibly unevenly — cards
 *  don't stack pixel-aligned like a deck cut for play. The horizontal
 *  spread is big enough that the under-pile cards genuinely peek out
 *  from behind the top card, growing the silhouette as more land. */
function pileOffset(cardId: string, indexInStack: number): { x: number; y: number } {
  const x = (hash01(cardId + "x") - 0.5) * 22;         // ±11px
  // Each higher card sits ~2.5px above the previous one, so the visible
  // pile literally grows taller as more cards accumulate.
  const y = (hash01(cardId + "y") - 0.5) * 12 - indexInStack * 2.5;
  return { x, y };
}

export function Center() {
  const game = useStore((s) => s.game!);
  const humanId = useStore((s) => s.humanId);
  const reduced = useReducedMotion() ?? false;

  const isHumanTurn = game.players[game.currentPlayer].id === humanId;
  const canDraw = isHumanTurn && game.phase === "turn_start";
  const canDrawDiscard = canDraw && game.discard.length > 0;

  const drawn = game.drawnCard;

  const draw = useStore((s) => s.draw);
  const drawDiscard = useStore((s) => s.drawDiscard);

  // Visible portion of the discard pile, bottom-to-top.
  const visiblePile = game.discard.slice(-VISIBLE_PILE_DEPTH);
  const pileBaseAbsoluteIdx = game.discard.length - visiblePile.length;
  const topDiscard = visiblePile[visiblePile.length - 1] ?? null;

  const drawnTraj = drawnTrajectory(game);
  const discardTraj = discardTrajectory(game);
  const topRotation = topDiscard ? pileRotation(topDiscard.id, game.discard.length - 1) : 0;
  const topOffset = topDiscard ? pileOffset(topDiscard.id, visiblePile.length - 1) : { x: 0, y: 0 };

  return (
    <div className="center-area">
      <div className="deck-area">

        {/* ── Deck pile ── */}
        <button
          className={`pile deck ${canDraw ? "clickable" : ""}`}
          disabled={!canDraw}
          onClick={draw}
        >
          <CardView card={null} faceUp={false} size="md" />
          <div className="pile-label">Deck · {game.deck.length}</div>
        </button>

        {/* ── Drawn card slot ── */}
        <div className="drawn-slot">
          <AnimatePresence mode="popLayout">
            {drawn ? (
              <motion.div
                key={drawn.id}
                initial={reduced ? { opacity: 0 } : drawnTraj.initial}
                animate={reduced ? { opacity: 1 } : drawnTraj.animate}
                exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.18 } }}
                transition={reduced ? { duration: 0.15 } : CARD_SPRING}
                style={{ position: "relative", zIndex: 5 }}
              >
                <CardView
                  card={drawn}
                  faceUp={isHumanTurn}
                  size="lg"
                  layoutId={drawn.id}
                />
              </motion.div>
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <div className="drawn-placeholder">Drawn card</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Discard pile — visible stack of up to VISIBLE_PILE_DEPTH cards ── */}
        <button
          className={`pile discard ${canDrawDiscard ? "clickable" : ""}`}
          disabled={!canDrawDiscard}
          onClick={drawDiscard}
        >
          <div className="discard-card-area">
            {visiblePile.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="empty-pile">Discard</div>
              </motion.div>
            ) : (
              <>
                {/* Buried under-pile cards (everything below the top). These
                    are static — already settled in place; no entrance
                    animation. The inner CardView still owns its layoutId so
                    framer-motion handles the small position shift when this
                    card was previously the top and is now buried. */}
                {visiblePile.slice(0, -1).map((card, i) => {
                  const absoluteIdx = pileBaseAbsoluteIdx + i;
                  const rot = pileRotation(card.id, absoluteIdx);
                  const { x, y } = pileOffset(card.id, i);
                  return (
                    <div
                      key={card.id}
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${rot}deg)`,
                        zIndex: i,
                        pointerEvents: "none",
                      }}
                    >
                      <CardView
                        card={card}
                        faceUp={true}
                        size="md"
                        layoutId={card.id}
                      />
                    </div>
                  );
                })}

                {/* Top card — animated entry from its source position. */}
                {topDiscard && (
                  <motion.div
                    key={topDiscard.id}
                    initial={reduced ? { opacity: 0 } : discardTraj.initial}
                    animate={reduced
                      ? { opacity: 1 }
                      : {
                          // End at the pile-offset target so the top card
                          // sits exactly where its under-pile slot would be.
                          x: [...discardTraj.animate.x.slice(0, -1), topOffset.x],
                          y: [...discardTraj.animate.y.slice(0, -1), topOffset.y],
                          opacity: 1,
                          scale: 1,
                          rotate: topRotation,
                        }}
                    transition={reduced ? { duration: 0.15 } : CARD_SPRING}
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      translateX: "-50%",
                      translateY: "-50%",
                      zIndex: visiblePile.length,
                    }}
                  >
                    <CardView
                      card={topDiscard}
                      faceUp={true}
                      size="md"
                      layoutId={topDiscard.id}
                    />
                  </motion.div>
                )}
              </>
            )}
          </div>
          <div className="pile-label">Discard</div>
        </button>

      </div>
    </div>
  );
}
