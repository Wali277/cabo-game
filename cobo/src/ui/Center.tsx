import { AnimatePresence, motion } from "framer-motion";
import { CardView } from "./Card";
import { useStore } from "../state/store";

/**
 * Burn-style exit for discarded cards: brightness flash → orange glow → dissolve upward.
 * Matches the game's gold/fire aesthetic without any layout shift.
 */
const BURN_EXIT = {
  opacity: 0,
  scale: 1.18,
  y: -18,
  filter: "brightness(6) saturate(4) drop-shadow(0 0 28px rgba(255,140,0,1))",
  transition: { duration: 0.38, ease: [0.4, 0, 1, 1] as const },
};

/**
 * Flare entrance for a newly-landed discard: starts bright (like landing from fire)
 * then cools to normal. Spring-settled so it feels physical.
 */
const FLARE_ENTER_INITIAL = {
  opacity: 0,
  scale: 0.72,
  filter: "brightness(5) drop-shadow(0 0 22px rgba(255,180,0,0.9))",
};
const FLARE_ENTER_ANIMATE = {
  opacity: 1,
  scale: 1,
  filter: "brightness(1) drop-shadow(0 0 0px transparent)",
};

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
                initial={{ y: -44, opacity: 0, scale: 0.82,
                  filter: "brightness(1) drop-shadow(0 0 0px transparent)" }}
                animate={{ y: 0, opacity: 1, scale: 1,
                  filter: "brightness(1) drop-shadow(0 0 0px transparent)" }}
                exit={BURN_EXIT}
                transition={{ type: "spring", stiffness: 240, damping: 22 }}
              >
                <CardView card={drawn} faceUp={isHumanTurn} size="lg" />
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
          {/* AnimatePresence so each new top-card gets its own entrance flare */}
          <div className="discard-card-area">
            <AnimatePresence mode="wait">
              {topDiscard ? (
                <motion.div
                  key={topDiscard.id}
                  initial={FLARE_ENTER_INITIAL}
                  animate={FLARE_ENTER_ANIMATE}
                  transition={{ type: "spring", stiffness: 260, damping: 20, duration: 0.45 }}
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
