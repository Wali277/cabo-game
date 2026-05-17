import {
  actionOf,
  cardScore,
  handScore,
  isBlackKing,
  makeDeck,
  mulberry32,
  shuffle,
} from "./deck";
import type {
  AnimationEvent,
  GameState,
  NewGameOptions,
  PlayerState,
} from "./types";

let _animId = 0;
function nextAnimId() {
  _animId += 1;
  return `a${_animId}_${Date.now()}`;
}

function pushAnim(state: GameState, kind: AnimationEvent["kind"], payload: Record<string, unknown>) {
  state.animations.push({ id: nextAnimId(), kind, payload });
}

function pushLog(state: GameState, msg: string) {
  state.log.push(msg);
}

export function newGame(opts: NewGameOptions): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const rng = mulberry32(seed);
  const deck = shuffle(makeDeck(), rng);

  const players: PlayerState[] = opts.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    hand: [],
    knownToSelf: [false, false, false, false],
    calledCabo: false,
  }));

  // Deal 4 cards to each player
  for (let i = 0; i < 4; i++) {
    for (const p of players) {
      p.hand.push(deck.shift()!);
    }
  }

  // Per Cabo rules, one card is placed face-up in the discard pile at the
  // start of every match. This gives the first player an immediate choice
  // between drawing from the deck or taking the known discard card.
  const initialDiscard = deck.shift()!;

  const state: GameState = {
    players,
    currentPlayer: 0,
    phase: "setup_peek",
    deck,
    discard: [initialDiscard],
    drawnCard: null,
    drawnFrom: null,
    pendingActionSource: null,
    peekAndSwapPick: null,
    caboCallerId: null,
    finalRoundTurnsLeft: null,
    reveals: [],
    animations: [],
    roundNumber: opts.roundNumber ?? 1,
    scores: opts.scores ?? Object.fromEntries(players.map((p) => [p.id, []])),
    winnerId: null,
    log: [],
  };

  pushAnim(state, "deal", { playerIds: players.map((p) => p.id) });

  // Per Cabo rules, each player chooses ANY 2 of their 4 cards to peek at during
  // setup. Humans tap their chosen cards; bots auto-pick two indices.
  for (const p of players) {
    if (p.isBot) {
      // Random two distinct indices so bots' opening info varies between games
      const indices = shuffle([0, 1, 2, 3], rng).slice(0, 2);
      for (const i of indices) {
        p.knownToSelf[i] = true;
        state.reveals.push({
          playerId: p.id, index: i, card: p.hand[i],
          toPlayerIds: [p.id], reason: "setup",
        });
      }
    }
  }

  return state;
}

export function setupPeekCard(state: GameState, playerId: string, index: number): GameState {
  if (state.phase !== "setup_peek") return state;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  if (index < 0 || index >= player.hand.length) return state;
  if (player.knownToSelf[index]) return state; // already peeked
  const peeked = player.knownToSelf.filter(Boolean).length;
  if (peeked >= 2) return state;
  const s = clone(state);
  const p = s.players.find((pp) => pp.id === playerId)!;
  p.knownToSelf[index] = true;
  const card = p.hand[index];
  s.reveals.push({
    playerId: p.id, index, card,
    toPlayerIds: [p.id], reason: "setup",
  });
  pushAnim(s, "reveal", { playerId: p.id, index, card, toPlayerIds: [p.id] });
  return s;
}

export function startPlay(state: GameState): GameState {
  if (state.phase !== "setup_peek") return state;
  // Clear setup peek reveals — players retain their memory via knownToSelf flags
  // but cards return face-down once play begins.
  return {
    ...state,
    phase: "turn_start",
    reveals: state.reveals.filter((r) => r.reason !== "setup"),
  };
}

export function clearAnimations(state: GameState): GameState {
  return { ...state, animations: [] };
}

export function clearReveals(state: GameState): GameState {
  // Keep persistent reveals (setup peek shown via phase, round_end shown forever)
  const keep = state.reveals.filter(
    (r) => r.reason === "round_end",
  );
  return { ...state, reveals: keep };
}

function reshuffleDiscardIntoDeck(state: GameState) {
  if (state.deck.length > 0 || state.discard.length <= 1) return;
  const top = state.discard.pop()!;
  const rng = mulberry32(Math.floor(Math.random() * 1e9));
  state.deck = shuffle(state.discard, rng);
  state.discard = [top];
}

