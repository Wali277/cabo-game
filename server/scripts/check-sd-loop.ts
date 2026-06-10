// =============================================================================
// check-sd-loop.ts — EMPIRICAL test of the FULL MULTIPLAYER sudden-death
// CONTINUATION LOOP, driving the REAL production code:
//
//     resolveRoundOver(room)          (server/src/roundResolve.ts — resolution)
//   → seatSuddenDeathNextRound(room)  (server/src/roundResolve.ts — seating,
//                                       extracted from the index.ts play_again
//                                       socket handler)
//   → resolveRoundOver(room) → …  until a Glorious Victor is crowned.
//
//   run:  cd server && node --import tsx scripts/check-sd-loop.ts
//
// Each SD round is simulated by (1) seating the next round via the real seat fn
// (which calls the real newGame, carrying scores forward), then (2) OVERWRITING
// the dealt hands with controlled ranks so we decide tie-vs-unique exactly, then
// (3) marking phase=round_over and calling the real resolveRoundOver.
//
// It also runs a DIFFERENTIAL parity check: the SAME scripted SD loop is driven
// through the REAL single-player resolution (computeSpBust, importable) plus a
// byte-faithful reimplementation of SP's store.ts playAgain() sudden-death
// seating branch, and asserts the MP loop result === the SP loop result.
//
// COVERS (same matrix as the SP agent):
//   - 2-player tie → replay → winner
//   - repeated ties → then a winner
//   - 3-player A&B tie / C higher → KEY: does the next SD round seat ONLY {A,B}
//     and kick C?  (asserts correct narrowing; reports a BUG if it does not)
//   - seating contestants-only
//   - scores preserved across SD rounds
//   - termination
//   - <2 guard (lone contestant → immediate GV)
//   - MP-specific: a contestant who disconnects/forfeits mid-SD
//   - MP loop result === SP loop result (differential)
// =============================================================================
import {
  resolveRoundOver,
  seatSuddenDeathNextRound,
} from "../src/roundResolve.js";
import type { Room, Member } from "../src/rooms.js";
import type { GameState, Card } from "../src/engine/types.js";
import { handScore } from "../src/engine/game.js";
import {
  computeSpBust,
  EMPTY_ELIM,
  type ElimState,
} from "../../cobo/src/state/spBust.js";
// SP seating uses the REAL newGame (same fn the SP store calls).
import { newGame } from "../src/engine/game.js";

let pass = 0,
  fail = 0;
const bugs: string[] = [];
function ok(label: string) {
  pass++;
  console.log(`  ok  ${label}`);
}
function bad(label: string, extra?: string) {
  fail++;
  console.log(`FAIL  ${label}${extra ? "\n        " + extra : ""}`);
}
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) ok(label);
  else bad(label, `got  ${g}\n        want ${w}`);
}

function card(rank: Card["rank"]): Card {
  return { id: `${rank}-${Math.random()}`, rank, suit: "S" };
}

// ── synthetic round_over GameState (mirrors check-roundresolve's builder) ─────
interface PlayerSpec {
  id: string;
  scores: number[];
  caboPenalty?: number[];
  caboBonus?: number[];
  snapBonus?: number[];
  hand?: Card["rank"][];
}
function makeGame(
  specs: PlayerSpec[],
  opts: { winnerId?: string | null; variant?: "classic" | "evolved" } = {},
): GameState {
  const scores: Record<string, number[]> = {};
  const caboPenalty: Record<string, number[]> = {};
  const caboBonus: Record<string, number[]> = {};
  const snapBonus: Record<string, number[]> = {};
  const players = specs.map((s) => {
    scores[s.id] = [...s.scores];
    caboPenalty[s.id] = s.caboPenalty ?? s.scores.map(() => 0);
    caboBonus[s.id] = s.caboBonus ?? s.scores.map(() => 0);
    snapBonus[s.id] = s.snapBonus ?? s.scores.map(() => 0);
    return {
      id: s.id,
      name: s.id,
      isBot: false,
      hand: (s.hand ?? []).map(card),
      knownToSelf: [],
      calledCabo: false,
      snapsUsed: { other: false, self: false },
      snapsCorrect: { other: false, self: false },
    };
  });
  return {
    variant: opts.variant ?? "classic",
    players,
    currentPlayer: 0,
    phase: "round_over",
    deck: [],
    discard: [],
    drawnCard: null,
    drawnFrom: null,
    pendingActionSource: null,
    peekAndSwapPick: null,
    pendingPeek: null,
    caboCallerId: null,
    finalRoundTurnsLeft: null,
    reveals: [],
    animations: [],
    roundNumber: specs[0]?.scores.length ?? 1,
    scores,
    caboBonus,
    caboPenalty,
    snapBonus,
    winnerId: opts.winnerId ?? null,
  } as unknown as GameState;
}

