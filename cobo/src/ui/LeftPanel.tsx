import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { actionOf } from "../engine/game";
import { Audio } from "../audio/sounds";

/** Maps a card rank to its action label, emoji, and tooltip description. */
const ACTION_META: Record<string, { label: string; emoji: string; desc: string; color: string }> = {
  "7":  { label: "Peek Own",    emoji: "👁",  desc: "Look at one of YOUR own cards.",             color: "#67e0a3" },
  "8":  { label: "Peek Own",    emoji: "👁",  desc: "Look at one of YOUR own cards.",             color: "#67e0a3" },
  "9":  { label: "Spy",         emoji: "🔍", desc: "Spy on one of an OPPONENT's cards.",         color: "#7aa8ff" },
  "10": { label: "Spy",         emoji: "🔍", desc: "Spy on one of an OPPONENT's cards.",         color: "#7aa8ff" },
  "J":  { label: "Blind Swap",  emoji: "🔀", desc: "Swap your card with an opponent's blindly.", color: "#ff8ec0" },
  "Q":  { label: "Blind Swap",  emoji: "🔀", desc: "Swap your card with an opponent's blindly.", color: "#ff8ec0" },
  "K":  { label: "Peek & Swap", emoji: "👑", desc: "Peek an opponent's card, then decide swap.", color: "#ffd86b" },
};

