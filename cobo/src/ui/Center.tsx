import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { CardView } from "./Card";
import { useStore } from "../state/store";
import type { GameState } from "../engine/types";
import { useViewMode } from "../state/viewmode";
import {
  consumeSwapHandSource,
  recordSwapHandSource,
  swapHandDiscardAnimate,
  swapHandDiscardTrajectory,
  swapHandDiscardTransition,
} from "./swapHandMotion";
import {
  centerCardArrivalTransition,
  discardCardTrajectory,
  drawnCardTrajectory,
} from "./centerCardMotion";

/** How many cards of the discard pile are visibly rendered as a stack.
 *  Older cards exist in `game.discard` but stay invisibly buried. */
const VISIBLE_PILE_DEPTH = 5;

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
function pileRotation(cardId: string, absoluteIndex: number, viewMode: "desktop" | "mobile"): number {
  if (absoluteIndex === 0) return 0;
  // Tight mobile layout: gentler tilt so the small cards stay aligned and
  // don't swing sideways into the neighbouring deck / drawn slots.
  const max = viewMode === "mobile" ? 3.5 : 9;
  return (hash01(cardId + "rot") - 0.5) * 2 * max; // ±max°
}

/** x/y jitter per card so the pile builds visibly unevenly — cards
 *  don't stack pixel-aligned like a deck cut for play. The horizontal
 *  spread is big enough that the under-pile cards genuinely peek out
 *  from behind the top card, growing the silhouette as more land. */
function pileOffset(cardId: string, indexInStack: number, viewMode: "desktop" | "mobile"): { x: number; y: number } {
  const mobile = viewMode === "mobile";
  // Desktop piles spread widely for a "real toss" look. On mobile the deck /
  // drawn / discard cards sit only ~8px apart, so the full spread shoved the
  // top discard card sideways into the drawn card (the overlap + misalignment
  // the player reported). Shrink the spread so the pile stays neatly aligned.
  const xSpread = mobile ? 4 : 22;   // ±2px vs ±11px
  const yJitter = mobile ? 4 : 12;   // ±2px vs ±6px
  const yStep = mobile ? 1 : 2.5;    // gentler stack growth keeps top card aligned
  const x = (hash01(cardId + "x") - 0.5) * xSpread;
  // Each higher card sits slightly above the previous one, so the visible
  // pile grows taller as more cards accumulate.
  const y = (hash01(cardId + "y") - 0.5) * yJitter - indexInStack * yStep;
  return { x, y };
}

function captureSwapHandSourceFromBoard(game: GameState, cardId: string) {
  const latest = game.animations[game.animations.length - 1];
  if (!latest) return null;

  // swap_hand: source slot = the snapper's own slot the drawn card swapped into.
  // snap_correct: source slot = the target's slot the matched card came out of
  // (target may be the snapper themselves on a self-snap).
  let playerId: string | undefined;
  let handIndex: number | undefined;
  if (latest.kind === "swap_hand") {
    playerId = latest.payload.playerId as string | undefined;
    handIndex = latest.payload.handIndex as number | undefined;
  } else if (latest.kind === "snap_correct") {
    playerId = latest.payload.targetId as string | undefined;
    handIndex = latest.payload.targetIndex as number | undefined;
  } else {
    return null;
  }
  if (!playerId || typeof handIndex !== "number") return null;

  const sourceSlot = document.querySelector<HTMLElement>(
    `.hand-slot[data-player-id="${playerId}"][data-hand-index="${handIndex}"]`,
  );
  const discardArea = document.querySelector<HTMLElement>(".discard-card-area");
  if (!sourceSlot || !discardArea) return null;

  recordSwapHandSource(
    cardId,
    sourceSlot.getBoundingClientRect(),
    discardArea.getBoundingClientRect(),
  );
  return consumeSwapHandSource(cardId);
}

