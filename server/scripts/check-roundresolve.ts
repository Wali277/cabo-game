// =============================================================================
// check-roundresolve.ts — EXHAUSTIVE test of the MULTIPLAYER round_over bust /
// glorious-victory / sudden-death resolution (server/src/roundResolve.ts), and a
// DIFFERENTIAL parity check against the REAL single-player resolution
// (cobo/src/state/spBust.ts → computeSpBust), proving MP === SP for identical
// inputs.
//
//   run:  cd server && node --import tsx scripts/check-roundresolve.ts
//
// resolveRoundOver(room) was extracted VERBATIM from the index.ts room:action
// socket handler. We build synthetic Rooms (only the fields the resolver reads)
// and assert the mutated bust/GV/SD bookkeeping for every outcome in the matrix.
//
// PARITY: spBust.ts is the actual production SP code (only deps are ../engine/*,
// which are pure), so we import computeSpBust directly and assert that, for the
// SAME GameState, MP and SP land on identical {gloriosVictory, reason, kicked,
// busted, suddenDeath, roundWins}.
// =============================================================================
import { resolveRoundOver } from "../src/roundResolve.js";
import type { Room, Member } from "../src/rooms.js";
import type { GameState, Card } from "../src/engine/types.js";
// REAL single-player resolution + its ElimState shape (production code).
import {
  computeSpBust,
  EMPTY_ELIM,
  type ElimState,
} from "../../cobo/src/state/spBust.js";

let pass = 0,
  fail = 0;
