// =============================================================================
// EXHAUSTIVE integration test for the REAL single-player end-of-game bust
// resolution: computeSpBust + matchTotal from cobo/src/state/spBust.ts (the
// pure module store.ts now imports — identical code to the former inline fns).
//
// Run with:  cd server && node --import tsx test-spbust.mts
//
// We import the REAL functions plus their REAL dependencies (engine/bustResolve
// shared tiebreaker + engine/deck handScore) and thread the returned ElimState
// round by round as the next prevElim, so roundWins accumulates through the
// production credit path. Each case asserts the FULL returned ElimState.
//
// VERIFIED RULE INTERACTION (matches MP server/src/roundResolve.ts byte-for-
// byte): in the NORMAL path the round-win credit for the just-ended round is
// applied BEFORE the simultaneous-bust tiebreaker. So a player who is the
// STRICT-unique lowest in the BUST round earns a round-win that feeds the
// "most wins" tiebreaker for that same bust. Therefore, to reach a genuine
// sudden death, the two finalists must TIE each other for the strict-lowest
// score in the bust round (crediting neither) AND be tied on prior wins.
// =============================================================================

import {
  computeSpBust,
  matchTotal,
  EMPTY_ELIM,
  type ElimState,
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
/** A hand totalling exactly `handTotal` (only matters on an active SD round,
 *  which reads handScore; irrelevant on every other round). */
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
  /** Per-round running-total adjustments, applied BEFORE computeSpBust runs so
   *  matchTotal (and thus the >60 bust check) sees them. */
  caboPenalty?: Record<string, number>;
  caboBonus?: Record<string, number>;
  snapBonus?: Record<string, number>;
}

/** Stateful match runner: accumulates per-round scores like the engine, builds a
 *  round_over GameState, and calls the REAL computeSpBust threading prevElim. */
class Match {
  variant: GameVariant;
  ids: string[];
  names: Record<string, string>;
  scores: Record<string, number[]> = {};
  caboPenalty: Record<string, number[]> = {};
  caboBonus: Record<string, number[]> = {};
  snapBonus: Record<string, number[]> = {};
  elim: ElimState = structuredClone(EMPTY_ELIM);

  constructor(players: { id: string; name: string }[], variant: GameVariant = "classic") {
    this.variant = variant;
    this.ids = players.map((p) => p.id);
    this.names = Object.fromEntries(players.map((p) => [p.id, p.name]));
    for (const id of this.ids) {
      this.scores[id] = []; this.caboPenalty[id] = [];
      this.caboBonus[id] = []; this.snapBonus[id] = [];
    }
  }

  private seatedIds(): string[] {
    if (this.elim.suddenDeath?.active) return [...this.elim.suddenDeath.contestants];
    return this.ids.filter((id) => !this.elim.kickedIds.includes(id));
  }

  /** Emulate playAgain()'s finalisation: move this round's busts into kickedIds
   *  (only used by tests that need a player permanently kicked between rounds). */
  finaliseBusts() {
    const kicked = [...this.elim.kickedIds];
    for (const id of this.elim.bustedThisRound) if (!kicked.includes(id)) kicked.push(id);
    this.elim = { ...this.elim, kickedIds: kicked, bustedThisRound: [] };
    return this;
  }

