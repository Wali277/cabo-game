/**
 * Shared final-results scoreboard rendered by both GloriousVictory (for the
 * winner) and GameLostOverlay (for the loser).
 *
 * Layout: one column per round (R1, R2, R3, …) plus a Total column, matching
 * the in-game RoundEndOverlay so the user sees a consistent score-grid view
 * everywhere they look at scores.
 *
 * Highlights:
 *  - Winner row → gold (`.end-score-winner`).
 *  - Per-round cell with the SOLE lowest score → green (`.end-score-round-win`).
 *  - Per-round cell where 2+ players tied at the lowest → bright gray
 *    (`.end-score-round-tie`). Green is reserved for a unique winner so a tie
 *    reads visually distinct.
 *
 * The `variant` prop ("victory" / "lost") drives a wrapper class so App.css
 * can apply different palettes (loser: red numbers on dark; winner: gold on
 * purple glory).
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
  /** Boundary index splitting R-rounds (< mainRoundsCount) from F-rounds
   *  (≥ mainRoundsCount). Null/undefined → all rounds render as R-columns
   *  (no sudden death occurred). */
  mainRoundsCount?: number | null;
}

export function EndScoreboard({ rows, winnerId, humanId, variant, mainRoundsCount }: Props) {
  if (rows.length === 0) return null;

  // For each round index, find the lowest value across all players (= round
  // winner) AND how many players tied at that minimum. We render the green
  // win highlight only when there's a SOLE lowest score; multi-way ties at
  // the lowest get a bright-gray highlight instead so they read as ties.
  const numRounds = Math.max(0, ...rows.map((r) => r.rounds.length));
  const roundMins: number[] = [];
  const roundLowestCounts: number[] = [];
  for (let i = 0; i < numRounds; i++) {
    const values = rows
      .map((r) => r.rounds[i])
      .filter((v): v is number => typeof v === "number");
    const min = values.length > 0 ? Math.min(...values) : Infinity;
    roundMins.push(min);
    roundLowestCounts.push(values.filter((v) => v === min).length);
  }

  // Helper: column label + class for an index. Splits at mainRoundsCount.
  const splitAt = typeof mainRoundsCount === "number" ? mainRoundsCount : null;
  const isFinalIndex = (i: number) => splitAt !== null && i >= splitAt;
  const labelFor = (i: number) => isFinalIndex(i) ? `F${i - (splitAt ?? 0) + 1}` : `R${i + 1}`;

  return (
    <div className={`end-scoreboard end-scoreboard-${variant}`}>
      <div className="end-scoreboard-header">Final Scores</div>
      <table className="end-score-table">
        <thead>
          <tr>
            <th>Player</th>
            {numRounds === 0 ? (
              <th>Rounds</th>
            ) : (
              Array.from({ length: numRounds }).map((_, i) => (
                <th
                  key={i}
                  className={`end-score-round-h${isFinalIndex(i) ? " end-score-round-h-final" : ""}`}
                >
                  {labelFor(i)}
                </th>
              ))
            )}
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
              {numRounds === 0 ? (
                <td className="end-score-round">—</td>
              ) : (
                Array.from({ length: numRounds }).map((_, i) => {
                  const v = row.rounds[i];
                  const isLowest = v !== undefined && v === roundMins[i];
                  const tiedAtLowest = isLowest && roundLowestCounts[i] > 1;
                  const baseCls = tiedAtLowest
                    ? "end-score-round end-score-round-tie"
                    : isLowest
                    ? "end-score-round end-score-round-win"
                    : "end-score-round";
                  const finalCls = isFinalIndex(i) ? " sb-cell-final" : "";
                  return (
                    <td key={i} className={`${baseCls}${finalCls}`}>
                      {v !== undefined ? v : "—"}
                    </td>
                  );
                })
              )}
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
