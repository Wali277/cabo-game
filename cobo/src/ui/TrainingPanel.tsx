import { useStore } from "../state/store";
import { CardView } from "./Card";
import type { Card } from "../engine/types";

type TrainCard = { card: Card; label: string };

/** Classic Cabo training set (one per interesting rank/suit). */
const TRAINING_CARDS_CLASSIC: TrainCard[] = [
  // Action cards — discarding triggers their ability
  { card: { id: "tr7",  rank: "7",     suit: "S" }, label: "Peek Own"   },
  { card: { id: "tr8",  rank: "8",     suit: "S" }, label: "Peek Own"   },
  { card: { id: "tr9",  rank: "9",     suit: "S" }, label: "Peek Other" },
  { card: { id: "tr10", rank: "10",    suit: "S" }, label: "Peek Other" },
  { card: { id: "trJ",  rank: "J",     suit: "S" }, label: "Blind Swap" },
  { card: { id: "trQ",  rank: "Q",     suit: "S" }, label: "Blind Swap" },
  { card: { id: "trKH", rank: "K",     suit: "H" }, label: "Peek+Swap"  },
  { card: { id: "trKS", rank: "K",     suit: "S" }, label: "Peek+Swap"  },
  // Jokers (0 pts, no action)
  { card: { id: "trJR", rank: "Joker", suit: "H" }, label: "Joker 0pt"  },
  { card: { id: "trJB", rank: "Joker", suit: "S" }, label: "Joker 0pt"  },
  // Plain-value cards for score testing
  { card: { id: "trA",  rank: "A",     suit: "H" }, label: "Ace 1pt"    },
  { card: { id: "tr5",  rank: "5",     suit: "H" }, label: "5 pts"      },
  { card: { id: "tr6",  rank: "6",     suit: "H" }, label: "6 pts"      },
];

/** Cabo Evolved training set — the Dragon up front, plus Evolved action labels
 *  (7/8 peek-or-spy, 9/10 peek+spy, J/Q blind swap, K = 0 / no action). Inject
 *  the same rank repeatedly and swap each into hand to build a Carré, or finish
 *  on a 0 hand to trigger a Kamikaze. */
const TRAINING_CARDS_EVOLVED: TrainCard[] = [
  { card: { id: "trDragon", rank: "Dragon", suit: "S" }, label: "🐉 Dragon"  },
  { card: { id: "tr7e",  rank: "7",     suit: "S" }, label: "Peek/Spy"   },
  { card: { id: "tr8e",  rank: "8",     suit: "S" }, label: "Peek/Spy"   },
  { card: { id: "tr9e",  rank: "9",     suit: "S" }, label: "Peek+Spy"   },
  { card: { id: "tr10e", rank: "10",    suit: "S" }, label: "Peek+Spy"   },
  { card: { id: "trJe",  rank: "J",     suit: "S" }, label: "Blind Swap" },
  { card: { id: "trQe",  rank: "Q",     suit: "S" }, label: "Blind Swap" },
  { card: { id: "trKe",  rank: "K",     suit: "S" }, label: "King 0pt"   },
  { card: { id: "trJoke",rank: "Joker", suit: "H" }, label: "Joker 0pt"  },
  { card: { id: "trAe",  rank: "A",     suit: "H" }, label: "Ace 1pt"    },
  { card: { id: "tr5e",  rank: "5",     suit: "H" }, label: "5 pts"      },
];

export function TrainingPanel() {
  const training       = useStore((s) => s.training);
  const game           = useStore((s) => s.game);
  const humanId        = useStore((s) => s.humanId);
  const injectCard     = useStore((s) => s.trainingInjectCard);

  if (!training || !game) return null;

  // Buttons are only clickable when it's the human's turn to draw
  const isHumanTurn =
    game.players[game.currentPlayer]?.id === humanId;
  const canInject = isHumanTurn && game.phase === "turn_start";
  const isEvolved = game.variant === "evolved";
  const cards = isEvolved ? TRAINING_CARDS_EVOLVED : TRAINING_CARDS_CLASSIC;

  return (
    <div className="training-panel">
      <div className="training-panel-header">
        <span className="training-badge">{isEvolved ? "DEV · EVOLVED" : "DEV · CLASSIC"}</span>
        <span className="training-panel-label">
          Training Chamber — click a card to inject it as your drawn card
          {!canInject && " (available on your turn)"}
        </span>
      </div>

      <div className="training-cards-row">
        {cards.map(({ card, label }) => (
          <button
            key={card.id}
            className="training-card-btn"
            disabled={!canInject}
            onClick={() => injectCard(card)}
            title={`Inject ${card.rank} (${label})`}
          >
            <CardView
              card={card}
              faceUp={true}
              size="sm"
              flipDuration={0}
            />
            <span className="training-card-label">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
