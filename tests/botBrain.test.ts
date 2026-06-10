// =============================================================================
// botBrain.test.ts — deterministic unit tests for the pure bot decision core.
//   Run (from repo root):  npm run test:ai
//   Or directly:           cd server && node --import tsx ../tests/botBrain.test.ts
//
// Framework-less (node:assert/strict), like the other tests in this folder.
// Imports brain.ts + the engine ONLY — never bot.ts (which pulls the Zustand
// store and, through it, localStorage-touching audio code).
// =============================================================================

import assert from "node:assert/strict";
import { cardScore, mulberry32 } from "../cobo/src/engine/deck";
import { newGame, startPlay, clearReveals } from "../cobo/src/engine/game";
import type { Card, GameState, PlayerState, Rank, Suit } from "../cobo/src/engine/types";
import {
  type BotCardBelief,
  type BotKnowledge,
  chooseDragonRank,
  decideBotMove,
  findBotSnap,
  getOrInitKnowledge,
  ingestReveals,
  resetBotKnowledge,
  shouldCallCaboBob,
  suggestBotDelayMs,
  unseenEv,
} from "../cobo/src/ai/brain";

let pass = 0;
function ok(label: string, fn: () => void) {
  fn();
  pass += 1;
  console.log(`  ok  ${label}`);
}

// ── factories ───────────────────────────────────────────────────────────────

let cid = 0;
function card(rank: Rank, suit: Suit = "S"): Card {
  cid += 1;
  return { id: `t${cid}_${rank}${suit}`, rank, suit };
}

function mkPlayer(id: string, hand: (Card | null)[], isBot = true): PlayerState {
  return {
    id,
    name: id,
    isBot,
    hand,
    knownToSelf: hand.map(() => false),
    calledCabo: false,
    snapsUsed: { other: false, self: false },
    snapsCorrect: { other: false, self: false },
  };
}

function mkState(over: Partial<GameState> & { players: PlayerState[] }): GameState {
  return {
    variant: "classic",
    currentPlayer: 0,
    phase: "turn_start",
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
    roundNumber: 1,
    scores: {},
    caboBonus: {},
    caboPenalty: {},
    snapBonus: {},
    kamikaze: {},
    winnerId: null,
    log: [],
    snapPhase: "idle",
    snappingPlayerId: null,
    roundOutcome: null,
    ...over,
  };
}

function belief(c: Card, variant: "classic" | "evolved" = "classic"): BotCardBelief {
  return { cardId: c.id, rank: c.rank, suit: c.suit, score: cardScore(c, variant) };
}

function knowledgeOf(beliefs: Record<string, (BotCardBelief | null)[]>): BotKnowledge {
  return { beliefs: new Map(Object.entries(beliefs)) };
}

const EMPTY_K: BotKnowledge = { beliefs: new Map() };

console.log("— botBrain: card-counting EV (unseenEv) —");

ok("fresh classic deck: ev = (364 - top)/55", () => {
  const top = card("5");
  const st = mkState({
    players: [mkPlayer("b1", [card("A"), card("2"), card("3"), card("4")])],
    discard: [top],
  });
  const ev = unseenEv(st, EMPTY_K, "b1");
  assert.ok(Math.abs(ev - (364 - 5) / 55) < 1e-9, `ev=${ev}`);
});

ok("four Ks discarded drops the ev", () => {
  const base = mkState({
    players: [mkPlayer("b1", [card("A")])],
    discard: [card("5")],
  });
  const evBase = unseenEv(base, EMPTY_K, "b1");
  const st = mkState({
    players: [mkPlayer("b1", [card("A")])],
    discard: [card("5"), card("K", "S"), card("K", "H"), card("K", "D"), card("K", "C")],
  });
  const ev = unseenEv(st, EMPTY_K, "b1");
  assert.ok(ev < evBase, `ev=${ev} evBase=${evBase}`);
  assert.ok(Math.abs(ev - (364 - 57) / 51) < 1e-9, `ev=${ev}`);
});

