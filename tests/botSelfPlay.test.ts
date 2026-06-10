// =============================================================================
// botSelfPlay.test.ts — headless bot-vs-bot soak test for the AI brain.
//   Run (from repo root):  npm run test:ai
//   Or directly:           cd server && node --import tsx ../tests/botSelfPlay.test.ts
//
// Imports brain.ts + the engine ONLY. bot.ts must never be imported here:
// it pulls the Zustand store, which pulls localStorage-touching audio code
// and cannot load headlessly.
//
// What it proves:
//   • zero exceptions across hundreds of seeded rounds (classic + evolved),
//   • zero illegal actions (decideBotMove must always transition the state —
//     an unchanged reference means the engine rejected the bot's move, which
//     in the real app soft-locks the game),
//   • every round terminates within the step budget,
//   • skill ordering: Bob's average round score beats Billy's by >= 2 points
//     (Bob-vs-Marcy is reported, not asserted).
// =============================================================================

import assert from "node:assert/strict";
import { mulberry32 } from "../cobo/src/engine/deck";
import { clearReveals, newGame, startPlay } from "../cobo/src/engine/game";
import type { GameState } from "../cobo/src/engine/types";
import {
  type BotSnapPlan,
  armBotSnap,
  decideBotMove,
  executeBotSnap,
  findBotSnap,
  ingestReveals,
  resetBotKnowledge,
} from "../cobo/src/ai/brain";

type Difficulty = "billy" | "marcy" | "bob";
const ALL: Difficulty[] = ["bob", "marcy", "billy"];
const IDS = ["p0", "p1", "p2"] as const;

/** Resolve pending bot snaps inline. Each difficulty's race is evaluated
 *  with findBotSnap; a plan is honoured only when the winning bot actually
 *  HAS that difficulty in this mixed-seat match (in the real SP game all
 *  bots share one difficulty, so this filter is a harness-only concern).
 *  Loops because a resolved snap changes the discard top. */
function resolveSnaps(
  state: GameState,
  seats: Record<string, Difficulty>,
  rng: () => number,
  seed: number,
): GameState {
  for (let guard = 0; guard < 8 && state.phase !== "round_over"; guard++) {
    let best: BotSnapPlan | null = null;
    for (const d of ALL) {
      const plan = findBotSnap(state, d, rng);
      if (!plan) continue;
      if (seats[plan.botId] !== d) continue;
      if (!best || plan.delayMs < best.delayMs) best = plan;
    }
    if (!best) return state;
    const armed = armBotSnap(state, best);
    if (armed === state) return state; // engine rejected the arm — stop
    const resolved = executeBotSnap(armed, best);
    assert.notEqual(
      resolved,
      armed,
      `executeBotSnap left snapPhase armed (seed ${seed}, plan ${JSON.stringify(best)})`,
    );
    state = resolved;
    ingestReveals(state);
    state = clearReveals(state);
  }
  return state;
}

function playRound(
  seed: number,
  variant: "classic" | "evolved",
  seats: Record<string, Difficulty>,
): { state: GameState; steps: number } {
  const rng = mulberry32(seed * 7919 + 17);
  resetBotKnowledge();
  let state = newGame({
    players: IDS.map((id) => ({ id, name: id, isBot: true })),
    variant,
    seed,
  });
  state = startPlay(state);
  ingestReveals(state);
  state = clearReveals(state);

  let steps = 0;
  while (state.phase !== "round_over") {
    steps += 1;
    assert.ok(steps <= 600, `round did not terminate (seed ${seed}, ${variant})`);
    const current = state.players[state.currentPlayer];
    const difficulty = seats[current.id];
    const next = decideBotMove(state, { difficulty, rng });
    assert.notEqual(
      next,
      state,
      `decideBotMove made no progress (seed ${seed}, ${variant}, phase ${state.phase}, ` +
        `bot ${current.id}/${difficulty}, step ${steps})`,
    );
    state = next;
    ingestReveals(state);
    state = clearReveals(state);
    state = resolveSnaps(state, seats, rng, seed);
  }
  return { state, steps };
}

// ── 200 seeded classic rounds with mixed seats ──────────────────────────────
// The difficulty→seat assignment rotates with the seed so no persona gets a
// systematic first-mover advantage; scores accumulate per DIFFICULTY.

console.log("— botSelfPlay: 200 classic rounds (Bob / Marcy / Billy) —");

const totals: Record<Difficulty, number> = { bob: 0, marcy: 0, billy: 0 };
const wins: Record<Difficulty, number> = { bob: 0, marcy: 0, billy: 0 };
let roundsPlayed = 0;

for (let seed = 1; seed <= 200; seed++) {
  const rot = seed % 3;
  const seats: Record<string, Difficulty> = {
    p0: ALL[rot % 3],
    p1: ALL[(rot + 1) % 3],
    p2: ALL[(rot + 2) % 3],
  };
  const { state } = playRound(seed, "classic", seats);
  for (const id of IDS) {
    const arr = state.scores[id];
    assert.ok(arr && arr.length === 1, `seed ${seed}: missing round score for ${id}`);
    totals[seats[id]] += arr[0];
  }
  if (state.winnerId) wins[seats[state.winnerId]] += 1;
  roundsPlayed += 1;
}

const avg = (d: Difficulty) => totals[d] / roundsPlayed;
console.log(
  `  averages over ${roundsPlayed} rounds — ` +
    `Bob: ${avg("bob").toFixed(2)}  Marcy: ${avg("marcy").toFixed(2)}  Billy: ${avg("billy").toFixed(2)}`,
);
console.log(
  `  round wins — Bob: ${wins.bob}  Marcy: ${wins.marcy}  Billy: ${wins.billy}`,
);
console.log(
  `  Bob-vs-Marcy delta (reported, not asserted): ${(avg("marcy") - avg("bob")).toFixed(2)} pts`,
);
assert.ok(
  avg("bob") <= avg("billy") - 2.0,
  `skill ordering violated: Bob avg ${avg("bob").toFixed(2)} must beat Billy avg ${avg("billy").toFixed(2)} by >= 2.0`,
);

// ── 100 evolved rounds: crash / illegal-action / termination coverage ──────
// (Dragons, Kamikaze, Carré, 7/8 picker, 9/10 double peek.)

console.log("— botSelfPlay: 100 evolved rounds (crash / illegal coverage) —");

for (let seed = 1000; seed < 1100; seed++) {
  const rot = seed % 3;
  const seats: Record<string, Difficulty> = {
    p0: ALL[rot % 3],
    p1: ALL[(rot + 1) % 3],
    p2: ALL[(rot + 2) % 3],
  };
  playRound(seed, "evolved", seats);
}
console.log("  100 evolved rounds: zero exceptions, zero illegal actions, all terminated");

resetBotKnowledge();
console.log("botSelfPlay tests passed");