export function LeftPanel() {
  const game = useStore((s) => s.game!);
  const humanId = useStore((s) => s.humanId);
  const targeting = useStore((s) => s.targeting);
  const mode = useStore((s) => s.mode);
  const mp = useStore((s) => s.mp);

  // Ticker for the round-start countdown (only active during setup_peek in MP).
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (mode !== "mp" || !mp?.roundReadyStartedAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [mode, mp?.roundReadyStartedAt]);

  const draw = useStore((s) => s.draw);
  const drawDiscard = useStore((s) => s.drawDiscard);
  const discardNoAction = useStore((s) => s.discardNoAction);
  const discardAndTrigger = useStore((s) => s.discardAndTrigger);
  const setTargeting = useStore((s) => s.setTargeting);
  const callCaboAction = useStore((s) => s.callCaboAction);
  const peekSwapDecide = useStore((s) => s.peekSwapDecide);
  const start = useStore((s) => s.start);

  const isHumanTurn = game.players[game.currentPlayer].id === humanId;
  const canDraw = isHumanTurn && game.phase === "turn_start";
  const canDrawDiscard = canDraw && game.discard.length > 0;

  const me = game.players.find((p) => p.id === humanId);
  const peekedCount = me ? me.knownToSelf.filter(Boolean).length : 0;

  // For turn_drawn, detect if the drawn card carries an action ability
  const drawnCard = game.drawnCard;
  const drawnAction = drawnCard ? actionOf(drawnCard) : null;
  const actionMeta = drawnCard ? ACTION_META[drawnCard.rank] : null;

  let emoji = "";
  let instruction = "";
  let buttons: React.ReactNode = null;

  if (game.phase === "setup_peek") {
    emoji = "👀";

    if (mode === "mp" && mp) {
      // Collective ready-up: either player can start, uses a 10s server timer.
      const iReady = mp.roundReadyVotes.includes(humanId);
      const otherReadyId = mp.roundReadyVotes.find((id) => id !== humanId);
      const otherReadyName = otherReadyId
        ? mp.members.find((m) => m.id === otherReadyId)?.name ?? "Opponent"
        : null;
      const secsLeft = mp.roundReadyStartedAt
        ? Math.max(0, Math.ceil((10_000 - (now - mp.roundReadyStartedAt)) / 1000))
        : null;

      if (iReady) {
        instruction = otherReadyName
          ? "Starting the round…"
          : secsLeft !== null
          ? `Round starts in ${secsLeft}s — waiting for other player`
          : "Waiting for other player…";
      } else {
        instruction = otherReadyName && secsLeft !== null
          ? `${otherReadyName} started the round! Starting in ${secsLeft}s…`
          : peekedCount === 0
          ? "Tap any 2 of your cards to peek at them."
          : peekedCount === 1
          ? "One more — pick another card (or skip)."
          : "Memorised? Start when ready!";
        buttons = (
          <button
            className={`btn primary left-btn${otherReadyName ? " ready-pulse" : ""}`}
            onClick={start}
          >
            {otherReadyName
              ? "▶ Start now!"
              : peekedCount === 0 ? "⏩ Skip & start"
              : peekedCount < 2 ? "▶ Start now"
              : "▶ Start round"}
          </button>
        );
      }
    } else {
      // Single-player: human always sees the start button.
      instruction =
        peekedCount === 0
          ? "Tap any 2 of your cards to peek at them."
          : peekedCount === 1
          ? "One more — pick another card (or skip)."
          : "Memorised? Start when ready!";
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
              onClick={() => { Audio.playSfx("card_draw"); draw(); }}
            >
              🂠 Draw from Deck
            </button>
            <button
              className="btn left-btn"
              disabled={!canDrawDiscard}
              title={!canDrawDiscard ? "Discard pile is empty" : ""}
              onClick={() => { Audio.playSfx("card_draw"); drawDiscard(); }}
            >
              ♻ Draw from Discard
            </button>
            <div className="left-divider" />
            <button className="btn danger left-btn" onClick={callCaboAction} disabled={!!game.caboCallerId}>
              🚨 Call CABO!
            </button>
          </>
        );
        break;

      case "turn_drawn":
        emoji = targeting === "swap_hand" ? "🔄" : (actionMeta?.emoji ?? "✋");
        instruction =
          targeting === "swap_hand"
            ? "Tap one of your cards to swap it in."
            : drawnAction
            ? "Choose what to do with your drawn card."
            : "Swap it into your hand or discard it.";
        buttons = (
          <>
            {/* Always: swap into hand */}
            <button
              className={`btn left-btn ${targeting === "swap_hand" ? "primary" : ""}`}
              onClick={() => setTargeting("swap_hand")}
            >
              🔄 {targeting === "swap_hand" ? "Pick a card to swap…" : "Swap into Hand"}
            </button>

            {/* Only for action cards: use the ability (with CSS tooltip) */}
            {drawnAction && actionMeta && (
              <div
                className="left-tip-wrap"
                data-tip={actionMeta.desc}
              >
                <button
                  className="btn left-btn action-trigger-btn"
                  style={{ borderColor: actionMeta.color, color: actionMeta.color }}
                  disabled={game.drawnFrom === "discard"}
                  onClick={() => { Audio.playSfx("action_trigger"); discardAndTrigger(); }}
                >
                  {actionMeta.emoji} Use {actionMeta.label}
                </button>
              </div>
            )}

            {/* Always: plain discard (never triggers action) */}
            <button
              className="btn left-btn"
              disabled={game.drawnFrom === "discard"}
              title={
                game.drawnFrom === "discard"
                  ? "Cards drawn from discard must be swapped."
                  : drawnAction
                  ? "Discard without using the ability."
                  : ""
              }
              onClick={() => { Audio.playSfx("card_discard"); discardNoAction(); }}
            >
              🗑 Discard
            </button>
          </>
        );
        break;

      case "pending_action":
        // Legacy phase — kept for server compatibility. Shouldn't normally appear
        // in the UI now (SP uses discardDrawnWithAction/discardDrawnSkipAction).
        // If it does surface (old server), show simple buttons here.
        emoji = actionMeta?.emoji ?? "⚡";
        instruction = "Use this card's ability or discard it.";
        buttons = (
          <>
            {actionMeta && (
              <div className="left-tip-wrap" data-tip={actionMeta.desc}>
                <button
                  className="btn left-btn action-trigger-btn"
                  style={{ borderColor: actionMeta.color, color: actionMeta.color }}
                  onClick={() => { Audio.playSfx("action_trigger"); useStore.getState().triggerAction(); }}
                >
                  {actionMeta.emoji} Use {actionMeta.label}
                </button>
              </div>
            )}
            <button className="btn left-btn" onClick={() => useStore.getState().skipAction()}>
              🗑 Just Discard
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