ok("evolved baseline: 312/56 = ~5.57", () => {
  const st = mkState({
    variant: "evolved",
    players: [mkPlayer("b1", [card("A")])],
    discard: [],
  });
  const ev = unseenEv(st, EMPTY_K, "b1");
  assert.ok(Math.abs(ev - 312 / 56) < 1e-9, `ev=${ev}`);
});

ok("Dragons and dx-conjured extras are outside the counted pool", () => {
  const st = mkState({
    variant: "evolved",
    players: [mkPlayer("b1", [card("A")])],
    discard: [
      card("5"),
      { id: "dx1_test", rank: "Q", suit: "S" }, // Dragon-conjured extra
      { id: "Dragon1", rank: "Dragon", suit: "S" },
    ],
  });
  const ev = unseenEv(st, EMPTY_K, "b1");
  assert.ok(Math.abs(ev - (312 - 5) / 55) < 1e-9, `ev=${ev}`);
});

ok("beliefs count as seen; deck-drawn cards only when the bot itself drew", () => {
  const known = card("K");
  const k = knowledgeOf({ opp: [belief(known), null, null, null] });
  const st = mkState({
    players: [mkPlayer("b1", [card("A")]), mkPlayer("opp", [known, card("2"), card("3"), card("4")])],
    discard: [],
  });
  const ev = unseenEv(st, k, "b1");
  assert.ok(Math.abs(ev - (364 - 13) / 55) < 1e-9, `ev=${ev}`);

  // Drawn from deck by b1 (currentPlayer 0): b1 counts it, opp does not.
  const drawn = card("Q");
  const st2 = mkState({
    players: [mkPlayer("b1", [card("A")]), mkPlayer("opp", [card("2")])],
    currentPlayer: 0,
    drawnCard: drawn,
    drawnFrom: "deck",
  });
  const evSelf = unseenEv(st2, EMPTY_K, "b1");
  const evOther = unseenEv(st2, EMPTY_K, "opp");
  assert.ok(Math.abs(evSelf - (364 - 12) / 55) < 1e-9, `evSelf=${evSelf}`);
  assert.ok(Math.abs(evOther - 364 / 56) < 1e-9, `evOther=${evOther}`);
});

console.log("— botBrain: belief reconciliation (ingestReveals) —");

ok("rival-snap replacement nulls the belief (no hidden-rank carryover)", () => {
  resetBotKnowledge();
  const f = card("7");
  const b1 = mkPlayer("b1", [card("A"), card("2"), card("3"), card("4")]);
  const b2 = mkPlayer("b2", [card("5"), f, card("6"), card("8")]);
  const st = mkState({
    players: [b1, b2],
    reveals: [{ playerId: "b2", index: 1, card: f, toPlayerIds: ["b1"], reason: "peek_other" }],
  });
  ingestReveals(st);
  const k1 = getOrInitKnowledge(st, "b1");
  assert.equal(k1.beliefs.get("b2")![1]?.cardId, f.id);

  // Snap replaced b2[1] with a fresh face-down card; f went to discard.
  const z = card("9");
  const st2 = mkState({
    players: [
      mkPlayer("b1", b1.hand),
      mkPlayer("b2", [b2.hand[0], z, b2.hand[2], b2.hand[3]]),
    ],
    discard: [f],
  });
  ingestReveals(st2);
  assert.equal(k1.beliefs.get("b2")![1], null);
});