function makeRoom(
  game: GameState,
  over: Partial<Room> & { memberIds?: string[] } = {},
): Room {
  const ids = over.memberIds ?? game.players.map((p) => p.id);
  const members: Member[] = ids.map((id) => ({
    socketId: `sock-${id}`,
    playerId: id,
    name: id,
    connected: true,
  }));
  return {
    code: "TEST",
    hostId: ids[0] ?? null,
    members,
    game,
    variant: game.variant,
    createdAt: 0,
    lastStarterIdx: 0,
    coinToss: null,
    strawDraw: null,
    playAgainVotes: [],
    disconnects: over.disconnects ?? {},
    bustedThisRound: over.bustedThisRound ?? [],
    kickedIds: over.kickedIds ?? [],
    gloriosVictory: over.gloriosVictory ?? null,
    gloriosVictoryReason: over.gloriosVictoryReason ?? null,
    roundWins: over.roundWins ?? {},
    suddenDeath: over.suddenDeath ?? null,
    readyVotes: [],
    roundReadyVotes: [],
    roundReadyStartedAt: null,
    strawReadyVotes: [],
    strawReadyStartedAt: null,
    matchSeq: 1,
    matchId: "TEST-m1",
    xpGranted: false,
  } as Room;
}

// =============================================================================
// SP SEATING — byte-faithful reimplementation of store.ts playAgain()'s
// sudden-death branch (cobo/src/state/store.ts ~lines 1346-1396). Operates on an
// ElimState + GameState pair the way the SP store does. Returns the next game (or
// null when terminal, having mutated elim's GV/SD).
// =============================================================================
function spSeatSuddenDeath(
  game: GameState,
  elim: ElimState,
): { game: GameState | null; elim: ElimState } {
  if (!elim.suddenDeath?.active) {
    return { game: null, elim };
  }
  const contestantSet = new Set(elim.suddenDeath.contestants);
  const playerInputs = game.players
    .filter((p) => contestantSet.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, isBot: p.isBot }));
  if (playerInputs.length < 2) {
    const survivor = playerInputs[0]?.id ?? null;
    return {
      game: null,
      elim: {
        ...elim,
        bustedThisRound: [],
        gloriosVictory: survivor,
        gloriosVictoryReason: survivor ? "sudden_death" : null,
        suddenDeath: {
          active: false,
          contestants: elim.suddenDeath.contestants,
          mainRoundsCount: elim.suddenDeath.mainRoundsCount,
        },
      },
    };
  }
  const next = newGame({
    players: playerInputs,
    variant: game.variant,
    roundNumber: game.roundNumber + 1,
    scores: game.scores,
    caboBonus: game.caboBonus,
    caboPenalty: game.caboPenalty,
    snapBonus: game.snapBonus,
    kamikaze: game.kamikaze,
  });
  return { game: next, elim: { ...elim, bustedThisRound: [] } };
}

// ── A "scripted SD round": each entry assigns a hand (ranks) to every still-in
//    contestant for that round. We also append the round score (handScore) to the
//    scores array so the carried-forward history grows realistically. ───────────
type RoundScript = Record<string, Card["rank"][]>; // id → hand ranks for this SD round

