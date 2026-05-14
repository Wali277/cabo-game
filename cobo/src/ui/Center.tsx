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
        {/* Deck pile — also clickable as a secondary shortcut */}
        <button
          className={`pile deck ${canDraw ? "clickable" : ""}`}
          disabled={!canDraw}
          onClick={draw}
        >
          <CardView card={null} faceUp={false} size="md" />
          <div className="pile-label">Deck · {game.deck.length}</div>
        </button>

        {/* Drawn card slot */}
        <div className="drawn-slot">
          <AnimatePresence>
            {drawn && (
              <motion.div
                key={drawn.id}
                initial={{ y: -50, opacity: 0, rotate: -12, scale: 0.8 }}
                animate={{ y: 0, opacity: 1, rotate: 0, scale: 1 }}
                exit={{ y: 30, opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 220, damping: 22 }}
              >
                <CardView card={drawn} faceUp={true} size="lg" layoutId={drawn.id} />
              </motion.div>
            )}
          </AnimatePresence>
          {!drawn && <div className="drawn-placeholder">Drawn card</div>}
        </div>

        {/* Discard pile — also clickable as a secondary shortcut */}
        <button
          className={`pile discard ${canDrawDiscard ? "clickable" : ""}`}
          disabled={!canDrawDiscard}
          onClick={drawDiscard}
        >
          {topDiscard ? (
            <CardView
              key={topDiscard.id}
              card={topDiscard}
              faceUp={true}
              size="md"
              layoutId={topDiscard.id}
            />
          ) : (
            <div className="empty-pile">Discard</div>
          )}
          <div className="pile-label">Discard</div>
        </button>
      </div>
    </div>
  );
}
