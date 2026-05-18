import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

interface Slide {
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    title: "Goal",
    body:
      "Cabo is a memory game. Each round you score points equal to the cards you're holding when the round ends. The LOWEST score wins — so keep your hand low.",
  },
  {
    title: "Setup",
    body:
      "You're dealt 4 cards face-down. Tap any 2 of them at the start to peek — you'll remember them but they go face-down again when the round begins.",
  },
  {
    title: "Your turn",
    body:
      "On your turn you can:\n  • Draw the top card from the deck\n  • Take the top card from the discard pile\n  • Call CABO! to end the round on your terms",
  },
  {
    title: "After you draw",
    body:
      "Swap the drawn card into one of your 4 slots (the old card goes to the discard), OR discard the drawn card. If you drew from the discard pile you must swap — you can't re-discard.",
  },
  {
    title: "Action cards",
    body:
      "If you DISCARD a drawn action card, its power triggers:\n  • 7 or 8 — peek at one of your own cards\n  • 9 or 10 — spy on one opponent card\n  • J or Q — blind-swap one of your cards with an opponent's\n  • K (any suit) — peek at any card, then optionally swap with one of yours\n(Swapping a hand card does NOT trigger its action — only discarding the drawn card.)",
  },
  {
    title: "Snap (throw-in)",
    body:
      "At any time, if you have a card matching the rank on top of the discard pile, tap it to snap. Right snap: that card leaves your hand. Wrong snap: you take a penalty card from the deck.",
  },
  {
    title: "Calling CABO",
    body:
      "Skip your draw to call CABO. Every other player gets ONE more turn, then everyone reveals. Lowest hand total wins the round. Calling CABO doesn't protect you — if your hand isn't the lowest, you still score whatever you're holding.",
  },
  {
    title: "Scoring",
    body:
      "Ace = 1 · 2–10 = face value · J = 11 · Q = 12 · K = 13 · Joker = 0\n\nJokers are the best cards to hold — they're worth nothing! Kings are the most dangerous — they're worth 13 points. Round scores stack across rounds — lowest total after all rounds wins.",
  },
  {
    title: "Bust! (Multiplayer)",
    body:
      "In multiplayer, your scores add up across every round. If your cumulative total exceeds 60 points you are BUSTED — permanently eliminated from the room. No rejoining, no exceptions!\n\nThe last player still standing wins a Glorious Victory. Play smart: keeping each round's score low is how you survive the long game. Kings and Jacks are your worst enemies late in a session.",
  },
];

interface Props {
  onClose: () => void;
}

export function Tutorial({ onClose }: Props) {
  const [idx, setIdx] = useState(0);
  const slide = SLIDES[idx];
  const last = idx === SLIDES.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        className="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="modal tutorial-modal"
          initial={{ scale: 0.7, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="tut-step">Step {idx + 1} of {SLIDES.length}</div>
          <h2>{slide.title}</h2>
          <p className="tut-body">{slide.body}</p>
          <div className="tut-dots">
            {SLIDES.map((_, i) => (
              <span
                key={i}
                className={`dot ${i === idx ? "active" : ""}`}
                onClick={() => setIdx(i)}
              />
            ))}
          </div>
          <div className="row gap center">
            <button
              className="btn"
              onClick={() => (idx === 0 ? onClose() : setIdx(idx - 1))}
            >
              {idx === 0 ? "Close" : "← Back"}
            </button>
            <button
              className="btn primary big"
              onClick={() => (last ? onClose() : setIdx(idx + 1))}
            >
              {last ? "Got it!" : "Next →"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
