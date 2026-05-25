import { actionOf, cardScore } from "../engine/deck";
import {
  actionBlindSwap,
  actionPeekAndSwapDecide,
  actionPeekAndSwapPick,
  actionPeekOther,
  actionPeekOwn,
  callCabo,
  discardDrawnSkipAction,
  discardDrawnWithAction,
  drawFromDeck,
  drawFromDiscard,
  swapDrawnWithHand,
  triggerPendingAction,
} from "../engine/game";
import type { GameState, PlayerState } from "../engine/types";
import { useStore } from "../state/store";
import { type BotDifficulty, type ChatMoment, pickChatLine } from "./bots";

/** Per-bot in-memory belief tracker: what the bot *thinks* is in each
 *  player's hand. Populated by ingestReveals(); consumed by decision code. */
interface BotKnowledge {
  beliefs: Map<string, (BotCardBelief | null)[]>;
}

interface BotCardBelief {
  rank: string;
  suit: string;
  score: number;
}

const KNOWLEDGE: Map<string, BotKnowledge> = new Map();

function getOrInitKnowledge(state: GameState, botId: string): BotKnowledge {
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
}

export function ingestReveals(state: GameState) {
  for (const bot of state.players.filter((p) => p.isBot)) {
    const k = getOrInitKnowledge(state, bot.id);
    const arr = k.beliefs.get(bot.id)!;
    const self = state.players.find((p) => p.id === bot.id)!;
    // Sync self-beliefs to ground truth on every tick. Without this, a
    // swap-into-known-slot leaves the OLD card's belief in place — making
    // the bot think its hand is still low when it just replaced a 2 with
    // a Joker (or vice versa). knownToSelf is the engine's source of
    // truth for "what THIS bot can see in its own hand".
    self.knownToSelf.forEach((known, i) => {
      const card = self.hand[i];
      if (!known || !card) {
        arr[i] = null;
        return;
      }
      const cur = arr[i];
      if (!cur || cur.rank !== card.rank || cur.suit !== card.suit) {
        arr[i] = { rank: card.rank, suit: card.suit, score: cardScore(card) };
      }
    });
    for (const r of state.reveals) {
      if (!r.toPlayerIds.includes(bot.id)) continue;
      const oppArr = k.beliefs.get(r.playerId);
      if (!oppArr) continue;
      oppArr[r.index] = {
        rank: r.card.rank,
        suit: r.card.suit,
        score: cardScore(r.card),
      };
    }
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
  for (let i = 0; i < arr.length; i++) if (!arr[i]) return i;
  return null;
}

/** Standard 54-card deck (A-K + 2 Jokers, Jokers=0, J/Q/K=10) averages ~6.3
 *  per draw. We use 6 as the unknown-card estimate — slightly conservative,
 *  since the bot would rather under-call cabo than over-call. */
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
    for (let i = 0; i < arr.length; i++) if (!arr[i]) return { playerId: p.id, idx: i };
  }
  return null;
}

/** Indices in the human's hand the human has "peeked" (knownToSelf). In the
 *  fiction this is meta-knowledge a real opponent wouldn't have — Bob uses
 *  it as a proxy for "cards the human is keeping intentionally", which is
 *  what makes him feel like he reads you. */
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

// ────────────────────────────────────────────────────────────────────────────
// Side-effect: speech bubbles
// ────────────────────────────────────────────────────────────────────────────

const SPEECH_COOLDOWN_MS = 1800;

/** Emit a speech bubble for the given bot, picking from the configured pool.
 *  Cooldown so back-to-back moments don't visually stomp. Safe in SP only —
 *  no-op when no bot difficulty is active (MP). */