export function drawFromDeck(state: GameState): GameState {
  if (state.phase !== "turn_start") return state;
  const s = clone(state);
  reshuffleDiscardIntoDeck(s);
  if (s.deck.length === 0) return endRound(s);
  s.drawnCard = s.deck.shift()!;
  s.drawnFrom = "deck";
  s.phase = "turn_drawn";
  pushAnim(s, "draw_deck", { playerId: s.players[s.currentPlayer].id, card: s.drawnCard });
  pushLog(s, `${s.players[s.currentPlayer].name} drew from the deck.`);
  return s;
}

export function drawFromDiscard(state: GameState): GameState {
  if (state.phase !== "turn_start") return state;
  if (state.discard.length === 0) return state;
  const s = clone(state);
  s.drawnCard = s.discard.pop()!;
  s.drawnFrom = "discard";
  s.phase = "turn_drawn";
  pushAnim(s, "draw_discard", { playerId: s.players[s.currentPlayer].id, card: s.drawnCard });
  pushLog(s, `${s.players[s.currentPlayer].name} took the top discard.`);
  return s;
}

export function swapDrawnWithHand(state: GameState, handIndex: number): GameState {
  if (state.phase !== "turn_drawn" || !state.drawnCard) return state;
  const s = clone(state);
  const player = s.players[s.currentPlayer];
  const oldCard = player.hand[handIndex];
  player.hand[handIndex] = s.drawnCard!;
  player.knownToSelf[handIndex] = true;
  s.discard.push(oldCard);
  pushAnim(s, "swap_hand", {
    playerId: player.id,
    handIndex,
    newCard: s.drawnCard,
    discardedCard: oldCard,
  });
  pushLog(s, `${player.name} swapped in a card.`);
  s.drawnCard = null;
  s.drawnFrom = null;
  return advanceTurn(s);
}

export function discardDrawn(state: GameState): GameState {
  if (state.phase !== "turn_drawn" || !state.drawnCard) return state;
  // Cannot discard a card drawn from discard (must swap with hand)
  if (state.drawnFrom === "discard") return state;
  const s = clone(state);
  const drawn = s.drawnCard!;
  s.discard.push(drawn);
  pushAnim(s, "discard_drawn", { playerId: s.players[s.currentPlayer].id, card: drawn });
  s.drawnCard = null;
  s.drawnFrom = null;
  const action = actionOf(drawn);
  if (!action) {
    pushLog(s, `${s.players[s.currentPlayer].name} discarded a ${drawn.rank}.`);
    return advanceTurn(s);
  }
  s.pendingActionSource = drawn;
  // NEW: don't auto-activate — wait for the player to press the Action button
  s.phase = "pending_action";
  pushLog(s, `${s.players[s.currentPlayer].name} discarded a ${drawn.rank}.`);
  return s;
}

/** Player presses the Action button to activate the pending card's ability. */
export function triggerPendingAction(state: GameState): GameState {
  if (state.phase !== "pending_action" || !state.pendingActionSource) return state;
  const s = clone(state);
  const src = s.pendingActionSource!;
  const action = actionOf(src);
  if (!action) {
    s.pendingActionSource = null;
    return advanceTurn(s);
  }
  pushLog(s, `${s.players[s.currentPlayer].name} plays ${src.rank}'s action.`);
  switch (action) {
    case "peek_own": s.phase = "action_peek_own"; break;
    case "peek_other": s.phase = "action_peek_other"; break;
    case "blind_swap": s.phase = "action_blind_swap"; break;
    case "peek_and_swap": s.phase = "action_peek_and_swap_pick"; break;
  }
  return s;
}

/** Player chose NOT to activate the discarded card's ability — turn ends. */
export function skipPendingAction(state: GameState): GameState {
  if (state.phase !== "pending_action") return state;
  const s = clone(state);
  pushLog(s, `${s.players[s.currentPlayer].name} declined the action.`);
  s.pendingActionSource = null;
  return advanceTurn(s);
}

/** Discard the drawn card AND immediately activate its ability (one-step). */
export function discardDrawnWithAction(state: GameState): GameState {
  const s = discardDrawn(state);
  if (s.phase === "pending_action") return triggerPendingAction(s);
  return s;
}

