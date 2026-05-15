import { AnimatePresence, motion } from "framer-motion";
import { CardView } from "./Card";
import { useStore } from "../state/store";

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

        {/* ── Drawn card slot — fixed size so layout never jumps ── */}
        <div className="drawn-slot">
          <AnimatePresence mode="wait">
            {drawn ? (
              <motion.div
                key={drawn.id}
                initial={{ y: -36, opacity: 0, scale: 0.85 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 240, damping: 22 }}
              >
                {/* layoutId lets this card fly to/from hand or discard via shared-element */}
                <CardView layoutId={drawn.id} card={drawn} faceUp={isHumanTurn} size="lg" />
              </motion.div>
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
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
            <AnimatePresence mode="wait">
              {topDiscard ? (
                <motion.div
                  key={topDiscard.id}
                  initial={{ opacity: 0, scale: 0.82 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 22 }}
                >
                  {/* layoutId makes displaced hand cards fly into the discard pile */}
                  <CardView layoutId={topDiscard.id} card={topDiscard} faceUp={true} size="md" />
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
