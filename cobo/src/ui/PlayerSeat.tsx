import { motion } from "framer-motion";
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

/** Spring for card movement animations. */
const CARD_SPRING = { type: "spring" as const, stiffness: 300, damping: 26 };

export function PlayerSeat({ player, seatIndex, isCurrent, isHuman, tablePos }: Props) {
  const cardSize = isHuman ? "lg" : (tablePos === "left" || tablePos === "right") ? "sm" : "md";
  const game = useStore((s) => s.game!);
  const targeting = useStore((s) => s.targeting);
  const humanId = useStore((s) => s.humanId);
  const clickOwnCard = useStore((s) => s.clickOwnCard);
  const clickOtherCard = useStore((s) => s.clickOtherCard);
  const reveals = game.reveals;

  const color = PLAYER_COLORS[seatIndex % PLAYER_COLORS.length];
  const lastAnim = game.animations[game.animations.length - 1];

  function cardFaceUp(idx: number): { faceUp: boolean; card: typeof player.hand[number] | null } {
    const c = player.hand[idx];
    if (!c) return { faceUp: false, card: null };
    if (game.phase === "round_over") return { faceUp: true, card: c };
    const r = reveals.find(
      (r) => r.playerId === player.id && r.index === idx && r.toPlayerIds.includes(humanId),
    );
    if (r) return { faceUp: true, card: r.card };
    return { faceUp: false, card: c };
  }

  function cardHighlight(idx: number) {
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
    if (isHuman) clickOwnCard(idx);
    else clickOtherCard(player.id, idx);
  }

  function cardIsBeingSpied(idx: number): boolean {
    return reveals.some(
      (r) =>
        r.playerId === player.id &&
        r.index === idx &&
        (r.reason === "peek_other" || r.reason === "peek_and_swap"),
    );
  }

  /**
   * Entrance animation for a card that just arrived in this slot.
   * Called when key changes (meaning the card ID in this slot just changed).
   */
  function slotInitial(idx: number) {
    if (!lastAnim) return {};

    if (lastAnim.kind === "swap_hand") {
      const p = lastAnim.payload as { playerId: string; handIndex: number };
      // The card just swapped in from the drawn slot — drops in from above
      if (p.playerId === player.id && p.handIndex === idx) {
        return { y: -70, opacity: 0, scale: 0.88 };
      }
    }

    if (lastAnim.kind === "blind_swap") {
      const p = lastAnim.payload as {
        fromPlayerId: string; fromIndex: number;
        toPlayerId: string; toIndex: number;
      };
      // Card arrived from another player — slide in from their direction
      if (p.toPlayerId === player.id && p.toIndex === idx) {
        return tablePos === "bottom"
          ? { y: -60, opacity: 0, scale: 0.88 }  // human receives: from above
          : { y: 60,  opacity: 0, scale: 0.88 }; // opponent receives: from below
      }
    }

    if (lastAnim.kind === "peek_and_swap") {
      const p = lastAnim.payload as { didSwap: boolean; targetPlayerId: string; targetIndex: number };
      if (p.didSwap) {
        // Receiving card: slide in from opponent direction
        if (p.targetPlayerId === player.id && p.targetIndex === idx) {
          return tablePos === "bottom"
            ? { y: -60, opacity: 0, scale: 0.88 }
            : { y: 60,  opacity: 0, scale: 0.88 };
        }
      }
    }

    return {};
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
          const initial = slotInitial(idx);
          const hasInitial = Object.keys(initial).length > 0;
          return (
            <motion.div
              className={`hand-slot${spied ? " spy-glow" : ""}`}
              key={c.id}
              initial={hasInitial ? initial : false}
              // Always target the fully-visible state so a slot can never get
              // stuck mid-animation (which previously caused cards to vanish
              // when another state update arrived during an entrance animation).
              animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              transition={CARD_SPRING}
            >
              <CardView
                card={card}
                faceUp={faceUp}
                highlight={hl}
                onClick={() => handleClick(idx)}
                size={cardSize}
                layoutId={c.id}
              />
              {knownDot && <div className="known-dot" title="You've seen this card" />}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
