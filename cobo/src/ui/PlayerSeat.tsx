import { motion, AnimatePresence } from "framer-motion";
import { CardView } from "./Card";
import type { PlayerState } from "../engine/types";
import { useStore, PLAYER_COLORS } from "../state/store";
import { useViewMode } from "../state/viewmode";
import { recordSwapHandSource } from "./swapHandMotion";
import { BOT_PROFILES } from "../ai/bots";

type TablePos = "top" | "left" | "right" | "bottom";

interface Props {
  player: PlayerState;
  seatIndex: number;
  totalSeats: number;
  isCurrent: boolean;
  isHuman: boolean;
  tablePos?: TablePos;
}

/** Spring for HAND-SLOT wrapper entrance animations (only fires for
 *  entries that don't have a layoutId source — e.g. round_start deal,
 *  initial mount). Swap / blind_swap / peek_and_swap let the shared-
 *  element layout animation on the inner CardView handle the glide. */
const CARD_SPRING = { type: "spring" as const, stiffness: 140, damping: 22, mass: 1.2 };

export function PlayerSeat({ player, seatIndex, isCurrent, isHuman, tablePos }: Props) {
  const viewMode = useViewMode();
  const isMobile = viewMode === "mobile";
  const cardSize = isHuman ? "lg" : "md";
  const game = useStore((s) => s.game!);
  const targeting = useStore((s) => s.targeting);
  const humanId = useStore((s) => s.humanId);
  const clickOwnCard = useStore((s) => s.clickOwnCard);
  const clickOtherCard = useStore((s) => s.clickOtherCard);
  const reveals = game.reveals;
  // In SP, bots show a stylized portrait + character name + speech bubble.
  const botDifficulty = useStore((s) => s.botDifficulty);
  const botSpeech = useStore((s) => s.botSpeech);
  const botProfile = player.isBot && botDifficulty ? BOT_PROFILES[botDifficulty] : null;
  const BotPortraitComp = botProfile?.Portrait;
  const hasSpeech = !!botSpeech && botSpeech.playerId === player.id;

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

  function rememberSwapHandSource(cardId: string, slotEl: HTMLElement) {
    if (!isHuman || targeting !== "swap_hand" || game.phase !== "turn_drawn") return;
    const discardArea = document.querySelector<HTMLElement>(".discard-card-area");
    recordSwapHandSource(
      cardId,
      slotEl.getBoundingClientRect(),
      discardArea?.getBoundingClientRect(),
    );
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
   *
   * For moves where the SOURCE card was visible on screen before landing
   * here (swap_hand: from drawn slot, blind_swap: from another seat,
   * peek_and_swap: from another seat) we return {} so the wrapper does
   * NOT run an entrance animation. Instead, framer-motion's shared-element
   * layout transition on the inner CardView (via layoutId={c.id}) glides
   * the card visibly from its previous on-screen position to here.
   *
   * The fallback offsets that used to live here (drop-from-above etc.)
   * caused the wrapper to translate ON TOP of the layout animation, which
   * compounded into a visible "snap then re-snap" feel. Now: ONE smooth
   * arc carries the card to its new home, every time.
   *
   * Deal (round start) and other unrecognised moves get a gentle fade-in
   * from a slight scale so empty slots don't pop into view.
   */
  function slotInitial(idx: number) {
    if (!lastAnim) return {};

    // Layout-id-handled moves — let the inner CardView glide via the shared
    // element transition. No wrapper offset.
    const layoutIdHandled =
      lastAnim.kind === "swap_hand" ||
      lastAnim.kind === "blind_swap" ||
      lastAnim.kind === "peek_and_swap";

    if (layoutIdHandled) return {};

    // Round-start deal — cards fly toward the seat from the centre (where
    // the deck sits). Direction varies per seat position.
    if (lastAnim.kind === "deal") {
      const offset =
        tablePos === "bottom" ? { y: -90 } :
        tablePos === "top"    ? { y: 90 }  :
        tablePos === "left"   ? { x: 60 }  :
        tablePos === "right"  ? { x: -60 } : {};
      return { ...offset, opacity: 0, scale: 0.85, rotate: (idx - 1.5) * 4 };
    }

    return {};
  }

  const known = player.knownToSelf;

  // Side players (left/right) render their card row horizontally then rotate it
  // so CABO text faces the person sitting on that side.
  // sm card: 56×81 → row of 4: ~266px wide × 93px tall
  // After rotation: wrapper is 93px wide × 266px tall.
  //
  // On MOBILE we skip the rotation entirely — all opponents sit in a single
  // horizontal row at the top of the screen, so left/right players are
  // rendered identically to the top player (no fixed-size wrapper, no
  // absolute positioning, no 90° transform).
  const isSide = !isMobile && (tablePos === "left" || tablePos === "right");
  const sideRotateDeg = tablePos === "right" ? -90 : 90;

  const cardSlots = player.hand.map((c, idx) => {
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
        data-player-id={player.id}
        data-hand-index={idx}
        onPointerDown={(event) => rememberSwapHandSource(c.id, event.currentTarget)}
        initial={hasInitial ? initial : false}
        animate={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
        transition={
          // Round-start deal staggers per card so each of the 4 cards in
          // a hand arrives a beat after the previous — reads as a real
          // deal, not a four-card splash.
          lastAnim?.kind === "deal"
            ? { ...CARD_SPRING, delay: 0.12 + idx * 0.09 }
            : CARD_SPRING
        }
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
  });

  return (
    <div className={`player-seat seat-${seatIndex}${tablePos ? ` pos-${tablePos}` : ""}${botProfile ? ` has-bot-portrait diff-${botProfile.difficultyClass}` : ""}`}>
      {BotPortraitComp ? (
        // Bot identifier — the portrait IS the nametag. No text name shown
        // in-game (the character is recognisable from their face). The
        // current-turn highlight ring lives here now.
        <div
          className={`bot-portrait-wrap bot-portrait-identifier${isCurrent ? " is-current" : ""}`}
          style={{ borderColor: botProfile!.accent }}
        >
          <BotPortraitComp size={isMobile ? 56 : 72} />
          {player.calledCabo && <span className="cabo-badge bot-cabo-badge">CABO!</span>}
          <AnimatePresence>
            {hasSpeech && (
              <motion.div
                key={botSpeech!.at}
                className="bot-speech-bubble"
                initial={{ opacity: 0, y: 8, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
              >
                {botSpeech!.text}
                <span className="bot-speech-tail" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
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
      )}

      {isSide ? (
        // Fixed-size wrapper reserves the post-rotation footprint (93×266).
        // The inner hand-row is a horizontal row that gets rotated into a column.
        <div className="hand-row-side-wrap">
          <div
            className="hand-row hand-row-side"
            style={{ transform: `translateX(-50%) translateY(-50%) rotate(${sideRotateDeg}deg)` }}
          >
            {cardSlots}
          </div>
        </div>
      ) : (
        <div className="hand-row">{cardSlots}</div>
      )}
    </div>
  );
}
