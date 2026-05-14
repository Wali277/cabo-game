import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../state/store";

export function Scoreboard() {
  const game = useStore((s) => s.game!);
  const totals = Object.entries(game.scores).map(([id, arr]) => ({
    id,
    name: game.players.find((p) => p.id === id)?.name ?? id,
    total: arr.reduce((a, b) => a + b, 0),
    rounds: arr,
  }));
  totals.sort((a, b) => a.total - b.total); // lowest total = closest to winning

  return (
    <div className="scoreboard">
      <div className="sb-title">Scoreboard · Round {game.roundNumber}</div>
      <div className="sb-rows">
        {totals.map((t, i) => (
          <div
            key={t.id}
            className={`sb-row ${i === 0 ? "lead" : ""} ${i === totals.length - 1 && totals.length > 1 ? "worst" : ""}`}
          >
            <span className="sb-name">
              {i === 0 ? "👑" : `#${i + 1}`} {t.name}
            </span>
            <span className="sb-total">{t.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RoundEndOverlay() {
  const game = useStore((s) => s.game!);
  const playAgain = useStore((s) => s.playAgain);
  const backToMenu = useStore((s) => s.backToMenu);

  if (game.phase !== "round_over") return null;
  const rows = game.players.map((p) => ({
    id: p.id,
    name: p.name,
    handSum: p.hand.reduce((s, c) => {
      const v = c.rank === "K" ? 0 : c.rank === "J" || c.rank === "Q" ? 10 : c.rank === "A" ? 1 : parseInt(c.rank, 10);
      return s + v;
    }, 0),
    pts: game.scores[p.id][game.scores[p.id].length - 1],
    cumulative: game.scores[p.id].reduce((a, b) => a + b, 0),
  }));
  // Rank by cumulative score ascending — Cabo: lowest wins
  rows.sort((a, b) => a.cumulative - b.cumulative);
  const winner = rows.find((t) => t.id === game.winnerId)!;

  return (
    <AnimatePresence>
      <motion.div
        className="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <motion.div
          className="modal"
          initial={{ scale: 0.6, y: 20, rotate: -4 }}
          animate={{ scale: 1, y: 0, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
        >
          <div className="modal-burst">🎉</div>
          <h2>{winner.name} wins the round!</h2>
          <div className="modal-subtitle">Leaderboard · lowest total wins</div>
          <div className="modal-rows">
            {rows.map((t, i) => (
              <div
                key={t.id}
                className={`modal-row ${i === 0 ? "win" : ""} ${i === rows.length - 1 && rows.length > 1 ? "worst" : ""}`}
              >
                <span className="rank">{i === 0 ? "👑" : `#${i + 1}`}</span>
                <span>{t.name}</span>
                <span>hand: {t.handSum}</span>
                <span>+{t.pts}</span>
                <span className="cum">total: {t.cumulative}</span>
              </div>
            ))}
          </div>
          <div className="row gap center">
            <button className="btn primary big" onClick={playAgain}>Play again</button>
            <button className="btn" onClick={backToMenu}>Main menu</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
