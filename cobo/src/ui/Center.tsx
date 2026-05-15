import { motion, AnimatePresence } from "framer-motion";
import { CardView } from "./Card";
import { useStore } from "../state/store";
import type { GameState } from "../engine/types";

/** Spring shared across all card movement animations. */
const CARD_SPRING = { type: "spring" as const, stiffness: 300, damping: 26 };

/** Return the entrance initial state for the DRAWN CARD SLOT based on last action. */
function drawnInitial(g: GameState) {
  const last = g.animations[g.animations.length - 1];
  if (last?.kind === "draw_discard") return { x: 100, opacity: 0, scale: 0.88 };
  return { y: -52, opacity: 0, scale: 0.88 }; // draw_deck or default — drops from above
}

/** Return the entrance initial state for the DISCARD PILE TOP based on last action. */
function discardInitial(g: GameState) {
  const last = g.animations[g.animations.length - 1];
  switch (last?.kind) {
    case "discard_drawn":   return { x: -80, opacity: 0, scale: 0.88 }; // comes from drawn slot (left)
    case "swap_hand":       return { y: 90,  opacity: 0, scale: 0.88 }; // displaced card rises from hand (below)
    case "blind_swap":      return { y: 70,  opacity: 0, scale: 0.88 };
    case "peek_and_swap":   return { y: 70,  opacity: 0, scale: 0.88 };
    default:                return { scale: 0.72, opacity: 0 };
  }
}

export function Center() {
  const game = useStore((s) => s.game!);
  const humanId = useStore((s) => s.humanId);

  const isHumanTurn = game.players[game.currentPlayer].id === humanId;
  const canDraw = isHumanTurn && game.phase === "turn_start";
  const canDrawDiscard = canDraw && game.discard.length > 0;

  const drawn = game.drawnCard;
  const topDiscard = game.discard[game.discard.length - 1];

  const draw = useStore((s) => s.draw);
  const drawDiscard = useStore((s) => s.drawDiscard);

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
                initial={drawnInitial(game)}
                animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.15 } }}
                transition={CARD_SPRING}
              >
                <CardView card={drawn} faceUp={isHumanTurn} size="lg" />
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
                  initial={discardInitial(game)}
                  animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  transition={CARD_SPRING}
                >
                  <CardView card={topDiscard} faceUp={true} size="md" />
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
