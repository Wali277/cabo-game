import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import confetti from "canvas-confetti";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";

export function GloriousVictory() {
  const mp = useStore((s) => s.mp);
  const humanId = useStore((s) => s.humanId);
  const backToMenu = useStore((s) => s.backToMenu);
  const mode = useStore((s) => s.mode);
  const game = useStore((s) => s.game);

  const victorId = mp?.gloriosVictory ?? null;
  const reason = mp?.gloriosVictoryReason ?? null;
  // Only the actual winner sees the Glorious Victory screen.
  // Losers (including tiebreaker losers) see GameLostOverlay instead.
  const show = mode === "mp" && !!victorId && victorId === humanId;

  // Fire confetti + win sound only for the winner
  useEffect(() => {
    if (!show || victorId !== humanId) return;
    Audio.playSfx("win");
    const fire = () => {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.5 },
        colors: ["#ffd86b", "#a87bff", "#67e0a3", "#ff5b6e", "#7aa8ff"],
      });
    };
    fire();
    const t1 = setTimeout(fire, 600);
    const t2 = setTimeout(fire, 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [show, victorId, humanId]);

  if (!show) return null;

  // Build scoreboard rows: all players with cumulative scores + round scores.
  // Use the game state's scores (the source of truth for all rounds played).
  const scoreRows = (() => {
    if (!game) return [];
    const scores = game.scores ?? {};
    return game.players
      .map((p) => {
        const rounds = scores[p.id] ?? [];
        const total = rounds.reduce((a: number, b: number) => a + b, 0);
        return { id: p.id, name: p.name, rounds, total };
      })
      .sort((a, b) => a.total - b.total); // lowest total first (best)
  })();

  // Build tiebreaker message.
  let tiebreakerMsg: string | null = null;
  if (reason === "more_wins") {
    // Find who had fewer wins to name in the message.
    const others = game?.players
      .filter((p) => p.id !== victorId)
      .map((p) => p.name)
      .join(", ");
    tiebreakerMsg = others
      ? `Won by winning more rounds than ${others}`
      : "Won by winning more rounds";
  } else if (reason === "final_round") {
    tiebreakerMsg = "Won by winning in the final round";
  }

  return (
    <AnimatePresence>
      <motion.div
        className="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ zIndex: 400 }}
      >
        <motion.div
          className="modal glory-modal"
          initial={{ scale: 0.6, y: 20, rotate: -4 }}
          animate={{ scale: 1, y: 0, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
        >
          <div className="modal-burst">🏆</div>
          <h2>Glorious Victory!</h2>
          <p className="glory-subtitle">
            You outlasted everyone and achieved perfect glory!
          </p>
          {tiebreakerMsg && (
            <p className="glory-tiebreaker">{tiebreakerMsg}</p>
          )}

          {/* Scoreboard */}
          {scoreRows.length > 0 && (
            <div className="end-scoreboard">
              <div className="end-scoreboard-header">Final Scores</div>
              <table className="end-score-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Rounds</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {scoreRows.map((row) => (
                    <tr
                      key={row.id}
                      className={row.id === victorId ? "end-score-winner" : ""}
                    >
                      <td>{row.id === humanId ? `${row.name} (You)` : row.name}</td>
                      <td className="end-score-rounds">
                        {row.rounds.join(" + ") || "—"}
                      </td>
                      <td className="end-score-total">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button className="btn primary big" onClick={backToMenu} style={{ marginTop: "20px" }}>
            Return to Menu
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
