/**
 * Shared final-results scoreboard rendered by both GloriousVictory (for the
 * winner) and GameLostOverlay (for the loser).
 *
 * Highlights:
 *  - Winner row → gold
 *  - For each round column, the lowest score across all players → green
 *    (the player who "won" that round in Cabo: lowest hand)
 *
 * The `variant` prop ("victory" / "lost") drives a class on the wrapper so
 * App.css can apply different color schemes (loser sees red numbers on a
 * dark/black background; winner sees the gold-on-purple glory palette).
 */
export interface ScoreRow {
  id: string;
  name: string;
  rounds: number[];
  total: number;
}

interface Props {
  rows: ScoreRow[];
  winnerId: string | null;
  humanId: string;
  variant: "victory" | "lost";
}

export function EndScoreboard({ rows, winnerId, humanId, variant }: Props) {
  if (rows.length === 0) return null;

  // For each round index, find the lowest value across all players (= round winner).
  const numRounds = Math.max(0, ...rows.map((r) => r.rounds.length));
  const roundMins: number[] = [];
  for (let i = 0; i < numRounds; i++) {
    const values = rows
      .map((r) => r.rounds[i])
      .filter((v): v is number => typeof v === "number");
    roundMins.push(values.length > 0 ? Math.min(...values) : Infinity);
  }

  return (
    <div className={`end-scoreboard end-scoreboard-${variant}`}>
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
          {rows.map((row) => (
            <tr
              key={row.id}
              className={row.id === winnerId ? "end-score-winner" : ""}
            >
              <td>{row.id === humanId ? `${row.name} (You)` : row.name}</td>
              <td className="end-score-rounds">
                {row.rounds.length === 0
                  ? "—"
                  : row.rounds.map((v, i) => (
                      <span
                        key={i}
                        className={
                          v === roundMins[i] ? "end-score-round-win" : undefined
                        }
                      >
                        {i > 0 ? " + " : ""}
                        {v}
                      </span>
                    ))}
              </td>
              <td className="end-score-total">{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Build score rows from the game state + room member list.
 * Includes players who were kicked earlier in the game (they appear in
 * `game.scores` but may have been filtered out of `game.players`).
 */
export function buildScoreRows(
  game: { players: { id: string; name: string }[]; scores: Record<string, number[]> } | null,
  members: { id: string; name: string }[] | null | undefined,
): ScoreRow[] {
  if (!game) return [];
  const allIds = new Set<string>([
    ...game.players.map((p) => p.id),
    ...Object.keys(game.scores ?? {}),
  ]);
  const playerNameLookup = new Map<string, string>(
    game.players.map((p) => [p.id, p.name]),
  );
  const memberNameLookup = new Map<string, string>(
    (members ?? []).map((m) => [m.id, m.name]),
  );

  return Array.from(allIds)
    .map((id) => {
      const rounds = game.scores[id] ?? [];
      const total = rounds.reduce((a, b) => a + b, 0);
      const name =
        playerNameLookup.get(id) ?? memberNameLookup.get(id) ?? "Player";
      return { id, name, rounds, total };
    })
    .sort((a, b) => a.total - b.total); // lowest total first
}
