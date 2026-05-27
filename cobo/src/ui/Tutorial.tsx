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
      "Cabo is a memory game. Each round you score points equal to the cards you're holding when the round ends. The LOWEST total wins — so keep your hand low.",
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
      "If you DISCARD a drawn action card, its power triggers:\n  • 7 or 8 — peek at one of your own cards\n  • 9 or 10 — spy on one opponent card\n  • J or Q — blind-swap one of your cards with an opponent's\n  • K (any suit) — peek at any card, then optionally swap with one of yours\n(Swapping a drawn card into your hand does NOT trigger its action — only discarding does.)",
  },
  {
    title: "Snap a rival",
    body:
      "If you believe an opponent is holding a card whose rank matches the TOP of the discard pile, slap the Snap rival button and tap their card.\n\n  • Correct — that card is discarded and the opponent draws a fresh one.\n  • Wrong — YOU draw a penalty card straight into your hand. Your score rises.\n\nOne Snap rival per round.",
  },
  {
    title: "Snap yourself",
    body:
      "You can also Snap one of your OWN face-down cards if you believe its rank matches the discard top. Same rules — correct discards the card, wrong adds a penalty card.\n\nOne Snap self per round. Use it to flush a high card you peeked at setup.",
  },
  {
    title: "Calling CABO",
    body:
      "Skip your draw to call CABO. Every other player gets ONE more turn, then everyone reveals.\n\n  • If your hand IS the lowest AND ≤ 7 points → that round scores zero AND your hand value is SUBTRACTED from your running total.\n  • If your hand is NOT the lowest → you score your hand + a flat 5-point penalty.\n  • Otherwise — normal scoring.\n\nCabo is a bet. Reward when you're right, punishment when you're wrong.",
  },
  {
    title: "Scoring",
    body:
      "Ace = 1 · 2–10 = face value · J = 11 · Q = 12 · K = 13 · Joker = 0\n\nJokers are the best cards to hold — they're worth nothing. Kings are the worst — they're worth 13.\n\nThe scoreboard shows three columns: round score, Cabo Bonus (green, subtracted), Cabo Penalty (red, added). The Total combines all three.",
  },
  {
    title: "Meet the bots",
    body:
      "Single-player offers three rivals:\n\n  • Billy Smalls — naive, loose, calls Cabo at random.\n  • General Marcy — composed, textbook play, snaps when she knows.\n  • Bob — adaptive, ruthless, snaps in under half a second.\n\nPick the level that matches the fight you want.",
  },
  {
    title: "Bust! (Multiplayer)",
    body:
      "In multiplayer, your scores add up across every round. If your cumulative total exceeds 60 points you are BUSTED — permanently eliminated from the room.\n\nThe last player still standing wins a Glorious Victory. Late in a match, even a small Cabo penalty can push you over. Play accordingly.",
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
          <button
            className="tut-close"
            onClick={onClose}
            aria-label="Close tutorial"
          >
            ✕
          </button>
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
