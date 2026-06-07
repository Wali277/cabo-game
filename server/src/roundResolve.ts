// =============================================================================
// roundResolve.ts — PURE extraction of the MP round_over bust/GV/SD resolution.
// -----------------------------------------------------------------------------
// This is the round-over bust / glorious-victory / sudden-death resolution that
// used to live inline in the `room:action` socket handler in index.ts (the
// `if (room.game.phase === "round_over")` block), lifted into a pure function so
// it can be unit-tested with synthetic Rooms without standing up sockets / io /
// grants. It implements the corrected order-of-authority (most wins → lowest
// final-round score → sudden death; a tied round credits nobody) and MUST stay
// in lockstep with SP's computeSpBust (cobo/src/state/spBust.ts) — the
// `npm run check:roundresolve` suite asserts MP === SP across hundreds of cases.
//
// CONTRACT: resolveRoundOver(room) mutates ONLY the room's bust/GV/SD bookkeeping
//   - room.roundWins
//   - room.bustedThisRound
//   - room.kickedIds
//   - room.gloriosVictory
//   - room.gloriosVictoryReason
//   - room.suddenDeath
// It does NOT broadcast, does NOT call grantMpRewards, does NOT touch the socket.
// The caller (socket handler) runs the side effects (grant / broadcast / cb)
// AFTER calling this.
//
// Precondition: room.game is non-null and room.game.phase === "round_over".
//
// PARITY: this mirrors the SP path computeSpBust() in cobo/src/state/store.ts.
// The shared order-of-authority lives in engine/bustResolve.ts (resolveSimultaneous
// Bust / roundWinForCredit / lastRoundScores), identical in SP and MP.
// =============================================================================
import type { Room } from "./rooms.js";
import { handScore, newGame } from "./engine/game.js";
import {
  resolveSimultaneousBust,
  roundWinForCredit,
  lastRoundScores,
} from "./engine/bustResolve.js";

/** A player's running MATCH total — round scores + cabo penalties − cabo/snap
 *  bonuses. The bust threshold uses this (NOT the raw round sum) so busting
 *  matches the scoreboard total the players see. Identical to index.ts's
 *  matchTotal and to the client's matchTotal. */
function matchTotal(game: NonNullable<Room["game"]>, id: string): number {
  const sum = (arr?: number[]) => (arr ?? []).reduce((a, b) => a + b, 0);
  return (
    sum(game.scores[id]) +
    sum(game.caboPenalty[id]) -
    sum(game.caboBonus[id]) -
    sum(game.snapBonus[id])
  );
}

/**
 * Resolve a round_over for an MP room: track round wins, detect busts on the
 * match total, and (when the game ends) decide the Glorious Victor / sudden
 * death through the shared order of authority. Mutates room.* in place.
 *
 * Extracted VERBATIM from the index.ts `room:action` handler — do not change the
 * rule here; this is the parity-critical glue and must stay in lockstep with SP.
 */
