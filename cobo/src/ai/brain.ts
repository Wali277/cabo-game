// =============================================================================
// brain.ts — the bots' ENTIRE decision core, as a pure headless module.
//
// Import policy (enforced by the headless self-play tests): this file may
// import ONLY the engine (../engine/*) and TYPES from ./bots. No store, no
// audio, no React — side effects (speech, store reads) are injected through
// BotMoveCtx by the thin adapter in ./bot.ts.
//
// HONESTY CONSTRAINT (absolute): bots act only on legitimately obtained
// information —
//   • their own knownToSelf cards,
//   • reveals addressed to them (state.reveals.toPlayerIds),
//   • cards from swaps they participated in,
//   • the public discard pile and public events,
//   • card-ID identity tracking (watching face-down cards MOVE — anyone at
//     a real table can follow a card with their eyes).
// Nothing in this module may read the rank/suit of an unrevealed card.
// =============================================================================

import { actionOf, cardScore } from "../engine/deck";
import {
  activateDragon as engineActivateDragon,
  actionBlindSwap,
  actionChoosePeek,
  actionPeekAndSwapDecide,
  actionPeekAndSwapPick,
  actionPeekOther,
  actionPeekOwn,
  actionSnapOther,
  actionSnapSelf,
  actionStartSnapOther,
  actionStartSnapSelf,
  callCabo,
  discardDrawnSkipAction,
  discardDrawnWithAction,
  dragonChooseRank as engineDragonChooseRank,
  drawFromDeck,
  drawFromDiscard,
  swapDrawnWithHand,
  triggerPendingAction,
} from "../engine/game";
import type { GameState, PlayerState, Rank } from "../engine/types";
import type { BotDifficulty, ChatMoment } from "./bots";

// ────────────────────────────────────────────────────────────────────────────
// Belief model
// ────────────────────────────────────────────────────────────────────────────

/** What a bot believes sits at one hand slot. `cardId` is the PHYSICAL
 *  identity anchor: beliefs survive only while the same physical card sits
 *  in (or visibly moves to) a slot. The reconciliation pass in
 *  ingestReveals() relocates / invalidates beliefs purely by card id. */
export interface BotCardBelief {
  cardId: string;
  rank: Rank;
  suit: string;
  score: number;
}

/** Per-bot in-memory belief tracker: what the bot *thinks* is in each
 *  player's hand. Populated by ingestReveals(); consumed by decision code. */
export interface BotKnowledge {
  beliefs: Map<string, (BotCardBelief | null)[]>;
}

const KNOWLEDGE: Map<string, BotKnowledge> = new Map();

/** Public discard-draw tracking: when ANY player takes the face-up top of
 *  the discard pile, the whole table saw that card. Everyone is entitled to
 *  remember it and watch which slot it lands in. Module-global because the
 *  information is public — it feeds EVERY bot's belief map. */
let publicDrawn: { cardId: string; rank: Rank; suit: string } | null = null;

export function getOrInitKnowledge(state: GameState, botId: string): BotKnowledge {
  let k = KNOWLEDGE.get(botId);
  if (!k) {
    k = { beliefs: new Map() };
    KNOWLEDGE.set(botId, k);
  }
  for (const p of state.players) {
    if (!k.beliefs.has(p.id)) {
      k.beliefs.set(p.id, p.hand.map(() => null));
    } else {
      const arr = k.beliefs.get(p.id)!;
      while (arr.length < p.hand.length) arr.push(null);
      while (arr.length > p.hand.length) arr.pop();
    }
  }
  return k;
}

export function resetBotKnowledge() {
  KNOWLEDGE.clear();
  publicDrawn = null;
}

/**
 * Reconcile every bot's beliefs against the latest engine state. Called on
 * EVERY state transition (the Table effect deps on [game]) so no intermediate
 * state is missed. Ordered passes per bot:
 *
 *  Pass 0 — getOrInitKnowledge pads/truncates belief arrays to hand sizes.
 *  Pass 1 — identity reconciliation: a belief stays only where its physical
 *           card id still sits; if that card visibly MOVED to another slot
 *           (blind swap, peek-and-swap, snap replacement...) the belief
 *           RELOCATES with it; if the card left all hands, the belief dies.
 *           This implements the full swap/replacement transfer matrix by
 *           identity alone — no hidden ranks are ever read.
 *  Pass 2 — self ground truth: slots the bot can see (knownToSelf) snap to
 *           the actual card. Slots it CANNOT see are left alone, so a
 *           relocated inference (e.g. a card it received in a blind swap
 *           that it had previously seen) survives.
 *  Pass 3 — reveals addressed to this bot.
 *  Pass 4 — public discard-draw tracking (see publicDrawn).
 */
