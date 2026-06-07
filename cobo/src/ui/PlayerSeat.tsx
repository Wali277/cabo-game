import { motion, AnimatePresence } from "framer-motion";
import { CardView, cardPx } from "./Card";
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
/** Mobile: cheap fixed tween for slot entrances (deal / snap-replacement card)
 *  instead of the spring — springs re-solve per frame and felt jaggy on phones. */
const CARD_TWEEN_MOBILE = { type: "tween" as const, duration: 0.34, ease: [0.22, 1, 0.36, 1] as const };

export function PlayerSeat({ player, seatIndex, isCurrent, isHuman, tablePos }: Props) {
  const viewMode = useViewMode();
  const isMobile = viewMode === "mobile";
  // Card size hierarchy. Desktop keeps the original lg/md split. Mobile packs
  // a compact spatial table: your hand stays large (lg), the front opponent
  // gets a medium strip (sm), and the slim left/right side rails get the
  // smallest cards (xs) so a 2×2 cluster fits a narrow gutter.
  // Your hand shrinks as snap penalties push it past 4 cards so the row keeps
  // fitting the screen width instead of overflowing the edges.
  const handLen = player.hand.length;
  // Side seats (left/right) render in a 90°-rotated rail whose wrapper
  // (.hand-row-side-wrap = 128×362) and overflow placeholders (80×116) are
  // sized for `md` (80px). They must use `md`, NOT `lg`: `lg` (110px → ~160px
  // tall after rotation) overflows the rail, so the side hands rendered
  // oversized and crowded the centre deck. Top opponent keeps `lg` to match
  // the human's hand; the human keeps `lg` (desktop).
  const isSideSeat = tablePos === "left" || tablePos === "right";
  const cardSize: "xs" | "sm" | "md" | "lg" = isHuman
    ? !isMobile
      ? "lg"
      : handLen > 6
      ? "sm"
      : handLen > 4
      ? "md"
      : "lg"
    : !isMobile
    ? isSideSeat
      ? "md" // side rails are sized for md — see .hand-row-side-wrap in App.css
      : "lg" // top opponent matches the human's hand size (desktop)
    // Mobile: all opponents — top AND left/right — use sm (48), so the side
    // players match the top player's card size. Side players render in the
    // rotated vertical rail (below), same placement as the top row reads.
    : "sm";
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
    // findLast — when multiple reveals land on the same slot (e.g. a peek
    // followed by a peek_and_swap, or a peek_other followed by a snap_reveal),
    // the NEWEST should win. find() returns the first match and would freeze
    // the slot on a stale card.
    const r = reveals.findLast(
      (r) => r.playerId === player.id && r.index === idx && r.toPlayerIds.includes(humanId),
    );
    if (r) return { faceUp: true, card: r.card };
    return { faceUp: false, card: c };
  }

  // Snap pick-gating is phase-agnostic — it's driven by game.snapPhase +
  // game.snappingPlayerId. The snapping player can ONLY click into the
  // valid pick set; everyone else is read-only until the snap resolves.
  const iAmSnapping =
    (game.snapPhase === "armed_self" || game.snapPhase === "armed_other") &&
    game.snappingPlayerId === humanId;
  const someoneIsSnapping = game.snapPhase !== "idle";

  function cardHighlight(idx: number) {
    if (game.phase === "setup_peek" && isHuman) {
      const peekedCount = player.knownToSelf.filter(Boolean).length;
      if (!player.knownToSelf[idx] && peekedCount < 2) return "selectable";
      return null;
    }
    // Cinematic-first snap pick-gating. Engine snapPhase is the source of
    // truth — the local targeting flag follows it but the engine state is
    // what matters for cross-client correctness.
    if (iAmSnapping && game.snapPhase === "armed_self" && isHuman) {
      return "selectable";
    }
    if (iAmSnapping && game.snapPhase === "armed_other" && !isHuman) {
      return "selectable";
    }
    // While ANY snap is in flight, suppress all other selectable highlights
    // so the player can't double-dip into a different action mid-snap.
    if (someoneIsSnapping) return null;
    // Legacy targeting flags (still used in conjunction with snapPhase as a
    // belt-and-braces — store sets these alongside the engine arm action).
    if (targeting === "snap_self_target" && isHuman) {
      return "selectable";
    }
    if (targeting === "snap_other_target" && !isHuman) {
      return "selectable";
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
    // While a snap is in flight: only the snapping player can pick, and
    // only inside the valid set (own cards for armed_self, opponent cards
    // for armed_other). Everyone else's clicks are no-ops.
    if (someoneIsSnapping) {
      if (!iAmSnapping) return;
      if (game.snapPhase === "armed_self") {
        if (!isHuman) return;
        clickOwnCard(idx);
        return;
      }
      if (game.snapPhase === "armed_other") {
        if (isHuman) return;
        clickOtherCard(player.id, idx);
        return;
      }
      // revealing / resolving — input is fully gated.
      return;
    }
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

    // Rival/self snap success — only the TARGET slot gets a new card; it
    // should glide in from the deck (centre of table) so the player sees
    // the replacement arrive. Direction matches the deal animation so the
    // single new card reads as "fresh deal into this slot".
    if (lastAnim.kind === "snap_correct") {
      const targetId = lastAnim.payload.targetId as string | undefined;
      const targetIndex = lastAnim.payload.targetIndex as number | undefined;
      if (targetId === player.id && targetIndex === idx) {
        const offset =
          tablePos === "bottom" ? { y: -90 } :
          tablePos === "top"    ? { y: 90 }  :
          tablePos === "left"   ? { x: 60 }  :
          tablePos === "right"  ? { x: -60 } : {};
        return { ...offset, opacity: 0, scale: 0.85, rotate: 0 };
      }
    }

    return {};
  }

  const known = player.knownToSelf;

  // Side players (left/right) render their card row horizontally then rotate it
  // so LUMO text faces the person sitting on that side.
  // sm card: 56×81 → row of 4: ~266px wide × 93px tall
  // After rotation: wrapper is 93px wide × 266px tall.
  //
  // On MOBILE we skip the rotation entirely — all opponents sit in a single
  // horizontal row at the top of the screen, so left/right players are
  // rendered identically to the top player (no fixed-size wrapper, no
  // absolute positioning, no 90° transform).
  // Side players render their hand as a single horizontal row rotated 90° so
  // it reads as a vertical column on the rail (matching the desktop/web look),
  // with snap-penalty overflow cards tucked behind the 2nd/3rd cards. Enabled
  // on mobile too — the wrapper is sized down for the small xs cards in CSS.
  const isSide = isSideSeat;
  const sideRotateDeg = tablePos === "right" ? -90 : 90;

  const cardSlots = player.hand.map((c, idx) => {
    // Empty slot left over from a correct self-snap. Render a placeholder
    // that keeps the row's spacing but isn't interactive — the slot can
    // later be refilled by a wrong-snap penalty card. Match the ghost
    // dimensions to the active card size so the row's width is stable.
    if (!c) {
      const ghostW = cardPx(cardSize, viewMode);
      const ghostH = Math.round(ghostW * 1.45);
      return (
        <div
          className="hand-slot hand-slot-empty"
          key={`empty-${player.id}-${idx}`}
          data-player-id={player.id}
          data-hand-index={idx}
          aria-hidden
        >
          <div
            className="hand-slot-empty-ghost"
            style={{ width: ghostW, height: ghostH }}
          />
        </div>
      );
    }
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
          // deal, not a four-card splash. Mobile uses a cheap tween base
          // (keeps the stagger) to avoid the spring's per-frame jank.
          lastAnim?.kind === "deal"
            ? { ...(isMobile ? CARD_TWEEN_MOBILE : CARD_SPRING), delay: 0.12 + idx * 0.09 }
            : isMobile
            ? CARD_TWEEN_MOBILE
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

  // When a side player picks up snap-penalty cards their hand can exceed 4.
  // The first 4 cards go in the MAIN row (original wrapper, unchanged
  // position). Cards 5+ go in an absolutely-positioned BACK row outside the
  // main wrapper on the OUTER (screen-edge) side — see CSS for placement.
  //
  // The back row uses a 4-SLOT structure (matching the main row) with
  // empty placeholders in slots 1 and 4, so the overflow cards land
  // EXACTLY behind main card 2 (first overflow) and main card 3 (second
  // overflow). Without the placeholders a single overflow card would
  // visually centre between cards 2 and 3, which felt off.
  // On MOBILE, side players render ALL their cards in the single rotated row
  // so snap-penalty cards simply CONTINUE the column (the line grows toward
  // the centre / downward) instead of tucking behind cards 2–3. The wrapper
  // height is sized to the card count below so the longer column has room and
  // the portrait stays clear above it. DESKTOP keeps the main(4)+back-row
  // (overflow tucked outside) behaviour unchanged.
  const sideMainSlots = isSide ? (isMobile ? cardSlots : cardSlots.slice(0, 4)) : cardSlots;
  const sideOverflowSlots = isSide && !isMobile ? cardSlots.slice(4) : [];
  const sideHasOverflow = isSide && !isMobile && sideOverflowSlots.length > 0;
  // Build the back-row's 4-slot array. The overflow (5th+) cards fill the row
  // FROM THE START so the second row reads left-to-right in the SAME direction
  // as the main row: the first overflow card (the 5th card) lands at slot 0 —
  // aligned with main card 1 — and each further penalty card extends along the
  // row from there. Trailing empty slots keep the back row the same width as
  // the main row so the rotation + centering line the two columns up.
  const sideBackRowSlots = sideHasOverflow
    ? [0, 1, 2, 3].map((i) =>
        sideOverflowSlots[i] ?? (
          <div className="hand-slot hand-slot-placeholder" key={`back-ph-${i}`} aria-hidden />
        ),
      )
    : [];

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
          <BotPortraitComp size={isMobile ? (tablePos === "left" || tablePos === "right" ? 28 : 52) : 72} />
          {player.calledCabo && <span className="cabo-badge bot-cabo-badge">LUMO!</span>}
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
          {player.calledCabo && <span className="cabo-badge">LUMO!</span>}
        </div>
      )}

      {isSide ? (
        // Side player: render the main 4-card wrapper EXACTLY as before (no
        // size change so the main row never shifts in the table layout). When
        // the hand grows past 4 we render a SIBLING "back-row" wrapper that
        // is ABSOLUTELY positioned next to the main wrapper on the OUTER
        // (screen-edge) side. Because the back wrapper is absolute it
        // doesn't contribute to the player-seat's measured size, so the
        // main wrapper — and therefore the four main cards — stays exactly
        // where it was before the penalty card arrived.
        //   LEFT player  → back-row at `right: 100%` (LEFT of main wrapper).
        //   RIGHT player → back-row at `left: 100%`  (RIGHT of main wrapper).
        // CSS picks the side via .pos-left / .pos-right on .side-hands-group.
        // Side player: rotated vertical rail (same placement on mobile and
        // desktop). On mobile the wrapper height grows with the card count so
        // snap-penalty cards extend the line. Cards are sm (48) — matching the
        // top player. 4 sm cards × 48 + 4px gaps + 12 padding.
        <div className={`side-hands-group pos-${tablePos}${sideHasOverflow ? " has-back" : ""}`}>
          <div
            className="hand-row-side-wrap"
            style={
              isMobile && isSide
                ? { height: handLen * cardPx("sm", viewMode) + (handLen - 1) * 4 + 12 }
                : undefined
            }
          >
            <div
              className="hand-row hand-row-side"
              style={{ transform: `translateX(-50%) translateY(-50%) rotate(${sideRotateDeg}deg)` }}
            >
              {sideMainSlots.length ? sideMainSlots : cardSlots}
            </div>
          </div>
          {sideHasOverflow && (
            <div className="hand-row-side-wrap hand-row-side-wrap-back">
              <div
                className="hand-row hand-row-side"
                style={{ transform: `translateX(-50%) translateY(-50%) rotate(${sideRotateDeg}deg)` }}
              >
                {sideBackRowSlots}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="hand-row">{cardSlots}</div>
      )}
    </div>
  );
}