ok("blind swap relocates beliefs for BOTH actor and target slots", () => {
  resetBotKnowledge();
  const a = card("3");
  const f = card("J");
  const b1 = mkPlayer("b1", [a, card("4"), card("5"), card("6")]);
  b1.knownToSelf[0] = true; // b1 peeked its own card at setup
  const b2 = mkPlayer("b2", [card("7"), f, card("8"), card("9")]);
  const st = mkState({
    players: [b1, b2],
    reveals: [{ playerId: "b2", index: 1, card: f, toPlayerIds: ["b1"], reason: "peek_other" }],
  });
  ingestReveals(st);

  // Blind swap b1[0] <-> b2[1]; engine clears knownToSelf on both slots.
  const st2 = mkState({
    players: [
      mkPlayer("b1", [f, b1.hand[1], b1.hand[2], b1.hand[3]]),
      mkPlayer("b2", [b2.hand[0], a, b2.hand[2], b2.hand[3]]),
    ],
  });
  ingestReveals(st2);
  const k1 = getOrInitKnowledge(st2, "b1");
  // The card b1 RECEIVED is one it had previously seen — it tracked the move.
  assert.equal(k1.beliefs.get("b1")![0]?.cardId, f.id);
  // ...and it watched its own known card land in b2's slot 1.
  assert.equal(k1.beliefs.get("b2")![1]?.cardId, a.id);
  // knownToSelf[0] is false, yet the relocated inference SURVIVES (the
  // self-truth pass must not wipe unknown-to-engine slots).
  assert.equal(st2.players[0].knownToSelf[0], false);
});

ok("discard-draw is public: the landed slot is written into EVERY bot's map", () => {
  resetBotKnowledge();
  const x = card("2");
  const b1 = mkPlayer("b1", [card("5"), card("6"), card("7"), card("8")]);
  const b2 = mkPlayer("b2", [card("9"), card("10"), card("J"), card("Q")]);
  const b3 = mkPlayer("b3", [card("A"), card("3"), card("4"), card("K")]);
  // Tick 1: b1 lifted x off the face-up discard pile.
  const st = mkState({
    players: [b1, b2, b3],
    currentPlayer: 0,
    phase: "turn_drawn",
    drawnCard: x,
    drawnFrom: "discard",
  });
  ingestReveals(st);
  // Tick 2: forced swap put x at b1[2].
  const b1b = mkPlayer("b1", [b1.hand[0], b1.hand[1], x, b1.hand[3]]);
  b1b.knownToSelf[2] = true;
  const st2 = mkState({ players: [b1b, mkPlayer("b2", b2.hand), mkPlayer("b3", b3.hand)] });
  ingestReveals(st2);
  for (const watcher of ["b2", "b3"]) {
    const k = getOrInitKnowledge(st2, watcher);
    assert.equal(k.beliefs.get("b1")![2]?.cardId, x.id, `watcher ${watcher}`);
  }
});

ok("no belief resurrection: a card lost to the pile returns face-down unknown", () => {
  resetBotKnowledge();
  const f = card("10");
  const b1 = mkPlayer("b1", [card("A"), card("2"), card("3"), card("4")]);
  const b2 = mkPlayer("b2", [f, card("5"), card("6"), card("7")]);
  const st = mkState({
    players: [b1, b2],
    reveals: [{ playerId: "b2", index: 0, card: f, toPlayerIds: ["b1"], reason: "peek_other" }],
  });
  ingestReveals(st);
  const k1 = getOrInitKnowledge(st, "b1");
  assert.equal(k1.beliefs.get("b2")![0]?.cardId, f.id);

  // Tick 2: f left b2's hand (discarded, later reshuffled into the deck).
  const y = card("8");
  const st2 = mkState({
    players: [mkPlayer("b1", b1.hand), mkPlayer("b2", [y, card("5"), card("6"), card("7")])],
    discard: [f],
  });
  ingestReveals(st2);
  assert.equal(k1.beliefs.get("b2")![0], null);

  // Tick 3: f comes back FACE-DOWN from the reshuffled deck into b2[3].
  const st3 = mkState({
    players: [mkPlayer("b1", b1.hand), mkPlayer("b2", [y, card("5"), card("6"), f])],
  });
  ingestReveals(st3);
  assert.equal(k1.beliefs.get("b2")![3], null, "belief must not resurrect");
});

console.log("— botBrain: shouldCallCaboBob —");

