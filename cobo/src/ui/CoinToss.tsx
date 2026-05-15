import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../state/store";
import type { CoinSide } from "../state/store";
import { Audio } from "../audio/sounds";

export function CoinToss() {
  const coinToss = useStore((s) => s.coinToss);
  const pendingGame = useStore((s) => s.pendingGame);
  const humanId = useStore((s) => s.humanId);
  const mode = useStore((s) => s.mode);

  // SP actions
  const choose = useStore((s) => s.coinTossChoose);
  const botAutoPick = useStore((s) => s.coinTossBotAutoPick);
  const complete = useStore((s) => s.coinTossComplete);

  // MP action
  const mpPick = useStore((s) => s.mpCoinTossPick);

  const [timeLeft, setTimeLeft] = useState(5);

  // Countdown while in "choosing" phase
  useEffect(() => {
    if (!coinToss || coinToss.phase !== "choosing" || !coinToss.countdownEndsAt) return;
    const tick = () => {
      const ms = Math.max(0, coinToss.countdownEndsAt! - Date.now());
      setTimeLeft(Math.ceil(ms / 1000));
      if (ms <= 0 && !coinToss.humanChoice) {
        // Timer expired — auto-pick for this player
        if (mode === "mp") {
          // Pick whichever side the other player hasn't taken
          const remaining: CoinSide = coinToss.botChoice === "heads" ? "tails" : "heads";
          mpPick(remaining);
        } else {
          botAutoPick();
        }
      }
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [coinToss?.phase, coinToss?.countdownEndsAt, coinToss?.humanChoice, mode, botAutoPick, mpPick]);

  // SFX on phase changes
  useEffect(() => {
    if (coinToss?.phase === "flipping") Audio.playSfx("coin_flip");
    if (coinToss?.phase === "done") Audio.playSfx("coin_land");
  }, [coinToss?.phase]);

  // Auto-finish 2.4s after result shown
  useEffect(() => {
    if (coinToss?.phase !== "done") return;
    const id = setTimeout(() => complete(), 2400);
    return () => clearTimeout(id);
  }, [coinToss?.phase, complete]);

  if (!coinToss || !pendingGame) return null;

  const humanName = pendingGame.players.find((p) => p.id === humanId)?.name ?? "You";
  const otherPlayer = pendingGame.players.find((p) => p.id !== humanId);
  const otherName = otherPlayer?.name ?? (mode === "mp" ? "Opponent" : "Bot");
  const winnerName = coinToss.winnerId
    ? pendingGame.players.find((p) => p.id === coinToss.winnerId)?.name
    : null;
  const winnerIsHuman = coinToss.winnerId === humanId;

  // Who occupies each side button
  function whoHas(side: CoinSide): "human" | "other" | null {
    if (coinToss!.humanChoice === side) return "human";
    if (coinToss!.botChoice === side) return "other";
    return null;
  }

  function handlePick(side: CoinSide) {
    if (coinToss!.humanChoice) return; // already picked
    if (mode === "mp") mpPick(side);
    else { Audio.playSfx("click"); choose(side); }
  }

  const pct = coinToss.countdownEndsAt
    ? Math.max(0, Math.min(100, ((coinToss.countdownEndsAt - Date.now()) / 5000) * 100))
    : 0;

  return (
    <div className="coin-toss-screen">
      <motion.div
        className="coin-toss-card"
        initial={{ y: 30, opacity: 0, scale: 0.9 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 18 }}
      >
        <h1 className="coin-toss-title">Coin Toss</h1>
        <p className="coin-toss-sub">
          {coinToss.phase === "choosing" && (coinToss.humanChoice
            ? "Waiting for the other player…"
            : coinToss.countdownEndsAt
            ? "Your turn — pick before time runs out!"
            : "Pick a side!")}
          {coinToss.phase === "flipping" && "Tossing the coin…"}
          {coinToss.phase === "done" &&
            `${coinToss.result?.toUpperCase()} — ${winnerName} goes first!`}
        </p>

        {/* Countdown timer bar */}
        {coinToss.phase === "choosing" && coinToss.countdownEndsAt && (
          <div className="coin-timer-track">
            <motion.div
              className="coin-timer-bar"
              initial={{ width: "100%" }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.1, ease: "linear" }}
              style={{ background: timeLeft <= 2 ? "#ff5b6e" : "#ffd86b" }}
            />
            <span className="coin-timer-label">{timeLeft}s</span>
          </div>
        )}

        {/* The coin */}
        <div className="coin-3d-wrap">
          <motion.div
            key={coinToss.phase}
            className="coin-3d"
            initial={
              coinToss.phase === "flipping"
                ? { rotateX: 0 }
                : coinToss.phase === "done"
                ? { rotateX: 1800 + (coinToss.result === "tails" ? 180 : 0) }
                : { rotateX: 0 }
            }
            animate={
              coinToss.phase === "flipping"
                ? { rotateX: 1800 }
                : coinToss.phase === "done"
                ? { rotateX: 1800 + (coinToss.result === "tails" ? 180 : 0) }
                : { rotateX: [0, 12, -12, 0] }
            }
            transition={
              coinToss.phase === "flipping"
                ? { duration: 0.9, ease: [0.45, 0, 0.55, 1] }
                : coinToss.phase === "done"
                ? { duration: 0.4 }
                : { duration: 2.4, repeat: Infinity }
            }
          >
            <div className="coin-face heads">H</div>
            <div className="coin-face tails">T</div>
            <div className="coin-edge" />
          </motion.div>
        </div>

        {/* Choice buttons — shown during "choosing" phase */}
        {coinToss.phase === "choosing" && (
          <div className="coin-choice-row">
            {(["heads", "tails"] as CoinSide[]).map((side) => {
              const owner = whoHas(side);
              const label = side === "heads" ? "HEADS" : "TAILS";
              const ownerName = owner === "human" ? humanName : owner === "other" ? otherName : null;
              return (
                <button
                  key={side}
                  className={`coin-choice-btn ${side}${owner ? " taken" : ""}`}
                  disabled={!!owner}
                  onClick={() => handlePick(side)}
                >
                  <span className="coin-choice-glyph">{side === "heads" ? "H" : "T"}</span>
                  <span>{ownerName ? ownerName : label}</span>
                  {ownerName && (
                    <span className="coin-choice-lock">
                      {owner === "human" ? "✓ your pick" : "locked"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* After picking — show who has which side */}
        <AnimatePresence>
          {coinToss.phase !== "choosing" && coinToss.humanChoice && coinToss.botChoice && (
            <motion.div
              className="coin-picks"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.15 }}
            >
              <div className={`coin-pick-row ${winnerIsHuman && coinToss.phase === "done" ? "won" : ""}`}>
                <span className="coin-pick-name">{humanName}</span>
                <span className="coin-pick-side">{coinToss.humanChoice.toUpperCase()}</span>
              </div>
              <div className={`coin-pick-row ${!winnerIsHuman && coinToss.phase === "done" ? "won" : ""}`}>
                <span className="coin-pick-name">{otherName}</span>
                <span className="coin-pick-side">{coinToss.botChoice.toUpperCase()}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