export function resolveRoundOver(room: Room): void {
  if (!room.game || room.game.phase !== "round_over") return;

  // The engine's declared round winner is passed through unchanged, even
  // if they happen to be on kickedIds.
  const winnerId = room.game.winnerId;

  // ── Sudden-death resolution branch ─────────────────────────────────────
  if (room.suddenDeath?.active) {
    if (winnerId) {
      room.roundWins[winnerId] = (room.roundWins[winnerId] ?? 0) + 1;
    }

    const contestantHands = room.suddenDeath.contestants.map((id) => {
      const player = room.game!.players.find((p) => p.id === id);
      // Pass the variant so sudden-death hand scoring matches SP (computeSpBust)
      // AND the rest of the engine. Without it, Evolved scores a King as 13
      // (classic) instead of 0, which can crown the WRONG sudden-death winner.
      return { id, handTotal: player ? handScore(player.hand, room.game!.variant) : Infinity };
    });
    const minHand = Math.min(...contestantHands.map((c) => c.handTotal));
    const atMin = contestantHands.filter((c) => c.handTotal === minHand);

    if (atMin.length === 1) {
      // Unique winner — declare GV, kick the other contestants.
      const victorId = atMin[0].id;
      const losers = room.suddenDeath.contestants.filter((id) => id !== victorId);
      for (const id of losers) {
        if (!room.kickedIds.includes(id)) room.kickedIds.push(id);
      }
      room.gloriosVictory = victorId;
      room.gloriosVictoryReason = "sudden_death";
      room.suddenDeath = {
        active: false,
        contestants: room.suddenDeath.contestants,
        mainRoundsCount: room.suddenDeath.mainRoundsCount,
      };
    } else {
      // Multiple tied at the minimum — another SD round is needed, but per the
      // spec ("another is played until only one stands") it must be played by
      // ONLY the still-tied (lowest-hand) players. Eliminate every contestant
      // who scored STRICTLY HIGHER than the minimum and narrow the contestant
      // set to the still-tied subset. Mirrors the normal-bust narrowing at
      // ~lines 168-186 (resolveSimultaneousBust → sdContestants), and MUST stay
      // identical to SP's computeSpBust. The set shrinks whenever any contestant
      // scored strictly higher; a persistent all-tie (every contestant still at
      // the minimum, e.g. forced-equal hands) does NOT shrink and relies on
      // reshuffled hands eventually differing — see the non-termination note in
      // check-sd-loop.ts (no hard iteration cap exists yet).
      const stillTied = atMin.map((c) => c.id);
      const losers = room.suddenDeath.contestants.filter(
        (id) => !stillTied.includes(id),
      );
      for (const id of losers) {
        if (!room.kickedIds.includes(id)) room.kickedIds.push(id);
      }
      // No victor yet (mirrors SP, which clears these on the cloned next state).
      room.gloriosVictory = null;
      room.gloriosVictoryReason = null;
      room.suddenDeath = {
        active: true,
        contestants: stillTied,
        mainRoundsCount: room.suddenDeath.mainRoundsCount,
      };
    }
    return;
  }

  // ── Normal path ────────────────────────────────────────────────────────
  // Track round wins. A round is "won" ONLY by a player with a STRICTLY
  // unique lowest score that round; a TIE for lowest credits NOBODY.
  {
    const activeIds = room.game.players
      .map((p) => p.id)
      .filter((id) => !room.kickedIds.includes(id));
    const credited = roundWinForCredit(activeIds, lastRoundScores(room.game.scores, activeIds));
    if (credited) {
      room.roundWins[credited] = (room.roundWins[credited] ?? 0) + 1;
    }
  }

  // Compute newly busted players on the FULL match total.
  room.bustedThisRound = room.game.players
    .filter((p) => matchTotal(room.game!, p.id) > 60)
    .map((p) => p.id);

  if (room.bustedThisRound.length > 0) {
    const allEliminated = new Set([...room.kickedIds, ...room.bustedThisRound]);
    const survivors = room.members
      .map((m) => m.playerId)
      .filter((pid) => !allEliminated.has(pid) && !room.disconnects[pid]?.forfeited);

    if (survivors.length === 1) {
      // ── One clear survivor after busts → regular Glorious Victory ────────
      for (const id of room.bustedThisRound) {
        if (!room.kickedIds.includes(id)) room.kickedIds.push(id);
      }
      room.gloriosVictory = survivors[0];
      room.gloriosVictoryReason = "survivor";

    } else if (survivors.length === 0) {
      // ── Everyone busted simultaneously → tiebreaker ──────────────────────
      const contestants = room.bustedThisRound.filter(
        (pid) => !room.kickedIds.includes(pid),
      );

      if (contestants.length === 1) {
        // Only one active buster — they win by default.
        const gloriousWinnerId = contestants[0];
        room.bustedThisRound = room.bustedThisRound.filter((id) => id !== gloriousWinnerId);
        for (const id of room.bustedThisRound) {
          if (!room.kickedIds.includes(id)) room.kickedIds.push(id);
        }
        room.gloriosVictory = gloriousWinnerId;
        room.gloriosVictoryReason = "survivor";
      } else if (contestants.length > 1) {
        // Resolve via the SHARED order of authority (most wins → lowest
        // score in the FINAL round → sudden death).
        const decision = resolveSimultaneousBust(
          contestants,
          room.roundWins,
          lastRoundScores(room.game.scores, contestants),
        );
        if (decision.winnerId) {
          const gloriousWinnerId = decision.winnerId;
          room.bustedThisRound = room.bustedThisRound.filter((id) => id !== gloriousWinnerId);
          for (const id of room.bustedThisRound) {
            if (!room.kickedIds.includes(id)) room.kickedIds.push(id);
          }
          room.gloriosVictory = gloriousWinnerId;
          room.gloriosVictoryReason = decision.reason;
        } else {
          // Sudden death among the STILL-tied set.
          const sd = decision.sdContestants ?? [];
          const losers = room.bustedThisRound.filter(
            (id) => !sd.includes(id) && !room.kickedIds.includes(id),
          );
          for (const id of losers) {
            if (!room.kickedIds.includes(id)) room.kickedIds.push(id);
          }
          room.bustedThisRound = room.bustedThisRound.filter(
            (id) => !sd.includes(id),
          );
          const anyPlayerId = room.game.players[0]?.id;
          const mainRoundsCount = anyPlayerId
            ? (room.game.scores[anyPlayerId]?.length ?? 0)
            : 0;
          room.suddenDeath = {
            active: true,
            contestants: sd,
            mainRoundsCount,
          };
        }
      }
      // If contestants.length === 0 (edge case: all already kicked), do nothing.
    }
    // survivors.length > 1: multiple still active → normal play-again flow.
  }
}