  playRound(spec: RoundSpec): ElimState {
    const seated = this.seatedIds();
    for (const id of seated) {
      const s = spec.scores[id];
      if (s == null) throw new Error(`round missing score for seated ${id}`);
      this.scores[id].push(s);
      this.caboPenalty[id].push(spec.caboPenalty?.[id] ?? 0);
      this.caboBonus[id].push(spec.caboBonus?.[id] ?? 0);
      this.snapBonus[id].push(spec.snapBonus?.[id] ?? 0);
    }
    const players: PlayerState[] = seated.map((id) =>
      player(id, this.names[id], spec.hands?.[id] ?? 0),
    );
    const game: GameState = {
      variant: this.variant, players, currentPlayer: 0, phase: "round_over",
      deck: [], discard: [], drawnCard: null, drawnFrom: null,
      pendingActionSource: null, peekAndSwapPick: null, pendingPeek: null,
      caboCallerId: null, finalRoundTurnsLeft: null, reveals: [], animations: [],
      roundNumber: this.scores[seated[0]].length,
      scores: this.scores, caboBonus: this.caboBonus,
      caboPenalty: this.caboPenalty, snapBonus: this.snapBonus, kamikaze: {},
      winnerId: spec.winnerId ?? null, log: [],
      snapPhase: "idle", snappingPlayerId: null, roundOutcome: null,
    };
    this.elim = computeSpBust(game, this.elim);
    return this.elim;
  }