ok("fully-known 3 vs rival estimated 10 → call", () => {
  const me = mkPlayer("me", [card("A"), card("2"), card("Joker"), null]);
  const r5a = card("5");
  const r5b = card("5", "H");
  const rival = mkPlayer("r", [r5a, r5b, null, null]);
  const k = knowledgeOf({
    me: [belief(me.hand[0]!), belief(me.hand[1]!), belief(me.hand[2]!), null],
    r: [belief(r5a), belief(r5b), null, null],
  });
  const st = mkState({ players: [me, rival] });
  assert.equal(shouldCallCaboBob(st, me, k, 6), true);
});

ok("two own unknowns with a close race → hold", () => {
  const me = mkPlayer("me", [card("A"), card("A", "H"), card("4"), card("6")]);
  const r7a = card("7");
  const r7b = card("7", "H");
  const rival = mkPlayer("r", [r7a, r7b, null, null]);
  const k = knowledgeOf({
    me: [belief(me.hand[0]!), belief(me.hand[1]!), null, null], // known 2, U=2
    r: [belief(r7a), belief(r7b), null, null], // rival known 14
  });
  const st = mkState({ players: [me, rival] });
  // selfNeutral = 2 + 2*6 = 14 vs rival est 14: no commanding margin → hold.
  assert.equal(shouldCallCaboBob(st, me, k, 6), false);
});

ok("unknown-heavy rival does not scare Bob off a commanding call", () => {
  // Bob: two known aces (sum 2) + two unknowns → selfNeutral 2 + 12 = 14.
  // Rival: one known 2 + three unknowns → est 2 + 18 = 20. Rush margin is
  // 2 + 2*U = 6, so 14 <= 20-6 = 14 → call (exact boundary, deliberately).
  // (Regression guard: the old double-pessimism rule held here forever.)
  const me = mkPlayer("me", [card("A"), card("A", "H"), card("4"), card("6")]);
  const r2 = card("2");
  const rival = mkPlayer("r", [r2, card("9"), card("9", "H"), card("9", "D")]);
  const k = knowledgeOf({
    me: [belief(me.hand[0]!), belief(me.hand[1]!), null, null],
    r: [belief(r2), null, null, null],
  });
  const st = mkState({ players: [me, rival] });
  assert.equal(shouldCallCaboBob(st, me, k, 6), true);
});

ok("tie boundary: caller wins ties, so equal-at-worst calls; one over holds", () => {
  const mk = (myRank: Rank, theirRank: Rank) => {
    const mine = card(myRank);
    const theirs = card(theirRank, "H");
    const me = mkPlayer("me", [mine, null, null, null]);
    const rival = mkPlayer("r", [theirs, null, null, null]);
    const k = knowledgeOf({
      me: [belief(mine), null, null, null],
      r: [belief(theirs), null, null, null],
    });
    return shouldCallCaboBob(mkState({ players: [me, rival] }), me, k, 6);
  };
  assert.equal(mk("8", "8"), true);  // exact tie (caller wins ties) → call
  assert.equal(mk("9", "8"), false); // one over, no racing signal → hold
  assert.equal(mk("7", "6"), false); // rival FULLY KNOWN and lower: p(win)=0 → hold
  assert.equal(mk("8", "6"), false); // two over, no nudge applies → hold
});

ok("kamikaze-locked hand always calls", () => {
  const me = mkPlayer("me", [card("K"), card("K", "H"), card("Joker"), card("Joker", "H"), card("K", "D")]);
  const rival = mkPlayer("r", [card("A"), null, null, null, null]);
  const k = knowledgeOf({
    me: me.hand.map((c) => belief(c!, "evolved")), // all zeros in evolved
    r: [belief(card("A"), "evolved"), null, null, null, null],
  });
  const st = mkState({ variant: "evolved", players: [me, rival] });
  assert.equal(shouldCallCaboBob(st, me, k, 5.5), true);
});