/** Discard the drawn card WITHOUT triggering any ability (pure discard). */
export function discardDrawnSkipAction(state: GameState): GameState {
  const s = discardDrawn(state);
  if (s.phase === "pending_action") return skipPendingAction(s);
  return s;
}

export function actionPeekOwn(state: GameState, index: number): GameState {
  if (state.phase !== "action_peek_own") return state;
  const s = clone(state);
  const p = s.players[s.currentPlayer];
  const card = p.hand[index];
  p.knownToSelf[index] = true;
  s.reveals.push({ playerId: p.id, index, card, toPlayerIds: [p.id], reason: "peek_own" });
  pushAnim(s, "reveal", { playerId: p.id, index, card, toPlayerIds: [p.id] });
  pushLog(s, `${p.name} peeked at one of their cards.`);
  s.pendingActionSource = null;
  return advanceTurn(s);
}

export function actionPeekOther(state: GameState, targetPlayerId: string, index: number): GameState {
  if (state.phase !== "action_peek_other") return state;
  if (targetPlayerId === state.players[state.currentPlayer].id) return state;
  const s = clone(state);
  const cur = s.players[s.currentPlayer];
  const target = s.players.find((p) => p.id === targetPlayerId)!;
  const card = target.hand[index];
  s.reveals.push({ playerId: target.id, index, card, toPlayerIds: [cur.id], reason: "peek_other" });
  pushAnim(s, "reveal", { playerId: target.id, index, card, toPlayerIds: [cur.id] });
  pushLog(s, `${cur.name} spied on ${target.name}'s card.`);
  s.pendingActionSource = null;
  return advanceTurn(s);
}

export function actionBlindSwap(
  state: GameState,
  ownIndex: number,
  targetPlayerId: string,
  targetIndex: number,
): GameState {
  if (state.phase !== "action_blind_swap") return state;
  if (targetPlayerId === state.players[state.currentPlayer].id) return state;
  const s = clone(state);
  const cur = s.players[s.currentPlayer];
  const target = s.players.find((p) => p.id === targetPlayerId)!;
  const a = cur.hand[ownIndex];
  const b = target.hand[targetIndex];
  cur.hand[ownIndex] = b;
  target.hand[targetIndex] = a;
  // After blind swap, neither side knows their new card's identity
  cur.knownToSelf[ownIndex] = false;
  target.knownToSelf[targetIndex] = false;
  pushAnim(s, "blind_swap", {
    fromPlayerId: cur.id, fromIndex: ownIndex,
    toPlayerId: target.id, toIndex: targetIndex,
  });
  pushLog(s, `${cur.name} blind-swapped with ${target.name}.`);
  s.pendingActionSource = null;
  return advanceTurn(s);
}

export function actionPeekAndSwapPick(
  state: GameState,
  targetPlayerId: string,
  index: number,
): GameState {
  if (state.phase !== "action_peek_and_swap_pick") return state;
  const s = clone(state);
  const cur = s.players[s.currentPlayer];
  const target = s.players.find((p) => p.id === targetPlayerId)!;
  const card = target.hand[index];
  s.peekAndSwapPick = { playerId: target.id, index, card };
  s.reveals.push({
    playerId: target.id, index, card,
    toPlayerIds: [cur.id], reason: "peek_and_swap",
  });
  pushAnim(s, "reveal", { playerId: target.id, index, card, toPlayerIds: [cur.id] });
  s.phase = "action_peek_and_swap_decide";
  return s;
}

export function actionPeekAndSwapDecide(
  state: GameState,
  doSwap: boolean,
  ownIndex?: number,
): GameState {
  if (state.phase !== "action_peek_and_swap_decide" || !state.peekAndSwapPick) return state;
  const s = clone(state);
  const cur = s.players[s.currentPlayer];
  const pick = s.peekAndSwapPick!;
  const target = s.players.find((p) => p.id === pick.playerId)!;
  if (doSwap && ownIndex !== undefined) {
    const a = cur.hand[ownIndex];
    const b = target.hand[pick.index];
    cur.hand[ownIndex] = b;
    target.hand[pick.index] = a;
    cur.knownToSelf[ownIndex] = true; // Current player saw what they're getting
    target.knownToSelf[pick.index] = false;
    pushAnim(s, "peek_and_swap", {
      fromPlayerId: cur.id, fromIndex: ownIndex,
      toPlayerId: target.id, toIndex: pick.index,
    });
    pushLog(s, `${cur.name} peeked and swapped with ${target.name}.`);
  } else {
    pushLog(s, `${cur.name} peeked but didn't swap.`);
  }
  s.peekAndSwapPick = null;
  s.pendingActionSource = null;
  return advanceTurn(s);
}