// Inject the scripted hands into a freshly-seated game and append the round's
// hand-score to each seated player's scores. The seat fns already carried the
// PRIOR scores forward; we add this round's row. winnerId set to the unique low
// (or null on a tie) to mirror the engine's declared winner.
function applyScriptToGame(game: GameState, script: RoundScript): void {
  // Append this round's score row for every seated player.
  const handTotals: Record<string, number> = {};
  for (const p of game.players) {
    const ranks = script[p.id];
    if (!ranks) {
      // Player not scripted this round (shouldn't happen for a seated contestant).
      handTotals[p.id] = Infinity;
      continue;
    }
    p.hand = ranks.map(card);
    const total = handScore(p.hand, game.variant);
    handTotals[p.id] = total;
    game.scores[p.id] = [...(game.scores[p.id] ?? []), total];
    game.caboPenalty[p.id] = [...(game.caboPenalty[p.id] ?? []), 0];
    game.caboBonus[p.id] = [...(game.caboBonus[p.id] ?? []), 0];
    game.snapBonus[p.id] = [...(game.snapBonus[p.id] ?? []), 0];
  }
  // Engine declared winner = unique lowest hand among seated players, else null.
  const ids = game.players.map((p) => p.id);
  const min = Math.min(...ids.map((id) => handTotals[id]));
  const atMin = ids.filter((id) => handTotals[id] === min);
  game.winnerId = atMin.length === 1 ? atMin[0] : null;
  game.phase = "round_over";
}

// =============================================================================
// MP loop driver. Seeds an ACTIVE sudden death with the given contestants and
// prior score history, then for each scripted round: seat → inject → resolve,
// until resolveRoundOver crowns a GV (or a safety cap trips). Returns the room.
// =============================================================================
const SAFETY_CAP = 50;
function runMpLoop(
  contestants: string[],
  priorScores: Record<string, number[]>,
  scripts: RoundScript[],
  opts: {
    priorRoundWins?: Record<string, number>;
    mainRoundsCount?: number;
    variant?: "classic" | "evolved";
    forfeitBefore?: { round: number; id: string }; // forfeit id just before seating round N (0-based)
  } = {},
): { room: Room; rounds: number } {
  // Build a round_over game that is ALREADY mid-SD: phase round_over, an SD round
  // just ended in a tie (so seat is the first action). To bootstrap, we hand the
  // loop a game whose scores == priorScores and an active SD, then drive seating.
  const specs: PlayerSpec[] = contestants.map((id) => ({
    id,
    scores: priorScores[id] ?? [],
  }));
  const game = makeGame(specs, { variant: opts.variant });
  const room = makeRoom(game, {
    roundWins: { ...(opts.priorRoundWins ?? {}) },
    suddenDeath: {
      active: true,
      contestants: [...contestants],
      mainRoundsCount: opts.mainRoundsCount ?? (priorScores[contestants[0]]?.length ?? 0),
    },
  });

  let rounds = 0;
  for (let i = 0; i < scripts.length && i < SAFETY_CAP; i++) {
    // Optional MP-specific forfeit just before seating this round.
    if (opts.forfeitBefore && opts.forfeitBefore.round === i) {
      room.disconnects[opts.forfeitBefore.id] = { startedAt: 0, forfeited: true };
    }
    const seat = seatSuddenDeathNextRound(room);
    rounds++;
    if (seat.gameOver) {
      // Lone contestant → GV declared by the seat fn (<2 guard).
      return { room, rounds };
    }
    applyScriptToGame(room.game!, scripts[i]);
    resolveRoundOver(room);
    if (room.gloriosVictory) {
      return { room, rounds };
    }
  }
  return { room, rounds };
}