function emitBotSpeech(playerId: string, moment: ChatMoment) {
  const diff = useStore.getState().botDifficulty;
  if (!diff) return;
  const line = pickChatLine(diff, moment);
  if (!line) return;
  const prev = useStore.getState().botSpeech;
  if (prev && Date.now() - prev.at < SPEECH_COOLDOWN_MS) return;
  useStore.setState({
    botSpeech: { playerId, text: line, at: Date.now() },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Difficulty-specific decision helpers
// ────────────────────────────────────────────────────────────────────────────

/** Should this bot call Cabo this turn?  The decision is based on KNOWN
 *  cards (confidence) plus the room around the unknowns. Each difficulty
 *  has its own appetite — Bob is genuinely aggressive once he's got 3+
 *  knowns. */
function shouldCallCabo(state: GameState, bot: PlayerState, k: BotKnowledge, difficulty: BotDifficulty): boolean {
  if (state.caboCallerId) return false;
  const handLen = bot.hand.length;
  const { count, sum } = knownCountAndSum(bot, k);
  const unknowns = handLen - count;
  const estimate = sum + unknowns * UNKNOWN_ESTIMATE;
  const worstCase = sum + unknowns * 10; // assume every unknown is a face card
  const human = state.players.find((p) => !p.isBot);
  const humanReveals = human ? state.reveals.filter((r) => r.playerId === human.id).length : 0;

  if (difficulty === "billy") {
    // Billy is unpredictable: calls cabo at random points. Sometimes too
    // cautious (<=4), sometimes way too late (>10), sometimes never.
    if (estimate <= 3) return Math.random() < 0.5;
    if (estimate <= 8) return Math.random() < 0.08;
    if (estimate > 15) return Math.random() < 0.18;
    return false;
  }

  if (difficulty === "marcy") {
    // Confident play — needs to know most of her hand and have it low.
    if (count === handLen && sum <= 12) return true;
    if (count >= 3 && sum <= 8) return true;
    if (count >= 2 && sum <= 4 && worstCase <= 24) return true;
    return false;
  }

  // Bob — aggressive, exploits info advantage, races the human.
  if (count === handLen && sum <= 14) return true;
  if (count >= 3 && sum <= 10) return true;
  if (count >= 2 && sum <= 6 && worstCase <= 22) return true;
  // Racing: human has been peeking/swapping a lot (3+ reveals) — they're
  // setting up. If we're plausibly competitive, call to deny them another
  // turn.
  if (humanReveals >= 3 && count >= 2 && estimate <= 14) return true;
  return false;
}

/** Pick a hand slot for the bot to swap a drawn-from-deck card into.
 *  The unknown threshold widens when we're in the post-cabo final lap —
 *  swapping into an unknown is a gamble on AVG = UNKNOWN_ESTIMATE (6), but
 *  in endgame even a marginal expected-value bet is worth it. */
function pickDeckSwapTarget(
  bot: PlayerState,
  k: BotKnowledge,
  state: GameState,
  drawnScore: number,
  difficulty: BotDifficulty,
): number | null {
  const highest = highestKnownOwnIndex(bot, k);
  const unknown = unknownOwnIndex(bot, k);
  const inEndgame = !!state.caboCallerId && state.caboCallerId !== bot.id;

  if (difficulty === "billy") {
    if (Math.random() < 0.35) return Math.floor(Math.random() * bot.hand.length);
    if (highest && drawnScore < highest.score) return highest.idx;
    if (unknown !== null && drawnScore <= 6) return unknown;
    return null;
  }

  if (highest && drawnScore < highest.score) return highest.idx;
  // Unknowns: swap if drawn is below the avg unknown estimate. Bob is more
  // aggressive (will swap up to UNKNOWN_ESTIMATE), and both bots loosen
  // further in endgame.
  const marcyCap = inEndgame ? 6 : 5;
  const bobCap = inEndgame ? 7 : 6;
  const cap = difficulty === "bob" ? bobCap : marcyCap;
  if (unknown !== null && drawnScore <= cap) return unknown;
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Action card targeting
// ────────────────────────────────────────────────────────────────────────────

function chooseBlindSwap(state: GameState, bot: PlayerState, k: BotKnowledge, difficulty: BotDifficulty) {
  const ownHi = highestKnownOwnIndex(bot, k);
  const ownUnknown = unknownOwnIndex(bot, k);

  if (difficulty === "billy") {
    // Billy: swap a random pair, no strategy.
    const other = state.players.find((p) => p.id !== bot.id)!;
    const randOwn = Math.floor(Math.random() * bot.hand.length);
    const randTheirs = Math.floor(Math.random() * other.hand.length);
    return { ownIdx: randOwn, targetId: other.id, targetIdx: randTheirs };
  }

  // Picking our slot to give away: ONLY surrender a known card if it's
  // genuinely high (>=6). A known Joker / Ace / low is worth keeping; in
  // that case, gamble an unknown slot instead. Falls back to ownHi as a
  // last resort if there are no unknowns either.
  const safeToGiveAwayKnown = ownHi && ownHi.score >= 6;
  const ownIdx = safeToGiveAwayKnown ? ownHi!.idx : (ownUnknown ?? ownHi?.idx ?? 0);

  if (difficulty === "bob") {
    // Bob targets the HUMAN's likely-known cards (their setup peeks or
    // recently swapped slots). Putting our high into a slot the human
    // trusts is maximally disruptive — but only worth it if we're
    // actually offloading a high card.
    const likely = humanLikelyKnownIndices(state);
    if (likely && safeToGiveAwayKnown) {
      const targetIdx = likely.indices[Math.floor(Math.random() * likely.indices.length)];
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
  return { ownIdx, targetId: other.id, targetIdx: 0 };
}

function choosePeekAndSwapPick(state: GameState, bot: PlayerState, k: BotKnowledge, difficulty: BotDifficulty) {
  if (difficulty === "billy") {
    // Random target.
    const other = state.players.find((p) => p.id !== bot.id)!;
    return { playerId: other.id, idx: Math.floor(Math.random() * other.hand.length) };
  }
  if (difficulty === "bob") {
    // Bob peeks into the human's known cards first to inspect what the
    // human thinks is "safe". If they're high, swap; if low, leave.
    const likely = humanLikelyKnownIndices(state);
    if (likely) {
      const idx = likely.indices[Math.floor(Math.random() * likely.indices.length)];
      return { playerId: likely.playerId, idx };
    }
  }
  const unk = unknownOpponentIndex(state, bot, k);
  if (unk) return { playerId: unk.playerId, idx: unk.idx };
  const oppLow = bestKnownOpponentIndex(state, bot, k);
  if (oppLow) return { playerId: oppLow.playerId, idx: oppLow.idx };
  const other = state.players.find((p) => p.id !== bot.id)!;
  return { playerId: other.id, idx: 0 };
}

// ────────────────────────────────────────────────────────────────────────────
// Entry point — the only function Table.tsx calls
// ────────────────────────────────────────────────────────────────────────────

export function botMove(state: GameState): GameState {
  const bot = state.players[state.currentPlayer];
  if (!bot.isBot) return state;
  const k = getOrInitKnowledge(state, bot.id);
  const difficulty = useStore.getState().botDifficulty ?? "marcy";

  // ── turn_start: draw or call cabo ───────────────────────────────────────
  if (state.phase === "turn_start") {
    if (shouldCallCabo(state, bot, k, difficulty)) {
      emitBotSpeech(bot.id, "callCabo");
      return callCabo(state);
    }
    const top = state.discard[state.discard.length - 1];
    const inEndgame = !!state.caboCallerId && state.caboCallerId !== bot.id;
    if (top) {
      const topScore = cardScore(top);
      if (difficulty === "billy") {
        // Billy: draws from discard for bad reasons too.
        if (Math.random() < 0.3 && topScore <= 9) return drawFromDiscard(state);
      } else {
        const highest = highestKnownOwnIndex(bot, k);
        const unknown = unknownOwnIndex(bot, k);
        // Take discard if it improves a known high...
        if (highest && topScore < highest.score) {
          return drawFromDiscard(state);
        }
        // ...or if it's a known-low we can drop into an unknown slot
        // (gambling that unknown is >= UNKNOWN_ESTIMATE). Bob is bolder.
        const fillUnknownThreshold = difficulty === "bob" ? 5 : 4;
        if (unknown !== null && topScore <= fillUnknownThreshold) {
          return drawFromDiscard(state);
        }
        // Endgame — grab anything cheap-ish, even into known slots, to
        // try to win the last comparison.
        if (inEndgame && topScore <= 4) {
          return drawFromDiscard(state);
        }
      }
    }
    return drawFromDeck(state);
  }

  // ── turn_drawn: swap, discard with action, or discard ───────────────────
  if (state.phase === "turn_drawn" && state.drawnCard) {
    const drawn = state.drawnCard;
    const drawnScore = cardScore(drawn);
    const drawnAction = actionOf(drawn);

    // Juicy-card chat (face / action). 30% chance, gated by cooldown.
    if (juicyCard(drawn.rank) && Math.random() < 0.3) {
      emitBotSpeech(bot.id, "juicyDraw");
    }

    if (state.drawnFrom === "discard") {
      // Drew from discard — engine forces a swap. Pick our highest known,
      // else our first unknown.
      const highest = highestKnownOwnIndex(bot, k);
      const unknown = unknownOwnIndex(bot, k);
      const target = highest ?? (unknown !== null ? { idx: unknown, score: 0 } : { idx: 0, score: 0 });
      return swapDrawnWithHand(state, target.idx);
    }

    // Drawn from deck.
    if (difficulty === "billy" && Math.random() < 0.18) {
      // Billy occasionally throws away a perfectly good card.
      return discardDrawnSkipAction(state);
    }

    if (drawnScore <= 4) {
      const idx = pickDeckSwapTarget(bot, k, state, drawnScore, difficulty);
      if (idx !== null) return swapDrawnWithHand(state, idx);
      return discardDrawnSkipAction(state);
    }

    if (drawnAction) {
      const highest = highestKnownOwnIndex(bot, k);
      if (difficulty !== "billy" && highest) {
        // The card's action ability is gone the moment it lands in our
        // hand, so swapping it in trades information-for-points. Only
        // do that when it meaningfully lowers our hand. A drawn Joker
        // (score 0) almost always wins this comparison; a drawn J (10)
        // only wins it when ownHi is even higher. Bob is more aggressive.
        const minSavings = difficulty === "bob" ? 2 : 3;
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
    // Endgame: gamble — even a 6 is at-par with an unknown's expected value.
    const inEndgame = !!state.caboCallerId && state.caboCallerId !== bot.id;
    if (inEndgame && difficulty !== "billy") {
      const unknown = unknownOwnIndex(bot, k);
      if (unknown !== null && drawnScore <= 6) {
        return swapDrawnWithHand(state, unknown);
      }
    }
    return discardDrawnSkipAction(state);
  }

  if (state.phase === "pending_action") {
    return triggerPendingAction(state);
  }

  if (state.phase === "action_peek_own") {
    const target = unknownOwnIndex(bot, k) ?? 0;
    return actionPeekOwn(state, target);
  }

  if (state.phase === "action_peek_other") {
    if (difficulty === "billy") {
      const other = state.players.find((p) => p.id !== bot.id)!;
      return actionPeekOther(state, other.id, Math.floor(Math.random() * other.hand.length));
    }
    if (difficulty === "bob") {
      // Bob peeks the human's UNKNOWN-to-bot slot to learn maximum info.
      const likely = humanLikelyKnownIndices(state);
      const human = state.players.find((p) => !p.isBot);
      if (likely && human) {
        // Peek at a slot the human has peeked too — confirms whether
        // their "safe" card is actually low.
        const idx = likely.indices[Math.floor(Math.random() * likely.indices.length)];
        return actionPeekOther(state, human.id, idx);
      }
    }
    const target = unknownOpponentIndex(state, bot, k);
    if (target) return actionPeekOther(state, target.playerId, target.idx);
    const other = state.players.find((p) => p.id !== bot.id)!;
    return actionPeekOther(state, other.id, 0);
  }

  if (state.phase === "action_blind_swap") {
    const choice = chooseBlindSwap(state, bot, k, difficulty);
    return actionBlindSwap(state, choice.ownIdx, choice.targetId, choice.targetIdx);
  }

  if (state.phase === "action_peek_and_swap_pick") {
    const pick = choosePeekAndSwapPick(state, bot, k, difficulty);
    return actionPeekAndSwapPick(state, pick.playerId, pick.idx);
  }

  if (state.phase === "action_peek_and_swap_decide" && state.peekAndSwapPick) {
    const pickedScore = cardScore(state.peekAndSwapPick.card);
    const ownHi = highestKnownOwnIndex(bot, k);
    if (difficulty === "billy") {
      // Billy: swaps regardless of whether it's a good idea, 50% of the time.
      if (ownHi && Math.random() < 0.5) {
        return actionPeekAndSwapDecide(state, true, ownHi.idx);
      }
      return actionPeekAndSwapDecide(state, false);
    }
    // Marcy: swap only if it's a meaningful improvement.
    if (ownHi && pickedScore < ownHi.score - 2) {
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
// Round-end reactions (called from Table.tsx on phase → round_over)
// ────────────────────────────────────────────────────────────────────────────

/** When a round ends, pick one bot to react to its outcome. Prefer the round
 *  winner (their roundWin line wins). If no bot won, the bot with the
 *  highest hand gets a roundHighHand line. Single-shot per round transition. */
export function reactToRoundEnd(state: GameState) {
  if (state.phase !== "round_over") return;
  const bots = state.players.filter((p) => p.isBot);
  if (bots.length === 0) return;

  // Did a bot win the round?
  const winnerId = state.winnerId;
  if (winnerId) {
    const winnerBot = bots.find((b) => b.id === winnerId);
    if (winnerBot) {
      emitBotSpeech(winnerBot.id, "roundWin");
      return;
    }
  }

  // Otherwise have the worst-scoring bot complain.
  const lastRoundScore = (id: string) => {
    const scoresArr = state.scores[id] ?? [];
    return scoresArr[scoresArr.length - 1] ?? 0;
  };
  const worst = [...bots].sort((a, b) => lastRoundScore(b.id) - lastRoundScore(a.id))[0];
  if (worst) emitBotSpeech(worst.id, "roundHighHand");
}
