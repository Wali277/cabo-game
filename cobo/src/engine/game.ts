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
  Card,
  GameState,
  GameVariant,
  NewGameOptions,
  PlayerState,
  Rank,
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

/** Guard for caller-supplied hand indices (MP clients can forge payloads).
 *  Rejects ONLY non-integer / out-of-range values — an IN-RANGE empty (null)
 *  slot is a legal target for some moves and must pass through unchanged. */
function isValidHandIndex(hand: (Card | null)[], index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < hand.length;
}

export function newGame(opts: NewGameOptions): GameState {
  const variant: GameVariant = opts.variant ?? "classic";
  // Cabo Evolved deals 5 cards per hand; classic deals 4.
  const handSize = variant === "evolved" ? 5 : 4;
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const rng = mulberry32(seed);
  let deck = shuffle(makeDeck(variant), rng);

  // Cabo Evolved: keep the two Dragons OUT of the opening deal and the initial
  // face-up discard. Burying a Dragon face-down at setup wastes it — there it's
  // just a 20-point liability to be swapped away, when its real value is being
  // DRAWN and activated mid-round to swing the game. Set them aside, deal from
  // the Dragon-free remainder, then shuffle them back into the draw deck below.
  let setAsideDragons: Card[] = [];
  if (variant === "evolved") {
    setAsideDragons = deck.filter((c) => c.rank === "Dragon");
    deck = deck.filter((c) => c.rank !== "Dragon");
  }

  const players: PlayerState[] = opts.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    hand: [],
    knownToSelf: [],
    calledCabo: false,
    snapsUsed: { other: false, self: false },
    snapsCorrect: { other: false, self: false },
  }));

  // Deal `handSize` cards to each player
  for (let i = 0; i < handSize; i++) {
    for (const p of players) {
      p.hand.push(deck.shift()!);
    }
  }
  // Size each player's positional-knowledge array to the dealt hand.
  for (const p of players) {
    p.knownToSelf = p.hand.map(() => false);
  }

  // Per Cabo rules, one card is placed face-up in the discard pile at the
  // start of every match. This gives the first player an immediate choice
  // between drawing from the deck or taking the known discard card.
  const initialDiscard = deck.shift()!;

  // Evolved: return the set-aside Dragons to the draw deck and reshuffle so
  // their positions are unpredictable. A Dragon can now only enter play via a
  // draw (where it can be activated), never as a dealt or initial-discard card.
  if (setAsideDragons.length > 0) {
    deck = shuffle([...deck, ...setAsideDragons], rng);
  }

  const state: GameState = {
    variant,
    players,
    currentPlayer: 0,
    phase: "setup_peek",
    deck,
    discard: [initialDiscard],
    drawnCard: null,
    drawnFrom: null,
    pendingActionSource: null,
    peekAndSwapPick: null,
    pendingPeek: null,
    caboCallerId: null,
    finalRoundTurnsLeft: null,
    reveals: [],
    animations: [],
    roundNumber: opts.roundNumber ?? 1,
    scores: opts.scores ?? Object.fromEntries(players.map((p) => [p.id, []])),
    caboBonus: opts.caboBonus ?? Object.fromEntries(players.map((p) => [p.id, []])),
    caboPenalty: opts.caboPenalty ?? Object.fromEntries(players.map((p) => [p.id, []])),
    snapBonus: opts.snapBonus ?? Object.fromEntries(players.map((p) => [p.id, []])),
    kamikaze: opts.kamikaze ?? Object.fromEntries(players.map((p) => [p.id, []])),
    winnerId: null,
    log: [],
    snapPhase: "idle",
    snappingPlayerId: null,
    roundOutcome: null,
  };

  pushAnim(state, "deal", { playerIds: players.map((p) => p.id) });

  // Per Cabo rules, each player chooses ANY 2 of their 4 cards to peek at during
  // setup. Humans tap their chosen cards; bots auto-pick two indices.
  for (const p of players) {
    if (p.isBot) {
      // Random two distinct indices so bots' opening info varies between games
      const indices = shuffle(p.hand.map((_, i) => i), rng).slice(0, 2);
      for (const i of indices) {
        p.knownToSelf[i] = true;
        state.reveals.push({
          playerId: p.id, index: i, card: p.hand[i]!,
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
  if (!isValidHandIndex(player.hand, index)) return state;
  if (player.knownToSelf[index]) return state; // already peeked
  const peeked = player.knownToSelf.filter(Boolean).length;
  if (peeked >= 2) return state;
  const card = player.hand[index];
  if (!card) return state; // empty slot — nothing to peek
  const s = clone(state);
  const p = s.players.find((pp) => pp.id === playerId)!;
  p.knownToSelf[index] = true;
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
  // A freshly drawn Dragon must be ACTIVATED, not kept. (A dead Dragon taken
  // from the discard can be swapped into hand — the only legal move with it —
  // so only block the deck-drawn case here.)
  if (state.drawnCard.rank === "Dragon" && state.drawnFrom === "deck") return state;
  if (!isValidHandIndex(state.players[state.currentPlayer].hand, handIndex)) return state;
  const s = clone(state);
  const player = s.players[s.currentPlayer];
  const oldCard = player.hand[handIndex];
  player.hand[handIndex] = s.drawnCard!;
  player.knownToSelf[handIndex] = true;
  // Swapping into an empty slot has no card to discard — the drawn card
  // just fills the gap. Otherwise the displaced card goes to discard.
  if (oldCard) s.discard.push(oldCard);
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
  // A freshly drawn Dragon cannot be discarded — it must be activated.
  if (state.drawnCard.rank === "Dragon") return state;
  const s = clone(state);
  const drawn = s.drawnCard!;
  s.discard.push(drawn);
  pushAnim(s, "discard_drawn", { playerId: s.players[s.currentPlayer].id, card: drawn });
  s.drawnCard = null;
  s.drawnFrom = null;
  const action = actionOf(drawn, s.variant);
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
  const action = actionOf(src, s.variant);
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
    // Cabo Evolved:
    case "peek_choose": s.phase = "action_peek_choose"; break;
    case "peek_both":
      // Peek own first; pendingPeek routes the spy step after it resolves.
      s.phase = "action_peek_own";
      s.pendingPeek = "peek_other";
      break;
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

// ── Cabo Evolved: the Dragon ─────────────────────────────────────────────
// A drawn Dragon cannot be kept or discarded — only ACTIVATED. Activation
// transforms it into a brand-new "extra card" of any rank the player picks
// (the deck is NOT depleted by the transform). If that card is an action
// card, the player then plays it from `turn_drawn` exactly as if they'd
// drawn it. A Dragon still held face-down at round end is worth 20 (see
// cardScore) and that +20 overrides Carré (see detectCarre).

let _extraCardId = 0;
function nextExtraCardId(): string {
  _extraCardId += 1;
  return `dx${_extraCardId}_${Date.now()}`;
}

/** Press "Activate" on a freshly drawn Dragon → enter the rank-pick phase and
 *  fire the activation cinematic. Only legal for a Dragon drawn from the deck
 *  (a Dragon taken from the discard pile is a dead card and cannot activate). */
export function activateDragon(state: GameState): GameState {
  if (state.phase !== "turn_drawn" || !state.drawnCard) return state;
  if (state.drawnCard.rank !== "Dragon" || state.drawnFrom !== "deck") return state;
  const s = clone(state);
  s.phase = "dragon_choose";
  pushAnim(s, "dragon_activate", {
    playerId: s.players[s.currentPlayer].id,
    card: s.drawnCard,
  });
  pushLog(s, `${s.players[s.currentPlayer].name} unleashed the Dragon!`);
  return s;
}

/** Pick the rank the Dragon transforms into. Conjures a NEW card of that rank
 *  (an "extra card" — not pulled from the deck) into the drawn slot, then
 *  returns to `turn_drawn` so the player keeps it or plays its action normally.
 *  The Dragon can become any rank EXCEPT another Dragon. */
export const ALLOWED_DRAGON_RANKS: Rank[] = [
  "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "Joker",
];

export function dragonChooseRank(state: GameState, rank: Rank): GameState {
  if (state.phase !== "dragon_choose" || !state.drawnCard) return state;
  // The Dragon can become any normal rank — never another Dragon, and never a
  // forged/unknown value (the client supplies the rank; this guards scoring
  // integrity, e.g. a bogus rank scoring NaN).
  if (!ALLOWED_DRAGON_RANKS.includes(rank)) return state;
  const s = clone(state);
  // Suit is cosmetic in Cabo; carry the Dragon's suit onto the new card.
  const newCard: Card = { id: nextExtraCardId(), rank, suit: s.drawnCard!.suit };
  s.drawnCard = newCard;   // the Dragon is consumed; the extra card replaces it
  s.drawnFrom = "deck";    // now playable as a normal drawn card (keep or action)
  s.phase = "turn_drawn";
  pushAnim(s, "dragon_transform", {
    playerId: s.players[s.currentPlayer].id,
    rank,
    card: newCard,
  });
  pushLog(s, `${s.players[s.currentPlayer].name}'s Dragon became a ${rank}.`);
  return s;
}

export function actionPeekOwn(state: GameState, index: number): GameState {
  if (state.phase !== "action_peek_own") return state;
  if (!isValidHandIndex(state.players[state.currentPlayer].hand, index)) return state;
  const card = state.players[state.currentPlayer].hand[index];
  if (!card) return state; // can't peek at an empty slot
  const s = clone(state);
  const p = s.players[s.currentPlayer];
  p.knownToSelf[index] = true;
  s.reveals.push({ playerId: p.id, index, card, toPlayerIds: [p.id], reason: "peek_own" });
  pushAnim(s, "reveal", { playerId: p.id, index, card, toPlayerIds: [p.id] });
  pushLog(s, `${p.name} peeked at one of their cards.`);
  // Cabo Evolved 9/10 "peek both": route into the spy step after the own-peek
  // instead of ending the turn. Keep pendingActionSource so the UI can show a
  // "(2 of 2)" hint. Classic / single-peek path ends the turn as before.
  if (s.pendingPeek === "peek_other") {
    s.pendingPeek = null;
    s.phase = "action_peek_other";
    return s;
  }
  s.pendingActionSource = null;
  return advanceTurn(s);
}

/** Cabo Evolved 7/8 picker: choose to peek one of your own cards OR spy a
 *  rival's. Transitions into the matching single-peek phase. */
export function actionChoosePeek(state: GameState, choice: "own" | "other"): GameState {
  if (state.phase !== "action_peek_choose") return state;
  if (choice !== "own" && choice !== "other") return state;
  const s = clone(state);
  s.phase = choice === "own" ? "action_peek_own" : "action_peek_other";
  return s;
}

export function actionPeekOther(state: GameState, targetPlayerId: string, index: number): GameState {
  if (state.phase !== "action_peek_other") return state;
  if (targetPlayerId === state.players[state.currentPlayer].id) return state;
  const target0 = state.players.find((p) => p.id === targetPlayerId);
  if (!target0 || !isValidHandIndex(target0.hand, index)) return state;
  const card = target0.hand[index];
  if (!card) return state; // can't peek at an empty slot
  const s = clone(state);
  const cur = s.players[s.currentPlayer];
  const target = s.players.find((p) => p.id === targetPlayerId)!;
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
  const cur0 = state.players[state.currentPlayer];
  const target0 = state.players.find((p) => p.id === targetPlayerId);
  if (!target0) return state;
  if (!isValidHandIndex(cur0.hand, ownIndex) || !isValidHandIndex(target0.hand, targetIndex)) {
    return state;
  }
  // Both slots must hold a card. Empty slots (from a prior correct self
  // snap) are not legal swap targets.
  if (!cur0.hand[ownIndex] || !target0.hand[targetIndex]) return state;
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
  const target0 = state.players.find((p) => p.id === targetPlayerId);
  if (!target0 || !isValidHandIndex(target0.hand, index)) return state;
  const card = target0.hand[index];
  if (!card) return state; // can't peek-and-swap at an empty slot
  const s = clone(state);
  const cur = s.players[s.currentPlayer];
  const target = s.players.find((p) => p.id === targetPlayerId)!;
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
  // Untrusted ownIndex: reject non-integer / out-of-range outright. An
  // in-range EMPTY slot still routes through the "couldn't swap" path below.
  if (
    doSwap &&
    ownIndex !== undefined &&
    !isValidHandIndex(state.players[state.currentPlayer].hand, ownIndex)
  ) {
    return state;
  }
  const s = clone(state);
  const cur = s.players[s.currentPlayer];
  const pick = s.peekAndSwapPick!;
  const target = s.players.find((p) => p.id === pick.playerId)!;
  if (doSwap && ownIndex !== undefined) {
    // Both sides must hold a card to swap. The pick is guaranteed non-null
    // (actionPeekAndSwapPick rejected empty slots), so we only need to
    // guard our own slot here.
    if (!cur.hand[ownIndex]) {
      pushLog(s, `${cur.name} peeked but couldn't swap (empty slot).`);
    } else {
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
    }
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
  pushLog(s, `${cur.name} called LUMO!`);
  return advanceTurn(s);
}


// ─────────────────────────────────────────────────────────────────────────
// SNAP — cinematic-first flow
//
// Press → arm (snap_armed_* event, snapPhase = armed_*) → SNAP! overlay
// plays → player picks → engine resolves.
//
// For rival-snap we add a brief `revealing` step (snap_reveal event flips
// the target card face-up) before the outcome cinematic + card motion.
//
// Self-snap: available any time once per round. A correct match NULLS the
// picked slot (leaving an empty placeholder) — hand visually keeps its
// shape but one slot is empty. A wrong self-snap deals a penalty card.
//
// Wrong-snap penalty placement: penalties fill the first empty slot (left
// over from a prior correct self-snap) before extending the hand. This
// gives the "return to 4" recovery path the rules call out.
//
// Rival-snap mechanic: correct = target card replaced from deck and
// knownToSelf cleared; wrong = snapper draws a penalty (with empty-slot
// fill-in described above).
//
// Each player has one snap-self and one snap-other per round; both budget
// flags flip on RESOLUTION (correct or wrong), never on arm.
// ─────────────────────────────────────────────────────────────────────────

/** Place a penalty card into the snapper's hand: fill the first empty
 *  slot if one exists, otherwise append to the end. Returns the index it
 *  landed at so callers can include it in animation payloads. */
function placePenalty(
  hand: (import("./types").Card | null)[],
  knownToSelf: boolean[],
  penalty: import("./types").Card,
): number {
  const emptyIdx = hand.findIndex((c) => c === null);
  if (emptyIdx >= 0) {
    hand[emptyIdx] = penalty;
    knownToSelf[emptyIdx] = true;
    return emptyIdx;
  }
  hand.push(penalty);
  knownToSelf.push(true);
  return hand.length - 1;
}

/** When a player has just landed a CORRECT snap (rival or self), check
 *  whether they now hold BOTH a correct rival-snap and a correct self-snap
 *  for the round. If so, emit a snap_bonus animation event so the UI can
 *  surface the in-game "Snap bonus! −10 points" overlay only to that
 *  player. The actual −10 is applied during endRound. Idempotent — caller
 *  fires this twice per round at most (once per correct snap) and only
 *  the second call emits the event. */
function maybeAwardSnapBonus(state: GameState, snapper: import("./types").PlayerState) {
  if (!snapper.snapsCorrect.self || !snapper.snapsCorrect.other) return;
  // Avoid double-firing: check if a snap_bonus event for this snapper
  // already exists in this round's animation queue.
  if (state.animations.some(
    (a) => a.kind === "snap_bonus" && (a.payload.playerId as string) === snapper.id,
  )) {
    return;
  }
  pushAnim(state, "snap_bonus", { playerId: snapper.id, amount: 10 });
  pushLog(state, `${snapper.name} earned a SNAP BONUS — minus 10 points!`);
}

/**
 * Begin a rival-snap. Commits the arm immediately so there's no
 * cancel/back-out — the player MUST follow through with a pick.
 * Sets snapPhase = 'armed_other' and emits snap_armed_other for the
 * cinematic overlay.
 */
export function actionStartSnapOther(state: GameState, snapperId: string): GameState {
  if (state.phase === "setup_peek" || state.phase === "round_over") return state;
  if (state.snapPhase !== "idle") return state;
  const snapper = state.players.find((p) => p.id === snapperId);
  if (!snapper) return state;
  if (snapper.snapsUsed.other) return state;
  if (state.discard.length === 0) return state;
  const s = clone(state);
  s.snapPhase = "armed_other";
  s.snappingPlayerId = snapperId;
  pushAnim(s, "snap_armed_other", { snapperId });
  pushLog(s, `${snapper.name} called SNAP on a rival!`);
  return s;
}

/**
 * Begin a self-snap. Available once per round, any hand size — the player
 * is gambling that they remember a card whose rank matches the discard
 * top. Correct → that slot empties (-1); wrong → penalty card (+1).
 */
export function actionStartSnapSelf(state: GameState, snapperId: string): GameState {
  if (state.phase === "setup_peek" || state.phase === "round_over") return state;
  if (state.snapPhase !== "idle") return state;
  const snapper = state.players.find((p) => p.id === snapperId);
  if (!snapper) return state;
  if (snapper.snapsUsed.self) return state;
  if (state.discard.length === 0) return state;
  // Need at least one non-empty card to snap on.
  if (!snapper.hand.some((c) => c !== null)) return state;
  const s = clone(state);
  s.snapPhase = "armed_self";
  s.snappingPlayerId = snapperId;
  pushAnim(s, "snap_armed_self", { snapperId });
  pushLog(s, `${snapper.name} called SNAP on themselves!`);
  return s;
}

/**
 * Snap on an opponent's face-down card. The cinematic-first flow expects
 * actionSnapOther to be called AFTER the rival-snap was armed (which fires
 * the SNAP! overlay and gates input). This call resolves the snap:
 * flips the picked card face-up (snap_reveal event + reveal entry), then
 * runs the outcome cinematic + card motion. Both visual beats land within
 * the same engine call; the cinematic outlasts the flip so the "hold"
 * built into the spec reads naturally on screen.
 *
 * Mechanic: CORRECT → target's card is replaced from the deck and
 * knownToSelf for that slot is cleared (nobody knows the new card). WRONG
 * → snapper appends a penalty card from the deck.
 */
export function actionSnapOther(
  state: GameState,
  snapperId: string,
  targetId: string,
  targetIndex: number,
): GameState {
  // Not allowed during setup or after the round ends.
  if (state.phase === "setup_peek" || state.phase === "round_over") return state;
  if (snapperId === targetId) return state;
  // Must have been armed for rival-snap by THIS player.
  if (state.snapPhase !== "armed_other") return state;
  if (state.snappingPlayerId !== snapperId) return state;
  const snapper = state.players.find((p) => p.id === snapperId);
  const target = state.players.find((p) => p.id === targetId);
  if (!snapper || !target) return state;
  if (snapper.snapsUsed.other) return state;
  if (state.discard.length === 0) return state;
  if (!isValidHandIndex(target.hand, targetIndex)) return state;
  const targetCard = target.hand[targetIndex];
  if (!targetCard) return state;

  const top = state.discard[state.discard.length - 1];
  const isMatch = targetCard.rank === top.rank;

  const s = clone(state);
  const snapperC = s.players.find((p) => p.id === snapperId)!;
  const targetC = s.players.find((p) => p.id === targetId)!;
  snapperC.snapsUsed.other = true;
  s.snapPhase = "resolving";

  if (isMatch) {
    // Correct — discard the snapped card and replace from deck.
    const removed = targetC.hand[targetIndex]!;
    s.discard.push(removed);
    snapperC.snapsCorrect.other = true;
    reshuffleDiscardIntoDeck(s);
    if (s.deck.length === 0) {
      // Edge case: nothing to deal back. Null the slot (preserves layout
      // shape) and end the round defensively. The snap-bonus check happens
      // inside endRound, so snapsCorrect.other is already set above.
      targetC.hand[targetIndex] = null;
      targetC.knownToSelf[targetIndex] = false;
      pushAnim(s, "snap_correct", { snapperId, targetId, targetIndex, card: removed, isSelf: false });
      pushLog(s, `${snapper.name} snapped ${target.name}'s ${removed.rank}!`);
      return endRound(s);
    }
    const replacement = s.deck.shift()!;
    targetC.hand[targetIndex] = replacement;
    targetC.knownToSelf[targetIndex] = false;
    // No slot reveal on correct rival-snap: the card flies to the discard
    // pile (face-up there) so everyone already sees what was matched. A
    // slot reveal would compete with the fly-to-discard animation and the
    // new card's entrance, making the moment read muddy.
    pushAnim(s, "snap_correct", { snapperId, targetId, targetIndex, card: removed, isSelf: false });
    pushLog(s, `${snapper.name} snapped ${target.name}'s ${removed.rank}!`);
    maybeAwardSnapBonus(s, snapperC);
  } else {
    // Wrong — snapper draws a penalty card into their hand. The slot flips
    // face-up via snap_reveal so the snapper sees the mispicked card under
    // the MISS! cinematic.
    pushAnim(s, "snap_reveal", { snapperId, targetId, targetIndex, card: targetCard, isSelf: false });
    s.reveals.push({
      playerId: targetId,
      index: targetIndex,
      card: targetCard,
      toPlayerIds: s.players.map((p) => p.id),
      reason: "snap_reveal",
    });
    reshuffleDiscardIntoDeck(s);
    if (s.deck.length === 0) {
      pushAnim(s, "snap_wrong", {
        snapperId, targetId, targetIndex,
        expectedRank: top.rank, actualCard: targetCard,
      });
      pushLog(s, `${snapper.name} snapped wrong on ${target.name} (deck empty, no penalty).`);
      return finalizeSnap(s);
    }
    const penalty = s.deck.shift()!;
    const penaltyIdx = placePenalty(snapperC.hand, snapperC.knownToSelf, penalty);
    pushAnim(s, "snap_wrong", {
      snapperId, targetId, targetIndex,
      expectedRank: top.rank, actualCard: targetCard,
    });
    pushAnim(s, "snap_penalty_draw", { snapperId, card: penalty, handIndex: penaltyIdx });
    pushLog(s, `${snapper.name} snapped wrong on ${target.name} — penalty card.`);
  }
  return finalizeSnap(s);
}

/**
 * Snap one of your OWN face-down cards. Once per round, at any hand size.
 *
 * CORRECT: null the matched slot. The card goes to discard; the slot
 * stays in the array as an empty placeholder so the other slots' indices
 * (and the player's positional memory) are preserved. Effective hand
 * size shrinks by 1; the empty slot can be filled later by a wrong-snap
 * penalty.
 * WRONG: penalty card from the deck. Fills the first empty slot if one
 * exists, otherwise extends the hand.
 *
 * Either way, snapsUsed.self flips to true on resolution.
 */
export function actionSnapSelf(
  state: GameState,
  snapperId: string,
  ownIndex: number,
): GameState {
  if (state.phase === "setup_peek" || state.phase === "round_over") return state;
  // Must have been armed for self-snap by THIS player.
  if (state.snapPhase !== "armed_self") return state;
  if (state.snappingPlayerId !== snapperId) return state;
  const snapper = state.players.find((p) => p.id === snapperId);
  if (!snapper) return state;
  if (snapper.snapsUsed.self) return state;
  if (state.discard.length === 0) return state;
  if (!isValidHandIndex(snapper.hand, ownIndex)) return state;
  const ownCard = snapper.hand[ownIndex];
  if (!ownCard) return state;

  const top = state.discard[state.discard.length - 1];
  const isMatch = ownCard.rank === top.rank;

  const s = clone(state);
  const snapperC = s.players.find((p) => p.id === snapperId)!;
  snapperC.snapsUsed.self = true;
  s.snapPhase = "resolving";

  if (isMatch) {
    // CORRECT self-snap: null the slot, no deck replacement. The card
    // flies to the discard pile (face-up there) so the snapper sees what
    // they matched. The empty slot stays in the array so layout doesn't
    // collapse — a future wrong-snap penalty will refill it.
    const removed = snapperC.hand[ownIndex]!;
    snapperC.hand[ownIndex] = null;
    snapperC.knownToSelf[ownIndex] = false;
    s.discard.push(removed);
    pushAnim(s, "snap_correct", { snapperId, targetId: snapperId, targetIndex: ownIndex, card: removed, isSelf: true });
    pushLog(s, `${snapper.name} self-snapped a ${removed.rank}!`);
    snapperC.snapsCorrect.self = true;
    maybeAwardSnapBonus(s, snapperC);
  } else {
    // WRONG self-snap: flip the slot face-up via snap_reveal so the player
    // sees what they mispicked, then deal a penalty card.
    pushAnim(s, "snap_reveal", { snapperId, targetId: snapperId, targetIndex: ownIndex, card: ownCard, isSelf: true });
    s.reveals.push({
      playerId: snapperId,
      index: ownIndex,
      card: ownCard,
      toPlayerIds: s.players.map((p) => p.id),
      reason: "snap_reveal",
    });
    reshuffleDiscardIntoDeck(s);
    if (s.deck.length === 0) {
      pushAnim(s, "snap_wrong", {
        snapperId, targetId: snapperId, targetIndex: ownIndex,
        expectedRank: top.rank, actualCard: ownCard, isSelf: true,
      });
      pushLog(s, `${snapper.name} self-snapped wrong (deck empty).`);
      return finalizeSnap(s);
    }
    const penalty = s.deck.shift()!;
    const penaltyIdx = placePenalty(snapperC.hand, snapperC.knownToSelf, penalty);
    pushAnim(s, "snap_wrong", {
      snapperId, targetId: snapperId, targetIndex: ownIndex,
      expectedRank: top.rank, actualCard: ownCard, isSelf: true,
    });
    pushAnim(s, "snap_penalty_draw", { snapperId, card: penalty, handIndex: penaltyIdx });
    pushLog(s, `${snapper.name} self-snapped wrong — penalty card.`);
  }
  return finalizeSnap(s);
}

/**
 * Clears snap-phase state at the end of a resolution. Caller is expected
 * to have already pushed the outcome animation (snap_correct / snap_wrong)
 * so consumers can finish their cinematic before the next action lands.
 */
function finalizeSnap(state: GameState): GameState {
  state.snapPhase = "idle";
  state.snappingPlayerId = null;
  return state;
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

/** Cabo Evolved: detect four-of-a-kind among non-zero-value cards in a hand.
 *  Returns the matched rank and the points those four cards represent (which
 *  become 0 under Carré). Null in classic or with no four-of-a-kind. */
function detectCarre(
  hand: (Card | null)[],
  variant: GameVariant,
): { rank: Rank; protect: number } | null {
  if (variant !== "evolved") return null;
  const byRank = new Map<Rank, Card[]>();
  for (const c of hand) {
    if (!c) continue;
    if (cardScore(c, variant) === 0) continue; // exclude 0-value (Joker, K)
    if (c.rank === "Dragon") continue; // Dragon's +20 always stands — never Carré-protected
    const arr = byRank.get(c.rank) ?? [];
    arr.push(c);
    byRank.set(c.rank, arr);
  }
  for (const [rank, cards] of byRank) {
    if (cards.length >= 4) {
      const protect = cards
        .slice(0, 4)
        .reduce((acc, c) => acc + cardScore(c, variant), 0);
      return { rank, protect };
    }
  }
  return null;
}

function endRound(state: GameState): GameState {
  const s = state;
  s.phase = "round_over";
  // Reveal all hands (skip empty slots — nothing to reveal there).
  for (const p of s.players) {
    p.hand.forEach((card, i) => {
      if (!card) return;
      s.reveals.push({
        playerId: p.id, index: i, card,
        toPlayerIds: s.players.map((pp) => pp.id),
        reason: "round_end",
      });
    });
  }

  // Hand totals
  const totals = s.players.map((p) => ({ id: p.id, name: p.name, total: handScore(p.hand, s.variant) }));
  const lowest = Math.min(...totals.map((t) => t.total));

  // Winner of the round: lowest total. Cabo caller wins ties.
  const lowestPlayers = totals.filter((t) => t.total === lowest);
  let winner = lowestPlayers[0];
  if (s.caboCallerId) {
    const caboLowest = lowestPlayers.find((t) => t.id === s.caboCallerId);
    if (caboLowest) winner = caboLowest;
  }
  // Cabo Evolved Kamikaze TIE: if EVERY active player finished on exactly 0,
  // nobody can be levied +20 and there is no winner — the round is a draw.
  const allZeroEvolvedTie =
    s.variant === "evolved" && totals.length >= 2 && totals.every((t) => t.total === 0);
  s.winnerId = allZeroEvolvedTie ? null : winner.id;

  // Cabo Evolved special outcomes (no-ops in classic). Kamikaze: if ANY hand
  // totals exactly 0, every other player takes +20. Carré: a four-of-a-kind
  // (non-zero rank) makes those four cards count 0 — points protection.
  const kamikazeOccurred =
    s.variant === "evolved" && totals.some((t) => t.total === 0);
  const carreById = new Map<string, { rank: Rank; protect: number }>();
  if (s.variant === "evolved") {
    for (const p of s.players) {
      const c = detectCarre(p.hand, s.variant);
      if (c) carreById.set(p.id, c);
    }
  }

  // Per-round scoring with Cabo bonus / penalty accounted for separately so
  // the scoreboard can display each component on its own line. Evolved folds
  // Carré protection + the Kamikaze +20 INTO the round contribution so every
  // existing total / bust / scoreboard computation picks them up unchanged.
  for (const t of totals) {
    const player = s.players.find((pp) => pp.id === t.id)!;
    const earnedSnapBonus =
      player.snapsCorrect.self && player.snapsCorrect.other;
    const isCaboCaller = t.id === s.caboCallerId;
    const wonRound = t.id === winner.id;
    const carre = carreById.get(t.id);
    // Carré: the four matched cards count 0 → contribution is the remainder.
    const handContribution = carre ? t.total - carre.protect : t.total;
    // Kamikaze: every non-zero hand takes +20 when someone finished at 0.
    const kamikazeLevy = kamikazeOccurred && t.total !== 0 ? 20 : 0;
    if (isCaboCaller && wonRound && t.total <= 7) {
      // Successful low Cabo: round contribution is 0, AND the player's
      // hand value is subtracted from their running total via caboBonus.
      s.scores[t.id].push(0);
      s.caboBonus[t.id].push(t.total);
      s.caboPenalty[t.id].push(0);
    } else if (isCaboCaller && !wonRound) {
      // Failed Cabo: (Carré-protected) hand + Kamikaze levy, PLUS a flat +5.
      s.scores[t.id].push(handContribution + kamikazeLevy);
      s.caboBonus[t.id].push(0);
      s.caboPenalty[t.id].push(5);
    } else {
      // Normal round (non-caller, or caller who won with a high hand).
      s.scores[t.id].push(handContribution + kamikazeLevy);
      s.caboBonus[t.id].push(0);
      s.caboPenalty[t.id].push(0);
    }
    // Snap bonus is independent of Cabo math: -10 off the running total
    // whenever the player landed BOTH a correct rival-snap and a correct
    // self-snap this round. Stored as a positive magnitude; the scoreboard
    // renders it as a negative adjustment.
    s.snapBonus[t.id].push(earnedSnapBonus ? 10 : 0);
    // Mirror the Kamikaze levy (already folded into `scores` above) so the
    // scoreboard can show it in the Penalty column. 0 in classic / non-Kamikaze.
    s.kamikaze[t.id].push(kamikazeLevy);
  }

  // Record the round's special outcomes for the dedicated cinematics
  // (Evolved only; null when neither Kamikaze nor Carré occurred).
  if (s.variant === "evolved" && !allZeroEvolvedTie) {
    const kamikaze = kamikazeOccurred
      ? totals.filter((t) => t.total === 0).map((t) => t.id)
      : [];
    const carre = [...carreById.entries()].map(([playerId, c]) => ({
      playerId,
      rank: c.rank,
    }));
    s.roundOutcome = kamikaze.length || carre.length ? { kamikaze, carre } : null;
  } else {
    // Classic, or an all-zero Kamikaze tie → no special-outcome cinematic.
    s.roundOutcome = null;
  }

  pushAnim(s, "round_end", { winnerId: s.winnerId, totals });
  pushLog(
    s,
    allZeroEvolvedTie
      ? `Round over — everyone hit zero. It's a tie; no points.`
      : `Round over. ${winner.name} wins with ${winner.total} pts.`,
  );
  return s;
}

function clone(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      hand: p.hand.slice(),
      knownToSelf: p.knownToSelf.slice(),
      snapsUsed: { ...p.snapsUsed },
      snapsCorrect: { ...p.snapsCorrect },
    })),
    deck: state.deck.slice(),
    discard: state.discard.slice(),
    reveals: state.reveals.slice(),
    animations: state.animations.slice(),
    log: state.log.slice(),
    scores: Object.fromEntries(Object.entries(state.scores).map(([k, v]) => [k, v.slice()])),
    caboBonus: Object.fromEntries(Object.entries(state.caboBonus).map(([k, v]) => [k, v.slice()])),
    caboPenalty: Object.fromEntries(Object.entries(state.caboPenalty).map(([k, v]) => [k, v.slice()])),
    snapBonus: Object.fromEntries(Object.entries(state.snapBonus).map(([k, v]) => [k, v.slice()])),
    kamikaze: Object.fromEntries(Object.entries(state.kamikaze).map(([k, v]) => [k, v.slice()])),
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