// SP loop driver — same scripts, but through computeSpBust + spSeatSuddenDeath.
function runSpLoop(
  contestants: string[],
  priorScores: Record<string, number[]>,
  scripts: RoundScript[],
  opts: {
    priorRoundWins?: Record<string, number>;
    mainRoundsCount?: number;
    variant?: "classic" | "evolved";
  } = {},
): { elim: ElimState; finalGame: GameState | null; rounds: number } {
  const specs: PlayerSpec[] = contestants.map((id) => ({
    id,
    scores: priorScores[id] ?? [],
  }));
  let game: GameState | null = makeGame(specs, { variant: opts.variant });
  let elim: ElimState = {
    ...EMPTY_ELIM,
    roundWins: { ...(opts.priorRoundWins ?? {}) },
    suddenDeath: {
      active: true,
      contestants: [...contestants],
      mainRoundsCount: opts.mainRoundsCount ?? (priorScores[contestants[0]]?.length ?? 0),
    },
  };
  let rounds = 0;
  for (let i = 0; i < scripts.length && i < SAFETY_CAP; i++) {
    const seated = spSeatSuddenDeath(game!, elim);
    rounds++;
    elim = seated.elim;
    if (!seated.game) {
      return { elim, finalGame: null, rounds }; // <2 guard terminal
    }
    game = seated.game;
    applyScriptToGame(game, scripts[i]);
    elim = computeSpBust(game, elim);
    if (elim.gloriosVictory) {
      return { elim, finalGame: game, rounds };
    }
  }
  return { elim, finalGame: game, rounds };
}

console.log(
  "==================================================================\n" +
    " MP sudden-death CONTINUATION LOOP — full resolve→seat→resolve\n" +
    "==================================================================",
);

const A = "a", B = "b", C = "c";

// ── 1. 2-player tie → replay → winner ────────────────────────────────────────
console.log("\n— 1) 2-player: tie, then a→winner —");
{
  // Bootstrap: SD active among {a,b}, 2 main rounds already played (final tie).
  const prior = { [A]: [31, 31], [B]: [31, 31] };
  const scripts: RoundScript[] = [
    { [A]: ["4", "4"], [B]: ["4", "4"] }, // round1: 8==8 → tie → replay
    { [A]: ["2", "3"], [B]: ["5", "5"] }, // round2: 5 < 10 → a wins
  ];
  const { room, rounds } = runMpLoop([A, B], prior, scripts, {
    priorRoundWins: { [A]: 1, [B]: 1 },
    mainRoundsCount: 2,
  });
  eq("1 — winner a", room.gloriosVictory, A);
  eq("1 — reason sudden_death", room.gloriosVictoryReason, "sudden_death");
  eq("1 — b kicked", room.kickedIds.includes(B), true);
  eq("1 — SD inactive, contestants preserved", room.suddenDeath, {
    active: false,
    contestants: [A, B],
    mainRoundsCount: 2,
  });
  eq("1 — took 2 SD rounds", rounds, 2);
  // Scores preserved + grew: a played main(2) + sd(2) = 4 rows.
  eq("1 — scores carried forward (a has 4 rows)", room.game!.scores[A].length, 4);
  eq("1 — mainRoundsCount split point intact", room.suddenDeath!.mainRoundsCount, 2);
}

// ── 2. Repeated ties → then a winner ─────────────────────────────────────────
console.log("\n— 2) 2-player: 3 ties in a row, then b wins —");
{
  const prior = { [A]: [31, 31], [B]: [31, 31] };
  const scripts: RoundScript[] = [
    { [A]: ["5", "5"], [B]: ["5", "5"] }, // 10==10 tie
    { [A]: ["6", "4"], [B]: ["7", "3"] }, // 10==10 tie
    { [A]: ["2", "2"], [B]: ["2", "2"] }, // 4==4 tie
    { [A]: ["9", "9"], [B]: ["3", "2"] }, // 18 vs 5 → b wins
  ];
  const { room, rounds } = runMpLoop([A, B], prior, scripts, {
    priorRoundWins: { [A]: 1, [B]: 1 },
    mainRoundsCount: 2,
  });
  eq("2 — winner b", room.gloriosVictory, B);
  eq("2 — a kicked", room.kickedIds.includes(A), true);
  eq("2 — SD inactive", room.suddenDeath!.active, false);
  eq("2 — took 4 SD rounds", rounds, 4);
  // Contestants list still the original frozen [a,b] (2-player never narrows).
  eq("2 — contestants frozen [a,b]", room.suddenDeath!.contestants, [A, B]);
}

