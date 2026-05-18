import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";

/**
 * Shown to the loser(s) when the game is fully over (gloriosVictory is set)
 * and they are not the winner. Replaces BustedOverlay for game-ending eliminations.
 *
 * Distinct from BustedOverlay (mid-game bust, game continues with others)
 * and GloriousVictory (the winner's screen).
 */
export function GameLostOverlay() {
  const mp = useStore((s) => s.mp);
  const humanId = useStore((s) => s.humanId);
  const game = useStore((s) => s.game);
  const backToMenu = useStore((s) => s.backToMenu);
  const mode = useStore((s) => s.mode);

  const gloriosVictory = mp?.gloriosVictory ?? null;

  // Show when: game is over AND I am not the winner AND I was eliminated.
  const iAmEliminated =
    (mp?.bustedThisRound.includes(humanId) ?? false) ||
    (mp?.kickedIds.includes(humanId) ?? false);

  const show =
    mode === "mp" &&
    !!gloriosVictory &&
    gloriosVictory !== humanId &&
    iAmEliminated;

  // Play lose SFX once when the overlay appears.
  useEffect(() => {
    if (show) Audio.playSfx("lose");
  }, [show]);

  if (!show) return null;

  // Look up the winner's name from the current game or the room member list.
  const victorName =
    game?.players.find((p) => p.id === gloriosVictory)?.name ??
    mp?.members.find((m) => m.id === gloriosVictory)?.name ??
    "Your opponent";

  // Build scoreboard rows: all players with cumulative scores + round scores.
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

  return (
    <AnimatePresence>
      <motion.div
        className="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ zIndex: 350 }}
      >
        <motion.div
          className="modal busted-modal"
          initial={{ scale: 0.6, y: 20, rotate: -4 }}
          animate={{ scale: 1, y: 0, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
        >
          <div className="modal-burst">🏁</div>
          <h2>{victorName} Won!</h2>
          <p className="modal-subtitle">They were the last one standing</p>
          <p style={{ fontSize: "16px", color: "#ff5b6e", fontWeight: 600, marginBottom: "16px" }}>
            You busted
          </p>

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
                      className={row.id === gloriosVictory ? "end-score-winner" : ""}
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