export function ingestReveals(state: GameState) {
  for (const bot of state.players.filter((p) => p.isBot)) {
    const k = getOrInitKnowledge(state, bot.id);

    // Pass 1 — identity-anchored reconciliation across ALL tracked hands.
    const oldById = new Map<string, BotCardBelief>();
    for (const arr of k.beliefs.values()) {
      for (const b of arr) if (b) oldById.set(b.cardId, b);
    }
    for (const p of state.players) {
      const arr = k.beliefs.get(p.id)!;
      p.hand.forEach((card, i) => {
        if (!card) {
          arr[i] = null; // empty slot — nothing to believe about
          return;
        }
        const cur = arr[i];
        if (cur && cur.cardId === card.id) return; // belief still anchored here
        // Different physical card now sits here: relocate the belief that
        // tracked THIS card id (we watched it move), else admit ignorance.
        arr[i] = oldById.get(card.id) ?? null;
      });
    }

    // Pass 2 — self ground truth. knownToSelf is the engine's source of
    // truth for "what THIS bot can currently see in its own hand". Do NOT
    // null unknown own slots: relocated inferences must survive.
    const self = state.players.find((p) => p.id === bot.id)!;
    const selfArr = k.beliefs.get(bot.id)!;
    self.knownToSelf.forEach((known, i) => {
      const card = self.hand[i];
      if (!known || !card) return;
      const cur = selfArr[i];
      if (!cur || cur.cardId !== card.id) {
        selfArr[i] = {
          cardId: card.id,
          rank: card.rank,
          suit: card.suit,
          score: cardScore(card, state.variant),
        };
      }
    });

    // Pass 3 — reveals addressed to this bot.
    for (const r of state.reveals) {
      if (!r.toPlayerIds.includes(bot.id)) continue;
      const oppArr = k.beliefs.get(r.playerId);
      if (!oppArr) continue;
      oppArr[r.index] = {
        cardId: r.card.id,
        rank: r.card.rank,
        suit: r.card.suit,
        score: cardScore(r.card, state.variant),
      };
    }
  }

  // Pass 4 — public discard-draw tracking. A card taken from the discard
  // pile sat FACE-UP: every player at the table saw it. Remember it while
  // it's in the drawer's hand-limbo, then once it lands in a slot, write
  // that belief into EVERY bot's map (it's public knowledge).
  if (state.drawnCard && state.drawnFrom === "discard") {
    publicDrawn = {
      cardId: state.drawnCard.id,
      rank: state.drawnCard.rank,
      suit: state.drawnCard.suit,
    };
  } else if (publicDrawn) {
    let matched = false;
    for (const p of state.players) {
      for (let i = 0; i < p.hand.length; i++) {
        if (p.hand[i]?.id !== publicDrawn.cardId) continue;
        const score = cardScore(p.hand[i]!, state.variant);
        for (const bot of state.players.filter((b) => b.isBot)) {
          const arr = KNOWLEDGE.get(bot.id)?.beliefs.get(p.id);
          if (arr && i < arr.length) {
            arr[i] = {
              cardId: publicDrawn.cardId,
              rank: publicDrawn.rank,
              suit: publicDrawn.suit,
              score,
            };
          }
        }
        matched = true;
        break;
      }
      if (matched) break;
    }
    if (matched) publicDrawn = null;
    else if (!state.drawnCard) publicDrawn = null; // defensive: card vanished (round end etc.)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Belief helpers
// ────────────────────────────────────────────────────────────────────────────

function highestKnownOwnIndex(bot: PlayerState, k: BotKnowledge): { idx: number; score: number } | null {
  const arr = k.beliefs.get(bot.id)!;
  let best: { idx: number; score: number } | null = null;
  arr.forEach((b, i) => {
    if (b && (best === null || b.score > best.score)) {
      best = { idx: i, score: b.score };
    }
  });
  return best;
}

function unknownOwnIndex(bot: PlayerState, k: BotKnowledge): number | null {
  const arr = k.beliefs.get(bot.id)!;
  // Only slots that actually HOLD a card. An EMPTY slot (left by a correct
  // self-snap) also has a null belief, but it is never a useful "unknown":
  // giving it away in a blind swap is illegal, and swapping a drawn card
  // INTO it would ADD points the bot wasn't carrying.
  for (let i = 0; i < arr.length; i++) if (!arr[i] && bot.hand[i]) return i;
  return null;
}

/** First slot in `p`'s hand that holds a card (fallback target picker —
 *  index 0 may be an empty slot after a self-snap). */
function firstCardIndex(p: PlayerState): number {
  const idx = p.hand.findIndex((c) => c !== null);
  return idx >= 0 ? idx : 0;
}

/** Random OCCUPIED slot in `p`'s hand (Billy's random targeting must not
 *  pick an empty slot — the engine rejects it and the move would no-op). */
function randomCardIndex(p: PlayerState, rng: () => number): number {
  const occupied: number[] = [];
  p.hand.forEach((c, i) => {
    if (c) occupied.push(i);
  });
  if (occupied.length === 0) return 0;
  return occupied[Math.floor(rng() * occupied.length)];
}

/** Cabo Evolved: a rank the bot KNOWS it holds exactly three non-zero copies
 *  of — i.e. a Carré (four of a kind) is one matching card away. */
function nearCarreRank(bot: PlayerState, k: BotKnowledge): Rank | null {
  const arr = k.beliefs.get(bot.id)!;
  const counts = new Map<Rank, number>();
  arr.forEach((b) => {
    if (b && b.score > 0) counts.set(b.rank, (counts.get(b.rank) ?? 0) + 1);
  });
  for (const [rank, n] of counts) if (n === 3) return rank;
  return null;
}

/** The own slot to displace when completing a Carré of `rank`: the highest
 *  KNOWN non-matching card (so the surviving 5th card is as low as possible),
 *  else any unknown slot. Never displaces a matching slot. */
function carreDisplaceSlot(bot: PlayerState, k: BotKnowledge, rank: Rank): number | null {
  const arr = k.beliefs.get(bot.id)!;
  let bestKnownIdx: number | null = null;
  let bestKnownScore = -Infinity;
  let unknownIdx: number | null = null;
  arr.forEach((b, i) => {
    if (b) {
      if (b.rank !== rank && b.score > bestKnownScore) {
        bestKnownScore = b.score;
        bestKnownIdx = i;
      }
    } else if (unknownIdx === null && bot.hand[i]) {
      unknownIdx = i;
    }
  });
  return bestKnownIdx !== null ? bestKnownIdx : unknownIdx;
}

/** The full deck is 56 cards: A–K in four suits (52) plus four Jokers.
 *  Classic values sum to 364 → mean 6.5 per card. Cabo Evolved zeroes the
 *  Kings (−52) → 312 → mean ≈5.57. (The two Evolved Dragons live OUTSIDE
 *  this base pool and are excluded from counting — see unseenEv.)
 *  Marcy/Billy use the static estimates below (6 classic / 5.5 evolved,
 *  slightly conservative — they'd rather under-call LUMO than over-call).
 *  Bob replaces the static value with live card counting (unseenEv). */
const UNKNOWN_ESTIMATE = 6;

function knownCountAndSum(bot: PlayerState, k: BotKnowledge): { count: number; sum: number } {
  const arr = k.beliefs.get(bot.id)!;
  let count = 0;
  let sum = 0;
  arr.forEach((b) => { if (b) { count += 1; sum += b.score; } });
  return { count, sum };
}

function bestKnownOpponentIndex(
  state: GameState,
  bot: PlayerState,
  k: BotKnowledge,
): { playerId: string; idx: number; score: number } | null {
  let best: { playerId: string; idx: number; score: number } | null = null;
  for (const p of state.players) {
    if (p.id === bot.id) continue;
    const arr = k.beliefs.get(p.id);
    if (!arr) continue;
    arr.forEach((b, i) => {
      if (b && (best === null || b.score < best.score)) {
        best = { playerId: p.id, idx: i, score: b.score };
      }
    });
  }
  return best;
}

function unknownOpponentIndex(
  state: GameState,
  bot: PlayerState,
  k: BotKnowledge,
): { playerId: string; idx: number } | null {
  for (const p of state.players) {
    if (p.id === bot.id) continue;
    const arr = k.beliefs.get(p.id);
    if (!arr) continue;
    // Occupied slots only — empty slots are not legal peek/swap targets.
    for (let i = 0; i < arr.length; i++) if (!arr[i] && p.hand[i]) return { playerId: p.id, idx: i };
  }
  return null;
}

/** Indices in the human's hand the human has "peeked" (knownToSelf). This
 *  reads the knownToSelf FLAGS only — never the cards behind them. The flags
 *  are legitimate information: every peek/draw/swap that sets one is a
 *  PUBLICLY OBSERVABLE event at the table ("she looked at her second card"),
 *  so a real opponent could track exactly the same thing. Bob uses it as a
 *  proxy for "cards the human is keeping intentionally", which is what makes
 *  him feel like he reads you. */
function humanLikelyKnownIndices(state: GameState): { playerId: string; indices: number[] } | null {
  const human = state.players.find((p) => !p.isBot);
  if (!human) return null;
  const indices: number[] = [];
  human.knownToSelf.forEach((known, i) => {
    if (known && human.hand[i]) indices.push(i);
  });
  if (indices.length === 0) return null;
  return { playerId: human.id, indices };
}

function juicyCard(rank: string): boolean {
  return rank === "J" || rank === "Q" || rank === "K" || rank === "Joker";
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// ────────────────────────────────────────────────────────────────────────────
// Card counting (Bob)
// ────────────────────────────────────────────────────────────────────────────

const BASE_COUNT = 56;

/** Expected value of one UNSEEN base-pool card, from this bot's point of
 *  view. "Seen" cards (all legitimately observed):
 *   • everything in the public discard pile,
 *   • every non-null belief this bot holds (own knowns, reveals, tracked
 *     swaps, public discard-draws),
 *   • the in-flight drawn card when it's public (taken from discard) or
 *     when this bot itself drew it.
 *  Dragons and Dragon-conjured extras (id "dx…") sit OUTSIDE the 56-card
 *  base pool and are skipped entirely. Result clamped to [0, 13]. */
export function unseenEv(state: GameState, k: BotKnowledge, botId: string): number {
  const baseSum = state.variant === "evolved" ? 312 : 364;
  const seenIds = new Set<string>();
  let seenSum = 0;
  let seenCount = 0;
  const see = (id: string, rank: Rank, score: number) => {
    if (rank === "Dragon" || id.startsWith("dx")) return; // outside base pool
    if (seenIds.has(id)) return;
    seenIds.add(id);
    seenCount += 1;
    seenSum += score;
  };
  for (const c of state.discard) see(c.id, c.rank, cardScore(c, state.variant));
  for (const arr of k.beliefs.values()) {
    for (const b of arr) if (b) see(b.cardId, b.rank, b.score);
  }
  if (state.drawnCard) {
    const drawerIsSelf = state.players[state.currentPlayer]?.id === botId;
    if (state.drawnFrom === "discard" || drawerIsSelf) {
      see(state.drawnCard.id, state.drawnCard.rank, cardScore(state.drawnCard, state.variant));
    }
  }
  const ev = (baseSum - seenSum) / Math.max(1, BASE_COUNT - seenCount);
  return clampNum(ev, 0, 13);
}

/** Per-difficulty estimate of an unknown card's value. Bob counts cards;
 *  Marcy and Billy keep the frozen static estimates. */
export function unknownEstimate(
  state: GameState,
  k: BotKnowledge,
  botId: string,
  difficulty: BotDifficulty,
): number {
  if (difficulty === "bob") return unseenEv(state, k, botId);
  return state.variant === "evolved" ? 5.5 : UNKNOWN_ESTIMATE;
}

// ────────────────────────────────────────────────────────────────────────────
// Opponent estimation (Bob)
// ────────────────────────────────────────────────────────────────────────────

export interface HandEstimate {
  playerId: string;
  knownSum: number;
  unknownSlots: number;
  est: number;
}

/** Estimate every player's hand total: sum of believed scores plus
 *  unknownSlots × ev. Empty (null) slots count 0 — they are NOT unknowns. */
export function estimateHands(state: GameState, k: BotKnowledge, ev: number): HandEstimate[] {
  return state.players.map((p) => {
    const arr = k.beliefs.get(p.id);
    let knownSum = 0;
    let unknownSlots = 0;
    p.hand.forEach((card, i) => {
      if (!card) return;
      const b = arr?.[i];
      if (b) knownSum += b.score;
      else unknownSlots += 1;
    });
    return { playerId: p.id, knownSum, unknownSlots, est: knownSum + unknownSlots * ev };
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Kamikaze tracking (Cabo Evolved)
// ────────────────────────────────────────────────────────────────────────────

export type KamikazeStatus =
  | { state: "locked" }
  | { state: "live"; blockingIdx: number }
  | { state: "off" };

/** Where this bot stands on an all-zero (Kamikaze) hand, judged purely from
 *  its own beliefs. "locked": every non-empty slot is a believed zero.
 *  "live": all believed zeros except exactly ONE blocking slot (unknown, or
 *  known non-zero). Anything else: "off". */
export function kamikazeStatus(bot: PlayerState, k: BotKnowledge): KamikazeStatus {
  const arr = k.beliefs.get(bot.id);
  if (!arr) return { state: "off" };
  const blocking: number[] = [];
  bot.hand.forEach((card, i) => {
    if (!card) return; // empty slot contributes 0
    const b = arr[i];
    if (b && b.score === 0) return; // known zero
    blocking.push(i); // unknown OR known non-zero
  });
  if (blocking.length === 0) return { state: "locked" };
  if (blocking.length === 1) return { state: "live", blockingIdx: blocking[0] };
  return { state: "off" };
}

// ────────────────────────────────────────────────────────────────────────────
// Human collection tracking (Bob)
// ────────────────────────────────────────────────────────────────────────────

/** Is the human visibly collecting a rank? Two or more BELIEVED same-rank
 *  human cards, each worth ≥5 — likely a Carré build (Evolved) or a snap
 *  chain. Beliefs only (reveals/tracked moves) — fully legitimate info. */
export function humanCollectedRank(
  state: GameState,
  k: BotKnowledge,
): { playerId: string; rank: Rank; indices: number[]; score: number } | null {
  const human = state.players.find((p) => !p.isBot);
  if (!human) return null;
  const arr = k.beliefs.get(human.id);
  if (!arr) return null;
  const byRank = new Map<Rank, { indices: number[]; score: number }>();
  arr.forEach((b, i) => {
    if (!b || b.score < 5) return;
    if (!human.hand[i]) return;
    const entry = byRank.get(b.rank) ?? { indices: [], score: b.score };
    entry.indices.push(i);
    byRank.set(b.rank, entry);
  });
  for (const [rank, entry] of byRank) {
    if (entry.indices.length >= 2) {
      return { playerId: human.id, rank, indices: entry.indices, score: entry.score };
    }
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Cabo-call decisions
// ────────────────────────────────────────────────────────────────────────────

/** Should Marcy or Billy call Cabo this turn? (Bob has his own card-counting
 *  call — shouldCallCaboBob.) The decision is based on KNOWN cards
 *  (confidence) plus the room around the unknowns. */
export function shouldCallCaboBasic(
  state: GameState,
  bot: PlayerState,
  k: BotKnowledge,
  difficulty: BotDifficulty,
  rng: () => number = Math.random,
): boolean {
  if (state.caboCallerId) return false;
  const handLen = bot.hand.length;
  const { count, sum } = knownCountAndSum(bot, k);
  const unknowns = handLen - count;
  // Evolved's deck averages lower (~5.5) than classic (~6.5) because K = 0,
  // so an unknown slot is worth a touch less when judging a Cabo call.
  const unkEst = state.variant === "evolved" ? 5.5 : UNKNOWN_ESTIMATE;
  const estimate = sum + unknowns * unkEst;
  // Worst case treats every unknown as a flat 10 — a DELIBERATE coarse proxy
  // (classic J/Q/K are 11/12/13 and exceed it) that's good enough for a
  // go/no-go gate without pretending to more precision than Marcy has.
  const worstCase = sum + unknowns * 10;

  if (difficulty === "billy") {
    // Billy is unpredictable: calls cabo at random points. Sometimes too
    // cautious (<=4), sometimes way too late (>10), sometimes never.
    if (estimate <= 3) return rng() < 0.5;
    if (estimate <= 8) return rng() < 0.08;
    if (estimate > 15) return rng() < 0.18;
    return false;
  }

  // Marcy — confident play; needs to know most of her hand and have it low.
  if (count === handLen && sum <= 12) return true;
  if (count >= 3 && sum <= 8) return true;
  if (count >= 2 && sum <= 4 && worstCase <= 24) return true;
  return false;
}

/** Bob's Cabo call: card-counted, opponent-modelled, and DETERMINISTIC (no
 *  rng — the pacing layer dry-runs it to size his thinking pause, so two
 *  consecutive evaluations of the same state must agree). */
export function shouldCallCaboBob(
  state: GameState,
  bot: PlayerState,
  k: BotKnowledge,
  ev: number,
): boolean {
  // (1) Someone already called — the race is over.
  if (state.caboCallerId) return false;
  // (2) A locked all-zero hand cannot be beaten, only tied — call it.
  if (kamikazeStatus(bot, k).state === "locked") return true;
  const ests = estimateHands(state, k, ev);
  const selfEst = ests.find((e) => e.playerId === bot.id);
  if (!selfEst) return false;
  const rivals = ests.filter((e) => e.playerId !== bot.id);
  if (rivals.length === 0) return false;
  const U = selfEst.unknownSlots;
  const knownSum = selfEst.knownSum;
  // (3) Neutral expectations on BOTH sides. The first version priced own
  //     unknowns hot and rival unknowns cold; that double pessimism meant
  //     Bob essentially never called and rounds dragged to 2x their old
  //     length (2026-06-10 regression). Caller-wins-ties is already the
  //     caller's edge — neutral-vs-neutral with small margins is enough.
  const selfNeutral = knownSum + U * ev;
  const minRival = Math.min(...rivals.map((r) => r.est));
  // (4) Fully-known hand: call on at-worst-a-tie (caller wins ties), with a
  //     +1 nudge when the hand is genuinely low (the <=7 bonus pays for it).
  //     Never against a FULLY-KNOWN strictly-lower rival — that call is a
  //     guaranteed loss (p(win)=0, certain hand+5), nudge or not.
  const beatenByCertain = rivals.some((r) => r.unknownSlots === 0 && r.knownSum < knownSum);
  if (U === 0 && !beatenByCertain && knownSum <= minRival + (knownSum <= 7 ? 1 : 0)) return true;
  // (5) One unknown: call with any real expected margin.
  if (U === 1 && selfNeutral <= minRival - 1) return true;
  // (6) Two+ unknowns: a deliberate RUSH CALL — only on genuinely tiny
  //     knowns (two aces, ace+joker) with a margin that scales with the
  //     variance each unknown adds. Without the tight gate, every opening
  //     hand "beats" rivals' all-unknown estimates and Bob calls on turn 1.
  if (U >= 2 && knownSum <= 4 && selfNeutral <= minRival - (2 + 2 * U)) return true;
  // (7) Racing: the human visibly knows 3+ of their own held cards — every
  //     knownToSelf flag is set by a publicly observable event (setup taps,
  //     peeks, swap-ins), so this is honest table-reading, and it persists.
  //     (A reveal-count proxy would be permanently zero here: the Table
  //     clears transient reveals before any bot decision runs.)
  const human = state.players.find((p) => !p.isBot);
  const humanKnown = human
    ? human.knownToSelf.filter((f, i) => f && human.hand[i]).length
    : 0;
  if (humanKnown >= 3 && U <= 1 && selfNeutral <= minRival + 2) return true;
  return false;
}

function shouldCallCabo(
  state: GameState,
  bot: PlayerState,
  k: BotKnowledge,
  difficulty: BotDifficulty,
  ev: number,
  rng: () => number,
): boolean {
  if (difficulty === "bob") return shouldCallCaboBob(state, bot, k, ev);
  return shouldCallCaboBasic(state, bot, k, difficulty, rng);
}

// ────────────────────────────────────────────────────────────────────────────
// Difficulty-specific decision helpers
// ────────────────────────────────────────────────────────────────────────────

/** Pick a hand slot for the bot to swap a drawn-from-deck card into.
 *  The unknown threshold widens when we're in the post-cabo final lap —
 *  swapping into an unknown is a gamble on the unknown-card average, but
 *  in endgame even a marginal expected-value bet is worth it. */
function pickDeckSwapTarget(
  bot: PlayerState,
  k: BotKnowledge,
  state: GameState,
  drawnScore: number,
  difficulty: BotDifficulty,
  ev: number,
  rng: () => number,
): number | null {
  const highest = highestKnownOwnIndex(bot, k);
  const unknown = unknownOwnIndex(bot, k);
  const inEndgame = !!state.caboCallerId && state.caboCallerId !== bot.id;

  if (difficulty === "billy") {
    if (rng() < 0.35) return Math.floor(rng() * bot.hand.length);
    if (highest && drawnScore < highest.score) return highest.idx;
    if (unknown !== null && drawnScore <= 6) return unknown;
    return null;
  }

  if (highest && drawnScore < highest.score) return highest.idx;
  // Unknowns: swap if drawn is below the unknown estimate. Marcy uses the
  // frozen static caps (evolved runs ~1 lower because K = 0); Bob derives
  // his cap from the live count, loosening one extra point in endgame.
  const evo = state.variant === "evolved" ? 1 : 0;
  const marcyCap = (inEndgame ? 6 : 5) - evo;
  const bobCap = clampNum(Math.round(ev) + (inEndgame ? 1 : 0), 3, 8);
  const cap = difficulty === "bob" ? bobCap : marcyCap;
  if (unknown !== null && drawnScore <= cap) return unknown;
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Action card targeting
// ────────────────────────────────────────────────────────────────────────────

function chooseBlindSwap(
  state: GameState,
  bot: PlayerState,
  k: BotKnowledge,
  difficulty: BotDifficulty,
  rng: () => number,
) {
  const ownHi = highestKnownOwnIndex(bot, k);
  const ownUnknown = unknownOwnIndex(bot, k);

  if (difficulty === "billy") {
    // Billy: swap a random pair, no strategy.
    const other = state.players.find((p) => p.id !== bot.id)!;
    const randOwn = randomCardIndex(bot, rng);
    const randTheirs = randomCardIndex(other, rng);
    return { ownIdx: randOwn, targetId: other.id, targetIdx: randTheirs };
  }

  // Picking our slot to give away: ONLY surrender a known card if it's
  // genuinely high (>=6). A known Joker / Ace / low is worth keeping; in
  // that case, gamble an unknown slot instead. Falls back to ownHi as a
  // last resort if there are no unknowns either.
  let safeToGiveAwayKnown = !!ownHi && ownHi.score >= 6;
  let ownIdx = safeToGiveAwayKnown ? ownHi!.idx : (ownUnknown ?? ownHi?.idx ?? 0);

  // Bob: if the human is visibly collecting a rank (Carré build / snap
  // chain), NEVER hand them another card of it — re-pick our give-away.
  const collected = difficulty === "bob" ? humanCollectedRank(state, k) : null;
  if (collected) {
    const selfArr = k.beliefs.get(bot.id)!;
    const giving = selfArr[ownIdx];
    if (giving && giving.rank === collected.rank) {
      let next: { idx: number; score: number } | null = null;
      selfArr.forEach((b, i) => {
        if (b && b.rank !== collected.rank && b.score >= 6 && (next === null || b.score > next.score)) {
          next = { idx: i, score: b.score };
        }
      });
      if (next !== null) {
        ownIdx = (next as { idx: number; score: number }).idx;
        safeToGiveAwayKnown = true;
      } else if (ownUnknown !== null) {
        ownIdx = ownUnknown;
        safeToGiveAwayKnown = false;
      }
      // else: no alternative slot exists — unavoidable.
    }
  }

  if (difficulty === "bob") {
    // Break up the human's collection first: pulling one of the pair both
    // raises our intel and wrecks their Carré/snap setup.
    if (collected && safeToGiveAwayKnown) {
      return { ownIdx, targetId: collected.playerId, targetIdx: collected.indices[0] };
    }
    // Bob targets the HUMAN's likely-known cards (their setup peeks or
    // recently swapped slots — knownToSelf FLAGS only; see
    // humanLikelyKnownIndices for why that's legitimate). Putting our high
    // into a slot the human trusts is maximally disruptive — but only worth
    // it if we're actually offloading a high card.
    const likely = humanLikelyKnownIndices(state);
    if (likely && safeToGiveAwayKnown) {
      const targetIdx = likely.indices[Math.floor(rng() * likely.indices.length)];
      return { ownIdx, targetId: likely.playerId, targetIdx };
    }
  }

  // Marcy (and Bob fallback): swap our highest known for an opponent's
  // best-known low. If nothing known, swap into an unknown.
  const oppLow = bestKnownOpponentIndex(state, bot, k);
  if (oppLow && safeToGiveAwayKnown) {
    return { ownIdx, targetId: oppLow.playerId, targetIdx: oppLow.idx };
  }
  const unk = unknownOpponentIndex(state, bot, k);
  if (unk) return { ownIdx, targetId: unk.playerId, targetIdx: unk.idx };
  const other = state.players.find((p) => p.id !== bot.id)!;
  return { ownIdx, targetId: other.id, targetIdx: firstCardIndex(other) };
}

function choosePeekAndSwapPick(
  state: GameState,
  bot: PlayerState,
  k: BotKnowledge,
  difficulty: BotDifficulty,
  rng: () => number,
) {
  if (difficulty === "billy") {
    // Random target.
    const other = state.players.find((p) => p.id !== bot.id)!;
    return { playerId: other.id, idx: randomCardIndex(other, rng) };
  }
  if (difficulty === "bob") {
    // Human collecting a rank (classic too): inspect one of the pair first —
    // if it's high we can confiscate it on the swap decide.
    const collected = humanCollectedRank(state, k);
    if (collected) {
      return { playerId: collected.playerId, idx: collected.indices[0] };
    }
    // Bob peeks into the human's known cards first to inspect what the
    // human thinks is "safe". If they're high, swap; if low, leave.
    // (knownToSelf FLAGS only — publicly observable; see
    // humanLikelyKnownIndices.)
    const likely = humanLikelyKnownIndices(state);
    if (likely) {
      const idx = likely.indices[Math.floor(rng() * likely.indices.length)];
      return { playerId: likely.playerId, idx };
    }
  }
  const unk = unknownOpponentIndex(state, bot, k);
  if (unk) return { playerId: unk.playerId, idx: unk.idx };
  const oppLow = bestKnownOpponentIndex(state, bot, k);
  if (oppLow) return { playerId: oppLow.playerId, idx: oppLow.idx };
  const other = state.players.find((p) => p.id !== bot.id)!;
  return { playerId: other.id, idx: firstCardIndex(other) };
}

/** Cabo Evolved Dragon: pick the rank a bot's Dragon becomes.
 *  Bob, in priority order: complete a Carré he's three-quarters into; mint
 *  another zero (K) when an all-zero hand is live or locked; conjure a 9
 *  (peek own AND spy — Evolved's biggest info action) when info-starved;
 *  else a free zero (Joker — the follow-up turn dumps his highest card).
 *  Marcy: Carré completion, else Joker. Billy: always Joker. */
export function chooseDragonRank(
  state: GameState,
  bot: PlayerState,
  k: BotKnowledge,
  difficulty: BotDifficulty,
): Rank {
  if (difficulty === "billy") return "Joker";
  const carre = nearCarreRank(bot, k);
  // Marcy: deliberate small upgrade from always-Joker — completing a visible carré is textbook play (accepted by the rules review, 2026-06-10).
  if (difficulty === "marcy") return carre ?? "Joker";
  // Bob:
  if (carre) return carre;
  const kam = kamikazeStatus(bot, k);
  if (kam.state === "live" || kam.state === "locked") return "K";
  // Info-starved: two+ own unknowns, or no read on any rival card → the 9's
  // double peek (own + spy) is worth more than another zero.
  const selfArr = k.beliefs.get(bot.id)!;
  let ownUnknowns = 0;
  bot.hand.forEach((card, i) => {
    if (card && !selfArr[i]) ownUnknowns += 1;
  });
  let rivalKnown = 0;
  for (const p of state.players) {
    if (p.id === bot.id) continue;
    const arr = k.beliefs.get(p.id);
    if (!arr) continue;
    for (const b of arr) if (b) rivalKnown += 1;
  }
  if (ownUnknowns >= 2 || rivalKnown === 0) return "9";
  return "Joker";
}

// ────────────────────────────────────────────────────────────────────────────
// Entry point — one engine step for the current (bot) player
// ────────────────────────────────────────────────────────────────────────────

export interface BotMoveCtx {
  difficulty: BotDifficulty;
  training?: boolean;
  rng?: () => number;
  speak?: (playerId: string, moment: ChatMoment) => void;
}

export function decideBotMove(state: GameState, ctx: BotMoveCtx): GameState {
  const bot = state.players[state.currentPlayer];
  if (!bot.isBot) return state;

  // Training Chamber: draw from deck, discard immediately, nothing else.
  if (ctx.training) {
    if (state.phase === "turn_start") return drawFromDeck(state);
    if (state.phase === "turn_drawn") return discardDrawnSkipAction(state);
    return state;
  }

  const rng = ctx.rng ?? Math.random;
  const speak = ctx.speak ?? (() => {});
  const k = getOrInitKnowledge(state, bot.id);
  const difficulty = ctx.difficulty;
  const ev = unknownEstimate(state, k, bot.id, difficulty);

  // ── turn_start: draw or call cabo ───────────────────────────────────────
  if (state.phase === "turn_start") {
    if (shouldCallCabo(state, bot, k, difficulty, ev, rng)) {
      speak(bot.id, "callCabo");
      return callCabo(state);
    }
    const top = state.discard[state.discard.length - 1];
    const inEndgame = !!state.caboCallerId && state.caboCallerId !== bot.id;
    if (top) {
      const topScore = cardScore(top, state.variant);
      if (difficulty === "billy") {
        // Billy: draws from discard for bad reasons too.
        if (rng() < 0.3 && topScore <= 9) return drawFromDiscard(state);
      } else {
        // Bob + Evolved: one slot away from an all-zero (Kamikaze) hand and
        // a zero sits face-up on the pile — grab it; the forced swap below
        // sends it into the blocking slot.
        if (difficulty === "bob" && state.variant === "evolved" && topScore === 0) {
          if (kamikazeStatus(bot, k).state === "live") return drawFromDiscard(state);
        }
        const highest = highestKnownOwnIndex(bot, k);
        const unknown = unknownOwnIndex(bot, k);
        // A visible take must beat the EV of a deck draw, which also buys
        // information and action cards. With perfect recall the old
        // "top < highest known" rule degenerated into living off the pile
        // (2026-06-10 regression: ~47% take rate, Qs taken while holding K),
        // so takes are gated to premium cards or big guaranteed swings:
        const gain = highest ? highest.score - topScore : 0;
        // 1. A cheap card dropped into an unknown slot — clear expected
        //    profit vs the unknown's average. Bob prices it off his live
        //    count of what's left unseen; Marcy keeps her frozen 4.
        const fillCap =
          difficulty === "bob" ? clampNum(Math.round(ev) - 3, 2, 4) : 4;
        if (unknown !== null && topScore <= fillCap) {
          return drawFromDiscard(state);
        }
        // 2. A big guaranteed improvement of a known high card.
        if (highest && gain >= 5 && topScore <= 9) {
          return drawFromDiscard(state);
        }
        // 3. A premium low (A/2/zero) improving any known card at all.
        if (highest && topScore <= 2 && gain >= 1) {
          return drawFromDiscard(state);
        }
        // Endgame — grab anything cheap-ish to win the last comparison, but
        // only when there's a profitable destination (an unknown slot, or a
        // known card it actually beats) — a forced swap with no good target
        // is guaranteed self-harm.
        if (
          inEndgame &&
          topScore <= 4 &&
          (unknown !== null || (highest && highest.score > topScore))
        ) {
          return drawFromDiscard(state);
        }
      }
    }
    return drawFromDeck(state);
  }

  // ── turn_drawn: swap, discard with action, or discard ───────────────────
  if (state.phase === "turn_drawn" && state.drawnCard) {
    const drawn = state.drawnCard;
    const drawnScore = cardScore(drawn, state.variant);
    const drawnAction = actionOf(drawn, state.variant);

    // Juicy-card chat (face / action). 30% chance, gated by cooldown.
    if (juicyCard(drawn.rank) && rng() < 0.3) {
      speak(bot.id, "juicyDraw");
    }

    // Cabo Evolved Dragon: a deck-drawn Dragon must be ACTIVATED (it can't be
    // kept or discarded). A Dragon taken from the discard is dead — fall
    // through to the normal forced-swap path below.
    if (drawn.rank === "Dragon" && state.drawnFrom === "deck") {
      return engineActivateDragon(state);
    }

    if (state.drawnFrom === "discard") {
      // Drew from discard — engine forces a swap.
      // Bob + Evolved with a live Kamikaze: the whole point of the take was
      // to clear the one blocking slot.
      if (difficulty === "bob" && state.variant === "evolved") {
        const kam = kamikazeStatus(bot, k);
        if (kam.state === "live") return swapDrawnWithHand(state, kam.blockingIdx);
      }
      // Route by WHY we took it: replace a strictly-higher known card if one
      // exists; otherwise this was a fill-an-unknown take and the card must
      // land IN the unknown slot — dumping a known lower card instead would
      // pay points and hand rivals fresh intel (council review 2026-06-10).
      const highest = highestKnownOwnIndex(bot, k);
      const unknown = unknownOwnIndex(bot, k);
      let idx: number;
      if (highest && highest.score > drawnScore) idx = highest.idx;
      else if (unknown !== null) idx = unknown;
      else idx = highest ? highest.idx : firstCardIndex(bot);
      return swapDrawnWithHand(state, idx);
    }

    // Cabo Evolved: if this deck-drawn card completes a four-of-a-kind we
    // already hold three of, swap it in (displacing our highest non-matching
    // card) so the four count 0 — strong Carré points protection.
    if (state.variant === "evolved" && difficulty !== "billy") {
      const carreRank = nearCarreRank(bot, k);
      if (carreRank && drawn.rank === carreRank) {
        const slot = carreDisplaceSlot(bot, k, carreRank);
        if (slot !== null) return swapDrawnWithHand(state, slot);
      }
    }

    // Bob + Evolved: a deck-drawn ZERO while a Kamikaze is live locks the
    // all-zero hand — take it before any generic low-card logic runs.
    if (difficulty === "bob" && state.variant === "evolved" && drawnScore === 0) {
      const kam = kamikazeStatus(bot, k);
      if (kam.state === "live") return swapDrawnWithHand(state, kam.blockingIdx);
    }

    // Drawn from deck.
    if (difficulty === "billy" && rng() < 0.18) {
      // Billy occasionally throws away a perfectly good card.
      return discardDrawnSkipAction(state);
    }

    if (drawnScore <= 4) {
      const idx = pickDeckSwapTarget(bot, k, state, drawnScore, difficulty, ev, rng);
      if (idx !== null) return swapDrawnWithHand(state, idx);
      return discardDrawnSkipAction(state);
    }

    if (drawnAction) {
      const highest = highestKnownOwnIndex(bot, k);
      if (difficulty !== "billy" && highest) {
        // The card's action ability is gone the moment it lands in our
        // hand, so swapping it in trades information-for-points. With
        // perfect recall a 2-point bar meant Bob swallowed nearly every
        // action card he drew (2026-06-10 regression) — an action is worth
        // a real discount while there is still something to learn. In the
        // post-call endgame information is worthless: points are everything,
        // so the bar drops back down.
        const minSavings =
          difficulty === "bob" ? (state.caboCallerId ? 2 : 5) : 3;
        if (highest.score - drawnScore >= minSavings) {
          return swapDrawnWithHand(state, highest.idx);
        }
      }
      return discardDrawnWithAction(state);
    }

    const highest = highestKnownOwnIndex(bot, k);
    if (highest && drawnScore < highest.score) {
      return swapDrawnWithHand(state, highest.idx);
    }
    // Endgame gamble: swap into an unknown when the drawn card is at-or-below
    // the unknown's expected value (Marcy: frozen 6; Bob: live count).
    const inEndgame = !!state.caboCallerId && state.caboCallerId !== bot.id;
    if (inEndgame && difficulty !== "billy") {
      const unknown = unknownOwnIndex(bot, k);
      const gambleCap = difficulty === "bob" ? Math.round(ev) : 6;
      if (unknown !== null && drawnScore <= gambleCap) {
        return swapDrawnWithHand(state, unknown);
      }
    }
    return discardDrawnSkipAction(state);
  }

  if (state.phase === "pending_action") {
    return triggerPendingAction(state);
  }

  // Cabo Evolved Dragon: the bot activated a Dragon and must pick the rank
  // it becomes. Difficulty-aware policy — see chooseDragonRank.
  if (state.phase === "dragon_choose") {
    return engineDragonChooseRank(state, chooseDragonRank(state, bot, k, difficulty));
  }

  if (state.phase === "action_peek_choose") {
    // Evolved 7/8 picker: prefer learning an unknown own card; else spy a rival.
    const ownUnknown = unknownOwnIndex(bot, k);
    return actionChoosePeek(state, ownUnknown !== null ? "own" : "other");
  }

  if (state.phase === "action_peek_own") {
    const target = unknownOwnIndex(bot, k) ?? firstCardIndex(bot);
    return actionPeekOwn(state, target);
  }

  if (state.phase === "action_peek_other") {
    if (difficulty === "billy") {
      const other = state.players.find((p) => p.id !== bot.id)!;
      return actionPeekOther(state, other.id, randomCardIndex(other, rng));
    }
    if (difficulty === "bob") {
      // Bob peeks a slot the human has peeked too — confirms whether their
      // "safe" card is actually low. (knownToSelf FLAGS only — legitimate.)
      const likely = humanLikelyKnownIndices(state);
      const human = state.players.find((p) => !p.isBot);
      if (likely && human) {
        const idx = likely.indices[Math.floor(rng() * likely.indices.length)];
        return actionPeekOther(state, human.id, idx);
      }
    }
    const target = unknownOpponentIndex(state, bot, k);
    if (target) return actionPeekOther(state, target.playerId, target.idx);
    const other = state.players.find((p) => p.id !== bot.id)!;
    return actionPeekOther(state, other.id, firstCardIndex(other));
  }

  if (state.phase === "action_blind_swap") {
    const choice = chooseBlindSwap(state, bot, k, difficulty, rng);
    return actionBlindSwap(state, choice.ownIdx, choice.targetId, choice.targetIdx);
  }

  if (state.phase === "action_peek_and_swap_pick") {
    const pick = choosePeekAndSwapPick(state, bot, k, difficulty, rng);
    return actionPeekAndSwapPick(state, pick.playerId, pick.idx);
  }

  if (state.phase === "action_peek_and_swap_decide" && state.peekAndSwapPick) {
    const pickedScore = cardScore(state.peekAndSwapPick.card, state.variant);
    const ownHi = highestKnownOwnIndex(bot, k);
    if (difficulty === "billy") {
      // Billy: swaps regardless of whether it's a good idea, 50% of the time.
      if (ownHi && rng() < 0.5) {
        return actionPeekAndSwapDecide(state, true, ownHi.idx);
      }
      return actionPeekAndSwapDecide(state, false);
    }
    // Marcy: swap only if it's a meaningful improvement.
    if (difficulty !== "bob" && ownHi && pickedScore < ownHi.score - 2) {
      return actionPeekAndSwapDecide(state, true, ownHi.idx);
    }
    // Bob: more aggressive swapping threshold.
    if (difficulty === "bob" && ownHi && pickedScore < ownHi.score - 1) {
      return actionPeekAndSwapDecide(state, true, ownHi.idx);
    }
    return actionPeekAndSwapDecide(state, false);
  }

  return state;
}

// ────────────────────────────────────────────────────────────────────────────
// Bot snap reactions (Table.tsx polls this and schedules the actual fire)
// ────────────────────────────────────────────────────────────────────────────

export interface BotSnapPlan {
  botId: string;
  kind: "other" | "self";
  targetId: string;
  targetIndex: number;
  delayMs: number;
}

/** Find the snap that fires FIRST right now, based on each bot's beliefs.
 *
 *  Every bot rolls its own independent reaction time (a real per-bot race);
 *  the candidate with the smallest delay wins the tick. All candidate picks
 *  come from id-verified beliefs — the old "stale belief" risk (acting on a
 *  card that silently moved) is gone, because ingestReveals relocates or
 *  kills beliefs by physical card id on every state transition.
 *
 *  Bob self-snaps his HIGHEST believed match (flushes points), but won't
 *  burn the once-per-round self-snap on a zero unless it completes the snap
 *  bonus or locks a Kamikaze. For rival-snaps Bob inverts the old "kick out
 *  their face card" logic: a correct rival-snap REPLACES the target's card
 *  with a random deck card (expected value ≈ his live count of the unseen
 *  pool), so snapping their HIGH card would actually help them. He therefore
 *  targets their LOWEST believed match, and only when it sits meaningfully
 *  BELOW the replacement's expected value — never above it.
 *
 *  Marcy / Billy candidate logic is intentionally unchanged. */
export function findBotSnap(
  state: GameState,
  difficulty: BotDifficulty,
  rng: () => number = Math.random,
): BotSnapPlan | null {
  if (state.phase === "setup_peek" || state.phase === "round_over") return null;
  if (state.discard.length === 0) return null;
  const top = state.discard[state.discard.length - 1];

  const bots = state.players.filter((p) => p.isBot);
  if (bots.length === 0) return null;

  let best: BotSnapPlan | null = null;
  for (const bot of bots) {
    // Per-bot INDEPENDENT reaction roll. Bob is FAST — beats a typical human
    // reaction (~250-400ms) most of the time.
    const reaction = (() => {
      if (difficulty === "bob") return 320 + Math.floor(rng() * 380);    // 0.32-0.70s
      if (difficulty === "marcy") return 900 + Math.floor(rng() * 500);  // 0.9-1.4s
      return 1700 + Math.floor(rng() * 700);                             // Billy 1.7-2.4s
    })();
    const plan = snapPlanForBot(state, bot, difficulty, top.rank, reaction, rng);
    if (plan && (!best || plan.delayMs < best.delayMs)) best = plan;
  }
  return best;
}

function snapPlanForBot(
  state: GameState,
  bot: PlayerState,
  difficulty: BotDifficulty,
  topRank: Rank,
  reaction: number,
  rng: () => number,
): BotSnapPlan | null {
  const k = getOrInitKnowledge(state, bot.id);

  // BOB self-snap: prefer the HIGHEST believed match (a successful snap also
  // flushes points). Skip zero-value matches — they don't lower the hand and
  // waste the once-per-round budget — UNLESS the rival half of the snap
  // bonus already landed (the −10 makes even a zero worth flushing), or a
  // Kamikaze override fires below.
  if (difficulty === "bob" && !bot.snapsUsed.self) {
    const selfArr = k.beliefs.get(bot.id);
    if (selfArr) {
      // Kamikaze override (Evolved): the ONE card blocking an all-zero hand
      // matches the discard top — flush it, even though it's "just" a
      // points-flush a normal Bob would weigh differently.
      if (state.variant === "evolved") {
        const kam = kamikazeStatus(bot, k);
        if (kam.state === "live") {
          const blocker = selfArr[kam.blockingIdx];
          if (blocker && blocker.score > 0 && blocker.rank === topRank) {
            return {
              botId: bot.id,
              kind: "self",
              targetId: bot.id,
              targetIndex: kam.blockingIdx,
              delayMs: reaction,
            };
          }
        }
      }
      let bestIdx = -1;
      let bestScore = -1;
      for (let i = 0; i < selfArr.length; i++) {
        const belief = selfArr[i];
        if (belief && belief.rank === topRank && belief.score > bestScore) {
          bestIdx = i;
          bestScore = belief.score;
        }
      }
      if (bestIdx >= 0 && (bestScore > 0 || bot.snapsCorrect.other)) {
        return {
          botId: bot.id,
          kind: "self",
          targetId: bot.id,
          targetIndex: bestIdx,
          delayMs: reaction,
        };
      }
    }
  }

  // Other-snap — look for a confidently-known opponent card matching.
  if (!bot.snapsUsed.other) {
    if (difficulty === "bob") {
      // EV INVERSION: a correct rival-snap replaces their card from the
      // deck (expected ≈ ev). Snapping a card ABOVE ev gifts them an
      // improvement, so Bob hunts their LOWEST believed match and pulls the
      // trigger only when the expected damage is real (v <= ev − 2) — or on
      // any non-positive edge (v <= ev) when it would complete his snap
      // bonus (self half landed, rival half still open).
      let lowest: { oppId: string; idx: number; score: number } | null = null;
      for (const opp of state.players) {
        if (opp.id === bot.id) continue;
        const arr = k.beliefs.get(opp.id);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const belief = arr[i];
          if (!belief || belief.rank !== topRank) continue;
          if (!lowest || belief.score < lowest.score) {
            lowest = { oppId: opp.id, idx: i, score: belief.score };
          }
        }
      }
      if (lowest) {
        const ev = unseenEv(state, k, bot.id);
        const bonusChase = bot.snapsCorrect.self && !bot.snapsCorrect.other;
        const threshold = bonusChase ? ev : ev - 2;
        if (lowest.score <= threshold) {
          return {
            botId: bot.id,
            kind: "other",
            targetId: lowest.oppId,
            targetIndex: lowest.idx,
            delayMs: reaction,
          };
        }
        // v > ev: snapping would IMPROVE the rival's hand on average — pass.
      }
    } else {
      // Marcy / Billy: first believed match found (frozen behavior).
      for (const opp of state.players) {
        if (opp.id === bot.id) continue;
        const arr = k.beliefs.get(opp.id);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const belief = arr[i];
          if (belief && belief.rank === topRank) {
            return {
              botId: bot.id,
              kind: "other",
              targetId: opp.id,
              targetIndex: i,
              delayMs: reaction,
            };
          }
        }
      }
      // Billy hunch — 8% chance per tick to snap blindly. He has no idea
      // what the card is (and we don't peek for him): the engine resolves
      // the hit/miss on its own.
      if (difficulty === "billy" && rng() < 0.08) {
        const opp = state.players.find((p) => p.id !== bot.id);
        if (opp && opp.hand.some((c) => c !== null)) {
          return {
            botId: bot.id,
            kind: "other",
            targetId: opp.id,
            targetIndex: randomCardIndex(opp, rng),
            delayMs: reaction + 600,
          };
        }
      }
    }
  }

  // Fallback self-snap for Marcy / Billy (Bob already handled above with
  // a smarter HIGHEST-card preference). No hand-size gate — the rule
  // makes self-snap available at any hand size.
  if (difficulty !== "bob" && !bot.snapsUsed.self) {
    const selfArr = k.beliefs.get(bot.id);
    if (selfArr) {
      for (let i = 0; i < selfArr.length; i++) {
        const belief = selfArr[i];
        if (belief && belief.rank === topRank) {
          return {
            botId: bot.id,
            kind: "self",
            targetId: bot.id,
            targetIndex: i,
            delayMs: reaction + 200,
          };
        }
      }
    }
  }
  return null;
}

/** Arm a bot's snap (commits snapPhase + emits snap_armed_* event). The
 *  Table.tsx polling driver should call this, render the cinematic, then
 *  call executeBotSnap after the overlay finishes. */
export function armBotSnap(state: GameState, plan: BotSnapPlan): GameState {
  if (plan.kind === "self") {
    return actionStartSnapSelf(state, plan.botId);
  }
  return actionStartSnapOther(state, plan.botId);
}

/** Resolve a bot's snap. Engine guards: requires snapPhase to be armed_*
 *  for this bot first (see armBotSnap). */
export function executeBotSnap(state: GameState, plan: BotSnapPlan): GameState {
  if (plan.kind === "self") {
    return actionSnapSelf(state, plan.botId, plan.targetIndex);
  }
  return actionSnapOther(state, plan.botId, plan.targetId, plan.targetIndex);
}

// ────────────────────────────────────────────────────────────────────────────
// Decision-weighted pacing
// ────────────────────────────────────────────────────────────────────────────

/** How long the current bot should "think" before its next step. Hard
 *  decisions (a Cabo call, a Dragon, an action card) read better with a
 *  longer pause; obvious ones (grabbing a low card) should feel snappy.
 *  Billy is uniformly erratic; Marcy pauses before a Cabo; Bob's pauses are
 *  fully decision-weighted (this dry-runs his DETERMINISTIC cabo call).
 *  Always clamped to [400, 3600] ms. */
export function suggestBotDelayMs(
  state: GameState,
  difficulty: BotDifficulty,
  rng: () => number = Math.random,
): number {
  const clamp = (v: number) => Math.min(3600, Math.max(400, Math.round(v)));
  if (difficulty === "billy") return clamp(400 + rng() * 2400);

  const bot = state.players[state.currentPlayer];
  const isBotTurn = !!bot?.isBot;

  if (difficulty === "marcy") {
    if (state.phase === "turn_start" && isBotTurn) {
      const k = getOrInitKnowledge(state, bot.id);
      if (shouldCallCaboBasic(state, bot, k, "marcy", rng)) {
        return clamp(1900 + rng() * 700);
      }
    }
    return clamp(1100 + rng() * 400);
  }

  // Bob. Defensive guard: this export is public, and the turn_drawn /
  // dragon_choose branches below key off state.drawnCard — which belongs to
  // the CURRENT player. If a caller ever asks for a delay when it is NOT a
  // bot's turn (today's only caller is bot-turn-gated), pacing must not read
  // the human's private drawn-card context: return the default band instead.
  if (!isBotTurn) return clamp(950 + rng() * 700);
  switch (state.phase) {
    case "turn_start": {
      if (isBotTurn) {
        const k = getOrInitKnowledge(state, bot.id);
        const ev = unseenEv(state, k, bot.id);
        if (shouldCallCaboBob(state, bot, k, ev)) return clamp(2500 + rng() * 1000);
      }
      return clamp(700 + rng() * 400);
    }
    case "turn_drawn": {
      const drawn = state.drawnCard;
      if (drawn) {
        if (drawn.rank === "Dragon") return clamp(2000 + rng() * 1000);
        if (actionOf(drawn, state.variant)) return clamp(1500 + rng() * 700);
        if (cardScore(drawn, state.variant) <= 2) return clamp(600 + rng() * 300);
      }
      return clamp(900 + rng() * 500);
    }
    case "dragon_choose":
      return clamp(2200 + rng() * 1000);
    case "action_blind_swap":
    case "action_peek_and_swap_pick":
    case "action_peek_and_swap_decide":
      return clamp(1500 + rng() * 700);
    case "action_peek_own":
    case "action_peek_other":
    case "action_peek_choose":
      return clamp(900 + rng() * 500);
    case "pending_action":
      return clamp(800 + rng() * 300);
    default:
      return clamp(950 + rng() * 700);
  }
}
