import { actionOf, cardScore } from "../engine/deck";
import {
  actionBlindSwap,
  actionPeekAndSwapDecide,
  actionPeekAndSwapPick,
  actionPeekOther,
  actionPeekOwn,
  callCabo,
  discardDrawn,
  drawFromDeck,
  drawFromDiscard,
  swapDrawnWithHand,
} from "../engine/game";
import type { GameState, PlayerState } from "../engine/types";

// Bots use only the knowledge they would have:
// - their own "knownToSelf" cards
// - cards revealed to them (we approximate by tracking reveals targeted at them)
// - the discard pile
// A simple greedy bot: keep low cards, swap out unknowns when drawing low, play action cards usefully.

interface BotKnowledge {
  // For each player id, for each hand index: the card the bot "thinks" is there (or null if unknown)
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
    // For setup, bots see their own bottom 2 cards
    // Bots "remember" any card they have personally marked as known (setup peeks
    // or cards drawn into their hand).
    const arr = k.beliefs.get(bot.id)!;
    const self = state.players.find((p) => p.id === bot.id)!;
    self.knownToSelf.forEach((known, i) => {
      if (known && self.hand[i] && !arr[i]) {
        arr[i] = {
          rank: self.hand[i].rank,
          suit: self.hand[i].suit,
          score: cardScore(self.hand[i]),
        };
      }
    });
    for (const r of state.reveals) {
      if (!r.toPlayerIds.includes(bot.id)) continue;
      const arr = k.beliefs.get(r.playerId);
      if (!arr) continue;
      arr[r.index] = {
        rank: r.card.rank,
        suit: r.card.suit,
        score: cardScore(r.card),
      };
    }
  }
}

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

function estimatedOwnTotal(bot: PlayerState, k: BotKnowledge): number {
  const arr = k.beliefs.get(bot.id)!;
  let total = 0;
  arr.forEach((b) => {
    total += b ? b.score : 5; // assume 5 for unknown
  });
  return total;
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

function unknownOpponentIndex(state: GameState, bot: PlayerState, k: BotKnowledge): { playerId: string; idx: number } | null {
  for (const p of state.players) {
    if (p.id === bot.id) continue;
    const arr = k.beliefs.get(p.id);
    if (!arr) continue;
    for (let i = 0; i < arr.length; i++) if (!arr[i]) return { playerId: p.id, idx: i };
  }
  return null;
}

export function botMove(state: GameState): GameState {
  const bot = state.players[state.currentPlayer];
  if (!bot.isBot) return state;
  const k = getOrInitKnowledge(state, bot.id);

  // Decision making
  if (state.phase === "turn_start") {
    const total = estimatedOwnTotal(bot, k);
    // Call Cabo when total is low and no one else has called
    if (!state.caboCallerId && total <= 7) {
      return callCabo(state);
    }
    // Draw from discard if top card is low and beats a known high in hand
    const top = state.discard[state.discard.length - 1];
    if (top) {
      const topScore = cardScore(top);
      const highest = highestKnownOwnIndex(bot, k);
      if (highest && topScore < highest.score && topScore <= 5) {
        return drawFromDiscard(state);
      }
    }
    return drawFromDeck(state);
  }

  if (state.phase === "turn_drawn" && state.drawnCard) {
    const drawn = state.drawnCard;
    const drawnScore = cardScore(drawn);
    const drawnAction = actionOf(drawn);
    const highest = highestKnownOwnIndex(bot, k);
    const unknown = unknownOwnIndex(bot, k);

    if (state.drawnFrom === "discard") {
      // Must swap with hand: pick highest known, otherwise an unknown
      const target = highest ?? (unknown !== null ? { idx: unknown, score: 0 } : { idx: 0, score: 0 });
      return swapDrawnWithHand(state, target.idx);
    }

    // Drawn from deck:
    // If drawn is low value (<=4), swap with highest known (if highest > drawn) else swap with unknown
    if (drawnScore <= 4) {
      if (highest && drawnScore < highest.score) return swapDrawnWithHand(state, highest.idx);
      if (unknown !== null) return swapDrawnWithHand(state, unknown);
      return discardDrawn(state);
    }

    // If drawn is action card, sometimes prefer the action
    if (drawnAction) {
      // If we have a high known card we could improve, swap rather than play action
      if (highest && highest.score >= 8 && drawnScore <= 5) {
        return swapDrawnWithHand(state, highest.idx);
      }
      return discardDrawn(state);
    }

    // Otherwise compare with highest known
    if (highest && drawnScore < highest.score) {
      return swapDrawnWithHand(state, highest.idx);
    }
    return discardDrawn(state);
  }

  if (state.phase === "action_peek_own") {
    const target = unknownOwnIndex(bot, k) ?? 0;
    return actionPeekOwn(state, target);
  }
  if (state.phase === "action_peek_other") {
    const target = unknownOpponentIndex(state, bot, k);
    if (target) return actionPeekOther(state, target.playerId, target.idx);
    // fallback: any opponent slot 0
    const other = state.players.find((p) => p.id !== bot.id)!;
    return actionPeekOther(state, other.id, 0);
  }
  if (state.phase === "action_blind_swap") {
    const ownHi = highestKnownOwnIndex(bot, k);
    const oppLow = bestKnownOpponentIndex(state, bot, k);
    const ownIdx = ownHi ? ownHi.idx : 0;
    if (oppLow) {
      return actionBlindSwap(state, ownIdx, oppLow.playerId, oppLow.idx);
    }
    // If we don't know anyone's cards, swap an unknown of ours with an unknown of theirs
    const unk = unknownOpponentIndex(state, bot, k);
    if (unk) return actionBlindSwap(state, ownIdx, unk.playerId, unk.idx);
    const other = state.players.find((p) => p.id !== bot.id)!;
    return actionBlindSwap(state, ownIdx, other.id, 0);
  }
  if (state.phase === "action_peek_and_swap_pick") {
    const unk = unknownOpponentIndex(state, bot, k);
    if (unk) return actionPeekAndSwapPick(state, unk.playerId, unk.idx);
    const oppLow = bestKnownOpponentIndex(state, bot, k);
    if (oppLow) return actionPeekAndSwapPick(state, oppLow.playerId, oppLow.idx);
    const other = state.players.find((p) => p.id !== bot.id)!;
    return actionPeekAndSwapPick(state, other.id, 0);
  }
  if (state.phase === "action_peek_and_swap_decide" && state.peekAndSwapPick) {
    const pickedScore = cardScore(state.peekAndSwapPick.card);
    const ownHi = highestKnownOwnIndex(bot, k);
    if (ownHi && pickedScore < ownHi.score - 2) {
      return actionPeekAndSwapDecide(state, true, ownHi.idx);
    }
    return actionPeekAndSwapDecide(state, false);
  }

  return state;
}

