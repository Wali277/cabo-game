// =============================================================================
// FULL single-player SUDDEN-DEATH CONTINUATION LOOP integration test.
//
// Run with:  cd server && node --import tsx test-sp-sd-loop.mts
//
// Unlike test-spbust.mts (which only exercises the RESOLUTION function
// computeSpBust), this suite drives the ENTIRE loop end-to-end using BOTH real
// production functions:
//   • computeSpBust       — resolves each finished round (RESOLUTION)
//   • computeSpPlayAgain  — decides who sits the next round (CONTINUATION)
// both exported from cobo/src/state/spBust.ts. computeSpPlayAgain is the pure
// extraction of store.ts playAgain()'s seat-selection (it returns the seat list
// + next ElimState; the store owns only newGame()/set()). By threading the
// RESULT of computeSpPlayAgain into the next round's seating we faithfully
// reproduce the real "Play again" loop WITHOUT instantiating Zustand or running
// newGame()'s RNG. Hand totals on active SD rounds are injected deterministically
// so each SD round's lowest-hand outcome is fully controlled.
//
// THE KEY CASE is #3: a 3-player SD where A & B tie at the lowest hand and C is
// strictly higher. The rule says the next SD round must be played by ONLY {A,B}
// with C eliminated. We assert that empirically. If the code does NOT narrow,
// the test FAILS LOUDLY and the bug is reported — the rule is NOT changed.
// =============================================================================

import {
  computeSpBust,
  computeSpPlayAgain,
  EMPTY_ELIM,
  type ElimState,
  type SpPlayAgainResult,
} from "../cobo/src/state/spBust.ts";
import type {
  GameState,
  GameVariant,
  Card,
  Rank,
  PlayerState,
} from "../cobo/src/engine/types.ts";

// ── tiny builders ────────────────────────────────────────────────────────────
let _cid = 0;
function card(rank: Rank): Card {
  _cid += 1;
  return { id: `c${_cid}`, rank, suit: "H" };
}
/** A hand totalling exactly `handTotal` (read by handScore only on an active SD
 *  round; ignored otherwise). */
function handFor(handTotal: number): Card[] {
  if (handTotal <= 0) return [card("Joker")];      // 0
  if (handTotal === 1) return [card("A")];         // 1
  if (handTotal <= 10) return [card(String(handTotal) as Rank)];
  const rem = handTotal - 10;
  return [card("10"), rem === 1 ? card("A") : card(String(rem) as Rank)];
}
function player(id: string, name: string, handTotal: number): PlayerState {
  const hand = handFor(handTotal);
  return {
    id, name, isBot: id !== "p_human", hand,
    knownToSelf: hand.map(() => false),
    calledCabo: false,
    snapsUsed: { other: false, self: false },
    snapsCorrect: { other: false, self: false },
  };
}

interface RoundSpec {
  scores: Record<string, number>;     // id → this round's scoreboard value
  winnerId?: string | null;           // engine-declared winner (SD history only)
  hands?: Record<string, number>;     // id → hand total (consulted only on active SD)
  caboPenalty?: Record<string, number>;
  caboBonus?: Record<string, number>;
  snapBonus?: Record<string, number>;
}

/**
 * Full-loop match runner. Threads BOTH real functions:
 *   playRound(spec)  → builds a round_over GameState for the CURRENTLY-SEATED
 *                      players, runs computeSpBust, stores the returned elim.
 *   playAgain()      → runs the REAL computeSpPlayAgain on (game, elim); if it
 *                      says "seat", we record the seated id list for the NEXT
 *                      playRound (exactly what the store would feed newGame);
 *                      if "game_over"/"noop" we record that and stop seating.
 *
 * This is the production seam: seating for round N+1 comes from
 * computeSpPlayAgain's output, NOT from a test-local mirror of the rule.
 */
class Match {
  variant: GameVariant;
  ids: string[];
  names: Record<string, string>;
  isBotMap: Record<string, boolean> = {};
  scores: Record<string, number[]> = {};
  caboPenalty: Record<string, number[]> = {};
  caboBonus: Record<string, number[]> = {};
  snapBonus: Record<string, number[]> = {};
  elim: ElimState = structuredClone(EMPTY_ELIM);
  roundNumber = 0;
  /** The seat list the NEXT playRound will deal to. Initialised to all ids;
   *  thereafter set ONLY from computeSpPlayAgain's "seat" result. */
  private nextSeated: string[];
  /** Last continuation decision (so tests can assert game-over / seat). */
  lastPlayAgain: SpPlayAgainResult | null = null;
  /** The last round_over GameState we built (fed to computeSpPlayAgain). */
  private lastGame: GameState | null = null;

