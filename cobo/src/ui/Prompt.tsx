import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../state/store";

export function Prompt() {
  const game = useStore((s) => s.game!);
  const targeting = useStore((s) => s.targeting);
  const humanId = useStore((s) => s.humanId);
  const peekSwapDecide = useStore((s) => s.peekSwapDecide);
  const callCaboAction = useStore((s) => s.callCaboAction);
  const start = useStore((s) => s.start);

  const isHumanTurn = game.players[game.currentPlayer].id === humanId;
  let text: string | null = null;
  let extra: React.ReactNode = null;

  if (game.phase === "setup_peek") {
    const mode = useStore.getState().mode;
    const mp = useStore.getState().mp;
    const isHost = mode === "mp" ? mp?.hostId === mp?.viewerId : true;
    const me = game.players.find((p) => p.id === humanId);
    const peekedCount = me ? me.knownToSelf.filter(Boolean).length : 0;
    text =
      peekedCount === 0
        ? "Tap any 2 of your cards to peek at them."
        : peekedCount === 1
        ? "One more — pick another card to peek (or skip)."
        : isHost
        ? "Memorise your two cards, then start the round."
        : "Memorise your two cards. Waiting for host…";
    extra = (
      <div className="row gap">
        {isHost && (
          <button className="btn primary" onClick={start}>
            {peekedCount === 0 ? "Skip peek & start" : peekedCount < 2 ? "Start now" : "Start round"}
          </button>
        )}
        {!isHost && peekedCount > 0 && (
          <span className="prompt-text small">Peeked {peekedCount}/2</span>
        )}
      </div>
    );
  } else if (game.phase === "round_over") {
    text = `Round over! ${game.players.find((p) => p.id === game.winnerId)?.name} wins this round.`;
  } else if (!isHumanTurn) {
    text = `${game.players[game.currentPlayer].name} is thinking…`;
  } else {
    switch (game.phase) {
      case "turn_start":
        text = "Your turn. Draw a card, or call LUMO if you think you're winning.";
        extra = (
          <button className="btn danger" onClick={callCaboAction}>
            Call LUMO!
          </button>
        );
        break;
      case "turn_drawn":
        text = targeting === "swap_hand"
          ? "Pick one of your cards to swap in."
          : "Swap into your hand, or discard. Action cards trigger when discarded.";
        break;
      case "action_peek_own":
        text = "Peek: tap one of YOUR cards.";
        break;
      case "action_peek_other":
        text = "Peek: tap one of an OPPONENT's cards.";
        break;
      case "action_blind_swap":
        text = targeting === "blind_swap_self"
          ? "Blind swap — pick one of YOUR cards first."
          : "Now pick an OPPONENT's card to swap with.";
        break;
      case "action_peek_and_swap_pick":
        text = "Pick an opponent's card to peek at.";
        break;
      case "action_peek_and_swap_decide":
        text = "You peeked. Swap with one of yours?";
        extra = (
          <div className="row gap">
            <button className="btn primary" onClick={() => peekSwapDecide(true)}>Yes, swap</button>
            <button className="btn" onClick={() => peekSwapDecide(false)}>No, keep</button>
          </div>
        );
        break;
    }
  }

  return (
    <AnimatePresence mode="wait">
      {text && (
        <motion.div
          key={text}
          className="prompt-bar"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 20 }}
        >
          <span className="prompt-text">{text}</span>
          {extra}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