function ok(label: string) {
  pass++;
  console.log(`  ok  ${label}`);
}
function bad(label: string, extra?: string) {
  fail++;
  console.log(`FAIL  ${label}${extra ? "\n        " + extra : ""}`);
}
function sortedJson(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      );
    }
    return val;
  });
}
function eq(label: string, got: unknown, want: unknown) {
  if (sortedJson(got) === sortedJson(want)) ok(label);
  else bad(label, `got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}

// ── synthetic-state builders ────────────────────────────────────────────────
// A card of a given rank (suit fixed; suit is irrelevant to handScore except for
// kings-by-color which we don't exercise here — we use spades).
function card(rank: Card["rank"]): Card {
  return { id: `${rank}-${Math.random()}`, rank, suit: "S" };
}

interface PlayerSpec {
  id: string;
  /** per-round score array (scoreboard rows). last entry = final-round score. */
  scores: number[];
  caboPenalty?: number[];
  caboBonus?: number[];
  snapBonus?: number[];
  /** hand cards (ranks) — only consulted in sudden-death branches. */
  hand?: Card["rank"][];
}

/** Build a minimal round_over GameState from per-player specs. Only the fields
 *  the resolvers read are populated; the rest are cast through `unknown`. */
function makeGame(
  specs: PlayerSpec[],
  opts: { winnerId?: string | null; variant?: "classic" | "evolved" } = {},
): GameState {
  const scores: Record<string, number[]> = {};
  const caboPenalty: Record<string, number[]> = {};
  const caboBonus: Record<string, number[]> = {};
  const snapBonus: Record<string, number[]> = {};
  const players = specs.map((s) => {
    scores[s.id] = s.scores;
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

/** Build a synthetic Room around a GameState. Members default to one per player
 *  (so the MP survivor-set = the player set, matching SP) unless overridden. */
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
  const room = {
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
  return room;
}

/** Snapshot the bust/GV/SD bookkeeping that resolveRoundOver mutates. */
function snap(room: Room) {
  return {
    busted: [...room.bustedThisRound].sort(),
    kicked: [...room.kickedIds].sort(),
    gv: room.gloriosVictory,
    reason: room.gloriosVictoryReason,
    sd: room.suddenDeath,
    roundWins: room.roundWins,
  };
}
function snapElim(e: ElimState) {
  return {
    busted: [...e.bustedThisRound].sort(),
    kicked: [...e.kickedIds].sort(),
    gv: e.gloriosVictory,
    reason: e.gloriosVictoryReason,
    sd: e.suddenDeath,
    roundWins: e.roundWins,
  };
}

// Run MP resolveRoundOver on a fresh room built from `specs`, and (when the
// player set == member set with no disconnects) the REAL SP computeSpBust on the
// equivalent GameState seeded with the same prior elim. Returns both snapshots.
function runBoth(
  specs: PlayerSpec[],
  opts: {
    winnerId?: string | null;
    variant?: "classic" | "evolved";
    priorKicked?: string[];
    priorRoundWins?: Record<string, number>;
    priorSd?: Room["suddenDeath"];
  } = {},
) {
  const gameMp = makeGame(specs, opts);
  const room = makeRoom(gameMp, {
    kickedIds: [...(opts.priorKicked ?? [])],
    roundWins: { ...(opts.priorRoundWins ?? {}) },
    suddenDeath: opts.priorSd
      ? { ...opts.priorSd, contestants: [...opts.priorSd.contestants] }
      : null,
  });
  resolveRoundOver(room);

  const gameSp = makeGame(specs, opts);
  const prevElim: ElimState = {
    ...EMPTY_ELIM,
    kickedIds: [...(opts.priorKicked ?? [])],
    roundWins: { ...(opts.priorRoundWins ?? {}) },
    suddenDeath: opts.priorSd
      ? { ...opts.priorSd, contestants: [...opts.priorSd.contestants] }
      : null,
  };
  const elim = computeSpBust(gameSp, prevElim);

  return { mp: snap(room), sp: snapElim(elim), room };
}

// Assert the MP outcome equals `want` AND equals the SP outcome (parity).
function expectBoth(
  label: string,
  specs: PlayerSpec[],
  want: Partial<ReturnType<typeof snap>>,
  opts: Parameters<typeof runBoth>[1] = {},
) {
  const { mp, sp } = runBoth(specs, opts);
  for (const key of Object.keys(want) as (keyof typeof want)[]) {
    eq(`${label} — MP.${String(key)}`, mp[key], want[key]);
  }
  // Full structural parity MP vs the REAL SP code.
  eq(`${label} — MP === SP (parity)`, mp, sp);
}

console.log(
  "==================================================================\n" +
    " MP round_over resolution — exhaustive matrix + SP parity\n" +
    "==================================================================",
);

const YOU = "you",
  BILLY = "billy";

// ── 1. Survivor: one player ≤60, others bust → "survivor" ────────────────────
console.log("\n— 1) Survivor (one ≤60 while others bust) —");
expectBoth(
  "survivor",
  [
    { id: "a", scores: [40, 30] }, // 70 → bust
    { id: "b", scores: [20, 20] }, // 40 → survives
    { id: "c", scores: [50, 25] }, // 75 → bust
  ],
  { gv: "b", reason: "survivor", busted: ["a", "c"], kicked: ["a", "c"], sd: null },
);

// ── 2. Single active buster: only one player over → wins by default ──────────
// Two players, one busts, the other ALSO busts? No — single active buster means
// exactly one of the still-active players busted and there are no survivors.
// Construct: player b was already kicked earlier; a busts; nobody else active.
console.log("\n— 2) Single active buster (others previously kicked) —");
expectBoth(
  "single-active-buster",
  [
    { id: "a", scores: [40, 30] }, // 70 → bust (only ACTIVE player)
    { id: "b", scores: [80, 80] }, // 160 → also "busts" but already on kickedIds
  ],
  // b is pre-kicked, so survivors = {} (a busted, b excluded). contestants =
  // bustedThisRound∖kicked = [a]. Single active buster → a wins by default; a is
  // removed from bustedThisRound, leaving the pre-kicked buster b in busted. b is
  // NOT re-added to kicked (already there). So busted=["b"], kicked=["b"] (the
  // winner a is never kicked).
  { gv: "a", reason: "survivor", busted: ["b"], kicked: ["b"], sd: null },
  { priorKicked: ["b"] },
);

// ── 3. Simultaneous bust, unique most-wins → "more_wins" ─────────────────────
console.log("\n— 3) Simultaneous bust → unique most-wins → more_wins —");
expectBoth(
  "more_wins",
  [
    { id: "a", scores: [40, 31] }, // 71 bust; final 31
    { id: "b", scores: [45, 25] }, // 70 bust; final 25
  ],
  { gv: "a", reason: "more_wins", busted: ["b"], kicked: ["b"], sd: null },
  { priorRoundWins: { a: 3, b: 1 } }, // a has more wins → a wins
);

// ── 4. Tie wins, unique lowest FINAL-round score → "final_round" ─────────────
// SUBTLE: the resolver FIRST credits a round-win for the current round's unique
// low (among ALL active), THEN runs the tiebreaker. A 2-player simultaneous bust
// can therefore NEVER yield "final_round": crediting the lower-final player would
// break the win tie and resolve as "more_wins" instead. To genuinely reach
// "final_round" the top-wins set must be a strict subset of the busters AND the
// current-round credit must not disturb it. Here c busts too with the unique low
// final (5) → c gets the credit (wins 0→1), but a & b each have 5 wins, so the
// top-wins set stays {a,b}; among them b's 26 < a's 31 → b wins on FINAL-round
// score. c loses the wins race and is eliminated.
console.log("\n— 4) Tie wins → unique lowest final-round score → final_round —");
expectBoth(
  "final_round",
  [
    { id: "a", scores: [40, 31] }, // 71 bust; final 31; wins 5
    { id: "b", scores: [45, 26] }, // 71 bust; final 26; wins 5 → lower → wins
    { id: "c", scores: [70, 5] }, // 75 bust; final 5 (unique low → +1 win, =1)
  ],
  { gv: "b", reason: "final_round", busted: ["a", "c"], kicked: ["a", "c"], sd: null },
  { priorRoundWins: { a: 5, b: 5, c: 0 } },
);

// ── 5. Tie wins + tie final → sudden death (correct contestants) ─────────────
console.log("\n— 5) Tie wins + tie final → sudden death —");
{
  const want = {
    gv: null,
    reason: null,
    busted: [], // SD contestants removed from busted
    kicked: [], // neither kicked (both in SD)
    sd: { active: true, contestants: ["a", "b"], mainRoundsCount: 2 },
  };
  expectBoth(
    "sd-trigger",
    [
      { id: "a", scores: [40, 31] }, // final 31
      { id: "b", scores: [45, 31] }, // final 31 → tie → SD
    ],
    want,
    { priorRoundWins: { a: 2, b: 2 } },
  );
}

// ── 5b. 3-way: most-wins set [a,b] tie final → SD only [a,b]; c kicked ───────
console.log("\n— 5b) 3-way SD: most-wins set ties final → SD [a,b], c eliminated —");
// All three bust with the SAME final score (31) → the final round is a 3-way tie
// so NOBODY is credited (wins stay a2,b2,c1). Top-wins set = {a,b}; among them
// final 31==31 → SD. c loses the wins race and is eliminated (kicked, and dropped
// from the SD contestants). NOTE c must share the final score (else c'd take the
// round credit and/or the final-round tiebreaker) — this isolates the SD trigger.
expectBoth(
  "sd-trigger-3way",
  [
    { id: "a", scores: [40, 31] }, // 71 bust, final 31, wins 2
    { id: "b", scores: [45, 31] }, // 71 bust, final 31, wins 2 → SD
    { id: "c", scores: [70, 31] }, // 101 bust, final 31, wins 1 → loses on wins
  ],
  {
    gv: null,
    reason: null,
    busted: ["c"], // a,b in SD removed from busted; c remains (then kicked)
    kicked: ["c"], // c eliminated (lost the wins race)
    sd: { active: true, contestants: ["a", "b"], mainRoundsCount: 2 },
  },
  { priorRoundWins: { a: 2, b: 2, c: 1 } },
);

// ── 6. SD resolution, unique hand → "sudden_death" ───────────────────────────
console.log("\n— 6) SD resolution: unique low hand → sudden_death —");
{
  // Active sudden death; resolve by lowest hand. a holds 3+4=7, b holds 5+5=10.
  const specs: PlayerSpec[] = [
    { id: "a", scores: [40, 31, 0], hand: ["3", "4"] }, // hand 7 → wins SD
    { id: "b", scores: [45, 31, 0], hand: ["5", "5"] }, // hand 10
  ];
  expectBoth(
    "sd-resolve-unique",
    specs,
    {
      gv: "a",
      reason: "sudden_death",
      kicked: ["b"], // loser kicked
      sd: { active: false, contestants: ["a", "b"], mainRoundsCount: 2 },
    },
    {
      priorRoundWins: { a: 2, b: 2 },
      priorSd: { active: true, contestants: ["a", "b"], mainRoundsCount: 2 },
    },
  );
}

// ── 7. SD tie → another SD (no winner, contestants frozen) ───────────────────
console.log("\n— 7) SD tie → another SD round (no winner) —");
{
  const specs: PlayerSpec[] = [
    { id: "a", scores: [40, 31, 0], hand: ["4", "4"] }, // hand 8
    { id: "b", scores: [45, 31, 0], hand: ["4", "4"] }, // hand 8 → tie
  ];
  expectBoth(
    "sd-resolve-tie",
    specs,
    {
      gv: null,
      reason: null,
      // SD branch does NOT touch bustedThisRound/kicked when tied.
      sd: { active: true, contestants: ["a", "b"], mainRoundsCount: 2 },
    },
    {
      priorRoundWins: { a: 2, b: 2 },
      priorSd: { active: true, contestants: ["a", "b"], mainRoundsCount: 2 },
    },
  );
}

// ── 8. Tied round credits nobody (roundWins unchanged for the tie) ───────────
console.log("\n— 8) A tied round credits NOBODY —");
{
  // 3 players, none bust (totals ≤60) → normal continue; round is a tie at the
  // lowest (a & b both 20) so NO round-win is credited.
  const { mp, sp } = runBoth([
    { id: "a", scores: [10, 10] }, // total 20, final 10
    { id: "b", scores: [10, 10] }, // total 20, final 10 → tie low
    { id: "c", scores: [15, 15] }, // total 30, final 15
  ]);
  eq("tie-round — MP credits nobody (roundWins empty)", mp.roundWins, {});
  eq("tie-round — no GV, no busts", { gv: mp.gv, busted: mp.busted }, { gv: null, busted: [] });
  eq("tie-round — MP === SP", mp, sp);

  // Contrast: a UNIQUE low DOES credit that player.
  const r2 = runBoth([
    { id: "a", scores: [10, 5] }, // final 5 → unique low → credited
    { id: "b", scores: [10, 10] },
    { id: "c", scores: [15, 15] },
  ]);
  eq("unique-low — MP credits a", r2.mp.roundWins, { a: 1 });
  eq("unique-low — MP === SP", r2.mp, r2.sp);
}

// ── 9. 3–4 players, survivors>1 → normal continue (no GV) ────────────────────
console.log("\n— 9) survivors>1 (one busts, two survive) → normal continue —");
expectBoth(
  "survivors-gt-1",
  [
    { id: "a", scores: [40, 30] }, // 70 bust
    { id: "b", scores: [20, 20] }, // 40 survive
    { id: "c", scores: [25, 25] }, // 50 survive
  ],
  {
    gv: null,
    reason: null,
    busted: ["a"], // recorded as busted this round but NOT kicked yet
    kicked: [],
    sd: null,
  },
);

// ── 10. Kicked-earlier players excluded from the contest ─────────────────────
console.log("\n— 10) Previously-kicked excluded from survivors/contestants —");
expectBoth(
  "kicked-excluded",
  [
    { id: "a", scores: [40, 31] }, // 71 bust, final 31
    { id: "b", scores: [45, 25] }, // 70 bust, final 25 → unique low this round
    { id: "c", scores: [99, 99] }, // already kicked — must be ignored entirely
  ],
  {
    // c is pre-kicked so it's excluded from the active set, the survivor set AND
    // the contestants. Active set is {a,b}; b is the unique low this round (25) →
    // b gets the round credit (wins 1→2). Contestants {a,b} with wins a1,b2 →
    // top-wins {b} → b wins by MORE_WINS (the round credit promoted b). a is
    // kicked; c stays kicked. Demonstrates kicked players never re-enter contention.
    // c's total (198) is >60 so it appears in bustedThisRound, and since c isn't
    // the winner it stays there (b removed as winner) → busted=["a","c"].
    gv: "b",
    reason: "more_wins",
    busted: ["a", "c"],
    kicked: ["a", "c"],
    sd: null,
  },
  { priorKicked: ["c"], priorRoundWins: { a: 1, b: 1 } },
);

console.log(
  "\n==================================================================\n" +
    " MP-SPECIFIC scenarios (no SP analogue — members/disconnects)\n" +
    "==================================================================",
);

// ── 11. A forfeited/disconnected player is excluded from survivors ───────────
// This is the MP-only twist: the survivor set uses room.members MINUS forfeited.
// Same scores would be "simultaneous bust" if both counted, but if one player
// FORFEITED, the other (under 60) is the lone survivor.
console.log("\n— 11) Forfeited player excluded → flips outcome —");
{
  // a is under 60 (would survive); b busts; c FORFEITED (disconnected).
  // Without forfeit handling, survivors = {a}. With c forfeited, still {a}.
  // The meaningful flip: a busts too, b busts, c forfeited & UNDER 60.
  // If c counted as a survivor → survivors {c} → c wins. Because c forfeited,
  // c is excluded → survivors {} → simultaneous bust between a & b.
  const game = makeGame([
    { id: "a", scores: [40, 31] }, // 71 bust
    { id: "b", scores: [45, 25] }, // 70 bust
    { id: "c", scores: [10, 10] }, // 20 — UNDER 60, but forfeited
  ]);
  const room = makeRoom(game, {
    disconnects: { c: { startedAt: 0, forfeited: true } },
    roundWins: { a: 1, b: 1 },
  });
  resolveRoundOver(room);
  const s = snap(room);
  // c excluded → a,b simultaneous bust → tie wins → b lower final → b wins.
  eq("forfeit-flip — gv is b (not c)", s.gv, "b");
  eq("forfeit-flip — reason final_round", s.reason, "final_round");
  eq("forfeit-flip — a busted+kicked, c not in busted", { busted: s.busted, kicked: s.kicked }, { busted: ["a"], kicked: ["a"] });

  // CONTROL: identical scores, but c NOT forfeited → c is the lone survivor.
  const game2 = makeGame([
    { id: "a", scores: [40, 31] },
    { id: "b", scores: [45, 25] },
    { id: "c", scores: [10, 10] },
  ]);
  const room2 = makeRoom(game2, { roundWins: { a: 1, b: 1 } });
  resolveRoundOver(room2);
  const s2 = snap(room2);
  eq("no-forfeit-control — gv is c (survivor)", { gv: s2.gv, reason: s2.reason }, { gv: "c", reason: "survivor" });
  eq("no-forfeit-control — a,b kicked", s2.kicked, ["a", "b"]);
}

// ── 11b. Forfeit flips simultaneous-bust → sole survivor ─────────────────────
console.log("\n— 11b) Forfeit turns a 2-way bust into a sole-survivor win —");
{
  // a busts, b busts, c forfeited. Only a & b active & both bust. But what if
  // ONE of the two busters forfeited? Then the other is sole survivor-by-default.
  const game = makeGame([
    { id: "a", scores: [40, 31] }, // 71 bust
    { id: "b", scores: [45, 26] }, // 71 bust
  ]);
  const room = makeRoom(game, {
    memberIds: ["a", "b"],
    disconnects: { b: { startedAt: 0, forfeited: true } },
  });
  resolveRoundOver(room);
  const s = snap(room);
  // survivors = members∖(eliminated ∪ forfeited) = {} (a busted, b forfeited).
  // contestants = bustedThisRound∖kicked = [a, b]  (forfeit does NOT add to
  // kickedIds here) → simultaneous bust between a & b via shared authority.
  // The current round's unique low (b, 26) is credited FIRST (b.wins 0→1), so the
  // tiebreaker resolves as MORE_WINS for b — not final_round. (Forfeit only
  // affects the survivor set, NOT the contestant set; the round-win credit still
  // fires for active players. Documents exact MP behavior.)
  eq("forfeit-2way — gv", s.gv, "b");
  eq("forfeit-2way — reason", s.reason, "more_wins");
}

console.log(
  "\n==================================================================\n" +
    " 12) THE REPORTED GAME — You[35,13,21] Billy[22,29,21] → SUDDEN DEATH\n" +
    "==================================================================",
);
{
  // Reconstruct the exact reported match. Round wins must be credited live from
  // each round (R1→Billy 22<35, R2→You 13<29, R3→tie 21=21 credits nobody),
  // giving wins 1-1. Totals: You 69, Billy 72 → both bust. Tie wins + tie final
  // (21=21) → sudden death between You and Billy.
  const specs: PlayerSpec[] = [
    { id: YOU, scores: [35, 13, 21] }, // total 69 → bust; final 21
    { id: BILLY, scores: [22, 29, 21] }, // total 72 → bust; final 21
  ];
  // Credit wins exactly as the live game would (per-round), to feed the
  // tiebreaker — both resolvers credit R1 & R2 and skip the tied R3.
  const priorRoundWins = { [BILLY]: 1, [YOU]: 1 }; // R1 Billy, R2 You (R3 tie → nobody)
  expectBoth(
    "reported-game",
    specs,
    {
      gv: null,
      reason: null,
      busted: [], // both in SD → removed from busted
      kicked: [], // neither kicked
      sd: { active: true, contestants: [YOU, BILLY], mainRoundsCount: 3 },
    },
    { priorRoundWins },
  );

  // Also verify the FULL live credit path: start roundWins empty, but the
  // resolver only credits the CURRENT (final) round. The final round here is a
  // tie (21=21) so the resolver credits nobody this round — proving the tie in
  // the deciding round doesn't hand anyone a win. (R1/R2 credits happened in
  // earlier round_over calls, modeled via priorRoundWins above.)
  const live = runBoth(specs, {}); // no prior wins
  eq("reported-game — final (tied) round credits nobody", live.mp.roundWins, {});
  // With zero wins on both, still tie wins → tie final → SD.
  eq(
    "reported-game — zero-wins still → SD [you,billy]",
    live.mp.sd,
    { active: true, contestants: [YOU, BILLY], mainRoundsCount: 3 },
  );
  eq("reported-game — MP === SP (zero-wins)", live.mp, live.sp);
}

console.log(
  "\n==================================================================\n" +
    " 13) BROAD PARITY SWEEP — MP resolveRoundOver === SP computeSpBust\n" +
    "==================================================================",
);
{
  // Run a battery of randomized-but-deterministic 2- and 3-player scenarios
  // through BOTH resolvers and assert identical outcomes. Player set == member
  // set, no disconnects, so the only structural difference (members vs players,
  // forfeit filter) is neutralized — leaving a pure algorithm parity check.
  let sweepFail = 0;
  const scoreChoices = [5, 18, 21, 25, 26, 31, 40, 45, 55, 70];
  let n = 0;
  for (let i = 0; i < scoreChoices.length; i++) {
    for (let j = 0; j < scoreChoices.length; j++) {
      for (const w of [
        { a: 0, b: 0 },
        { a: 2, b: 1 },
        { a: 1, b: 2 },
        { a: 3, b: 3 },
      ]) {
        n++;
        const specs: PlayerSpec[] = [
          { id: "a", scores: [50, scoreChoices[i]], hand: ["3", "4"] },
          { id: "b", scores: [50, scoreChoices[j]], hand: ["2", "5"] },
        ];
        const { mp, sp } = runBoth(specs, { priorRoundWins: w });
        if (sortedJson(mp) !== sortedJson(sp)) {
          sweepFail++;
          if (sweepFail <= 5)
            bad(
              `parity sweep #${n} (a=${scoreChoices[i]},b=${scoreChoices[j]},w=${JSON.stringify(w)})`,
              `MP ${JSON.stringify(mp)}\n        SP ${JSON.stringify(sp)}`,
            );
        }
      }
    }
  }
  if (sweepFail === 0) ok(`broad parity sweep — ${n} 2-player scenarios all MP === SP`);
  else bad(`broad parity sweep — ${sweepFail}/${n} scenarios diverged`);

  // 3-player sweep (survivor / simultaneous mixes).
  let sweep3Fail = 0;
  let m = 0;
  const sc = [10, 21, 25, 31, 40, 70];
  for (const x of sc)
    for (const y of sc)
      for (const z of sc) {
        m++;
        const specs: PlayerSpec[] = [
          { id: "a", scores: [40, x], hand: ["3", "4"] },
          { id: "b", scores: [40, y], hand: ["2", "5"] },
          { id: "c", scores: [40, z], hand: ["A", "6"] },
        ];
        const { mp, sp } = runBoth(specs, { priorRoundWins: { a: 1, b: 1, c: 0 } });
        if (sortedJson(mp) !== sortedJson(sp)) {
          sweep3Fail++;
          if (sweep3Fail <= 5)
            bad(
              `3p parity sweep #${m} (x=${x},y=${y},z=${z})`,
              `MP ${JSON.stringify(mp)}\n        SP ${JSON.stringify(sp)}`,
            );
        }
      }
  if (sweep3Fail === 0) ok(`broad 3-player parity sweep — ${m} scenarios all MP === SP`);
  else bad(`broad 3-player parity sweep — ${sweep3Fail}/${m} diverged`);
}