  total(id: string): number {
    const players: PlayerState[] = this.ids.map((sid) => player(sid, this.names[sid], 0));
    const game = {
      scores: this.scores, caboPenalty: this.caboPenalty,
      caboBonus: this.caboBonus, snapBonus: this.snapBonus, players,
    } as unknown as GameState;
    return matchTotal(game, id);
  }
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
  `GV=${e.gloriosVictory} reason=${e.gloriosVictoryReason} kicked=[${sset(e.kickedIds)}] busted=[${sset(e.bustedThisRound)}] wins=${JSON.stringify(e.roundWins)} sd=${e.suddenDeath ? `{active:${e.suddenDeath.active},contestants:[${sset(e.suddenDeath.contestants)}]}` : "null"}`;

// ============================================================================
// 1 — Survivor: 2 players, P1 ≤60, P2 >60 → GV=P1 "survivor", P2 kicked.
// ============================================================================
{
  const m = new Match([{ id: "P1", name: "P1" }, { id: "P2", name: "P2" }]);
  m.playRound({ scores: { P1: 30, P2: 40 } });
  const e = m.playRound({ scores: { P1: 25, P2: 35 } }); // totals 55 / 75
  check("1 survivor (2p, P2 busts)", [
    ["GV=P1", e.gloriosVictory === "P1"],
    ["reason=survivor", e.gloriosVictoryReason === "survivor"],
    ["P2 kicked", e.kickedIds.includes("P2")],
    ["no SD", e.suddenDeath === null],
    [`detail{${P(e)}}`, true],
  ]);
}

// ============================================================================
// 2 — Single active buster: 3 players, one already kicked, exactly one of the
// rest busts ALONE with zero survivors → wins "survivor" (contestants===1 path).
// (Both non-busters must be eliminated for survivors===0, so we pre-kick two.)
// ============================================================================
{
  const m = new Match([
    { id: "P1", name: "P1" }, { id: "P2", name: "P2" }, { id: "P3", name: "P3" },
  ]);
  m.elim = { ...m.elim, kickedIds: ["P2", "P3"] };       // P2,P3 kicked earlier
  const e = m.playRound({ scores: { P1: 70 } });          // P1 busts alone, survivors 0
  check("2 single active buster (others pre-kicked) → survivor", [
    ["GV=P1", e.gloriosVictory === "P1"],
    ["reason=survivor", e.gloriosVictoryReason === "survivor"],
    ["P1 removed from busted", !e.bustedThisRound.includes("P1")],
    ["no SD", e.suddenDeath === null],
    [`detail{${P(e)}}`, true],
  ]);
}

// ============================================================================
// 3 — Simultaneous bust, UNIQUE most-wins → "more_wins". P1 wins R1&R2, both bust.
// ============================================================================
{
  const m = new Match([{ id: "P1", name: "P1" }, { id: "P2", name: "P2" }]);
  m.playRound({ scores: { P1: 5, P2: 20 } });   // P1 unique low
  m.playRound({ scores: { P1: 5, P2: 20 } });   // P1 unique low (P1=10,P2=40)
  const e = m.playRound({ scores: { P1: 55, P2: 25 } }); // P1=65,P2=65; R3 low=25(P2) credits P2
  check("3 simultaneous bust, unique most-wins", [
    ["GV=P1", e.gloriosVictory === "P1"],
    ["reason=more_wins", e.gloriosVictoryReason === "more_wins"],
    ["P2 kicked", e.kickedIds.includes("P2")],
    ["P1 not busted", !e.bustedThisRound.includes("P1")],
    ["wins P1=2,P2=1", eqWins(e.roundWins, { P1: 2, P2: 1 })],
    ["no SD", e.suddenDeath === null],
    [`detail{${P(e)}}`, true],
  ]);
}

// ============================================================================
// 4 — Simultaneous bust, TIE on wins, UNIQUE lowest final-round → "final_round".
//
// IMPORTANT verified nuance: with EXACTLY 2 contestants, "final_round" is
// UNREACHABLE — the unique strict-low in the bust round is ALSO credited a
// round-win, which breaks the wins-tie (→ more_wins), and an exact tie in the
// bust round routes to sudden death. So a genuine "final_round" needs ≥3
// contestants where the bust-round-low ties them on wins yet wins the final
// tiebreaker. Here A,B each win 2 earlier rounds, C wins 1; all bust together
// and C is the UNIQUE strict-low in the final round → C is credited (wins now
// 2/2/2, a 3-way tie) AND has the lowest final-round score → reason final_round,
// winner C; A,B kicked.
// ============================================================================
{
  const m = new Match([
    { id: "A", name: "A" }, { id: "B", name: "B" }, { id: "C", name: "C" },
  ]);
  m.playRound({ scores: { A: 1, B: 10, C: 11 } });  // A win
  m.playRound({ scores: { A: 1, B: 10, C: 11 } });  // A win (A=2 wins)
  m.playRound({ scores: { A: 10, B: 1, C: 11 } });  // B win
  m.playRound({ scores: { A: 10, B: 1, C: 14 } });  // B win (B=2 wins)
  m.playRound({ scores: { A: 15, B: 15, C: 1 } });  // C win (C=1 win); totals 37/37/48
  const e = m.playRound({ scores: { A: 25, B: 25, C: 14 } }); // totals 62/62/62 all bust
  check("4 simultaneous bust, tie wins, unique lowest final round (3 contestants)", [
    ["GV=C", e.gloriosVictory === "C"],
    ["reason=final_round", e.gloriosVictoryReason === "final_round"],
    ["A,B kicked", e.kickedIds.includes("A") && e.kickedIds.includes("B")],
    ["C not kicked", !e.kickedIds.includes("C")],
    // final-round strict-low (C) is also credited → 3-way tie at 2.
    ["wins A=2,B=2,C=2", eqWins(e.roundWins, { A: 2, B: 2, C: 2 })],
    ["no SD", e.suddenDeath === null],
    [`detail{${P(e)}}`, true],
  ]);
}

// ============================================================================
// 5 — Simultaneous bust, TIE wins, TIE final-round → SUDDEN DEATH.
// 3 players: P1 wins R1, P2 wins R2; R3 all bust with P1==P2 strict-low (credits
// nobody, ties the final tiebreaker), P3 strictly higher in R3 → P3 kicked, SD=[P1,P2].
// CASE 6 chains off the resulting active-SD state below.
// ============================================================================
{
  const m = new Match([
    { id: "P1", name: "P1" }, { id: "P2", name: "P2" }, { id: "P3", name: "P3" },
  ]);
  m.playRound({ scores: { P1: 1, P2: 25, P3: 20 } });   // P1 win ; 1/25/20
  m.playRound({ scores: { P1: 45, P2: 21, P3: 30 } });  // P2 win ; 46/46/50
  const e = m.playRound({ scores: { P1: 20, P2: 20, P3: 30 } }); // totals 66/66/80; R3 low=20 tie P1,P2
  check("5 simultaneous bust, tie wins, tie final → sudden death", [
    ["GV unset", e.gloriosVictory === null],
    ["reason unset", e.gloriosVictoryReason === null],
    ["SD active", e.suddenDeath?.active === true],
    ["SD contestants=[P1,P2]", !!e.suddenDeath && eqSet(e.suddenDeath.contestants, ["P1", "P2"])],
    ["P3 kicked (lost final-round tiebreaker)", e.kickedIds.includes("P3")],
    // SD contestants are pulled OUT of bustedThisRound (they're playing the
    // tiebreaker); the kicked loser P3 legitimately REMAINS in bustedThisRound.
    ["P1,P2 removed from busted", !e.bustedThisRound.includes("P1") && !e.bustedThisRound.includes("P2")],
    ["P3 remains in busted (kicked loser)", e.bustedThisRound.includes("P3")],
    ["wins P1=1,P2=1,P3=0", eqWins(e.roundWins, { P1: 1, P2: 1, P3: 0 })],
    ["SD mainRoundsCount=3", e.suddenDeath?.mainRoundsCount === 3],
    [`detail{${P(e)}}`, true],
  ]);

  // 6 — SD resolution: unique lowest HAND among contestants → sudden_death.
  const e6 = m.playRound({ scores: { P1: 0, P2: 0 }, hands: { P1: 3, P2: 9 }, winnerId: "P1" });
  check("6 SD resolution, unique lowest hand → sudden_death", [
    ["GV=P1", e6.gloriosVictory === "P1"],
    ["reason=sudden_death", e6.gloriosVictoryReason === "sudden_death"],
    ["P2 kicked", e6.kickedIds.includes("P2")],
    ["SD inactive", e6.suddenDeath?.active === false],
    ["SD contestants preserved [P1,P2]", !!e6.suddenDeath && eqSet(e6.suddenDeath.contestants, ["P1", "P2"])],
    [`detail{${P(e6)}}`, true],
  ]);
}

// ============================================================================
// 7 — SD tie: active SD, ≥2 tied lowest hands → no GV, SD stays active.
// ============================================================================
{
  const m = new Match([
    { id: "P1", name: "P1" }, { id: "P2", name: "P2" }, { id: "P3", name: "P3" },
  ]);
  m.playRound({ scores: { P1: 1, P2: 25, P3: 20 } });
  m.playRound({ scores: { P1: 45, P2: 21, P3: 30 } });
  m.playRound({ scores: { P1: 20, P2: 20, P3: 30 } });  // SD active [P1,P2]
  const e = m.playRound({ scores: { P1: 0, P2: 0 }, hands: { P1: 7, P2: 7 }, winnerId: null });
  check("7 SD tie hands → stays active, no GV", [
    ["GV unset", e.gloriosVictory === null],
    ["reason unset", e.gloriosVictoryReason === null],
    ["SD still active", e.suddenDeath?.active === true],
    ["SD contestants still [P1,P2]", !!e.suddenDeath && eqSet(e.suddenDeath.contestants, ["P1", "P2"])],
    ["P3 kicked, P1/P2 not", e.kickedIds.includes("P3") && !e.kickedIds.includes("P1") && !e.kickedIds.includes("P2")],
    [`detail{${P(e)}}`, true],
  ]);
}

// ============================================================================
// 8 — Round-win credit: unique-lowest credits that player; tied-lowest credits
// NOBODY. Assert roundWins after each round (no busts here).
// ============================================================================
{
  const m = new Match([
    { id: "A", name: "A" }, { id: "B", name: "B" }, { id: "C", name: "C" },
  ]);
  const e1 = m.playRound({ scores: { A: 5, B: 10, C: 12 } }); // A unique low
  const c1 = eqWins(e1.roundWins, { A: 1 });
  const e2 = m.playRound({ scores: { A: 8, B: 8, C: 12 } });  // A,B tie low → nobody
  const c2 = eqWins(e2.roundWins, { A: 1 });
  const e3 = m.playRound({ scores: { A: 30, B: 9, C: 50 } }); // B unique low
  const c3 = eqWins(e3.roundWins, { A: 1, B: 1 });
  check("8 round-win credit (unique credits, tie credits nobody)", [
    ["after R1 A=1", c1],
    ["after R2 (tie) still A=1, none added", c2],
    ["after R3 A=1,B=1", c3],
    [`detail{R1 ${JSON.stringify(e1.roundWins)} | R2 ${JSON.stringify(e2.roundWins)} | R3 ${JSON.stringify(e3.roundWins)}}`, true],
  ]);
}

// ============================================================================
// 9a — 3 players, partial bust, ≥2 survivors → no GV (normal continue).
// ============================================================================
{
  const m = new Match([
    { id: "P1", name: "P1" }, { id: "P2", name: "P2" }, { id: "P3", name: "P3" },
  ]);
  m.playRound({ scores: { P1: 20, P2: 20, P3: 20 } });
  const e = m.playRound({ scores: { P1: 50, P2: 10, P3: 10 } }); // P1=70 busts; P2,P3=30 survive
  check("9a partial bust, 2 survivors → no GV", [
    ["GV unset", e.gloriosVictory === null],
    ["reason unset", e.gloriosVictoryReason === null],
    ["P1 in bustedThisRound", e.bustedThisRound.includes("P1")],
    ["P1 NOT yet kicked (playAgain finalises)", !e.kickedIds.includes("P1")],
    ["no SD", e.suddenDeath === null],
    [`detail{${P(e)}}`, true],
  ]);
}

// ============================================================================
// 9b — 4 players, all-but-one bust same round → survivor wins.
// ============================================================================
{
  const m = new Match([
    { id: "P1", name: "P1" }, { id: "P2", name: "P2" },
    { id: "P3", name: "P3" }, { id: "P4", name: "P4" },
  ]);
  m.playRound({ scores: { P1: 10, P2: 30, P3: 30, P4: 30 } });
  const e = m.playRound({ scores: { P1: 10, P2: 40, P3: 40, P4: 40 } }); // P1=20; P2/P3/P4=70
  check("9b 4p, all-but-one bust → survivor", [
    ["GV=P1", e.gloriosVictory === "P1"],
    ["reason=survivor", e.gloriosVictoryReason === "survivor"],
    ["P2,P3,P4 kicked", ["P2", "P3", "P4"].every((id) => e.kickedIds.includes(id))],
    ["no SD", e.suddenDeath === null],
    [`detail{${P(e)}}`, true],
  ]);
}

// ============================================================================
// 9c — 4 players, ALL bust same round → full chain (here: unique most-wins).
// ============================================================================
{
  const m = new Match([
    { id: "P1", name: "P1" }, { id: "P2", name: "P2" },
    { id: "P3", name: "P3" }, { id: "P4", name: "P4" },
  ]);
  m.playRound({ scores: { P1: 1, P2: 20, P3: 21, P4: 22 } }); // P1 win
  m.playRound({ scores: { P1: 1, P2: 20, P3: 21, P4: 22 } }); // P1 win (P1=2,P2=40,P3=42,P4=44)
  const e = m.playRound({ scores: { P1: 60, P2: 25, P3: 26, P4: 27 } });
  // totals: P1=62,P2=65,P3=68,P4=71 → all bust; R3 low=25(P2) credits P2;
  // wins P1=2 unique → more_wins.
  check("9c 4p, all bust → full chain (more_wins)", [
    ["GV=P1", e.gloriosVictory === "P1"],
    ["reason=more_wins", e.gloriosVictoryReason === "more_wins"],
    ["P2,P3,P4 kicked", ["P2", "P3", "P4"].every((id) => e.kickedIds.includes(id))],
    ["wins P1=2,P2=1 others 0", eqWins(e.roundWins, { P1: 2, P2: 1 })],
    ["no SD", e.suddenDeath === null],
    [`detail{${P(e)}}`, true],
  ]);
}

// ============================================================================
// 10 — Kicked-earlier player excluded from round-win credit AND contention.
// P3 busts R1 (survivors remain), is finalised to kicked, then a later round
// where P3's stale low score must NOT credit P3, and P3 must not contend.
// ============================================================================
{
  const m = new Match([
    { id: "P1", name: "P1" }, { id: "P2", name: "P2" }, { id: "P3", name: "P3" },
  ]);
  m.playRound({ scores: { P1: 20, P2: 20, P3: 65 } });  // P3 busts; survivors P1,P2 → no GV
  m.finaliseBusts();                                     // P3 → kicked (playAgain emulation)
  const e2 = m.playRound({ scores: { P1: 5, P2: 30 } }); // only P1,P2 seated; P1 unique low
  const creditOk = eqWins(e2.roundWins, { P1: 1 });      // P3 (stale 65) NOT credited
  // R3: P1 & P2 both bust. wins enter R3 tied (P1=1 from R2). R3 strict-low is P2
  // (40<60) → P2 credited → wins TIE 1-1 → final-round tiebreaker → P2 (40)<P1 (60)
  // → P2 wins "final_round". The point: kicked P3 is NOT credited and NOT a
  // contestant (contention is exactly [P1,P2]; never SD with P3).
  const e3 = m.playRound({ scores: { P1: 60, P2: 40 } }); // P1=85,P2=90 both bust
  check("10 kicked-earlier excluded from credit + contention", [
    ["R2 credit ignores kicked P3 (only P1=1)", creditOk],
    ["R3 winner is among contenders only (P2)", e3.gloriosVictory === "P2"],
    ["R3 reason final_round", e3.gloriosVictoryReason === "final_round"],
    ["P3 NOT credited a win ever", (e3.roundWins["P3"] ?? 0) === 0],
    ["P3 stays kicked, never an SD contestant", e3.kickedIds.includes("P3") && e3.suddenDeath === null],
    ["wins exactly P1=1,P2=1 (P3 absent)", eqWins(e3.roundWins, { P1: 1, P2: 1 })],
    ["P1 also kicked (lost final-round tiebreak)", e3.kickedIds.includes("P1")],
    [`detail{R2 ${JSON.stringify(e2.roundWins)} | R3 ${P(e3)}}`, true],
  ]);
}

// ============================================================================
// 11 — THE REPORTED GAME: You [35,13,21], Billy [22,29,21].
// Totals 69 / 72 → both bust R3. R1 You35/Billy22 → Billy win; R2 You13/Billy29
// → You win; R3 21==21 TIE → nobody. wins You=1,Billy=1 tie; final 21==21 tie →
// SUDDEN DEATH (You,Billy).
// ============================================================================
{
  const m = new Match([{ id: "You", name: "You" }, { id: "Billy", name: "Billy" }]);
  const r1 = m.playRound({ scores: { You: 35, Billy: 22 } });
  const r2 = m.playRound({ scores: { You: 13, Billy: 29 } });
  const r3 = m.playRound({ scores: { You: 21, Billy: 21 } });
  check("11 reported game (35/13/21 vs 22/29/21) → sudden death", [
    ["You total 69", m.total("You") === 69],
    ["Billy total 72", m.total("Billy") === 72],
    ["both bust → SD active", r3.suddenDeath?.active === true],
    ["SD contestants [Billy,You]", !!r3.suddenDeath && eqSet(r3.suddenDeath.contestants, ["You", "Billy"])],
    ["no GV yet", r3.gloriosVictory === null],
    ["wins You=1,Billy=1 (R3 tie credits nobody)", eqWins(r3.roundWins, { You: 1, Billy: 1 })],
    ["neither kicked (both in SD)", !r3.kickedIds.includes("You") && !r3.kickedIds.includes("Billy")],
    ["both removed from bustedThisRound", !r3.bustedThisRound.includes("You") && !r3.bustedThisRound.includes("Billy")],
    [`detail{R1wins ${JSON.stringify(r1.roundWins)} | R2wins ${JSON.stringify(r2.roundWins)} | R3 ${P(r3)}}`, true],
  ]);
}

// ============================================================================
// 12 — Regression: clean games with NO tied rounds resolve to the order-of-
// authority winner. (a) clear more_wins, (b) clear survivor.
// ============================================================================
{
  const a = new Match([{ id: "P1", name: "P1" }, { id: "P2", name: "P2" }]);
  a.playRound({ scores: { P1: 2, P2: 25 } }); // P1 win
  a.playRound({ scores: { P1: 2, P2: 25 } }); // P1 win (P1=4,P2=50)
  const ea = a.playRound({ scores: { P1: 58, P2: 12 } }); // P1=62,P2=62 both bust; wins P1=2 → more_wins
  const b = new Match([{ id: "P1", name: "P1" }, { id: "P2", name: "P2" }]);
  b.playRound({ scores: { P1: 10, P2: 30 } });
  const eb = b.playRound({ scores: { P1: 10, P2: 40 } }); // P1=20, P2=70 → survivor P1
  check("12 regression: clean more_wins + clean survivor", [
    ["(a) GV=P1 more_wins", ea.gloriosVictory === "P1" && ea.gloriosVictoryReason === "more_wins"],
    ["(a) no SD", ea.suddenDeath === null],
    ["(b) GV=P1 survivor", eb.gloriosVictory === "P1" && eb.gloriosVictoryReason === "survivor"],
    ["(b) P2 kicked", eb.kickedIds.includes("P2")],
    [`detail{(a) ${P(ea)} || (b) ${P(eb)}}`, true],
  ]);
}

// ============================================================================
// 13 — matchTotal threshold via cabo penalty / snap bonus (the bust figure is
// the SCOREBOARD total, not the raw round sum). A +5 cabo penalty tips a player
// who is exactly at 60 over the limit; a -10 snap bonus pulls another back under.
// ============================================================================
{
  const m = new Match([{ id: "P1", name: "P1" }, { id: "P2", name: "P2" }]);
  m.playRound({ scores: { P1: 58, P2: 58 } });  // raw 58 each
  // R2 raw 2 each → raw totals 60 each (NOT over the limit on raw sum). Apply
  // adjustments so the SCOREBOARD total decides: P1 +5 cabo penalty (→65, busts),
  // P2 -10 snap bonus (→50, safe). This proves the bust uses matchTotal.
  const e = m.playRound({
    scores: { P1: 2, P2: 2 },
    caboPenalty: { P1: 5 },
    snapBonus: { P2: 10 },
  });
  check("13 matchTotal threshold (cabo +5 busts, snap -10 saves)", [
    ["P1 total 58+2+5 = 65 >60", m.total("P1") === 65],
    ["P2 total 58+2-10 = 50 ≤60", m.total("P2") === 50],
    ["raw sum 60 each would NOT bust (proves matchTotal used)", (58 + 2) === 60],
    ["P1 busts → survivor P2", e.gloriosVictory === "P2" && e.gloriosVictoryReason === "survivor"],
    ["P1 kicked", e.kickedIds.includes("P1")],
    [`detail{P1total=${m.total("P1")} P2total=${m.total("P2")} ${P(e)}}`, true],
  ]);
}

// ── report ──────────────────────────────────────────────────────────────────
console.log("\n================ computeSpBust MATRIX ================\n");
let passN = 0;
for (const r of rows) {
  console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.name}`);
  console.log(`        ${r.detail}`);
  if (r.pass) passN++;
}
console.log(`\n----------------------------------------------------`);
console.log(`RESULT: ${passN}/${rows.length} cases passed.`);
process.exitCode = passN === rows.length ? 0 : 1;