// =============================================================================
// seatSuddenDeathNextRound — PURE extraction of the SUDDEN-DEATH SEATING half of
// the room:play_again socket handler (index.ts ~lines 713-816, the
// `isSuddenDeath` paths only). It encapsulates the two <=1 guards and the
// newGame() reseating so the FULL sudden-death continuation loop
// (resolveRoundOver → seatSuddenDeathNextRound → resolveRoundOver → …) can be
// unit-tested without standing up sockets / votes / io / grants.
//
// PRECONDITION: room.suddenDeath?.active === true and room.game is non-null, and
// all SD contestants have already voted play-again (the handler only reaches the
// seating code in its "all voted" branch — the vote bookkeeping stays in the
// socket handler).
//
// BEHAVIOUR (must stay byte-faithful to the inline handler):
//   activeIds          = suddenDeath.contestants ∖ (forfeited ∪ kicked)   [guard 1]
//   playersForNextRound = game.players ∩ suddenDeath.contestants          [guard 2]
//   - either guard at <=1 → terminal Glorious Victory (reason "sudden_death"),
//     suddenDeath marked inactive (contestants/mainRoundsCount preserved).
//   - otherwise → reseat newGame() carrying scores/bonuses/penalties forward,
//     roundNumber+1, alternating starter; suddenDeath stays active+frozen.
//
// It mutates the SAME room.* fields the handler mutates in these paths:
//   room.bustedThisRound (always cleared), room.gloriosVictory,
//   room.gloriosVictoryReason, room.suddenDeath, room.game, room.lastStarterIdx.
// It does NOT touch votes, timers, disconnects, broadcast, grant, or cb — those
// remain the socket handler's responsibility AFTER calling this.
//
// PARITY: this is the MP analogue of SP's store.ts playAgain() sudden-death
// branch (cobo/src/state/store.ts ~lines 1346-1396).
// =============================================================================
export type SeatSdResult =
  | { gameOver: true; winnerId: string | null; reason: "sudden_death" }
  | { gameOver: false; mainRoundsCount: number };

export function seatSuddenDeathNextRound(room: Room): SeatSdResult {
  if (!room.game || !room.suddenDeath?.active) {
    // Caller contract violated; nothing to seat. Treat as a no-op terminal so
    // the loop stops rather than spinning.
    return { gameOver: true, winnerId: null, reason: "sudden_death" };
  }

  // bustedThisRound is always cleared at play_again time (handler line 721).
  room.bustedThisRound = [];

  // Guard 1 — active SD contestants (not forfeited, not kicked).
  const activeIds = room.suddenDeath.contestants.filter(
    (pid) => !room.disconnects[pid]?.forfeited && !room.kickedIds.includes(pid),
  );
  if (activeIds.length <= 1) {
    room.gloriosVictory = activeIds[0] ?? null;
    room.gloriosVictoryReason = "sudden_death";
    room.suddenDeath = {
      active: false,
      contestants: room.suddenDeath.contestants,
      mainRoundsCount: room.suddenDeath.mainRoundsCount,
    };
    return { gameOver: true, winnerId: room.gloriosVictory, reason: "sudden_death" };
  }

  // Guard 2 — players that actually have a seat AND are still contestants.
  const playersForNextRound = room.game.players.filter((p) =>
    room.suddenDeath!.contestants.includes(p.id),
  );
  if (playersForNextRound.length <= 1) {
    room.gloriosVictory = playersForNextRound[0]?.id ?? null;
    room.gloriosVictoryReason = "sudden_death";
    room.suddenDeath = {
      active: false,
      contestants: room.suddenDeath.contestants,
      mainRoundsCount: room.suddenDeath.mainRoundsCount,
    };
    return { gameOver: true, winnerId: room.gloriosVictory, reason: "sudden_death" };
  }

  // Reseat the next sudden-death round — carry the full scoring history forward.
  const players = playersForNextRound.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: false,
  }));
  const nextStarterIdx = (room.lastStarterIdx + 1) % players.length;
  room.game = newGame({
    players,
    variant: room.variant,
    roundNumber: room.game.roundNumber + 1,
    scores: room.game.scores,
    caboBonus: room.game.caboBonus,
    caboPenalty: room.game.caboPenalty,
    snapBonus: room.game.snapBonus,
  });
  room.game.currentPlayer = nextStarterIdx;
  room.lastStarterIdx = nextStarterIdx;
  // suddenDeath stays active + frozen (contestants unchanged across SD repeats).
  return { gameOver: false, mainRoundsCount: room.suddenDeath.mainRoundsCount };
}
