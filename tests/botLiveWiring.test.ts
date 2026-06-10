/* Live-wiring regression guard: scripted HUMAN + 3 bots driven exactly the way
 * Table.tsx drives the brain (ingestReveals on every state change, then one
 * decideBotMove step). Guards the 2026-06-10 regression where bots churned
 * the discard pile every turn, swallowed their action cards, and dragged
 * rounds out by never calling LUMO:
 *   - bots must not live off the discard pile (take rate cap),
 *   - a non-endgame take must be a sane take (never a 10/J/Q/K),
 *   - rounds must end in a sane number of steps (someone calls LUMO),
 *   - bots must actually play action cards sometimes.
 * Run: cd server && node --import tsx ../tests/botLiveWiring.test.ts */
import assert from "node:assert/strict";
import {
  newGame,
  startPlay,
  setupPeekCard,
  drawFromDeck,
  swapDrawnWithHand,
  discardDrawnSkipAction,
  skipPendingAction,
  clearReveals,
  cardScore,
} from "../cobo/src/engine/game";
import type { GameState } from "../cobo/src/engine/types";
import { decideBotMove, ingestReveals, resetBotKnowledge } from "../cobo/src/ai/brain";

type Diff = "marcy" | "bob";
const ROUNDS = 12;

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Plain-vanilla human: always deck-draws, keeps low cards, skips actions. */
function humanMove(state: GameState, rng: () => number): GameState {
  const me = state.players[state.currentPlayer];
  if (state.phase === "turn_start") return drawFromDeck(state);
  if (state.phase === "turn_drawn" && state.drawnCard) {
    if (state.drawnFrom === "discard") return swapDrawnWithHand(state, 0);
    if (cardScore(state.drawnCard, state.variant) <= 5) {
      const idx = Math.floor(rng() * me.hand.length);
      return swapDrawnWithHand(state, me.hand[idx] ? idx : 0);
    }
    return discardDrawnSkipAction(state);
  }
  if (state.phase === "pending_action") return skipPendingAction(state);
  return state;
}

function runSeries(diff: Diff) {
  const t = {
    botTurnStarts: 0,
    deckDraws: 0,
    discardDraws: 0,
    badTakes: [] as string[],
    actionsStarted: 0,
    caboCalls: 0,
    roundSteps: [] as number[],
    stuck: 0,
  };
  for (let r = 0; r < ROUNDS; r++) {
    resetBotKnowledge();
    const rng = mulberry32(1000 + r);
    let state = newGame({
      seed: 42 + r,
      variant: "classic",
      players: [
        { id: "p_human", name: "You", isBot: false },
        { id: "p_bot1", name: "B1", isBot: true },
        { id: "p_bot2", name: "B2", isBot: true },
        { id: "p_bot3", name: "B3", isBot: true },
      ],
    });
    for (const p of state.players) {
      state = setupPeekCard(state, p.id, 0);
      state = setupPeekCard(state, p.id, 1);
    }
    state = startPlay(state);

    let steps = 0;
    while (state.phase !== "round_over" && steps < 400) {
      steps++;
      // Match the live Table lifecycle exactly: the ingest effect absorbs
      // reveals the moment they appear, and the Table clears transient
      // reveals BEFORE any bot decision runs (hasTransientReveal gate) —
      // so decisions must never see a transient reveal here either.
      ingestReveals(state);
      state = clearReveals(state);
      const cur = state.players[state.currentPlayer];
      let next: GameState;
      if (!cur.isBot) {
        next = humanMove(state, rng);
        if (next === state) break;
      } else {
        const phaseBefore = state.phase;
        const inEndgame = !!state.caboCallerId;
        next = decideBotMove(state, { difficulty: diff, rng });
        if (phaseBefore === "turn_start") {
          t.botTurnStarts++;
          if (next.caboCallerId && !state.caboCallerId && next.caboCallerId === cur.id) {
            t.caboCalls++;
          } else if (next.drawnFrom === "deck") t.deckDraws++;
          else if (next.drawnFrom === "discard") {
            t.discardDraws++;
            const top = state.discard[state.discard.length - 1]!;
            const topScore = cardScore(top, state.variant);
            // A sane take is never a 10+ card outside the post-call endgame.
            if (!inEndgame && topScore >= 10) {
              t.badTakes.push(`r${r} ${cur.id} took ${top.rank}(${topScore})`);
            }
          }
        }
        if (
          phaseBefore === "turn_drawn" &&
          next !== state &&
          next.phase !== "turn_start" &&
          next.phase !== "turn_drawn" &&
          next.phase !== "round_over"
        ) {
          t.actionsStarted++; // left turn_drawn into an action/pending phase
        }
        if (next === state) {
          t.stuck++;
          break;
        }
      }
      state = next;
    }
    t.roundSteps.push(steps);
  }
  return t;
}

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok ${name}`);
}

for (const diff of ["bob", "marcy"] as Diff[]) {
  const t = runSeries(diff);
  const draws = t.deckDraws + t.discardDraws;
  const takeRate = t.discardDraws / Math.max(1, draws);
  const avgSteps = t.roundSteps.reduce((a, b) => a + b, 0) / t.roundSteps.length;
  console.log(
    `— live wiring [${diff}]: takeRate=${(100 * takeRate).toFixed(1)}% avgSteps=${avgSteps.toFixed(1)} ` +
      `actions=${t.actionsStarted} cabo=${t.caboCalls} badTakes=${t.badTakes.length} stuck=${t.stuck} —`,
  );
  ok(`${diff}: never gets stuck (engine never rejects a bot move)`, () => {
    assert.equal(t.stuck, 0);
  });
  ok(`${diff}: bots do not live off the discard pile (take rate <= 30%)`, () => {
    assert.ok(takeRate <= 0.3, `take rate ${(100 * takeRate).toFixed(1)}% exceeds 30%`);
  });
  ok(`${diff}: no senseless takes (never grabs a 10/J/Q/K outside endgame)`, () => {
    assert.deepEqual(t.badTakes, []);
  });
  ok(`${diff}: rounds end in sane time (avg steps <= 55)`, () => {
    assert.ok(avgSteps <= 55, `avg round steps ${avgSteps.toFixed(1)} exceeds 55`);
  });
  ok(`${diff}: rounds are not rush-called away (avg steps >= 20)`, () => {
    assert.ok(avgSteps >= 20, `avg round steps ${avgSteps.toFixed(1)} below 20`);
  });
  ok(`${diff}: bots actually play action cards (>= 1 per round on average)`, () => {
    assert.ok(
      t.actionsStarted >= ROUNDS,
      `only ${t.actionsStarted} actions started across ${ROUNDS} rounds`,
    );
  });
}

console.log(`botLiveWiring: ${passed} checks passed`);
