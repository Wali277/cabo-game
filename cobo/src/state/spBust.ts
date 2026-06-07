// =============================================================================
// spBust.ts — PURE single-player round-end bust / glorious-victory resolution.
// -----------------------------------------------------------------------------
// Extracted verbatim from store.ts so the REAL `computeSpBust` + `matchTotal`
// can be unit-tested in isolation (store.ts is a Vite client module that pulls
// in browser-only globals via its import chain). This module's ONLY imports are
// from ../engine/* (all pure + dependency-free), so it loads cleanly under node.
//
// store.ts re-imports `computeSpBust`, `matchTotal`, `ElimState`, and
// `EMPTY_ELIM` from here and re-exports the `ElimState` type for existing
// consumers — behaviour is identical to the inlined version.
// =============================================================================

import type { GameState } from "../engine/types";
import { handScore } from "../engine/game";
import {
  resolveSimultaneousBust,
  roundWinForCredit,
  lastRoundScores,
} from "../engine/bustResolve";

/**
 * ElimState — round-bust / kick / glorious-victory tracking.
 *
 * Mirrors the room-level concepts from the MP server (see Room in
 * `server/src/rooms.ts`) so that BOTH modes can read elimination state from a
 * single place. In MP we copy the server's broadcast into here from
 * `applyMpRoom`; in SP we compute it locally from `computeSpBust()` whenever a
 * round ends.
 *
 * Default value across the board is empty / null. Cleared on backToMenu, on
 * fresh init/trainInit, and on switching modes.
 */
export interface ElimState {
  bustedThisRound: string[];
  kickedIds: string[];
  gloriosVictory: string | null;
  gloriosVictoryReason: "survivor" | "more_wins" | "final_round" | "sudden_death" | null;
  roundWins: Record<string, number>;
  /** Sudden-death tiebreaker state.
   *  - null when no sudden death has ever been triggered this game.
   *  - { active: true, contestants, mainRoundsCount } during SD.
   *  - contestants stays frozen across repeat SD rounds.
   *  - mainRoundsCount = scores[id].length captured at the moment SD first
   *    triggers, used to split R-rounds (< this) from F-rounds (≥ this) in
   *    the UI scoreboards. */
  suddenDeath: { active: boolean; contestants: string[]; mainRoundsCount: number } | null;
}

export const EMPTY_ELIM: ElimState = {
  bustedThisRound: [],
  kickedIds: [],
  gloriosVictory: null,
  gloriosVictoryReason: null,
  roundWins: {},
  suddenDeath: null,
};

/**
 * A player's running MATCH total — the exact figure the scoreboard shows and
 * that decides the winner: raw round scores PLUS cabo penalties MINUS cabo and
 * snap bonuses. The bust threshold uses this (not the raw round sum) so busting
 * matches the number the player sees: a +5 cabo penalty pushes you toward 60,
 * while a low-cabo win or snap bonus pulls you back. MUST stay identical to the
 * server's matchTotal and to Scoreboard.tsx buildRows().
 */
export function matchTotal(game: GameState, id: string): number {
  const sum = (arr?: number[]) => (arr ?? []).reduce((a, b) => a + b, 0);
  return (
    sum(game.scores[id]) +
    sum(game.caboPenalty[id]) -
    sum(game.caboBonus[id]) -
    sum(game.snapBonus[id])
  );
}

/**
 * Round-end bust + glorious-victory resolution for SP. Mirrors the MP server
 * algorithm exactly (see server/src/index.ts:741-838).
 *
 * Returns the next ElimState to commit. The store is responsible for
 * orchestrating the call once `game.phase === "round_over"` lands.
 */
