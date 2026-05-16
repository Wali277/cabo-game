import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../state/store";

export function Scoreboard() {
  const game = useStore((s) => s.game!);
  const rows = Object.entries(game.scores).map(([id, arr]) => ({
    id,
    name: game.players.find((p) => p.id === id)?.name ?? id,
    total: arr.reduce((a, b) => a + b, 0),
    rounds: arr,
  }));
  rows.sort((a, b) => a.total - b.total); // lowest total = closest to winning

  // Each player's per-round column count (use the longest array)
  const roundCount = Math.max(0, ...rows.map((r) => r.rounds.length));
  const lowestTotal = rows.length ? rows[0].total : 0;
  const leaders = rows.filter((r) => r.total === lowestTotal).length;
  const isTopTie = leaders > 1;

  const gridCols = `minmax(70px, 1.2fr) repeat(${Math.max(1, roundCount)}, minmax(22px, 1fr)) minmax(36px, 1.1fr)`;

  return (
    <div className="scoreboard">
      <div className="sb-title">Scoreboard · Round {game.roundNumber}</div>
      <div className="sb-table">
        <div className="sb-thead" style={{ gridTemplateColumns: gridCols }}>
          <div className="sb-th sb-th-name">Player</div>
          {Array.from({ length: Math.max(1, roundCount) }).map((_, i) => (
            <div key={i} className="sb-th sb-th-round">{roundCount > 0 ? `R${i + 1}` : "—"}</div>
          ))}
          <div className="sb-th sb-th-total">Total</div>
        </div>
        <div className="sb-tbody">
          {rows.map((t, i) => {
            const isLeader = t.total === lowestTotal;
            const crown = isLeader ? (isTopTie ? "🤝" : "👑") : `#${i + 1}`;
            return (
              <div
                key={t.id}
                className={`sb-trow ${isLeader ? "lead" : ""} ${i === rows.length - 1 && rows.length > 1 && !isLeader ? "worst" : ""}`}
                style={{ gridTemplateColumns: gridCols }}
              >
                <span className="sb-td sb-td-name">
                  <span className="sb-rank">{crown}</span>
                  <span className="sb-pname">{t.name}</span>
                </span>
                {Array.from({ length: Math.max(1, roundCount) }).map((_, ri) => (
                  <span key={ri} className="sb-td sb-td-round">
                    {t.rounds[ri] !== undefined ? t.rounds[ri] : "—"}
                  </span>
                ))}
                <span className="sb-td sb-td-total">{t.total}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function RoundEndOverlay() {
  const game = useStore((s) => s.game!);
  const mode = useStore((s) => s.mode);
  const mp = useStore((s) => s.mp);
  const humanId = useStore((s) => s.humanId);
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
  const lowestCum = rows[0].cumulative;
  const tiedAtTop = rows.filter((r) => r.cumulative === lowestCum);
  const isTie = tiedAtTop.length > 1;

  const winner = !isTie ? rows.find((t) => t.id === game.winnerId) ?? rows[0] : null;

  // Collective Play Again — only relevant in MP
  const playAgainVotes = mp?.playAgainVotes ?? [];
  const iVoted = playAgainVotes.includes(humanId);
  const otherVoter = playAgainVotes.find((id) => id !== humanId);
  const otherVoterName = otherVoter
    ? game.players.find((p) => p.id === otherVoter)?.name ?? "Opponent"
    : null;

  const roundCount = Math.max(0, ...rows.map((r) => game.scores[r.id]?.length ?? 0));
  const modalGridCols = `minmax(90px, 1.3fr) repeat(${Math.max(1, roundCount)}, minmax(28px, 1fr)) minmax(48px, 1.1fr)`;

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
          <div className="modal-burst">{isTie ? "🤝" : "🎉"}</div>
          {isTie ? (
            <h2>It&apos;s a tie!</h2>
          ) : (
            <h2>{winner!.name} wins the round!</h2>
          )}
          <div className="modal-subtitle">
            {isTie
              ? `Tied at ${lowestCum} pts · lowest wins`
              : "Leaderboard · lowest total wins"}
          </div>
          <div className="sb-table modal-sb">
            <div className="sb-thead" style={{ gridTemplateColumns: modalGridCols }}>
              <div className="sb-th sb-th-name">Player</div>
              {Array.from({ length: Math.max(1, roundCount) }).map((_, i) => (
                <div key={i} className="sb-th sb-th-round">{roundCount > 0 ? `R${i + 1}` : "—"}</div>
              ))}
              <div className="sb-th sb-th-total">Total</div>
            </div>
            <div className="sb-tbody">
              {rows.map((t, i) => {
                const tiedHere = t.cumulative === lowestCum;
                const crown = tiedHere ? (isTie ? "🤝" : "👑") : `#${i + 1}`;
                return (
                  <div
                    key={t.id}
                    className={`sb-trow ${tiedHere ? "lead" : ""} ${i === rows.length - 1 && rows.length > 1 && !tiedHere ? "worst" : ""}`}
                    style={{ gridTemplateColumns: modalGridCols }}
                  >
                    <span className="sb-td sb-td-name">
                      <span className="sb-rank">{crown}</span>
                      <span className="sb-pname">{t.name}</span>
                    </span>
                    {Array.from({ length: Math.max(1, roundCount) }).map((_, ri) => (
                      <span key={ri} className="sb-td sb-td-round">
                        {game.scores[t.id][ri] !== undefined ? game.scores[t.id][ri] : "—"}
                      </span>
                    ))}
                    <span className="sb-td sb-td-total">{t.cumulative}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="row gap center">
            <button
              className={`btn primary big play-again-btn ${iVoted ? "voted" : ""} ${otherVoter && !iVoted ? "their-turn" : ""}`}
              onClick={playAgain}
              disabled={mode === "mp" && iVoted}
            >
              {mode === "mp" && iVoted
                ? "Waiting for other player…"
                : mode === "mp" && otherVoterName
                ? `${otherVoterName} wants a rematch · Play again`
                : "Play again"}
            </button>
            <button className="btn" onClick={backToMenu}>Main menu</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