// ── 3. KEY: 3-player A&B tie / C higher → next round ONLY {A,B}, C kicked ─────
console.log("\n— 3) KEY 3-player: a&b tie lowest, c higher → narrow to {a,b}? —");
{
  const prior = { [A]: [31, 31, 31], [B]: [31, 31, 31], [C]: [31, 31, 31] };
  // Round 1 of SD: a=8, b=8, c=12 → a,b tie LOWEST, c strictly higher.
  // Per the rule, the NEXT SD round must seat ONLY {a,b} and c must be kicked.
  const scripts: RoundScript[] = [
    { [A]: ["4", "4"], [B]: ["4", "4"], [C]: ["6", "6"] }, // a,b=8 tie; c=12 higher
    // Round 2: whoever is seated. If narrowing is correct, only {a,b} seated and
    // we resolve a<b. If NOT narrowing, c is wrongly re-seated too.
    { [A]: ["2", "3"], [B]: ["5", "5"], [C]: ["9", "9"] }, // a=5 < b=10 (c=18 if present)
  ];
  const { room, rounds } = runMpLoop([A, B, C], prior, scripts, {
    priorRoundWins: { [A]: 1, [B]: 1, [C]: 1 },
    mainRoundsCount: 3,
  });

  // EMPIRICAL probe of the open question. Inspect what round 2 actually seated.
  // After round 1 resolves (tie at min between a,b), what is suddenDeath.contestants?
  // We captured the room AFTER the loop; reconstruct by re-running just round 1.
  {
    const prior1 = { [A]: [31, 31, 31], [B]: [31, 31, 31], [C]: [31, 31, 31] };
    const g = makeGame(
      [A, B, C].map((id) => ({ id, scores: prior1[id] })),
    );
    const r = makeRoom(g, {
      roundWins: { [A]: 1, [B]: 1, [C]: 1 },
      suddenDeath: { active: true, contestants: [A, B, C], mainRoundsCount: 3 },
    });
    seatSuddenDeathNextRound(r); // seat round 1
    applyScriptToGame(r.game!, scripts[0]); // a,b=8 ; c=12
    resolveRoundOver(r); // resolve the a,b tie with c higher

    const contestantsAfter = [...r.suddenDeath!.contestants].sort();
    const cKicked = r.kickedIds.includes(C);
    console.log(
      `        [probe] after a&b-tie/c-higher round: contestants=${JSON.stringify(
        contestantsAfter,
      )} cKicked=${cKicked} active=${r.suddenDeath!.active}`,
    );

    const narrows =
      contestantsAfter.length === 2 &&
      contestantsAfter[0] === A &&
      contestantsAfter[1] === B &&
      cKicked;

    // SPEC-CORRECT behavior (fixed 2026-06-05): after a&b tie at the lowest hand
    // and c scores strictly higher, the next SD round must be played by ONLY the
    // still-tied {a,b}; the higher-scoring loser c is eliminated. The resolver's
    // atMin.length>1 branch now kicks every handTotal>minHand contestant and
    // narrows suddenDeath.contestants to the atMin subset (mirroring the
    // normal-bust narrowing at roundResolve.ts ~168-186), so seatSuddenDeath
    // NextRound reseats only {a,b}. Present IDENTICALLY in SP computeSpBust.
    eq("3 — next SD contestants after a&b-tie/c-higher narrow to [a,b]", contestantsAfter, [A, B]);
    eq("3 — c (strictly higher loser) kicked", cKicked, true);

    if (narrows) {
      ok("3 — SPEC: narrows correctly to {a,b}, c eliminated");
    } else {
      // Regression guard: if narrowing ever breaks again, report it loudly.
      const msg =
        `KEY REGRESSION — 3-player SD tie did NOT narrow. After a&b tie (lowest) ` +
        `and c strictly higher, suddenDeath.contestants is ${JSON.stringify(contestantsAfter)} ` +
        `(spec wants ["a","b"]) and c kicked=${cKicked} (spec wants true). The ` +
        `strictly-higher loser c must be eliminated, not re-seated into the next ` +
        `SD round. Root cause if this fires: roundResolve.ts resolveRoundOver SD ` +
        `branch atMin.length>1 case stopped kicking handTotal>minHand contestants ` +
        `or stopped shrinking contestants to atMin. Must stay identical in SP ` +
        `computeSpBust (shared rule).`;
      console.log("BUG   3 — KEY narrowing on 3-way SD tie (a&b low, c higher)\n        " + msg);
      bugs.push(msg);
    }
  }

  // Document the full-loop outcome too (whatever it is) for the record.
  console.log(
    `        [loop] 3-player loop crowned gv=${room.gloriosVictory} reason=${room.gloriosVictoryReason} ` +
      `kicked=${JSON.stringify([...room.kickedIds].sort())} rounds=${rounds} ` +
      `contestants=${JSON.stringify(room.suddenDeath!.contestants)}`,
  );
}