ok("the <=7 nudge fires only against rivals with unknowns", () => {
  // Me: a fully-known 7. Rival: a known Joker (0) plus ONE occupied unknown
  // slot → est 0 + 6 = 6. One over the estimate, but the unknown can break
  // high and caller-wins-ties + the <=7 bonus pay for the risk → call.
  // (Contrast with mk("7","6") above: there the rival is fully known.)
  const mine = card("7");
  const rJoker = card("Joker");
  const me = mkPlayer("me", [mine, null, null, null]);
  const rival = mkPlayer("r", [rJoker, card("9"), null, null]);
  const k = knowledgeOf({
    me: [belief(mine), null, null, null],
    r: [belief(rJoker), null, null, null],
  });
  assert.equal(shouldCallCaboBob(mkState({ players: [me, rival] }), me, k, 6), true);
});

ok("someone already called → never calls", () => {
  const me = mkPlayer("me", [card("A"), null, null, null]);
  const rival = mkPlayer("r", [card("Q"), null, null, null]);
  const k = knowledgeOf({
    me: [belief(me.hand[0]!), null, null, null],
    r: [belief(rival.hand[0]!), null, null, null],
  });
  const st = mkState({ players: [me, rival], caboCallerId: "r" });
  assert.equal(shouldCallCaboBob(st, me, k, 6), false);
});

ok("deterministic: repeated evaluation of the same state agrees", () => {
  const me = mkPlayer("me", [card("A"), card("2"), card("3"), card("4")]);
  const rival = mkPlayer("r", [card("5"), card("6"), null, null]);
  const k = knowledgeOf({
    me: [belief(me.hand[0]!), belief(me.hand[1]!), null, null],
    r: [belief(rival.hand[0]!), null, null, null],
  });
  const st = mkState({ players: [me, rival] });
  const first = shouldCallCaboBob(st, me, k, 6.2);
  for (let i = 0; i < 10; i++) {
    assert.equal(shouldCallCaboBob(st, me, k, 6.2), first);
  }
});

console.log("— botBrain: chooseDragonRank —");

ok("Bob completes a near-Carré", () => {
  const sevens = [card("7", "S"), card("7", "H"), card("7", "D")];
  const me = mkPlayer("me", [...sevens, card("K"), card("2")]);
  const rival = mkPlayer("r", [card("A"), null, null, null, null]);
  const k = knowledgeOf({
    me: [...sevens.map((c) => belief(c, "evolved")), belief(me.hand[3]!, "evolved"), null],
    r: [belief(rival.hand[0]!, "evolved"), null, null, null, null],
  });
  const st = mkState({ variant: "evolved", players: [me, rival] });
  assert.equal(chooseDragonRank(st, me, k, "bob"), "7");
});

ok("Bob mints a K (zero) while hunting kamikaze", () => {
  const zeros = [card("K"), card("K", "H"), card("Joker"), card("Joker", "H")];
  const me = mkPlayer("me", [...zeros, card("9")]); // one blocking slot
  const rival = mkPlayer("r", [card("A"), null, null, null, null]);
  const k = knowledgeOf({
    me: [...zeros.map((c) => belief(c, "evolved")), null], // 4 zeros + 1 unknown → live
    r: [belief(rival.hand[0]!, "evolved"), null, null, null, null],
  });
  const st = mkState({ variant: "evolved", players: [me, rival] });
  assert.equal(chooseDragonRank(st, me, k, "bob"), "K");
});

ok("Bob conjures a 9 (double peek) when info-starved", () => {
  const me = mkPlayer("me", [card("2"), card("3"), card("4"), card("5"), card("6")]);
  const rival = mkPlayer("r", [card("A"), null, null, null, null]);
  const k = knowledgeOf({
    me: [belief(me.hand[0]!, "evolved"), belief(me.hand[1]!, "evolved"), belief(me.hand[2]!, "evolved"), null, null], // 2 own unknowns
    r: [belief(rival.hand[0]!, "evolved"), null, null, null, null],
  });
  const st = mkState({ variant: "evolved", players: [me, rival] });
  assert.equal(chooseDragonRank(st, me, k, "bob"), "9");
});