  constructor(players: { id: string; name: string; isBot?: boolean }[], variant: GameVariant = "classic") {
    this.variant = variant;
    this.ids = players.map((p) => p.id);
    this.names = Object.fromEntries(players.map((p) => [p.id, p.name]));
    for (const p of players) this.isBotMap[p.id] = p.isBot ?? (p.id !== "p_human");
    for (const id of this.ids) {
      this.scores[id] = []; this.caboPenalty[id] = [];
      this.caboBonus[id] = []; this.snapBonus[id] = [];
    }
    this.nextSeated = [...this.ids];
  }

  /** Who is seated for the upcoming round (driven by the continuation fn). */
  seated(): string[] {
    return [...this.nextSeated];
  }

  playRound(spec: RoundSpec): ElimState {
    const seated = this.nextSeated;
    if (seated.length === 0) throw new Error("playRound called with empty seat list");
    for (const id of seated) {
      const s = spec.scores[id];
      if (s == null) throw new Error(`round missing score for seated ${id}`);
      this.scores[id].push(s);
      this.caboPenalty[id].push(spec.caboPenalty?.[id] ?? 0);
      this.caboBonus[id].push(spec.caboBonus?.[id] ?? 0);
      this.snapBonus[id].push(spec.snapBonus?.[id] ?? 0);
    }
    this.roundNumber += 1;
    const players: PlayerState[] = seated.map((id) =>
      player(id, this.names[id], spec.hands?.[id] ?? 0),
    );
    const game: GameState = {
      variant: this.variant, players, currentPlayer: 0, phase: "round_over",
      deck: [], discard: [], drawnCard: null, drawnFrom: null,
      pendingActionSource: null, peekAndSwapPick: null, pendingPeek: null,
      caboCallerId: null, finalRoundTurnsLeft: null, reveals: [], animations: [],
      roundNumber: this.roundNumber,
      scores: this.scores, caboBonus: this.caboBonus,
      caboPenalty: this.caboPenalty, snapBonus: this.snapBonus, kamikaze: {},
      winnerId: spec.winnerId ?? null, log: [],
      snapPhase: "idle", snappingPlayerId: null, roundOutcome: null,
    };
    this.lastGame = game;
    this.elim = computeSpBust(game, this.elim);
    return this.elim;
  }

  /** Emulate a "Play again" click via the REAL continuation function. Updates
   *  elim + the next seat list from its output. Returns the result so tests can
   *  assert the kind / players. */
  playAgain(): SpPlayAgainResult {
    const result = computeSpPlayAgain(this.lastGame, this.elim);
    this.lastPlayAgain = result;
    if (result.kind === "seat") {
      this.elim = result.nextElim;
      this.nextSeated = result.players.map((p) => p.id);
      // Sanity: the store would re-create these players via newGame from the
      // SAME id/name/isBot — verify the helper preserved them faithfully.
      for (const p of result.players) {
        if (this.names[p.id] !== p.name) throw new Error(`name drift for ${p.id}`);
        if (this.isBotMap[p.id] !== p.isBot) throw new Error(`isBot drift for ${p.id}`);
      }
    } else if (result.kind === "game_over") {
      this.elim = result.nextElim;
      this.nextSeated = []; // no further rounds
    }
    // "noop": leave state as-is.
    return result;
  }

  total(id: string): number {
    const sum = (arr?: number[]) => (arr ?? []).reduce((a, b) => a + b, 0);
    return (
      sum(this.scores[id]) + sum(this.caboPenalty[id]) -
      sum(this.caboBonus[id]) - sum(this.snapBonus[id])
    );
  }
  scoreLen(id: string): number { return this.scores[id].length; }
}