// ── 4. Seating is contestants-only (already-kicked never re-seated) ──────────
console.log("\n— 4) Seating contestants-only: a pre-kicked d never re-enters —");
{
  // SD among {a,b}; an unrelated player d was kicked earlier. The seated next
  // round must contain ONLY {a,b} — d must never appear, even though it could be
  // present in members. (game.players only has the contestants here, which is the
  // realistic post-narrow seat list.)
  const prior = { [A]: [31, 31], [B]: [31, 31] };
  const g = makeGame([A, B].map((id) => ({ id, scores: prior[id] })));
  const room = makeRoom(g, {
    memberIds: [A, B, "d"],
    kickedIds: ["d"],
    suddenDeath: { active: true, contestants: [A, B], mainRoundsCount: 2 },
  });
  const seat = seatSuddenDeathNextRound(room);
  eq("4 — not terminal (2 contestants)", seat.gameOver, false);
  eq("4 — seated exactly [a,b]", room.game!.players.map((p) => p.id).sort(), [A, B]);
  eq("4 — d not seated", room.game!.players.some((p) => p.id === "d"), false);
}

// ── 5. <2 guard: lone contestant → immediate GV ──────────────────────────────
console.log("\n— 5) <2 guard: a single contestant → immediate sudden_death GV —");
{
  const prior = { [A]: [31, 31] };
  const g = makeGame([{ id: A, scores: prior[A] }]);
  const room = makeRoom(g, {
    suddenDeath: { active: true, contestants: [A], mainRoundsCount: 2 },
  });
  const seat = seatSuddenDeathNextRound(room);
  eq("5 — terminal", seat.gameOver, true);
  eq("5 — gv a", room.gloriosVictory, A);
  eq("5 — reason sudden_death", room.gloriosVictoryReason, "sudden_death");
  eq("5 — SD marked inactive", room.suddenDeath!.active, false);
}