ok("Bob defaults to Joker; Marcy completes Carré else Joker; Billy always Joker", () => {
  const me = mkPlayer("me", [card("A"), card("2"), card("3"), card("4"), card("5")]);
  const rival = mkPlayer("r", [card("6"), null, null, null, null]);
  const fullK = knowledgeOf({
    me: me.hand.map((c) => belief(c!, "evolved")),
    r: [belief(rival.hand[0]!, "evolved"), null, null, null, null],
  });
  const st = mkState({ variant: "evolved", players: [me, rival] });
  assert.equal(chooseDragonRank(st, me, fullK, "bob"), "Joker");
  assert.equal(chooseDragonRank(st, me, fullK, "marcy"), "Joker");
  assert.equal(chooseDragonRank(st, me, fullK, "billy"), "Joker");

  const fours = [card("4", "S"), card("4", "H"), card("4", "D")];
  const me2 = mkPlayer("me", [...fours, card("9"), card("10")]);
  const k2 = knowledgeOf({
    me: [...fours.map((c) => belief(c, "evolved")), belief(me2.hand[3]!, "evolved"), belief(me2.hand[4]!, "evolved")],
    r: [belief(rival.hand[0]!, "evolved"), null, null, null, null],
  });
  const st2 = mkState({ variant: "evolved", players: [me2, rival] });
  assert.equal(chooseDragonRank(st2, me2, k2, "marcy"), "4");
  assert.equal(chooseDragonRank(st2, me2, k2, "billy"), "Joker");
});

console.log("— botBrain: findBotSnap (seeded) —");

ok("Bob refuses a rival-snap on a believed K in classic (EV inversion)", () => {
  resetBotKnowledge();
  const theirK = card("K");
  const human = mkPlayer("h", [theirK, card("2"), card("3"), card("4")], false);
  const bob = mkPlayer("bob1", [card("5"), card("6"), card("7"), card("8")]);
  const st = mkState({ players: [human, bob], discard: [card("K", "H")] });
  const k = getOrInitKnowledge(st, "bob1");
  k.beliefs.get("h")![0] = belief(theirK);
  const plan = findBotSnap(st, "bob", mulberry32(1));
  assert.equal(plan, null, "snapping a 13 would gift the rival a ~6.3 replacement");
});

ok("Bob rival-snaps a believed LOW match (picks the lowest v)", () => {
  resetBotKnowledge();
  const low1 = card("2");
  const low2 = card("2", "H");
  const human = mkPlayer("h", [low1, card("9"), low2, card("4")], false);
  const bob = mkPlayer("bob1", [card("5"), card("6"), card("7"), card("8")]);
  const st = mkState({ players: [human, bob], discard: [card("2", "D")] });
  const k = getOrInitKnowledge(st, "bob1");
  k.beliefs.get("h")![0] = belief(low1);
  k.beliefs.get("h")![2] = belief(low2);
  const plan = findBotSnap(st, "bob", mulberry32(2));
  assert.ok(plan, "expected a snap plan");
  assert.equal(plan!.kind, "other");
  assert.equal(plan!.targetId, "h");
  assert.equal(plan!.targetIndex, 0, "first lowest believed match");
});

ok("Bob self-snaps his highest believed match, preferring self over rival", () => {
  resetBotKnowledge();
  const nine1 = card("9");
  const nine2 = card("9", "H");
  const human = mkPlayer("h", [card("9", "D"), card("2"), card("3"), card("4")], false);
  const bob = mkPlayer("bob1", [card("5"), nine1, card("7"), nine2]);
  const st = mkState({ players: [human, bob], discard: [card("9", "C")] });
  const k = getOrInitKnowledge(st, "bob1");
  k.beliefs.get("bob1")![1] = belief(nine1);
  k.beliefs.get("bob1")![3] = belief(nine2);
  k.beliefs.get("h")![0] = belief(human.hand[0]!);
  const plan = findBotSnap(st, "bob", mulberry32(3));
  assert.ok(plan);
  assert.equal(plan!.kind, "self");
  assert.equal(plan!.targetIndex, 1, "highest (first of equals) own match");
});