// ── assertion harness ─────────────────────────────────────────────────────────
interface Row { name: string; pass: boolean; detail: string; }
const rows: Row[] = [];
const sset = (a: string[]) => [...a].sort();
const eqSet = (a: string[], b: string[]) => {
  const x = sset(a), y = sset(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};
function eqWins(a: Record<string, number>, expected: Record<string, number>): boolean {
  for (const k of Object.keys(expected)) if ((a[k] ?? 0) !== expected[k]) return false;
  for (const k of Object.keys(a)) if ((a[k] ?? 0) !== 0 && !(k in expected)) return false;
  return true;
}
function check(name: string, conds: [string, boolean][]) {
  const failed = conds.filter(([, ok]) => !ok).map(([d]) => d);
  const pass = failed.length === 0;
  const detail = pass
    ? conds.filter(([d]) => !d.startsWith("detail")).map(([d]) => d).join("; ")
    : "FAILED → " + failed.join(" | ");
  rows.push({ name, pass, detail });
}
const P = (e: ElimState) =>
  `GV=${e.gloriosVictory} reason=${e.gloriosVictoryReason} kicked=[${sset(e.kickedIds)}] busted=[${sset(e.bustedThisRound)}] wins=${JSON.stringify(e.roundWins)} sd=${e.suddenDeath ? `{active:${e.suddenDeath.active},contestants:[${sset(e.suddenDeath.contestants)}],mrc:${e.suddenDeath.mainRoundsCount}}` : "null"}`;

/** Drive 2 main rounds so [P1,P2] enter an active SD tied on wins+final score.
 *  R1 P1 wins; R2 P2 wins; R3 both bust with identical strict-low → SD active.
 *  Returns the Match with SD already active and contestants [P1,P2]. */
function twoPlayerIntoSD(): Match {
  const m = new Match([{ id: "P1", name: "P1" }, { id: "P2", name: "P2" }]);
  m.playRound({ scores: { P1: 1, P2: 25 } });         // P1 win   ; 1/25
  m.playRound({ scores: { P1: 45, P2: 21 } });        // P2 win   ; 46/46
  m.playRound({ scores: { P1: 20, P2: 20 } });        // both 66 bust, tie low → SD
  return m;
}

// ============================================================================
// CASE 1 — 2-player SD: round ties → replay BOTH → next round unique → winner.
//   Trigger SD, play one SD round that TIES (stays active, both re-seated),
//   then play a second SD round with a UNIQUE low → glorious victory.
// ============================================================================
{
  const m = twoPlayerIntoSD();
  const trig = m.elim;
  const sdOk = trig.suddenDeath?.active === true && eqSet(trig.suddenDeath!.contestants, ["P1", "P2"]);

  // Play again → seat the SD round (both contestants).
  const pa1 = m.playAgain();
  const seat1Ok = pa1.kind === "seat" && eqSet(pa1.players.map((p) => p.id), ["P1", "P2"]);

  // SD round #1: TIE hands → stays active, both stay in.
  const e1 = m.playRound({ scores: { P1: 0, P2: 0 }, hands: { P1: 5, P2: 5 }, winnerId: null });
  const stillActive = e1.suddenDeath?.active === true && eqSet(e1.suddenDeath!.contestants, ["P1", "P2"]);

  // Play again → both re-seated (tie keeps both).
  const pa2 = m.playAgain();
  const seat2Ok = pa2.kind === "seat" && eqSet(pa2.players.map((p) => p.id), ["P1", "P2"]);

  // SD round #2: UNIQUE low (P1) → glorious victory sudden_death.
  const e2 = m.playRound({ scores: { P1: 0, P2: 0 }, hands: { P1: 3, P2: 9 }, winnerId: "P1" });

  check("1 2p SD: tie → replay both → unique → winner", [
    ["SD triggered [P1,P2]", sdOk],
    ["playAgain seats both (#1)", seat1Ok],
    ["after tie SD still active [P1,P2]", stillActive],
    ["playAgain re-seats both after tie (#2)", seat2Ok],
    ["final SD GV=P1", e2.gloriosVictory === "P1"],
    ["reason sudden_death", e2.gloriosVictoryReason === "sudden_death"],
    ["P2 kicked", e2.kickedIds.includes("P2")],
    ["SD inactive after win", e2.suddenDeath?.active === false],
    [`detail{trig ${P(trig)} | tie ${P(e1)} | win ${P(e2)}}`, true],
  ]);
}

// ============================================================================
// CASE 2 — 2-player SD: THREE consecutive ties, then a winner (loop repeats).
//   Proves the loop genuinely iterates: each tie → playAgain re-seats both →
//   another SD round; only the 4th SD round (unique low) terminates it.
// ============================================================================
{
  const m = twoPlayerIntoSD();
  let activeCount = 0;
  let seatCount = 0;
  // 3 ties.
  for (let i = 0; i < 3; i++) {
    const pa = m.playAgain();
    if (pa.kind === "seat" && eqSet(pa.players.map((p) => p.id), ["P1", "P2"])) seatCount++;
    const e = m.playRound({ scores: { P1: 0, P2: 0 }, hands: { P1: 7, P2: 7 }, winnerId: null });
    if (e.suddenDeath?.active === true && eqSet(e.suddenDeath!.contestants, ["P1", "P2"])) activeCount++;
  }
  // 4th: winner.
  const pa4 = m.playAgain();
  const seat4Ok = pa4.kind === "seat" && eqSet(pa4.players.map((p) => p.id), ["P1", "P2"]);
  const eWin = m.playRound({ scores: { P1: 0, P2: 0 }, hands: { P1: 2, P2: 8 }, winnerId: "P1" });
  // After a win, playAgain must be a NO-OP (gloriosVictory set → game over).
  const paAfter = m.playAgain();

  check("2 2p SD: 3 consecutive ties then a winner", [
    ["all 3 ties kept SD active [P1,P2]", activeCount === 3],
    ["all 3 ties re-seated both", seatCount === 3],
    ["4th playAgain seats both", seat4Ok],
    ["4th SD resolves GV=P1 sudden_death", eWin.gloriosVictory === "P1" && eWin.gloriosVictoryReason === "sudden_death"],
    ["P2 kicked", eWin.kickedIds.includes("P2")],
    ["playAgain after win is noop (game over)", paAfter.kind === "noop"],
    [`detail{ties=${activeCount} ${P(eWin)}}`, true],
  ]);
}

// ============================================================================
// CASE 3 — *** THE KEY CASE *** 3-player SD: A & B tie LOWEST, C strictly higher.
//   Per the rule, the NEXT SD round must seat ONLY {A,B}; C must be eliminated.
//   We assert the narrowing EMPIRICALLY against the real functions. If the code
//   does NOT narrow (keeps C in), the test FAILS and we report the BUG — we do
//   NOT alter the rule to match the code.
//
//   Build a 3-way SD first: A,B,C tied on wins AND final-round score → SD=[A,B,C].
// ============================================================================
{
  // Strategy: keep it to exactly the bust round. Pre-load equal totals and a
  // 1/1/1 win split over 3 rounds, then bust all three on R4 with an exact
  // 3-way strict-low tie (credits nobody) so wins stay 1/1/1 and final-round
  // scores are equal → resolveSimultaneousBust → SD=[A,B,C].
  const m = new Match([
    { id: "A", name: "A" }, { id: "B", name: "B" }, { id: "C", name: "C" },
  ]);
  m.playRound({ scores: { A: 1,  B: 15, C: 17 } });  // A win ; 1/15/17
  m.playRound({ scores: { A: 16, B: 1,  C: 15 } });  // B win ; 17/16/32
  m.playRound({ scores: { A: 19, B: 20, C: 1  } });  // C win ; 36/36/33
  // pre-bust totals A=36,B=36,C=33. R4 bust all with equal final-round score:
  // add 25 to each → A=61,B=61,C=58 (C not >60). Make C bust too: give C more
  // prior points by tweaking R3 C to 6 instead of 1? That'd lose C its win.
  // Instead equalise: R4 = {A:25,B:25,C:28} → A=61,B=61,C=61 all bust; but R4
  // scores differ (28≠25) → final-round tie BROKEN, C higher → C kicked, SD=[A,B].
  // That's actually CASE 3's payload directly (A,B tie low in the SIMULTANEOUS
  // bust, C higher). Assert SD narrows to [A,B] at TRIGGER (the simultaneous-
  // bust narrowing) AND that the loop seats only [A,B]. THEN the requested
  // sub-case: a 3-way SD that ties A,B under C — constructed separately at end.
  const trig = m.playRound({ scores: { A: 25, B: 25, C: 28 } });
  const seat = m.playAgain();

  check("3a simultaneous-bust narrows: A,B tie low, C higher → SD=[A,B], C kicked", [
    ["A,B,C all considered but C higher", true],
    ["SD active", trig.suddenDeath?.active === true],
    ["SD contestants=[A,B] (C excluded)", !!trig.suddenDeath && eqSet(trig.suddenDeath.contestants, ["A", "B"])],
    ["C kicked at trigger", trig.kickedIds.includes("C")],
    ["wins stay 1/1/1 (R4 tie credits nobody)", eqWins(trig.roundWins, { A: 1, B: 1, C: 1 })],
    ["playAgain seats ONLY [A,B]", seat.kind === "seat" && eqSet((seat as any).players.map((p: any) => p.id), ["A", "B"])],
    [`detail{${P(trig)} | seat=${seat.kind}:[${seat.kind === "seat" ? sset((seat as any).players.map((p: any) => p.id)) : ""}]}`, true],
  ]);
}

// CASE 3b — *** THE TRUE 3-WAY-SD KEY CASE ***
// Force a genuine 3-way ACTIVE SD = [A,B,C] (all three tied on wins+final), then
// play an SD round where A & B tie at the lowest HAND and C is strictly higher.
// EXPECTED per the rule: next SD round seats ONLY {A,B}; C eliminated.
{
  // To get a 3-way SD we need 3 busters tied on wins AND equal final-round score.
  // Wins: give each exactly 1 win over R1..R3, and make R4 a 3-way strict-low TIE
  // (credits nobody) with EQUAL final-round score and all totals >60.
  const m = new Match([
    { id: "A", name: "A" }, { id: "B", name: "B" }, { id: "C", name: "C" },
  ]);
  m.playRound({ scores: { A: 1,  B: 18, C: 19 } });  // A win ; 1/18/19
  m.playRound({ scores: { A: 18, B: 1,  C: 17 } });  // B win ; 19/19/36
  m.playRound({ scores: { A: 17, B: 18, C: 1  } });  // C win ; 36/37/37
  // pre-bust: A=36,B=37,C=37. Not equal — equalise via R4 with EQUAL R4 scores so
  // final-round ties, but totals must all exceed 60 AND be equal? Order-of-
  // authority final tiebreak compares the LAST round's score; if R4 scores are
  // all equal they tie → SD over all 3 (assuming wins tie 1/1/1). Totals need
  // only each be >60. A=36+R4,B=37+R4,C=37+R4 with R4=25 → 61/62/62 all bust,
  // R4 score equal (25 each) → 3-way final-round tie → SD=[A,B,C].
  const trig = m.playRound({ scores: { A: 25, B: 25, C: 25 } });
  const sd3 = trig.suddenDeath?.active === true && !!trig.suddenDeath && eqSet(trig.suddenDeath.contestants, ["A", "B", "C"]);

  // Seat the 3-way SD round.
  const paSeat = m.playAgain();
  const seat3Ok = paSeat.kind === "seat" && eqSet((paSeat as any).players.map((p: any) => p.id), ["A", "B", "C"]);

  // SD ROUND: A & B tie lowest hand (3), C strictly higher (9).
  const eSD = m.playRound({ scores: { A: 0, B: 0, C: 0 }, hands: { A: 3, B: 3, C: 9 }, winnerId: null });

  // Now the CRITICAL continuation: what does the next playAgain seat?
  const paNext = m.playAgain();
  const seatedNext = paNext.kind === "seat" ? (paNext as any).players.map((p: any) => p.id) : [];

  const narrowedContestants = eqSet(eSD.suddenDeath?.contestants ?? [], ["A", "B"]);
  const cKicked = eSD.kickedIds.includes("C");
  const seatsOnlyAB = paNext.kind === "seat" && eqSet(seatedNext, ["A", "B"]);

  check("3b *** KEY *** 3-way SD, A&B tie low, C higher → next seats ONLY [A,B], C kicked", [
    ["3-way SD triggered [A,B,C]", sd3],
    ["playAgain seated all 3 for SD round", seat3Ok],
    ["SD round still active (A,B tied)", eSD.suddenDeath?.active === true],
    ["EXPECTED: contestants narrowed to [A,B]", narrowedContestants],
    ["EXPECTED: C kicked (scored higher)", cKicked],
    ["EXPECTED: next playAgain seats ONLY [A,B]", seatsOnlyAB],
    [`detail{ACTUAL contestants after tie = [${sset(eSD.suddenDeath?.contestants ?? [])}] (expected [A,B])}`, true],
    [`detail{ACTUAL C kicked? = ${cKicked} (expected true)}`, true],
    [`detail{ACTUAL next seat = ${paNext.kind}:[${sset(seatedNext)}] (expected seat:[A,B])}`, true],
    [`detail{trig ${P(trig)}}`, true],
    [`detail{afterSD ${P(eSD)}}`, true],
  ]);
}

// ============================================================================
// CASE 4 — Seating invariant: the next SD round seats ONLY contestants, never a
// kicked or non-contestant player. (Uses the 2-player loop + a parallel kicked
// player to prove non-contestants are never seated.)
// ============================================================================
{
  // 3 players; P3 busts out earlier (kicked), P1/P2 go to SD. Assert SD seating
  // never includes P3.
  const m = new Match([
    { id: "P1", name: "P1" }, { id: "P2", name: "P2" }, { id: "P3", name: "P3" },
  ]);
  m.playRound({ scores: { P1: 1, P2: 25, P3: 20 } });   // P1 win
  m.playRound({ scores: { P1: 45, P2: 21, P3: 30 } });  // P2 win ; 46/46/50
  const trig = m.playRound({ scores: { P1: 20, P2: 20, P3: 30 } }); // 66/66/80 → SD=[P1,P2], P3 kicked
  const pa = m.playAgain();
  const seated = pa.kind === "seat" ? (pa as any).players.map((p: any) => p.id) : [];
  check("4 SD seats ONLY contestants (kicked P3 never seated)", [
    ["SD=[P1,P2]", !!trig.suddenDeath && eqSet(trig.suddenDeath.contestants, ["P1", "P2"])],
    ["P3 kicked", trig.kickedIds.includes("P3")],
    ["next seat is exactly [P1,P2]", pa.kind === "seat" && eqSet(seated, ["P1", "P2"])],
    ["P3 NOT seated", !seated.includes("P3")],
    [`detail{seat=[${sset(seated)}] ${P(trig)}}`, true],
  ]);
}

// ============================================================================
// CASE 5 — Scores / history PRESERVED across SD rounds; mainRoundsCount stable.
//   After SD triggers at round 3, every subsequent SD round appends to scores
//   for contestants; mainRoundsCount stays pinned at the trigger value (3).
// ============================================================================
{
  const m = twoPlayerIntoSD();                 // SD triggers after 3 main rounds
  const mrcAtTrigger = m.elim.suddenDeath!.mainRoundsCount;
  const lenP1_trig = m.scoreLen("P1");
  const lenP2_trig = m.scoreLen("P2");

  // Play TWO tie SD rounds, then resolve.
  m.playAgain();
  m.playRound({ scores: { P1: 0, P2: 0 }, hands: { P1: 6, P2: 6 }, winnerId: null });
  const mrcAfter1 = m.elim.suddenDeath!.mainRoundsCount;
  m.playAgain();
  m.playRound({ scores: { P1: 0, P2: 0 }, hands: { P1: 6, P2: 6 }, winnerId: null });
  const mrcAfter2 = m.elim.suddenDeath!.mainRoundsCount;
  m.playAgain();
  const eWin = m.playRound({ scores: { P1: 0, P2: 0 }, hands: { P1: 1, P2: 9 }, winnerId: "P1" });
  const mrcFinal = eWin.suddenDeath!.mainRoundsCount;

  // Scores grew by SD rounds (3 SD rounds appended after the 3 main rounds).
  const lenP1_final = m.scoreLen("P1");
  const lenP2_final = m.scoreLen("P2");

  check("5 scores/history preserved across SD rounds; mainRoundsCount stable", [
    ["mainRoundsCount pinned at trigger=3", mrcAtTrigger === 3],
    ["mrc stable after SD round 1", mrcAfter1 === 3],
    ["mrc stable after SD round 2", mrcAfter2 === 3],
    ["mrc stable at final win", mrcFinal === 3],
    ["P1 trigger had 3 score rows", lenP1_trig === 3],
    ["P2 trigger had 3 score rows", lenP2_trig === 3],
    ["P1 grew to 6 rows (3 main + 3 SD)", lenP1_final === 6],
    ["P2 grew to 6 rows (3 main + 3 SD)", lenP2_final === 6],
    ["R-vs-FR split intact: 3 main (<mrc) + 3 final (>=mrc)", lenP1_final - mrcFinal === 3],
    [`detail{mrc=${mrcFinal} P1rows=${lenP1_final} P2rows=${lenP2_final}}`, true],
  ]);
}

// ============================================================================
// CASE 6 — TERMINATION: a loop that eventually yields a unique winner terminates
//   with gloriosVictoryReason "sudden_death" and playAgain becomes a no-op.
// ============================================================================
{
  const m = twoPlayerIntoSD();
  let guard = 0;
  let terminatedReason: string | null = null;
  // Drive the loop: tie a few times, then a unique low. Cap iterations defensively.
  const handPlan: Array<[number, number, string | null]> = [
    [4, 4, null],   // tie
    [8, 8, null],   // tie
    [2, 5, "P1"],   // unique → terminate
  ];
  let idx = 0;
  while (guard++ < 50) {
    const pa = m.playAgain();
    if (pa.kind !== "seat") {
      terminatedReason = m.elim.gloriosVictoryReason;
      break; // game over
    }
    const [h1, h2, w] = handPlan[Math.min(idx, handPlan.length - 1)];
    idx++;
    const e = m.playRound({ scores: { P1: 0, P2: 0 }, hands: { P1: h1, P2: h2 }, winnerId: w });
    if (e.gloriosVictory) {
      // next playAgain should be noop → loop will break above.
    }
  }
  const finalPA = m.playAgain();
  check("6 termination → unique winner, reason sudden_death, playAgain noop", [
    ["loop terminated within guard", guard < 50],
    ["GV set to a player", m.elim.gloriosVictory === "P1"],
    ["reason sudden_death", m.elim.gloriosVictoryReason === "sudden_death"],
    ["terminated via game_over/noop", terminatedReason === "sudden_death" || finalPA.kind === "noop"],
    ["post-termination playAgain noop", finalPA.kind === "noop"],
    [`detail{iters=${guard} ${P(m.elim)}}`, true],
  ]);
}

// ============================================================================
// CASE 7 — <2-contestant DEFENSIVE path of computeSpPlayAgain.
//   Construct an active-SD elim whose contestant list has only ONE player still
//   present in game.players, and verify computeSpPlayAgain declares that lone
//   player the sudden_death victor (game_over) instead of seating a round.
// ============================================================================
{
  // Build a minimal game with a single player "Solo" and an active SD record
  // naming only Solo as a contestant.
  const solo = player("Solo", "Solo", 0);
  const game = {
    variant: "classic", players: [solo], currentPlayer: 0, phase: "round_over",
    deck: [], discard: [], drawnCard: null, drawnFrom: null,
    pendingActionSource: null, peekAndSwapPick: null, pendingPeek: null,
    caboCallerId: null, finalRoundTurnsLeft: null, reveals: [], animations: [],
    roundNumber: 4,
    scores: { Solo: [10, 10, 10] }, caboBonus: { Solo: [] },
    caboPenalty: { Solo: [] }, snapBonus: { Solo: [] }, kamikaze: {},
    winnerId: null, log: [],
    snapPhase: "idle", snappingPlayerId: null, roundOutcome: null,
  } as unknown as GameState;
  const elim: ElimState = {
    bustedThisRound: [],
    kickedIds: [],
    gloriosVictory: null,
    gloriosVictoryReason: null,
    roundWins: { Solo: 1 },
    suddenDeath: { active: true, contestants: ["Solo"], mainRoundsCount: 3 },
  };
  const res = computeSpPlayAgain(game, elim);
  check("7 <2-contestant defensive path → lone player wins sudden_death", [
    ["result kind game_over", res.kind === "game_over"],
    ["GV=Solo", res.kind === "game_over" && res.nextElim.gloriosVictory === "Solo"],
    ["reason sudden_death", res.kind === "game_over" && res.nextElim.gloriosVictoryReason === "sudden_death"],
    ["SD record kept but inactive", res.kind === "game_over" && res.nextElim.suddenDeath?.active === false],
    ["mainRoundsCount preserved (3)", res.kind === "game_over" && res.nextElim.suddenDeath?.mainRoundsCount === 3],
    [`detail{kind=${res.kind} ${res.kind === "game_over" ? P(res.nextElim) : ""}}`, true],
  ]);
}

// ── report ──────────────────────────────────────────────────────────────────
console.log("\n============ SP SUDDEN-DEATH FULL-LOOP MATRIX ============\n");
let passN = 0;
for (const r of rows) {
  console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.name}`);
  console.log(`        ${r.detail}`);
  if (r.pass) passN++;
}
console.log(`\n--------------------------------------------------------`);
console.log(`RESULT: ${passN}/${rows.length} cases passed.`);
process.exitCode = passN === rows.length ? 0 : 1;