export function Center() {
  const game = useStore((s) => s.game!);
  const humanId = useStore((s) => s.humanId);
  const reduced = useReducedMotion() ?? false;
  const viewMode = useViewMode();
  const isDesktop = viewMode === "desktop";

  const isHumanTurn = game.players[game.currentPlayer].id === humanId;
  const canDraw = isHumanTurn && game.phase === "turn_start";
  const canDrawDiscard = canDraw && game.discard.length > 0;

  const drawn = game.drawnCard;
  const drawnId = drawn?.id ?? null;
  const lastAnimKind = game.animations.length > 0
    ? game.animations[game.animations.length - 1].kind
    : null;

  const draw = useStore((s) => s.draw);
  const drawDiscard = useStore((s) => s.drawDiscard);

  // Visible portion of the discard pile, bottom-to-top.
  const visiblePile = game.discard.slice(-VISIBLE_PILE_DEPTH);
  const pileBaseAbsoluteIdx = game.discard.length - visiblePile.length;
  const topDiscard = visiblePile[visiblePile.length - 1] ?? null;
  const topDiscardId = topDiscard?.id ?? null;

  // Stabilise the trajectories so framer-motion doesn't re-trigger
  // animations on unrelated game state changes (animations consumed, bot
  // turn ticks, reveals, etc.). The entrance trajectory is captured the
  // moment a card lands in the slot; subsequent re-renders reuse the same
  // object reference, so the motion.div animate prop stays stable.
  const discardArrivalKind = useMemo(
    () => lastAnimKind,
    // Capture the event kind when this exact discard card first becomes top.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topDiscard?.id],
  );
  const isHandSwapDiscard =
    (discardArrivalKind === "swap_hand" || discardArrivalKind === "snap_correct");
  const isSwapDiscard =
    discardArrivalKind === "blind_swap" ||
    discardArrivalKind === "peek_and_swap" ||
    discardArrivalKind === "swap_hand" ||
    discardArrivalKind === "snap_correct";
  const swapHandSource = useMemo(
    () => {
      if (
        !topDiscard ||
        (discardArrivalKind !== "swap_hand" && discardArrivalKind !== "snap_correct")
      ) {
        return null;
      }
      return (
        consumeSwapHandSource(topDiscard.id) ??
        captureSwapHandSourceFromBoard(game, topDiscard.id)
      );
    },
    // Capture once for this top discard card. The source map is single-use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topDiscardId],
  );
  const drawnTraj = useMemo(
    () => drawnCardTrajectory(lastAnimKind, viewMode),
    // Re-compute only when the card occupying the slot changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawnId, viewMode],
  );
  const discardTraj = useMemo(
    () => {
      if (isHandSwapDiscard) {
        return swapHandDiscardTrajectory(swapHandSource, viewMode);
      }
      return discardCardTrajectory(discardArrivalKind, viewMode);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topDiscardId, viewMode, swapHandSource],
  );
  const topRotation = useMemo(
    () => topDiscardId ? pileRotation(topDiscardId, game.discard.length - 1, viewMode) : 0,
    [topDiscardId, game.discard.length, viewMode],
  );
  const topOffset = useMemo(
    () => topDiscardId ? pileOffset(topDiscardId, visiblePile.length - 1, viewMode) : { x: 0, y: 0 },
    [topDiscardId, visiblePile.length, viewMode],
  );

  // Pre-compute the stable animate target arrays so framer-motion doesn't
  // see "new array reference" on every render and restart the animation.
  const drawnAnimate = useMemo(
    () => drawnId ? drawnTraj.animate : null,
    [drawnId, drawnTraj],
  );
  const discardAnimate = useMemo(() => {
    if (!topDiscardId) return null;
    if (isHandSwapDiscard) {
      return swapHandDiscardAnimate(topOffset, topRotation, swapHandSource, viewMode);
    }
    return {
      x: [...discardTraj.animate.x.slice(0, -1), topOffset.x],
      y: [...discardTraj.animate.y.slice(0, -1), topOffset.y],
      opacity: 1,
      scale: 1,
      rotate: topRotation,
    };
  }, [topDiscardId, discardTraj, topOffset, topRotation, isHandSwapDiscard, swapHandSource, viewMode]);
  const drawnTransition = useMemo(
    () => centerCardArrivalTransition({ reduced, viewMode, isSwapDiscard: false }),
    [reduced, viewMode],
  );
  const discardTransition = useMemo(
    () =>
      isHandSwapDiscard
        ? swapHandDiscardTransition(reduced, viewMode)
        : centerCardArrivalTransition({ reduced, viewMode, isSwapDiscard }),
    [isHandSwapDiscard, isSwapDiscard, reduced, viewMode],
  );

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
                animate={reduced ? { opacity: 1 } : drawnAnimate!}
                exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.18 } }}
                transition={drawnTransition}
                style={{ position: "relative", zIndex: 5 }}
              >
                <CardView
                  card={drawn}
                  faceUp={isHumanTurn}
                  size={isDesktop ? "lg" : "md"}
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
                {/* Buried under-pile cards (everything below the top).
                    Pure static stamps: no motion.div, NO layoutId.
                    layoutId on a settled card caused continuous twitching
                    because framer-motion's LayoutGroup re-measured the
                    position every render and animated the subpixel
                    variance. These cards never move once placed, so we
                    drop the shared-element link and let CSS position them. */}
                {visiblePile.slice(0, -1).map((card, i) => {
                  const absoluteIdx = pileBaseAbsoluteIdx + i;
                  const rot = pileRotation(card.id, absoluteIdx, viewMode);
                  const { x, y } = pileOffset(card.id, i, viewMode);
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
                      />
                    </div>
                  );
                })}

                {/* Top card — animated entry from its source position.
                    NOTE: layoutId intentionally OMITTED on the top card's
                    CardView. The arc trajectory in discardAnimate already
                    handles the visual entrance; keeping a layoutId here
                    made framer-motion's LayoutGroup re-measure the card
                    on every unrelated movement elsewhere on the table,
                    producing a continuous twitch. The drawn card → discard
                    transition still reads as a glide because the arc starts
                    at the drawn-slot offset and animates to settle. */}
                {topDiscard && discardAnimate && (
                  <motion.div
                    key={topDiscard.id}
                    initial={reduced ? { opacity: 0 } : discardTraj.initial}
                    animate={reduced ? { opacity: 1 } : discardAnimate}
                    transition={discardTransition}
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
