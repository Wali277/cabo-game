import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { CardView } from "./Card";
import { useStore } from "../state/store";
import type { GameState } from "../engine/types";

/** Slow, premium-feeling spring for cards arriving at the centre slots.
 *  Tuned for ~950ms perceived duration so the path is fully readable.
 *  Cards GLIDE — they do not snap into place. */
const CARD_SPRING = { type: "spring" as const, stiffness: 130, damping: 22, mass: 1.2 };

/**
 * Build a "fly + arc" trajectory for a card arriving in the drawn or
 * discard slot. We return BOTH the initial state and the animate keyframes
 * so the arc lift between start and settle is real (a single intermediate
 * peak gives a parabolic feel; the spring smooths the in-between).
 */
type Trajectory = {
  initial: { x: number; y: number; opacity: number; scale: number; rotate: number };
  animate: { x: number[]; y: number[]; opacity: number; scale: number; rotate: number };
};

function withArc(start: { x: number; y: number; rotate: number; scale: number }, lift: number): Trajectory {
  const midX = start.x / 2;
  // Peak Y is HIGHER (more negative) than start so the card lifts before
  // settling. lift is the additional vertical climb past the start point.
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
    // Arc in from the right (where the discard pile sits)
    return withArc({ x: 110, y: -28, rotate: 8, scale: 0.85 }, 30);
  }
  // draw_deck or default — fly in from the deck (to the left), arc over
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
      // Static load (no last animation) — just gently fade up
      return {
        initial: { x: 0, y: 0, opacity: 0, scale: 0.7, rotate: 0 },
        animate: { x: [0, 0, 0], y: [0, 0, 0], opacity: 1, scale: 1, rotate: 0 },
      };
  }
}

/**
 * Deterministic 4-degree-ish jitter per card id — the discard pile top
 * card rotates slightly so the stack looks like real cards thrown down,
 * not pixel-aligned sprites.
 */
function settleRotation(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  // Range -5° → +5°
  return (((h % 1000) / 1000) * 10) - 5;
}

export function Center() {
  const game = useStore((s) => s.game!);
  const humanId = useStore((s) => s.humanId);
  const reduced = useReducedMotion() ?? false;

  const isHumanTurn = game.players[game.currentPlayer].id === humanId;
  const canDraw = isHumanTurn && game.phase === "turn_start";
  const canDrawDiscard = canDraw && game.discard.length > 0;

  const drawn = game.drawnCard;
  const topDiscard = game.discard[game.discard.length - 1];

  const draw = useStore((s) => s.draw);
  const drawDiscard = useStore((s) => s.drawDiscard);

  // Compute trajectories once per render so initial + animate stay in sync.
  const drawnTraj = drawnTrajectory(game);
  const discardTraj = discardTrajectory(game);

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
                animate={reduced
                  ? { opacity: 1 }
                  : drawnTraj.animate}
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

        {/* ── Discard pile ── */}
        <button
          className={`pile discard ${canDrawDiscard ? "clickable" : ""}`}
          disabled={!canDrawDiscard}
          onClick={drawDiscard}
        >
          <div className="discard-card-area">
            <AnimatePresence mode="popLayout">
              {topDiscard ? (
                <motion.div
                  key={topDiscard.id}
                  initial={reduced ? { opacity: 0 } : discardTraj.initial}
                  animate={reduced
                    ? { opacity: 1 }
                    : {
                        ...discardTraj.animate,
                        // First card on the pile lands STRAIGHT. Subsequent
                        // cards rotate by a per-id jitter so the pile reads
                        // as a real stack growing on top of that base card.
                        rotate: game.discard.length <= 1
                          ? 0
                          : settleRotation(topDiscard.id),
                      }}
                  transition={reduced ? { duration: 0.15 } : CARD_SPRING}
                  style={{ position: "relative", zIndex: 5 }}
                >
                  <CardView
                    card={topDiscard}
                    faceUp={true}
                    size="md"
                    layoutId={topDiscard.id}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="empty-pile">Discard</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="pile-label">Discard</div>
        </button>

      </div>
    </div>
  );
}