// ── 6. MP-specific: a contestant disconnects/forfeits mid-SD ─────────────────
console.log("\n— 6) MP forfeit mid-SD: forfeited contestant excluded from seating —");
{
  // SD among {a,b}. Before the next round seats, b forfeits (disconnect).
  // Guard 1 (activeIds = contestants ∖ forfeited ∖ kicked) → only {a} active →
  // immediate GV for a, reason sudden_death. (Documents MP-only behavior.)
  const prior = { [A]: [31, 31], [B]: [31, 31] };
  const g = makeGame([A, B].map((id) => ({ id, scores: prior[id] })));
  const room = makeRoom(g, {
    suddenDeath: { active: true, contestants: [A, B], mainRoundsCount: 2 },
    disconnects: { [B]: { startedAt: 0, forfeited: true } },
  });
  const seat = seatSuddenDeathNextRound(room);
  eq("6 — terminal (forfeit → lone active)", seat.gameOver, true);
  eq("6 — gv a (forfeiter b excluded)", room.gloriosVictory, A);
  eq("6 — reason sudden_death", room.gloriosVictoryReason, "sudden_death");
  eq("6 — SD inactive", room.suddenDeath!.active, false);

  // Sub-case: forfeit DURING the loop (round 1 ties, then b forfeits before R2).
  const prior2 = { [A]: [31, 31], [B]: [31, 31] };
  const scripts: RoundScript[] = [
    { [A]: ["4", "4"], [B]: ["4", "4"] }, // tie → replay
    { [A]: ["2", "2"], [B]: ["2", "2"] }, // would tie again, but b forfeits before this seats
  ];
  const { room: room2, rounds } = runMpLoop([A, B], prior2, scripts, {
    priorRoundWins: { [A]: 1, [B]: 1 },
    mainRoundsCount: 2,
    forfeitBefore: { round: 1, id: B }, // b forfeits before round-index 1 seats
  });
  eq("6b — loop ends via forfeit GV for a", room2.gloriosVictory, A);
  eq("6b — reason sudden_death", room2.gloriosVictoryReason, "sudden_death");
  eq("6b — terminated within 2 SD rounds", rounds <= 2, true);
}

// ── 7. Termination: a persistent 2-way tie hits the safety cap (no infinite) ──
console.log("\n— 7) Termination probe: persistent 2-way tie + safety cap —");
{
  // Feed MORE ties than the cap would allow if it looped forever; SAFETY_CAP
  // bounds the driver. With NO narrowing on a 2-player set (which is correct for
  // 2 players — there's nobody to narrow to), a forced-equal hand every round
  // never resolves. Assert the driver terminates at the cap rather than hanging,
  // documenting the NON-TERMINATION risk for persistently-equal hands.
  const prior = { [A]: [31, 31], [B]: [31, 31] };
  const scripts: RoundScript[] = Array.from({ length: SAFETY_CAP + 5 }, () => ({
    [A]: ["4", "4"] as Card["rank"][],
    [B]: ["4", "4"] as Card["rank"][],
  }));
  const { room, rounds } = runMpLoop([A, B], prior, scripts, {
    priorRoundWins: { [A]: 1, [B]: 1 },
    mainRoundsCount: 2,
  });
  eq("7 — driver halts at safety cap (no infinite loop)", rounds, SAFETY_CAP);
  eq("7 — still no GV (every round tied) — documents non-termination risk", room.gloriosVictory, null);
  eq("7 — SD still active (frozen [a,b])", room.suddenDeath, {
    active: true,
    contestants: [A, B],
    mainRoundsCount: 2,
  });
  bugs.push(
    "NON-TERMINATION RISK: production has NO max-SD-rounds cap (the cap above is " +
      "ONLY in the test driver). A persistently-equal pair of hands replays SD " +
      "forever (resolveRoundOver leaves SD active on every tie; seatSuddenDeath " +
      "reseats the same [a,b]). Real games avoid this because reshuffled hands " +
      "eventually differ, but a deterministic forced-equal hand (e.g. both " +
      "evolved Kings = 0) never resolves. Recommend an explicit iteration cap or " +
      "a deterministic final tiebreak.",
  );
}

