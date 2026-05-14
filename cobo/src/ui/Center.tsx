import { motion, AnimatePresence } from "framer-motion";
import { CardView } from "./Card";
import { useStore } from "../state/store";

export function Center() {
  const game = useStore((s) => s.game!);
  const draw = useStore((s) => s.draw);
  const drawDiscard = useStore((s) => s.drawDiscard);
  const humanId = useStore((s) => s.humanId);
  const targeting = useStore((s) => s.targeting);
  const discardDrawnAction = useStore((s) => s.discardDrawnAction);
  const setTargeting = useStore((s) => s.setTargeting);

  const isHumanTurn = game.players[game.currentPlayer].id === humanId;
  const canDraw = isHumanTurn && game.phase === "turn_start";
  const canDrawDiscard = canDraw && game.discard.length > 0;
  const canActOnDrawn = isHumanTurn && game.phase === "turn_drawn";

  const drawn = game.drawnCard;
  const topDiscard = game.discard[game.discard.length - 1];

  return (
    <div className="center-area">
      <div className="deck-area">
        <button
          className={`pile deck ${canDraw ? "clickable" : ""}`}
          disabled={!canDraw}
          onClick={draw}
        >
          <CardView card={null} faceUp={false} size="md" />
          <div className="pile-label">Draw {game.deck.length}</div>
        </button>

        <div className="drawn-slot">
          <AnimatePresence>
            {drawn && (
              <motion.div
                key={drawn.id}
                initial={{ y: -40, opacity: 0, rotate: -10 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                exit={{ y: 30, opacity: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
              >
                <CardView card={drawn} faceUp={true} size="lg" layoutId={drawn.id} />
              </motion.div>
            )}
          </AnimatePresence>
          {!drawn && <div className="drawn-placeholder">Drawn card</div>}
        </div>

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

      {canActOnDrawn && (
        <motion.div
          className="drawn-actions"
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <button className="btn primary" onClick={() => setTargeting("swap_hand")}>
            {targeting === "swap_hand" ? "Tap a card to swap…" : "Swap into hand"}
          </button>
          <button
            className="btn"
            onClick={discardDrawnAction}
            disabled={game.drawnFrom === "discard"}
            title={game.drawnFrom === "discard" ? "Cards drawn from discard must be swapped." : ""}
          >
            Discard
          </button>
        </motion.div>
      )}
    </div>
  );
}