export function callCabo(state: GameState): GameState {
  if (state.phase !== "turn_start") return state;
  if (state.caboCallerId) return state;
  const s = clone(state);
  const cur = s.players[s.currentPlayer];
  cur.calledCabo = true;
  s.caboCallerId = cur.id;
  s.finalRoundTurnsLeft = s.players.length - 1;
  pushAnim(s, "cabo_called", { playerId: cur.id });
  pushLog(s, `${cur.name} called CABO!`);
  return advanceTurn(s);
}


function advanceTurn(state: GameState): GameState {
  if (state.phase === "round_over") return state;
  // If we were in a final round, decrement
  if (state.finalRoundTurnsLeft !== null) {
    state.finalRoundTurnsLeft -= 1;
    if (state.finalRoundTurnsLeft < 0) return endRound(state);
  }
  state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
  // Skip the cabo caller's slot — they don't take another turn
  if (state.caboCallerId && state.players[state.currentPlayer].id === state.caboCallerId) {
    return endRound(state);
  }
  state.phase = "turn_start";
  state.drawnCard = null;
  state.drawnFrom = null;
  state.pendingActionSource = null;
  state.peekAndSwapPick = null;
  return state;
}

function endRound(state: GameState): GameState {
  const s = state;
  s.phase = "round_over";
  // Reveal all hands
  for (const p of s.players) {
    p.hand.forEach((card, i) => {
      s.reveals.push({
        playerId: p.id, index: i, card,
        toPlayerIds: s.players.map((pp) => pp.id),
        reason: "round_end",
      });
    });
  }
  // Score
  const totals = s.players.map((p) => ({ id: p.id, name: p.name, total: handScore(p.hand) }));
  let lowest = Math.min(...totals.map((t) => t.total));
  for (const t of totals) {
    let pts = t.total;
    if (s.caboCallerId === t.id && t.total !== lowest) {
      pts += 5;
    }
    s.scores[t.id].push(pts);
  }
  // Winner of the round: lowest total. If cabo caller tied lowest, they win the tie.
  const lowestPlayers = totals.filter((t) => t.total === lowest);
  let winner = lowestPlayers[0];
  if (s.caboCallerId) {
    const caboLowest = lowestPlayers.find((t) => t.id === s.caboCallerId);
    if (caboLowest) winner = caboLowest;
  }
  s.winnerId = winner.id;
  pushAnim(s, "round_end", { winnerId: winner.id, totals });
  pushLog(s, `Round over. ${winner.name} wins with ${winner.total} pts.`);
  return s;
}

function clone(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      hand: p.hand.slice(),
      knownToSelf: p.knownToSelf.slice(),
    })),
    deck: state.deck.slice(),
    discard: state.discard.slice(),
    reveals: state.reveals.slice(),
    animations: state.animations.slice(),
    log: state.log.slice(),
    scores: Object.fromEntries(Object.entries(state.scores).map(([k, v]) => [k, v.slice()])),
  };
}

/** DEV-only: force a specific card into the drawn-card slot.
 *  Pulls the card out of the deck if it's still there; otherwise creates a
 *  virtual copy so the same rank can be injected multiple times in a row.
 *  Only fires during turn_start (the human's normal draw phase). */
export function trainingInjectCard(state: GameState, card: import("./types").Card): GameState {
  if (state.phase !== "turn_start") return state;
  const s = clone(state);
  const deckIdx = s.deck.findIndex((c) => c.rank === card.rank && c.suit === card.suit);
  let drawn: import("./types").Card;
  if (deckIdx >= 0) {
    drawn = s.deck.splice(deckIdx, 1)[0];
  } else {
    drawn = { ...card }; // virtual copy — card already played, recreate for testing
  }
  s.drawnCard = drawn;
  s.drawnFrom = "deck";
  s.phase = "turn_drawn";
  pushAnim(s, "draw_deck", { playerId: s.players[s.currentPlayer].id, card: drawn });
  pushLog(s, `[DEV] Injected ${drawn.rank} for testing.`);
  return s;
}

export { cardScore, handScore, isBlackKing, actionOf };