console.log(
  "\n==================================================================\n" +
    " EVOLVED-VARIANT SD HAND SCORING — MP vs SP (divergence probe)\n" +
    "==================================================================",
);
{
  // REGRESSION GUARD for the evolved sudden-death King-scoring parity bug:
  // MP roundResolve must call handScore(hand, variant) (NOT the classic default),
  // so an EVOLVED room scores a King as 0 (not 13). With a King in sudden death,
  // MP and SP must pick the SAME winner. (Pre-fix: MP→b, SP→a — a real bug.)
  const specs: PlayerSpec[] = [
    // a: King + 2 → evolved hand = 0+2 = 2  (classic would be 13+2 = 15)
    { id: "a", scores: [40, 31, 0], hand: ["K", "2"] },
    // b: 5 + 4 → 9 in both variants
    { id: "b", scores: [45, 31, 0], hand: ["5", "4"] },
  ];
  const opts = {
    variant: "evolved" as const,
    priorRoundWins: { a: 2, b: 2 },
    priorSd: { active: true, contestants: ["a", "b"], mainRoundsCount: 2 },
  };
  const { mp, sp } = runBoth(specs, opts);
  // Evolved: a's King scores 0 → hand 2 < b's 9 → a wins SD, in BOTH MP and SP.
  eq("evolved SD — MP scores King as 0 (evolved) → a wins", mp.gv, "a");
  eq("evolved SD — SP scores King as 0 (evolved) → a wins", sp.gv, "a");
  eq("evolved SD — MP === SP (King-in-SD parity holds)", mp.gv, sp.gv);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES PRESENT"} — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
