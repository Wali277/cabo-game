import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../state/store";

export function LeftPanel() {
  const game = useStore((s) => s.game!);
  const humanId = useStore((s) => s.humanId);
  const targeting = useStore((s) => s.targeting);
  const mode = useStore((s) => s.mode);
  const mp = useStore((s) => s.mp);

  const draw = useStore((s) => s.draw);
  const drawDiscard = useStore((s) => s.drawDiscard);
  const discardDrawnAction = useStore((s) => s.discardDrawnAction);
  const setTargeting = useStore((s) => s.setTargeting);
  const callCaboAction = useStore((s) => s.callCaboAction);
  const peekSwapDecide = useStore((s) => s.peekSwapDecide);
  const start = useStore((s) => s.start);

  const isHumanTurn = game.players[game.currentPlayer].id === humanId;
  const canDraw = isHumanTurn && game.phase === "turn_start";
  const canDrawDiscard = canDraw && game.discard.length > 0;

  const isHost = mode === "mp" ? mp?.hostId === mp?.viewerId : true;
  const me = game.players.find((p) => p.id === humanId);
  const peekedCount = me ? me.knownToSelf.filter(Boolean).length : 0;

  let emoji = "";
  let instruction = "";
  let buttons: React.ReactNode = null;

  if (game.phase === "setup_peek") {
    emoji = "👀";
    instruction =
      peekedCount === 0
        ? "Tap any 2 of your cards to peek at them."
        : peekedCount === 1
        ? "One more — pick another card (or skip)."
        : isHost
        ? "Memorised? Start when ready!"
        : "Memorised your cards. Waiting for host…";
    if (isHost) {
      buttons = (
        <button className="btn primary left-btn" onClick={start}>
          {peekedCount === 0 ? "⏩ Skip & start" : peekedCount < 2 ? "▶ Start now" : "▶ Start round"}
        </button>
      );
    }
  } else if (game.phase === "round_over") {
    emoji = "🏁";
    instruction = "Round over!";
  } else if (!isHumanTurn) {
    emoji = "⌛";
    instruction = `${game.players[game.currentPlayer].name} is thinking…`;
  } else {
    switch (game.phase) {
      case "turn_start":
        emoji = "🎴";
        instruction = "Your turn — draw a card or call CABO!";
        buttons = (
          <>
            <button
              className="btn primary left-btn"
              disabled={!canDraw}
              onClick={draw}
            >
              🂠 Draw from Deck
            </button>
            <button
              className="btn left-btn"
              disabled={!canDrawDiscard}
              title={!canDrawDiscard ? "Discard pile is empty" : ""}
              onClick={drawDiscard}
            >
              ♻ Draw from Discard
            </button>
            <div className="left-divider" />
            <button className="btn danger left-btn" onClick={callCaboAction}>
              🚨 Call CABO!
            </button>
          </>
        );
        break;

      case "turn_drawn":
        emoji = "✋";
        instruction =
          targeting === "swap_hand"
            ? "Tap one of your cards to swap it in."
            : "Choose what to do with your drawn card.";
        buttons = (
          <>
            <button
              className={`btn left-btn ${targeting === "swap_hand" ? "primary" : ""}`}
              onClick={() => setTargeting("swap_hand")}
            >
              🔄 {targeting === "swap_hand" ? "Pick a card to swap…" : "Swap into Hand"}
            </button>
            <button
              className="btn left-btn"
              disabled={game.drawnFrom === "discard"}
              title={
                game.drawnFrom === "discard"
                  ? "Cards drawn from discard must be swapped."
                  : ""
              }
              onClick={discardDrawnAction}
            >
              🗑 Discard
            </button>
          </>
        );
        break;

      case "action_peek_own":
        emoji = "👁";
        instruction = "Tap one of YOUR own cards to peek at it.";
        break;

      case "action_peek_other":
        emoji = "🔍";
        instruction = "Tap one of an OPPONENT's cards to spy on it.";
        break;

      case "action_blind_swap":
        emoji = "🔀";
        instruction =
          targeting === "blind_swap_self"
            ? "Blind Swap — pick one of YOUR cards first."
            : "Now pick an OPPONENT's card to swap with.";
        break;

      case "action_peek_and_swap_pick":
        emoji = "👑";
        instruction = "Pick an opponent's card to peek at.";
        break;

      case "action_peek_and_swap_decide":
        emoji = "👑";
        instruction = "You peeked! Do you want to swap it into your hand?";
        buttons = (
          <>
            <button
              className="btn primary left-btn"
              onClick={() => peekSwapDecide(true)}
            >
              ✅ Yes, swap it in
            </button>
            <button
              className="btn left-btn"
              onClick={() => peekSwapDecide(false)}
            >
              ❌ No, keep mine
            </button>
          </>
        );
        break;
    }
  }

  return (
    <div className="left-panel">
      <AnimatePresence mode="wait">
        <motion.div
          key={instruction}
          className="left-instruction"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.18 }}
        >
          {emoji && <div className="left-emoji">{emoji}</div>}
          <p className="left-text">{instruction}</p>
        </motion.div>
      </AnimatePresence>

      {buttons && (
        <motion.div
          className="left-buttons"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.08 }}
        >
          {buttons}
        </motion.div>
      )}
    </div>
  );
}
