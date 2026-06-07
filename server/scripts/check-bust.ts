// =============================================================================
// check-bust.ts — runnable verification for the shared simultaneous-bust rule.
//   npm --prefix server run check:bust
//
// Two jobs:
//   1. DRIFT GUARD — asserts cobo/src/engine/bustResolve.ts and
//      server/src/engine/bustResolve.ts are byte-identical (they are hand-synced
//      copies that MUST never diverge, or SP and MP would resolve games
//      differently — exactly the parity risk this module exists to remove).
//   2. RULE TESTS — deterministic cases for the order of authority, including the
//      real reported game (rounds 1-1, final round 21-21 → sudden death).
// Exits non-zero on any failure so it can gate CI later.
// =============================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  roundWinForCredit,
  resolveSimultaneousBust,
  lastRoundScores,
} from "../src/engine/bustResolve.js";

let pass = 0, fail = 0;
function norm(v: unknown): unknown {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return v;
}
function eq(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(norm(got)) === JSON.stringify(norm(want))) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}\n        got ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

console.log("— drift guard: the two engine copies must be byte-identical —");
const clientSrc = readFileSync(fileURLToPath(new URL("../../cobo/src/engine/bustResolve.ts", import.meta.url)), "utf8");
const serverSrc = readFileSync(fileURLToPath(new URL("../src/engine/bustResolve.ts", import.meta.url)), "utf8");
eq("cobo/engine/bustResolve.ts === server/engine/bustResolve.ts", clientSrc === serverSrc, true);

const YOU = "you", BILLY = "billy";

console.log("— last-round score extraction (scoreboard's last column) —");
eq("takes the final round score", lastRoundScores({ [YOU]: [35, 13, 21], [BILLY]: [22, 29, 21] }, [YOU, BILLY]), { [YOU]: 21, [BILLY]: 21 });
eq("missing player → Infinity", lastRoundScores({ a: [10] }, ["a", "b"]), { a: 10, b: Infinity });

console.log("— round-win credit: a TIE for lowest credits NOBODY —");
eq("R1 35 vs 22 → Billy", roundWinForCredit([YOU, BILLY], { [YOU]: 35, [BILLY]: 22 }), BILLY);
eq("R2 13 vs 29 → You", roundWinForCredit([YOU, BILLY], { [YOU]: 13, [BILLY]: 29 }), YOU);
eq("R3 21 vs 21 → null (tie)", roundWinForCredit([YOU, BILLY], { [YOU]: 21, [BILLY]: 21 }), null);
eq("single active → that player", roundWinForCredit(["a"], { a: 10 }), "a");
eq("empty → null", roundWinForCredit([], {}), null);
eq("3-way unique low → that player", roundWinForCredit(["a", "b", "c"], { a: 30, b: 20, c: 25 }), "b");
eq("3-way two tied at low → null", roundWinForCredit(["a", "b", "c"], { a: 20, b: 20, c: 25 }), null);

console.log("— THE REPORTED GAME: rounds 1-1, final round 21-21 → SUDDEN DEATH —");
const rw: Record<string, number> = {};
for (const r of [
  { [YOU]: 35, [BILLY]: 22 }, // R1 → Billy
  { [YOU]: 13, [BILLY]: 29 }, // R2 → You
  { [YOU]: 21, [BILLY]: 21 }, // R3 → tie (nobody)
]) { const w = roundWinForCredit([YOU, BILLY], r); if (w) rw[w] = (rw[w] ?? 0) + 1; }
eq("roundWins = {you:1, billy:1}", rw, { [YOU]: 1, [BILLY]: 1 });
eq("resolve → sudden death (no winner yet)",
  resolveSimultaneousBust([YOU, BILLY], rw, { [YOU]: 21, [BILLY]: 21 }),
  { winnerId: null, reason: null, sdContestants: [YOU, BILLY] });

console.log("— order of authority —");
eq("1) most wins decides", resolveSimultaneousBust(["a", "b"], { a: 2, b: 1 }, { a: 30, b: 25 }),
  { winnerId: "a", reason: "more_wins", sdContestants: null });
eq("2) tie wins → lowest FINAL-round score (NOT total)",
  resolveSimultaneousBust(["a", "b"], { a: 1, b: 1 }, { a: 25, b: 20 }),
  { winnerId: "b", reason: "final_round", sdContestants: null });
eq("3) tie wins + tie final → sudden death",
  resolveSimultaneousBust(["a", "b"], { a: 1, b: 1 }, { a: 21, b: 21 }),
  { winnerId: null, reason: null, sdContestants: ["a", "b"] });
eq("3-way: most-wins set [a,b]; b lower final → b wins",
  resolveSimultaneousBust(["a", "b", "c"], { a: 2, b: 2, c: 1 }, { a: 20, b: 15, c: 5 }),
  { winnerId: "b", reason: "final_round", sdContestants: null });
eq("3-way: most-wins set [a,b] tie final → SD only [a,b] (c dropped)",
  resolveSimultaneousBust(["a", "b", "c"], { a: 2, b: 2, c: 1 }, { a: 20, b: 20, c: 5 }),
  { winnerId: null, reason: null, sdContestants: ["a", "b"] });
eq("lone contestant wins by default",
  resolveSimultaneousBust(["a"], { a: 0 }, { a: 80 }),
  { winnerId: "a", reason: null, sdContestants: null });

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