ok("Bob skips a zero self-snap without bonus progress, takes it with", () => {
  resetBotKnowledge();
  const myK = card("K");
  const human = mkPlayer("h", [card("2"), card("3"), card("4"), card("5"), card("6")], false);
  const bob = mkPlayer("bob1", [myK, card("7"), card("8"), card("9"), card("10")]);
  const st = mkState({ variant: "evolved", players: [human, bob], discard: [card("K", "H")] });
  const k = getOrInitKnowledge(st, "bob1");
  k.beliefs.get("bob1")![0] = belief(myK, "evolved"); // score 0 in evolved
  assert.equal(findBotSnap(st, "bob", mulberry32(4)), null, "zero flush wastes the budget");

  bob.snapsCorrect.other = true; // rival half landed → −10 bonus chase
  const plan = findBotSnap(st, "bob", mulberry32(4));
  assert.ok(plan);
  assert.equal(plan!.kind, "self");
  assert.equal(plan!.targetIndex, 0);
});

ok("two-bot race: per-bot reaction rolls, min delay wins", () => {
  resetBotKnowledge();
  const top = card("6", "C");
  const h0 = card("6");
  const h1 = card("6", "H");
  const human = mkPlayer("h", [h0, h1, card("3"), card("4")], false);
  const m1 = mkPlayer("m1", [card("7"), card("8"), card("9"), card("10")]);
  const m2 = mkPlayer("m2", [card("J"), card("Q"), card("K"), card("A")]);
  const st = mkState({ players: [human, m1, m2], discard: [top] });
  getOrInitKnowledge(st, "m1").beliefs.get("h")![0] = belief(h0);
  getOrInitKnowledge(st, "m2").beliefs.get("h")![1] = belief(h1);

  const seed = 7;
  const plan = findBotSnap(st, "marcy", mulberry32(seed));
  // Replicate the per-bot rolls in bot order (m1, then m2).
  const replay = mulberry32(seed);
  const d1 = 900 + Math.floor(replay() * 500);
  const d2 = 900 + Math.floor(replay() * 500);
  assert.ok(plan);
  assert.equal(plan!.delayMs, Math.min(d1, d2));
  assert.equal(plan!.botId, d1 <= d2 ? "m1" : "m2");
  assert.notEqual(d1, d2, "seed must produce distinct rolls for a meaningful race");
});

console.log("— botBrain: suggestBotDelayMs —");

ok("billy / marcy / bob phase-band ranges", () => {
  const me = mkPlayer("me", [card("5"), card("6"), card("7"), card("8")]);
  const rival = mkPlayer("r", [card("A"), card("2"), card("3"), card("4")], false);
  const turnStart = mkState({ players: [me, rival], currentPlayer: 0 });
  const rng = mulberry32(11);
  for (let i = 0; i < 100; i++) {
    const billy = suggestBotDelayMs(turnStart, "billy", rng);
    assert.ok(billy >= 400 && billy <= 2800, `billy=${billy}`);
    const marcy = suggestBotDelayMs(turnStart, "marcy", rng); // no beliefs → no cabo call
    assert.ok(marcy >= 1100 && marcy <= 1500, `marcy=${marcy}`);
  }
  const dragonDrawn = mkState({
    variant: "evolved",
    players: [me, rival],
    currentPlayer: 0,
    phase: "turn_drawn",
    drawnCard: { id: "Dragon1", rank: "Dragon", suit: "S" },
    drawnFrom: "deck",
  });
  for (let i = 0; i < 100; i++) {
    const bob = suggestBotDelayMs(dragonDrawn, "bob", rng);
    assert.ok(bob >= 2000 && bob <= 3000, `bob dragon=${bob}`);
  }
});