export function computeSpBust(game: GameState, prev: ElimState): ElimState {
  // Start from prev — we keep kickedIds + roundWins between rounds. The
  // bustedThisRound / gloriosVictory fields are recomputed each round.
  const next: ElimState = {
    bustedThisRound: [],
    kickedIds: [...prev.kickedIds],
    gloriosVictory: prev.gloriosVictory,
    gloriosVictoryReason: prev.gloriosVictoryReason,
    roundWins: { ...prev.roundWins },
    suddenDeath: prev.suddenDeath
      ? {
          active: prev.suddenDeath.active,
          contestants: [...prev.suddenDeath.contestants],
          mainRoundsCount: prev.suddenDeath.mainRoundsCount,
        }
      : null,
  };

  // The engine's declared round winner is passed through unchanged, even if
  // they happen to be on kickedIds. (Winner reassignment was removed per the
  // updated spec — the round win stays with whoever the engine declared.)
  const winnerId = game.winnerId;

  // ── Sudden-death resolution branch ──────────────────────────────────────
  // If we're in an active sudden-death round, resolve it by lowest-unique
  // hand among the locked contestants. Tied hands → another SD round.
  if (prev.suddenDeath?.active) {
    // Track the engine's declared winner for history.
    if (winnerId) {
      next.roundWins[winnerId] = (next.roundWins[winnerId] ?? 0) + 1;
    }

    const contestantHands = prev.suddenDeath.contestants.map((id) => {
      const player = game.players.find((p) => p.id === id);
      return { id, handTotal: player ? handScore(player.hand, game.variant) : Infinity };
    });
    const minHand = Math.min(...contestantHands.map((c) => c.handTotal));
    const atMin = contestantHands.filter((c) => c.handTotal === minHand);

    if (atMin.length === 1) {
      // Unique winner — declare GV, kick the other contestants.
      const victorId = atMin[0].id;
      const losers = prev.suddenDeath.contestants.filter((id) => id !== victorId);
      for (const id of losers) {
        if (!next.kickedIds.includes(id)) next.kickedIds.push(id);
      }
      next.gloriosVictory = victorId;
      next.gloriosVictoryReason = "sudden_death";
      // Keep the SD record so the end-of-game scoreboard can still split
      // R/F columns, but mark inactive so no further SD logic fires.
      next.suddenDeath = {
        active: false,
        contestants: prev.suddenDeath.contestants,
        mainRoundsCount: prev.suddenDeath.mainRoundsCount,
      };
    } else {
      // Multiple tied at the minimum — another sudden-death round is needed, but
      // per the spec ("another is played until only one stands") it must be
      // played by ONLY the still-tied (lowest-hand) players. Eliminate every
      // contestant who scored STRICTLY HIGHER than the minimum and narrow the
      // contestant set to the still-tied subset. Mirrors the normal-bust
      // narrowing below and MUST stay identical to the MP server
      // (roundResolve.ts). Don't declare GV yet. The set shrinks whenever any
      // contestant scored strictly higher; a persistent all-tie (every
      // contestant still at the minimum, e.g. forced-equal hands) does NOT
      // shrink and relies on reshuffled hands eventually differing — see
      // check-sd-loop.ts case 7 (no hard iteration cap exists yet).
      const stillTied = atMin.map((c) => c.id);
      const losers = prev.suddenDeath.contestants.filter(
        (id) => !stillTied.includes(id),
      );
      for (const id of losers) {
        if (!next.kickedIds.includes(id)) next.kickedIds.push(id);
      }
      next.gloriosVictory = null;
      next.gloriosVictoryReason = null;
      next.suddenDeath = {
        active: true,
        contestants: stillTied,
        mainRoundsCount: prev.suddenDeath.mainRoundsCount,
      };
    }
    return next;
  }

  // ── Normal path: NOTE — this branch is only reached when NOT in an active
  //    sudden-death round (the SD branch above returns early).
  // Track round wins. A round is "won" ONLY by a player with a STRICTLY unique
  // lowest score that round; a TIE for lowest credits NOBODY (a tied round must
  // never hand one player a hidden round-win that later decides a simultaneous-
  // bust tiebreaker). Uses the per-round scoreboard value among players active
  // this round. Shared with MP via engine/bustResolve.
  {
    const activeIds = game.players
      .map((p) => p.id)
      .filter((id) => !next.kickedIds.includes(id));
    const credited = roundWinForCredit(activeIds, lastRoundScores(game.scores, activeIds));
    if (credited) {
      next.roundWins[credited] = (next.roundWins[credited] ?? 0) + 1;
    }
  }

  // Compute newly busted players. Bust on the FULL match total (the same
  // figure the scoreboard shows and that decides the winner): round scores +
  // cabo penalties − cabo/snap bonuses. Penalties push you toward 60; a
  // low-cabo win or snap bonus pulls you back.
  next.bustedThisRound = game.players
    .filter((p) => matchTotal(game, p.id) > 60)
    .map((p) => p.id);

  if (next.bustedThisRound.length > 0) {
    const allEliminated = new Set([...next.kickedIds, ...next.bustedThisRound]);
    // SP "active" = all players in the current game minus eliminated.
    const survivors = game.players
      .map((p) => p.id)
      .filter((pid) => !allEliminated.has(pid));

    if (survivors.length === 1) {
      for (const id of next.bustedThisRound) {
        if (!next.kickedIds.includes(id)) next.kickedIds.push(id);
      }
      next.gloriosVictory = survivors[0];
      next.gloriosVictoryReason = "survivor";

    } else if (survivors.length === 0) {
      // Simultaneous bust — tiebreaker.
      const contestants = next.bustedThisRound.filter(
        (pid) => !next.kickedIds.includes(pid),
      );

      if (contestants.length === 1) {
        // Only one active buster — they win by default.
        const gloriousWinnerId = contestants[0];
        next.bustedThisRound = next.bustedThisRound.filter((id) => id !== gloriousWinnerId);
        for (const id of next.bustedThisRound) {
          if (!next.kickedIds.includes(id)) next.kickedIds.push(id);
        }
        next.gloriosVictory = gloriousWinnerId;
        next.gloriosVictoryReason = "survivor";
      } else if (contestants.length > 1) {
        // Resolve via the SHARED order of authority (most wins → lowest score
        // in the FINAL round → sudden death). roundWins already excludes tied
        // rounds (see the normal-path credit above), so this can't be fooled by
        // a tie. Identical to the MP server path (engine/bustResolve).
        const decision = resolveSimultaneousBust(
          contestants,
          next.roundWins,
          lastRoundScores(game.scores, contestants),
        );
        if (decision.winnerId) {
          const gloriousWinnerId = decision.winnerId;
          next.bustedThisRound = next.bustedThisRound.filter((id) => id !== gloriousWinnerId);
          for (const id of next.bustedThisRound) {
            if (!next.kickedIds.includes(id)) next.kickedIds.push(id);
          }
          next.gloriosVictory = gloriousWinnerId;
          next.gloriosVictoryReason = decision.reason;
        } else {
          // Sudden death among the STILL-tied set (tied on wins AND final-round
          // score). Kick the players who busted but lost the tiebreaker.
          const sd = decision.sdContestants ?? [];
          const losers = next.bustedThisRound.filter(
            (id) => !sd.includes(id) && !next.kickedIds.includes(id),
          );
          for (const id of losers) {
            if (!next.kickedIds.includes(id)) next.kickedIds.push(id);
          }
          // Remove SD contestants from bustedThisRound — they're playing
          // the tiebreaker, not eliminated. Leaving them in would cause
          // BustedOverlay to incorrectly show them the "Busted" splash +
          // "Return to menu" modal at SD trigger round_over.
          next.bustedThisRound = next.bustedThisRound.filter((id) => !sd.includes(id));
          // Set sudden-death state — DO NOT declare GV yet.
          const anyPlayerId = game.players[0]?.id;
          const mainRoundsCount = anyPlayerId
            ? (game.scores[anyPlayerId]?.length ?? 0)
            : 0;
          next.suddenDeath = {
            active: true,
            contestants: sd,
            mainRoundsCount,
          };
        }
      }
    }
    // survivors.length > 1: normal play-again flow — busts are moved into
    // kickedIds on the playAgain() click, not here.
  }

  return next;
}

