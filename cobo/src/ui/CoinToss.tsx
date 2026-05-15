import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../state/store";
import type { CoinSide } from "../state/store";
import { Audio } from "../audio/sounds";

/**
 * Coin-toss intro: human picks heads or tails. After 5s if they haven't picked,
 * the bot picks first and the human gets whatever's left. Then the coin flips
 * dramatically and reveals who starts.
 */
export function CoinToss() {
  const coinToss = useStore((s) => s.coinToss);
  const pendingGame = useStore((s) => s.pendingGame);
  const humanId = useStore((s) => s.humanId);
  const choose = useStore((s) => s.coinTossChoose);
  const botAutoPick = useStore((s) => s.coinTossBotAutoPick);
  const complete = useStore((s) => s.coinTossComplete);

  const [secondsLeft, setSecondsLeft] = useState(5);

  // 5-second countdown while in "choosing" phase
  useEffect(() => {
    if (!coinToss || coinToss.phase !== "choosing" || !coinToss.countdownEndsAt) return;
    const tick = () => {
      const ms = Math.max(0, coinToss.countdownEndsAt! - Date.now());
      const s = Math.ceil(ms / 1000);
      setSecondsLeft(s);
      if (ms <= 0) {
        botAutoPick();
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [coinToss?.phase, coinToss?.countdownEndsAt, botAutoPick]);

  // Play coin SFX on phase changes
  useEffect(() => {
    if (coinToss?.phase === "flipping") Audio.playSfx("coin_flip");
    if (coinToss?.phase === "done") Audio.playSfx("coin_land");
  }, [coinToss?.phase]);

  // Auto-finish 2s after the result is shown
  useEffect(() => {
    if (coinToss?.phase !== "done") return;
    const id = setTimeout(() => complete(), 2400);
    return () => clearTimeout(id);
  }, [coinToss?.phase, complete]);

  if (!coinToss || !pendingGame) return null;

  const humanName = pendingGame.players.find((p) => p.id === humanId)?.name ?? "You";
  const winnerName = coinToss.winnerId
    ? pendingGame.players.find((p) => p.id === coinToss.winnerId)?.name
    : null;
  const winnerIsHuman = coinToss.winnerId === humanId;

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
          {coinToss.phase === "choosing" &&
            `${humanName}, pick a side — auto-pick in ${secondsLeft}s`}
          {coinToss.phase === "flipping" && "Tossing the coin…"}
          {coinToss.phase === "done" &&
            `${coinToss.result?.toUpperCase()} — ${winnerName} starts first!`}
        </p>

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

        {/* Choice buttons during "choosing" phase */}
        {coinToss.phase === "choosing" && (
          <div className="coin-choice-row">
            <button
              className="coin-choice-btn heads"
              onClick={() => { Audio.playSfx("click"); choose("heads"); }}
            >
              <span className="coin-choice-glyph">H</span>
              <span>HEADS</span>
            </button>
            <button
              className="coin-choice-btn tails"
              onClick={() => { Audio.playSfx("click"); choose("tails"); }}
            >
              <span className="coin-choice-glyph">T</span>
              <span>TAILS</span>
            </button>
          </div>
        )}

        {/* During flipping or done, show who picked what */}
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
              {pendingGame.players.filter((p) => p.isBot).slice(0, 1).map((bot) => (
                <div
                  key={bot.id}
                  className={`coin-pick-row ${!winnerIsHuman && coinToss.phase === "done" ? "won" : ""}`}
                >
                  <span className="coin-pick-name">{bot.name}</span>
                  <span className="coin-pick-side">{coinToss.botChoice?.toUpperCase()}</span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
