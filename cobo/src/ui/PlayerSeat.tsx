import { CardView } from "./Card";
import type { PlayerState } from "../engine/types";
import { useStore, PLAYER_COLORS } from "../state/store";

type TablePos = "top" | "left" | "right" | "bottom";

interface Props {
  player: PlayerState;
  seatIndex: number;
  totalSeats: number;
  isCurrent: boolean;
  isHuman: boolean;
  tablePos?: TablePos;
}

export function PlayerSeat({ player, seatIndex, isCurrent, isHuman, tablePos }: Props) {
  // Card size by position: side players get smaller cards in a 2×2 grid
  const cardSize = isHuman ? "lg" : (tablePos === "left" || tablePos === "right") ? "sm" : "md";
  const game = useStore((s) => s.game!);
  const targeting = useStore((s) => s.targeting);
  const humanId = useStore((s) => s.humanId);
  const clickOwnCard = useStore((s) => s.clickOwnCard);
  const clickOtherCard = useStore((s) => s.clickOtherCard);
  const reveals = game.reveals;

  const color = PLAYER_COLORS[seatIndex % PLAYER_COLORS.length];

  function cardFaceUp(idx: number): { faceUp: boolean; card: typeof player.hand[number] | null } {
    const c = player.hand[idx];
    if (!c) return { faceUp: false, card: null };

    // Round end: all face up
    if (game.phase === "round_over") return { faceUp: true, card: c };

    // (Setup peek face-up display is now driven by reveals — see the next check.)

    // Reveals targeting the human
    const r = reveals.find(
      (r) => r.playerId === player.id && r.index === idx && r.toPlayerIds.includes(humanId),
    );
    if (r) return { faceUp: true, card: r.card };

    // Player's own cards they "know" — show subtle indicator only, not face
    return { faceUp: false, card: c };
  }

  function cardHighlight(idx: number) {
    // During setup peek, the human can tap any unrevealed own card up to twice.
    if (game.phase === "setup_peek" && isHuman) {
      const peekedCount = player.knownToSelf.filter(Boolean).length;
      if (!player.knownToSelf[idx] && peekedCount < 2) return "selectable";
      return null;
    }
    const player1IsCurrent = isCurrent && isHuman;
    if (player1IsCurrent) {
      if (targeting === "swap_hand") return "selectable";
      if (targeting === "peek_own") return "selectable";
      if (targeting === "blind_swap_self") return "selectable";
      if (targeting === "peek_and_swap_self") return "selectable";
    } else if (!isHuman) {
      if (targeting === "peek_other") return "selectable";
      if (targeting === "blind_swap_target") return "selectable";
      if (targeting === "peek_and_swap_target_pick") return "selectable";
    }
    return null;
  }

  function handleClick(idx: number) {
    if (isHuman) {
      clickOwnCard(idx);
    } else {
      clickOtherCard(player.id, idx);
    }
  }

  // Spy glow: show a pulsing glow on any card actively being peeked at
  // (visible to ALL players so the target knows their card was spied on)
  function cardIsBeingSpied(idx: number): boolean {
    return reveals.some(
      (r) =>
        r.playerId === player.id &&
        r.index === idx &&
        (r.reason === "peek_other" || r.reason === "peek_and_swap"),
    );
  }

  const known = player.knownToSelf;

  return (
    <div className={`player-seat seat-${seatIndex}${tablePos ? ` pos-${tablePos}` : ""}`}>
      <div
        className="player-tag"
        style={{
          background: color,
          color: "#1c1d2b",
          fontWeight: 700,
          boxShadow: isCurrent ? "0 0 0 4px #ffd86b, 0 6px 12px rgba(0,0,0,0.3)" : "0 4px 8px rgba(0,0,0,0.2)",
        }}
      >
        <span>{player.name}</span>
        {player.calledCabo && <span className="cabo-badge">CABO!</span>}
      </div>
      <div className="hand-row">
        {player.hand.map((c, idx) => {
          const { faceUp, card } = cardFaceUp(idx);
          const hl = cardHighlight(idx);
          const knownDot = isHuman && known[idx] && !faceUp;
          const spied = cardIsBeingSpied(idx);
          return (
            <div className={`hand-slot${spied ? " spy-glow" : ""}`} key={c.id}>
              <CardView
                layoutId={c.id}
                card={card}
                faceUp={faceUp}
                highlight={hl}
                onClick={() => handleClick(idx)}
                size={cardSize}
              />
              {knownDot && <div className="known-dot" title="You've seen this card" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