/** Player seat input for a continuation round — the subset newGame() needs. */
export interface SeatInput {
  id: string;
  name: string;
  isBot: boolean;
}

/**
 * The PURE decision for what a single-player "Play again" click should do.
 *
 * - kind "seat":      start another round seating exactly `players`, committing
 *                     `nextElim`. The store calls newGame() with these inputs.
 * - kind "game_over": no round is seated; commit `nextElim` (a glorious victory
 *                     is already, or now, set). The store just updates elim.
 * - kind "noop":      nothing to do (no game / already game over before this
 *                     click was meaningful). The store returns early.
 */
export type SpPlayAgainResult =
  | { kind: "seat"; players: SeatInput[]; nextElim: ElimState }
  | { kind: "game_over"; nextElim: ElimState }
  | { kind: "noop" };

/**
 * computeSpPlayAgain — PURE seat-selection + finalisation for playAgain().
 *
 * Extracted verbatim from store.ts playAgain() so the FULL single-player
 * continuation loop (resolve a round with computeSpBust, then seat the next one)
 * is unit-testable WITHOUT instantiating the Zustand store or running newGame().
 *
 * The store remains responsible for the side-effects: on "seat" it calls
 * newGame({ players, scores, ... }) and commits both the new game and nextElim;
 * on "game_over" it commits nextElim; on "noop" it returns early. The branching
 * logic and the next ElimState are decided here, byte-for-byte identical to the
 * former inline code.
 */