ok("500+ live states across seeded games stay within [400, 3600]", () => {
  let checks = 0;
  for (let seed = 1; seed <= 60; seed++) {
    resetBotKnowledge();
    const rng = mulberry32(seed * 1009);
    let st = newGame({
      players: [
        { id: "p0", name: "p0", isBot: true },
        { id: "p1", name: "p1", isBot: true },
        { id: "p2", name: "p2", isBot: true },
      ],
      variant: seed % 2 === 0 ? "evolved" : "classic",
      seed,
    });
    st = startPlay(st);
    ingestReveals(st);
    for (let step = 0; step < 12 && st.phase !== "round_over"; step++) {
      for (const d of ["billy", "marcy", "bob"] as const) {
        const v = suggestBotDelayMs(st, d, rng);
        assert.ok(v >= 400 && v <= 3600, `seed=${seed} step=${step} d=${d} v=${v}`);
        checks += 1;
      }
      st = decideBotMove(st, { difficulty: "marcy", rng });
      ingestReveals(st);
      st = clearReveals(st);
    }
  }
  assert.ok(checks >= 500, `only ${checks} checks`);
});

console.log("— botBrain: cross-game knowledge isolation —");

ok("resetBotKnowledge wipes a finished game's round-end intel before a new game", () => {
  resetBotKnowledge();
  // Engine card ids are rank-encoding and STABLE across games ("5S", "JokerR1")
  // and SP player ids are stable too — exactly the real menu→game→menu→game
  // flow. Same roster, two different deals.
  const roster = [
    { id: "p_human", name: "you", isBot: false },
    { id: "p_bot1", name: "bot1", isBot: true },
    { id: "p_bot2", name: "bot2", isBot: true },
  ];
  let g1 = newGame({ players: roster, variant: "classic", seed: 1234 });
  g1 = startPlay(g1);
  // Game 1 ends: round_over reveals EVERY hand to EVERY player (round_end
  // reveals, exactly as endRound() pushes them).
  const allIds = g1.players.map((p) => p.id);
  g1 = {
    ...g1,
    phase: "round_over",
    reveals: g1.players.flatMap((p) =>
      p.hand.map((c, i) => ({
        playerId: p.id, index: i, card: c!, toPlayerIds: allIds,
        reason: "round_end" as const,
      })),
    ),
  };
  ingestReveals(g1);
  // Sanity: the bots absorbed the full-table reveal (incl. the human's hand).
  const kDirty = getOrInitKnowledge(g1, "p_bot1");
  g1.players[0].hand.forEach((c, i) => {
    assert.equal(kDirty.beliefs.get("p_human")![i]?.cardId, c!.id);
  });

  // THE FIX: a new game must start from zero knowledge.
  resetBotKnowledge();

  // Game 2: fresh deal, SAME card-id space + SAME player ids. Without the
  // reset, ingestReveals' Pass-1 id-relocation would re-anchor game 1's
  // round-end beliefs onto these freshly dealt face-down hands.
  let g2 = newGame({ players: roster, variant: "classic", seed: 5678 });
  g2 = startPlay(g2);
  ingestReveals(g2);
  for (const bot of g2.players.filter((p) => p.isBot)) {
    const k = getOrInitKnowledge(g2, bot.id);
    for (const p of g2.players) {
      const arr = k.beliefs.get(p.id)!;
      p.hand.forEach((card, i) => {
        if (!card) return;
        // The bot's own setup-peeked slots are legitimate knowledge.
        if (p.id === bot.id && p.knownToSelf[i]) return;
        assert.equal(
          arr[i], null,
          `bot ${bot.id} must have NO belief about ${p.id}[${i}] in a fresh game`,
        );
      });
    }
  }
});

resetBotKnowledge();
console.log(`botBrain tests passed (${pass} checks)`);