console.log(
  "\n==================================================================\n" +
    " DIFFERENTIAL: MP loop result === SP loop result (identical scripts)\n" +
    "==================================================================",
);
function parityCheck(
  label: string,
  contestants: string[],
  prior: Record<string, number[]>,
  scripts: RoundScript[],
  opts: Parameters<typeof runMpLoop>[3] = {},
) {
  const mp = runMpLoop(contestants, prior, scripts, opts);
  const sp = runSpLoop(contestants, prior, scripts, opts);
  const mpOut = {
    gv: mp.room.gloriosVictory,
    reason: mp.room.gloriosVictoryReason,
    kicked: [...mp.room.kickedIds].sort(),
    sdActive: mp.room.suddenDeath?.active ?? null,
    sdContestants: mp.room.suddenDeath ? [...mp.room.suddenDeath.contestants].sort() : null,
    rounds: mp.rounds,
  };
  const spOut = {
    gv: sp.elim.gloriosVictory,
    reason: sp.elim.gloriosVictoryReason,
    kicked: [...sp.elim.kickedIds].sort(),
    sdActive: sp.elim.suddenDeath?.active ?? null,
    sdContestants: sp.elim.suddenDeath ? [...sp.elim.suddenDeath.contestants].sort() : null,
    rounds: sp.rounds,
  };
  eq(`${label} — MP === SP loop result`, mpOut, spOut);
}

// Reuse the loop scenarios above for the differential (no forfeit, so SP has an
// analogue). 2-player single-tie-then-winner, 3-tie-then-winner, and the KEY
// 3-player narrowing case.
parityCheck(
  "2-player single tie",
  [A, B],
  { [A]: [31, 31], [B]: [31, 31] },
  [
    { [A]: ["4", "4"], [B]: ["4", "4"] },
    { [A]: ["2", "3"], [B]: ["5", "5"] },
  ],
  { priorRoundWins: { [A]: 1, [B]: 1 }, mainRoundsCount: 2 },
);
parityCheck(
  "2-player 3 ties then winner",
  [A, B],
  { [A]: [31, 31], [B]: [31, 31] },
  [
    { [A]: ["5", "5"], [B]: ["5", "5"] },
    { [A]: ["6", "4"], [B]: ["7", "3"] },
    { [A]: ["2", "2"], [B]: ["2", "2"] },
    { [A]: ["9", "9"], [B]: ["3", "2"] },
  ],
  { priorRoundWins: { [A]: 1, [B]: 1 }, mainRoundsCount: 2 },
);
parityCheck(
  "3-player a&b tie / c higher (narrowing parity)",
  [A, B, C],
  { [A]: [31, 31, 31], [B]: [31, 31, 31], [C]: [31, 31, 31] },
  [
    { [A]: ["4", "4"], [B]: ["4", "4"], [C]: ["6", "6"] },
    { [A]: ["2", "3"], [B]: ["5", "5"], [C]: ["9", "9"] },
  ],
  { priorRoundWins: { [A]: 1, [B]: 1, [C]: 1 }, mainRoundsCount: 3 },
);

console.log(
  "\n==================================================================\n" +
    " SCORE-CARRY across SD rounds (history grows, mainRoundsCount frozen)\n" +
    "==================================================================",
);
{
  const prior = { [A]: [20, 25], [B]: [22, 23] }; // 2 main rounds
  const scripts: RoundScript[] = [
    { [A]: ["4", "4"], [B]: ["4", "4"] }, // SD r1 tie
    { [A]: ["1", "1"], [B]: ["5", "5"] }, // SD r2 a wins
  ];
  const { room } = runMpLoop([A, B], prior, scripts, {
    priorRoundWins: { [A]: 1, [B]: 1 },
    mainRoundsCount: 2,
  });
  eq("score-carry — a has 2 main + 2 SD = 4 score rows", room.game!.scores[A].length, 4);
  eq("score-carry — main rows preserved unchanged", room.game!.scores[A].slice(0, 2), [20, 25]);
  eq("score-carry — mainRoundsCount frozen at 2 (R/FR split)", room.suddenDeath!.mainRoundsCount, 2);
  eq("score-carry — winner a", room.gloriosVictory, A);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(
  "\n==================================================================\n" +
    ` BUGS FOUND: ${bugs.length}\n` +
    "==================================================================",
);
for (const b of bugs) console.log("  • " + b + "\n");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES PRESENT"} — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