export function computeSpPlayAgain(
  game: GameState | null,
  elim: ElimState,
): SpPlayAgainResult {
  if (!game) return { kind: "noop" };
  if (elim.gloriosVictory) return { kind: "noop" }; // game over, nothing to play

  // ── Sudden-death path: contestants play another tie-breaker round. ────────
  // Their busted-but-not-kicked status is preserved (they're still "in" —
  // playing the tiebreaker). Seat ONLY the SD contestants. Preserve history.
  if (elim.suddenDeath?.active) {
    const contestantSet = new Set(elim.suddenDeath.contestants);
    const players = game.players
      .filter((p) => contestantSet.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, isBot: p.isBot }));
    if (players.length < 2) {
      // Defensive: SD should never trigger with <2 contestants, but if somehow
      // we land here, declare the lone remaining player.
      const survivor = players[0]?.id ?? null;
      return {
        kind: "game_over",
        nextElim: {
          ...elim,
          bustedThisRound: [],
          gloriosVictory: survivor,
          gloriosVictoryReason: survivor ? "sudden_death" : null,
          // Keep the SD record (inactive) so end-of-game scoreboards can still
          // split R/F columns.
          suddenDeath: elim.suddenDeath
            ? {
                active: false,
                contestants: elim.suddenDeath.contestants,
                mainRoundsCount: elim.suddenDeath.mainRoundsCount,
              }
            : null,
        },
      };
    }
    return {
      kind: "seat",
      players,
      nextElim: {
        ...elim,
        // bustedThisRound resets for the new round; contestants remain "in"
        // (no migration to kickedIds during a SD transition).
        bustedThisRound: [],
      },
    };
  }

  // ── Normal path: finalise busts from the round that just ended into the
  //    permanent kickedIds. Mirrors the server's play_again handler. ─────────
  const nextKicked = [...elim.kickedIds];
  for (const id of elim.bustedThisRound) {
    if (!nextKicked.includes(id)) nextKicked.push(id);
  }
  const finalisedElim: ElimState = {
    ...elim,
    bustedThisRound: [],
    kickedIds: nextKicked,
  };

  // Filter out kicked players from the next round's seat list. The Glorious
  // Victor's seat persists; kicks are permanent for the rest.
  const kickedSet = new Set(nextKicked);
  const activePlayers = game.players.filter((p) => !kickedSet.has(p.id));

  if (activePlayers.length <= 1) {
    // Only one (or zero) active players remain — declare GV immediately
    // instead of starting a new round.
    const survivor = activePlayers[0]?.id ?? null;
    return {
      kind: "game_over",
      nextElim: {
        ...finalisedElim,
        gloriosVictory: survivor,
        gloriosVictoryReason: "survivor",
      },
    };
  }

  const players = activePlayers.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot }));
  return { kind: "seat", players, nextElim: finalisedElim };
}
