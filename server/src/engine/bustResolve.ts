// =============================================================================
// bustResolve.ts — SHARED, PURE simultaneous-bust tiebreaker + round-win credit.
// -----------------------------------------------------------------------------
// This file is byte-identical in cobo/src/engine and server/src/engine. It is
// the SINGLE source of truth for "who wins when 2+ players bust in the same
// round", so single-player (cobo store) and multiplayer (server) resolve it
// IDENTICALLY. Pure + dependency-free → unit-testable in isolation.
//
// ORDER OF AUTHORITY when the game ends with players over the bust limit
// (the caller handles the earlier cases first: a sole survivor under the limit,
// and the "only one active player busted" case):
//
//   1. SURVIVOR    — exactly one player stayed under the limit. (caller)
//   2. MOST WINS   — among the simultaneous busters, the one who won the most
//                    rounds. → reason "more_wins".
//   3. FINAL ROUND — tie on wins → the lowest score in THIS (final/bust) round.
//                    → reason "final_round".
//   4. SUDDEN DEATH— still tied (same wins AND same final-round score) → the
//                    still-tied set plays a sudden-death round. (winnerId null)
//
// ROUND-WIN CREDIT (feeds rule 2): a round is only "won" by a player with a
// STRICTLY UNIQUE lowest score that round. A tie for the lowest counts for
// NOBODY — a tied round must never hand one player a hidden round-win that can
// later decide the whole game. (This is the exact bug this module fixes.)
//
// "Score in a round" everywhere here means the per-round value the scoreboard
// shows (GameState.scores[id] for that round = the round's hand total), so the
// tiebreaker matches what the player sees.
// =============================================================================

export type BustReason = "more_wins" | "final_round";

export interface BustDecision {
  /** The Glorious Victor, or null when the tie must go to a sudden-death round. */
  winnerId: string | null;
  /** Why they won — set only when winnerId is set. */
  reason: BustReason | null;
  /** When winnerId is null: the still-tied players who must play sudden death. */
  sdContestants: string[] | null;
}

/**
 * The player who WON a round for round-win-counting purposes: the one with the
 * STRICTLY unique lowest score among the players active that round. Returns null
 * when the lowest score is shared (a tie credits no one).
 *
 * @param activeIds       players who actually played the round (exclude kicked).
 * @param lastRoundScore  id → that player's score in the round being counted.
 */
/**
 * Build `{ id → that player's score in the LATEST recorded round }` from a
 * GameState-style scores map (`scores[id]` = the per-round totals array). Missing
 * / empty → Infinity (treated as "worst", never wins a tiebreaker). Pure so SP
 * and MP build the tiebreaker inputs identically.
 */
export function lastRoundScores(
  scores: Record<string, number[]>,
  ids: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) {
    const arr = scores[id];
    out[id] = arr && arr.length > 0 ? arr[arr.length - 1] : Infinity;
  }
  return out;
}

export function roundWinForCredit(
  activeIds: string[],
  lastRoundScore: Record<string, number>,
): string | null {
  if (activeIds.length === 0) return null;
  let min = Infinity;
  for (const id of activeIds) {
    const s = lastRoundScore[id] ?? Infinity;
    if (s < min) min = s;
  }
  const atMin = activeIds.filter((id) => (lastRoundScore[id] ?? Infinity) === min);
  return atMin.length === 1 ? atMin[0] : null;
}

/**
 * Resolve a simultaneous bust (2+ players over the limit in the same round)
 * through the order of authority above (rules 2→3→4). The caller is responsible
 * for the survivor / single-buster cases BEFORE calling this.
 *
 * @param contestants     the simultaneous busters still in contention (not
 *                        previously kicked). Must be length >= 1.
 * @param roundWins       id → rounds won across the match (credited via
 *                        roundWinForCredit, so ties already count for nobody).
 * @param lastRoundScore  id → that player's score in THIS (final/bust) round.
 */
export function resolveSimultaneousBust(
  contestants: string[],
  roundWins: Record<string, number>,
  lastRoundScore: Record<string, number>,
): BustDecision {
  // Defensive: a lone contestant simply wins (caller normally handles this).
  if (contestants.length <= 1) {
    return { winnerId: contestants[0] ?? null, reason: null, sdContestants: null };
  }

  // Rule 2 — most rounds won.
  let maxWins = -Infinity;
  for (const id of contestants) {
    const w = roundWins[id] ?? 0;
    if (w > maxWins) maxWins = w;
  }
  const topByWins = contestants.filter((id) => (roundWins[id] ?? 0) === maxWins);
  if (topByWins.length === 1) {
    return { winnerId: topByWins[0], reason: "more_wins", sdContestants: null };
  }

  // Rule 3 — tie on wins → lowest score in the final (bust) round.
  let minFinal = Infinity;
  for (const id of topByWins) {
    const s = lastRoundScore[id] ?? Infinity;
    if (s < minFinal) minFinal = s;
  }
  const atMin = topByWins.filter((id) => (lastRoundScore[id] ?? Infinity) === minFinal);
  if (atMin.length === 1) {
    return { winnerId: atMin[0], reason: "final_round", sdContestants: null };
  }

  // Rule 4 — still tied (same wins AND same final-round score) → sudden death
  // among ONLY those still tied (others lost the final-round tiebreaker).
  return { winnerId: null, reason: null, sdContestants: atMin };
}
