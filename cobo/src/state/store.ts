import { create } from "zustand";
import type { GameState, GameVariant } from "../engine/types";
import type { Card, Rank } from "../engine/types";
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
  clearAnimations,
  clearReveals,
  discardDrawnSkipAction,
  discardDrawnWithAction,
  dragonChooseRank as engineDragonChooseRank,
  drawFromDeck,
  drawFromDiscard,
  handScore,
  newGame,
  setupPeekCard,
  skipPendingAction,
  startPlay,
  swapDrawnWithHand,
  trainingInjectCard as engineTrainingInject,
  triggerPendingAction,
} from "../engine/game";
import { Audio } from "../audio/sounds";
import { type BotDifficulty, nameForSlot } from "../ai/bots";

export type Screen = "menu" | "botPicker" | "lobby" | "coin_toss" | "straw_draw" | "game" | "scoring";

export interface ChatMessage {
  from: string;
  name: string;
  text: string;
  at: number;
}
export type GameMode = "sp" | "mp";

export type CoinSide = "heads" | "tails";
export interface CoinTossState {
  humanChoice: CoinSide | null;
  botChoice: CoinSide | null;
  result: CoinSide | null;  // randomly set when both have chosen / countdown ends
  winnerId: string | null;  // player id of whoever won the toss
  phase: "choosing" | "flipping" | "done";
  countdownEndsAt: number | null; // ms timestamp for 5s auto-pick
}

export interface MpMember {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
}
export interface MpRoom {
  code: string;
  hostId: string | null;
  viewerId: string;
  started: boolean;
  /** Rule variant chosen by the host in the lobby (read-only for joiners). */
  variant: GameVariant;
  members: MpMember[];
  game: GameState | null;
  coinToss: {
    choices: { heads: string | null; tails: string | null };
    startedAt: number | null;
    result: "heads" | "tails" | null;
  } | null;
  playAgainVotes: string[];
  disconnects: Record<string, { startedAt: number; forfeited: boolean }>;
  readyVotes: string[];
  readyStartedAt: number | null;
  roundReadyVotes: string[];
  roundReadyStartedAt: number | null;
  strawDraw: {
    straws: { length: number; ownerId: string | null; revealed: boolean }[];
    startedAt: number | null;
    result: string[] | null;
  } | null;
  strawReadyVotes: string[];
  strawReadyStartedAt: number | null;
  bustedThisRound: string[];
  kickedIds: string[];
  gloriosVictory: string | null;
  gloriosVictoryReason: "survivor" | "more_wins" | "final_round" | "sudden_death" | null;
  /** Sudden-death tiebreaker state, mirrored from the server.
   *  - null when no sudden death has been triggered this game.
   *  - { active: true, contestants, mainRoundsCount } when SD is in progress. */
  suddenDeath: { active: boolean; contestants: string[]; mainRoundsCount: number } | null;
}

/**
 * ElimState — round-bust / kick / glorious-victory tracking.
 *
 * Mirrors the room-level concepts from the MP server (see Room in
 * `server/src/rooms.ts`) so that BOTH modes can read elimination state from a
 * single place. In MP we copy the server's broadcast into here from
 * `applyMpRoom`; in SP we compute it locally from `computeSpBust()` whenever a
 * round ends.
 *
 * Default value across the board is empty / null. Cleared on backToMenu, on
 * fresh init/trainInit, and on switching modes.
 */
export interface ElimState {
  bustedThisRound: string[];
  kickedIds: string[];
  gloriosVictory: string | null;
  gloriosVictoryReason: "survivor" | "more_wins" | "final_round" | "sudden_death" | null;
  roundWins: Record<string, number>;
  /** Sudden-death tiebreaker state.
   *  - null when no sudden death has ever been triggered this game.
   *  - { active: true, contestants, mainRoundsCount } during SD.
   *  - contestants stays frozen across repeat SD rounds.
   *  - mainRoundsCount = scores[id].length captured at the moment SD first
   *    triggers, used to split R-rounds (< this) from F-rounds (≥ this) in
   *    the UI scoreboards. */
  suddenDeath: { active: boolean; contestants: string[]; mainRoundsCount: number } | null;
}

const EMPTY_ELIM: ElimState = {
  bustedThisRound: [],
  kickedIds: [],
  gloriosVictory: null,
  gloriosVictoryReason: null,
  roundWins: {},
  suddenDeath: null,
};

export type ActionTargetingMode =
  | null
  | "swap_hand"
  | "peek_own"
  | "peek_other"
  | "blind_swap_self"
  | "blind_swap_target"
  | "peek_and_swap_target_pick"
  | "peek_and_swap_self" // after peek, choose own card to swap
  | "snap_other_target"  // snap mode: click an opponent's face-down card
  | "snap_self_target";  // snap mode: click own face-down card

interface StoreState {
  screen: Screen;
  mode: GameMode;
  training: boolean;
  mp: MpRoom | null;
  /** Elimination state — single source of truth for BustedOverlay /
   *  GloriousVictory / GameLostOverlay / Scoreboard kicks across both modes.
   *  In MP this is mirrored from the room broadcast; in SP it's computed
   *  locally by `computeSpBust()` after every round_over transition. */
  elim: ElimState;
  game: GameState | null;
  pendingGame: GameState | null;  // game state created during coin toss, applied once toss is done
  coinToss: CoinTossState | null;
  humanId: string;
  setupPeekRevealed: boolean;
  targeting: ActionTargetingMode;
  pendingBlindSwapOwnIndex: number | null;
  toast: string | null;
  pendingPeekOverlay: { playerId: string; index: number; rank: string; suit: string } | null;
  chatMessages: ChatMessage[];
  chatOpen: boolean;
  chatUnread: number;
  audioOpen: boolean;
  themeOpen: boolean;
  /** Toggle for the in-game Help / Tutorial overlay. Independent of menu's
   *  tutorial — same Tutorial component, surfaced via this flag from a
   *  floating in-game button. */
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  eliminatedFromRoom: boolean;
  /** Number of bots the user has chosen on the main menu while routing to
   *  the difficulty picker. Default 1; updated when they tap a count tile. */
  pendingNumBots: number;
  setPendingNumBots: (n: number) => void;
  /** Selected rule variant for the next single-player game (chosen on the bot picker). */
  pendingVariant: GameVariant;
  setPendingVariant: (v: GameVariant) => void;
  setScreen: (s: Screen) => void;
  /** The bot difficulty profile in use for the current SP game. Drives bot
   *  decision making in [ai/bot.ts](src/ai/bot.ts) and chat lines via
   *  [ai/bots.ts](src/ai/bots.ts). Null in MP / outside an SP match. */
  botDifficulty: BotDifficulty | null;
  /** Transient SP-only "speech bubble" emitted by a bot at a key moment
   *  (cabo, win, bust, juicy draw). Auto-clears after a few seconds via
   *  the BotSpeechBubble component. */
  botSpeech: { playerId: string; text: string; at: number } | null;
  setBotSpeech: (v: StoreState["botSpeech"]) => void;
  init: (numBots: number, difficulty?: BotDifficulty, variant?: GameVariant) => void;
  trainInit: (variant?: GameVariant) => void;
  trainingInjectCard: (card: Card) => void;
  triggerAction: () => void;
  skipAction: () => void;
  coinTossChoose: (side: CoinSide) => void;
  coinTossBotAutoPick: () => void;
  coinTossResolve: () => void;
  coinTossComplete: () => void;
  mpCoinTossPick: (side: CoinSide) => void;
  start: () => void;
  setSetupPeekRevealed: (v: boolean) => void;
  draw: () => void;
  drawDiscard: () => void;
  setTargeting: (m: ActionTargetingMode) => void;
  clickOwnCard: (index: number) => void;
  clickOtherCard: (playerId: string, index: number) => void;
  discardNoAction: () => void;
  discardAndTrigger: () => void;
  /** Cabo Evolved Dragon: activate a freshly drawn Dragon (→ rank picker). */
  activateDragon: () => void;
  /** Cabo Evolved Dragon: choose the rank the Dragon transforms into. */
  dragonChooseRank: (rank: Rank) => void;
  callCaboAction: () => void;
  /** Begin snap targeting on opponents (UI mode only — sends the actual snap
   *  on card click). Press again to cancel. */
  beginSnapOther: () => void;
  beginSnapSelf: () => void;
  /** Cancel any in-progress snap targeting without firing. */
  cancelSnap: () => void;
  /** Fire a snap (SP local or MP server). Returns whether it dispatched. */
  doSnapOther: (targetId: string, targetIndex: number) => void;
  doSnapSelf: (ownIndex: number) => void;
  peekSwapDecide: (doSwap: boolean, ownIndex?: number) => void;
  /** Cabo Evolved 7/8 picker: choose to peek own OR spy other. */
  choosePeek: (choice: "own" | "other") => void;
  consumeAnimations: () => void;
  consumeReveals: () => void;
  setToast: (s: string | null) => void;
  setPeekOverlay: (v: StoreState["pendingPeekOverlay"]) => void;
  playAgain: () => void;
  backToMenu: () => void;
  leaveRoomToLobby: () => void;
  enterLobby: () => void;
  applyMpRoom: (room: MpRoom) => void;
  /** SP-only: commit a botMove() result through the bust/skip pipeline.
   *  Table.tsx's bot-driver effect calls this instead of writing directly to
   *  game so that round-end busts and kicked-seat skipping fire for bot
   *  actions too (e.g. when a bot's discard pushes them past 60). */
  applyBotMove: (next: GameState) => void;
  proceedFromStrawDraw: () => void;
  receiveChatMessage: (msg: ChatMessage) => void;
  setChatOpen: (open: boolean) => void;
  setAudioOpen: (open: boolean) => void;
  setThemeOpen: (open: boolean) => void;
  clearChat: () => void;
}

const PLAYER_COLORS = ["#ff5b6e", "#ffd86b", "#67e0a3", "#7aa8ff"];

function makePlayers(numBots: number, difficulty: BotDifficulty | null) {
  const human = { id: "p_human", name: "You", isBot: false };
  const bots = [];
  // Fallback names when no difficulty is set (Training Chamber uses this path).
  const fallback = ["Beep", "Boop", "Bam"];
  for (let i = 0; i < numBots; i++) {
    const name = difficulty ? nameForSlot(difficulty, i) : fallback[i];
    bots.push({ id: `p_bot${i + 1}`, name, isBot: true });
  }
  return [human, ...bots];
}

export { PLAYER_COLORS };

// ────────────────────────────────────────────────────────────────────────────
// SP bust / kick helpers
//
// These mirror the MP server logic in `server/src/index.ts`:
//   - computeSpBust(...)  ↔ server lines 741-838 (round-end bust + GV detection)
//   - skipKickedTurn(...) ↔ server lines 163-191 (auto-step past kicked seats)
//
// Keep them in lockstep with the server. Bust uses the FULL match total
// (round scores + cabo penalties − cabo/snap bonuses) > 60 — identical to the
// scoreboard total, so busting matches the number the player sees.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Auto-advance past any kicked players that the engine landed on. The engine
 * itself doesn't know about kicks (that's a room/store concept), so after
 * every action we need to step the turn forward until we hit a non-kicked
 * seat. Fast-path: if the current seat is fine, return the game untouched.
 */
function skipKickedTurn(game: GameState, kickedIds: string[]): GameState {
  if (game.phase === "round_over") return game;
  if (game.players.length === 0) return game;
  if (kickedIds.length === 0) return game;
  if (!kickedIds.includes(game.players[game.currentPlayer]?.id ?? "")) {
    return game;
  }
  // Work on a copy so React/Zustand sees a fresh reference.
  const next: GameState = { ...game };
  let attempts = next.players.length;
  let cur = next.currentPlayer;
  while (
    attempts > 0 &&
    kickedIds.includes(next.players[cur]?.id ?? "")
  ) {
    cur = (cur + 1) % next.players.length;
    attempts -= 1;
    if (next.caboCallerId && next.players[cur]?.id === next.caboCallerId) {
      break;
    }
  }
  next.currentPlayer = cur;
  next.phase = "turn_start";
  next.drawnCard = null;
  next.drawnFrom = null;
  next.pendingActionSource = null;
  next.peekAndSwapPick = null;
  return next;
}

/**
 * A player's running MATCH total — the exact figure the scoreboard shows and
 * that decides the winner: raw round scores PLUS cabo penalties MINUS cabo and
 * snap bonuses. The bust threshold uses this (not the raw round sum) so busting
 * matches the number the player sees: a +5 cabo penalty pushes you toward 60,
 * while a low-cabo win or snap bonus pulls you back. MUST stay identical to the
 * server's matchTotal and to Scoreboard.tsx buildRows().
 */
function matchTotal(game: GameState, id: string): number {
  const sum = (arr?: number[]) => (arr ?? []).reduce((a, b) => a + b, 0);
  return (
    sum(game.scores[id]) +
    sum(game.caboPenalty[id]) -
    sum(game.caboBonus[id]) -
    sum(game.snapBonus[id])
  );
}

/**
 * Round-end bust + glorious-victory resolution for SP. Mirrors the MP server
 * algorithm exactly (see server/src/index.ts:741-838).
 *
 * Returns the next ElimState to commit. The store is responsible for
 * orchestrating the call once `game.phase === "round_over"` lands.
 */
function computeSpBust(game: GameState, prev: ElimState): ElimState {
  // Start from prev — we keep kickedIds + roundWins between rounds. The
  // bustedThisRound / gloriosVictory fields are recomputed each round.
  const next: ElimState = {
    bustedThisRound: [],
    kickedIds: [...prev.kickedIds],
    gloriosVictory: prev.gloriosVictory,
    gloriosVictoryReason: prev.gloriosVictoryReason,
    roundWins: { ...prev.roundWins },
    suddenDeath: prev.suddenDeath
      ? {
          active: prev.suddenDeath.active,
          contestants: [...prev.suddenDeath.contestants],
          mainRoundsCount: prev.suddenDeath.mainRoundsCount,
        }
      : null,
  };

  // The engine's declared round winner is passed through unchanged, even if
  // they happen to be on kickedIds. (Winner reassignment was removed per the
  // updated spec — the round win stays with whoever the engine declared.)
  const winnerId = game.winnerId;

  // ── Sudden-death resolution branch ──────────────────────────────────────
  // If we're in an active sudden-death round, resolve it by lowest-unique
  // hand among the locked contestants. Tied hands → another SD round.
  if (prev.suddenDeath?.active) {
    // Track the engine's declared winner for history.
    if (winnerId) {
      next.roundWins[winnerId] = (next.roundWins[winnerId] ?? 0) + 1;
    }

    const contestantHands = prev.suddenDeath.contestants.map((id) => {
      const player = game.players.find((p) => p.id === id);
      return { id, handTotal: player ? handScore(player.hand, game.variant) : Infinity };
    });
    const minHand = Math.min(...contestantHands.map((c) => c.handTotal));
    const atMin = contestantHands.filter((c) => c.handTotal === minHand);

    if (atMin.length === 1) {
      // Unique winner — declare GV, kick the other contestants.
      const victorId = atMin[0].id;
      const losers = prev.suddenDeath.contestants.filter((id) => id !== victorId);
      for (const id of losers) {
        if (!next.kickedIds.includes(id)) next.kickedIds.push(id);
      }
      next.gloriosVictory = victorId;
      next.gloriosVictoryReason = "sudden_death";
      // Keep the SD record so the end-of-game scoreboard can still split
      // R/F columns, but mark inactive so no further SD logic fires.
      next.suddenDeath = {
        active: false,
        contestants: prev.suddenDeath.contestants,
        mainRoundsCount: prev.suddenDeath.mainRoundsCount,
      };
    } else {
      // Multiple tied at min — another sudden-death round needed.
      // Preserve the contestants list (frozen). Don't declare GV yet.
      next.gloriosVictory = null;
      next.gloriosVictoryReason = null;
    }
    return next;
  }

  // ── Normal path ─────────────────────────────────────────────────────────
  // Track round wins (engine's declared winner, even if kicked — per spec).
  if (winnerId) {
    next.roundWins[winnerId] = (next.roundWins[winnerId] ?? 0) + 1;
  }

  // Compute newly busted players. Bust on the FULL match total (the same
  // figure the scoreboard shows and that decides the winner): round scores +
  // cabo penalties − cabo/snap bonuses. Penalties push you toward 60; a
  // low-cabo win or snap bonus pulls you back.
  next.bustedThisRound = game.players
    .filter((p) => matchTotal(game, p.id) > 60)
    .map((p) => p.id);

  if (next.bustedThisRound.length > 0) {
    const allEliminated = new Set([...next.kickedIds, ...next.bustedThisRound]);
    // SP "active" = all players in the current game minus eliminated.
    const survivors = game.players
      .map((p) => p.id)
      .filter((pid) => !allEliminated.has(pid));

    if (survivors.length === 1) {
      for (const id of next.bustedThisRound) {
        if (!next.kickedIds.includes(id)) next.kickedIds.push(id);
      }
      next.gloriosVictory = survivors[0];
      next.gloriosVictoryReason = "survivor";

    } else if (survivors.length === 0) {
      // Simultaneous bust — tiebreaker.
      const contestants = next.bustedThisRound.filter(
        (pid) => !next.kickedIds.includes(pid),
      );

      if (contestants.length === 1) {
        // Only one active buster — they win by default.
        const gloriousWinnerId = contestants[0];
        next.bustedThisRound = next.bustedThisRound.filter((id) => id !== gloriousWinnerId);
        for (const id of next.bustedThisRound) {
          if (!next.kickedIds.includes(id)) next.kickedIds.push(id);
        }
        next.gloriosVictory = gloriousWinnerId;
        next.gloriosVictoryReason = "survivor";
      } else if (contestants.length > 1) {
        const maxWins = Math.max(...contestants.map((pid) => next.roundWins[pid] ?? 0));
        const topByWins = contestants.filter((pid) => (next.roundWins[pid] ?? 0) === maxWins);
        if (topByWins.length === 1) {
          const gloriousWinnerId = topByWins[0];
          next.bustedThisRound = next.bustedThisRound.filter((id) => id !== gloriousWinnerId);
          for (const id of next.bustedThisRound) {
            if (!next.kickedIds.includes(id)) next.kickedIds.push(id);
          }
          next.gloriosVictory = gloriousWinnerId;
          next.gloriosVictoryReason = "more_wins";
        } else if (winnerId && topByWins.includes(winnerId)) {
          // Last-round winner is in the tied set → they take it.
          const gloriousWinnerId = winnerId;
          next.bustedThisRound = next.bustedThisRound.filter((id) => id !== gloriousWinnerId);
          for (const id of next.bustedThisRound) {
            if (!next.kickedIds.includes(id)) next.kickedIds.push(id);
          }
          next.gloriosVictory = gloriousWinnerId;
          next.gloriosVictoryReason = "final_round";
        } else {
          // NEW: Sudden Death trigger. The tied-on-wins set plays another
          // round to break the tie. Kick the players who busted but aren't
          // in the tied set (they lost the wins tiebreaker outright).
          const losers = next.bustedThisRound.filter(
            (id) => !topByWins.includes(id) && !next.kickedIds.includes(id),
          );
          for (const id of losers) {
            if (!next.kickedIds.includes(id)) next.kickedIds.push(id);
          }
          // Remove SD contestants from bustedThisRound — they're playing
          // the tiebreaker, not eliminated. Leaving them in would cause
          // BustedOverlay to incorrectly show them the "Busted" splash +
          // "Return to menu" modal at SD trigger round_over.
          next.bustedThisRound = next.bustedThisRound.filter(
            (id) => !topByWins.includes(id),
          );
          // Set sudden-death state — DO NOT declare GV yet.
          const anyPlayerId = game.players[0]?.id;
          const mainRoundsCount = anyPlayerId
            ? (game.scores[anyPlayerId]?.length ?? 0)
            : 0;
          next.suddenDeath = {
            active: true,
            contestants: topByWins,
            mainRoundsCount,
          };
        }
      }
    }
    // survivors.length > 1: normal play-again flow — busts are moved into
    // kickedIds on the playAgain() click, not here.
  }

  return next;
}

/**
 * Mirror an MP room's bust/kick fields onto our local `elim`. Called from
 * `applyMpRoom`. This is what lets UI components read `elim` regardless of
 * mode — the MP server is still the source of truth, we just normalise the
 * shape so consumers don't care which path the data took.
 */
function elimFromMpRoom(room: MpRoom, prevRoundWins: Record<string, number>): ElimState {
  return {
    bustedThisRound: room.bustedThisRound ?? [],
    kickedIds: room.kickedIds ?? [],
    gloriosVictory: room.gloriosVictory ?? null,
    gloriosVictoryReason: room.gloriosVictoryReason ?? null,
    // Server doesn't broadcast roundWins (only used for SP tiebreaker);
    // preserve what we had, default to {}.
    roundWins: prevRoundWins,
    suddenDeath: room.suddenDeath ?? null,
  };
}

/**
 * Post-process an SP engine result before committing. This is the ONE place
 * we add the cross-cutting bust + skip-kicked logic that the engine doesn't
 * know about. Returns the patch object to pass to set().
 *
 * Sequence:
 *  1. Skip past any kicked seats so the new currentPlayer is alive.
 *  2. If the round just ended, compute the bust state.
 *  3. Return the updated game + elim.
 */
function applySpResult(rawGame: GameState, prevElim: ElimState): { game: GameState; elim: ElimState } {
  const game = skipKickedTurn(rawGame, prevElim.kickedIds);
  if (game.phase === "round_over") {
    const elim = computeSpBust(game, prevElim);
    return { game, elim };
  }
  return { game, elim: prevElim };
}

export const useStore = create<StoreState>((set, get) => ({
  screen: "menu",
  mode: "sp",
  training: false,
  mp: null,
  elim: EMPTY_ELIM,
  game: null,
  pendingGame: null,
  coinToss: null,
  humanId: "p_human",
  setupPeekRevealed: false,
  targeting: null,
  pendingBlindSwapOwnIndex: null,
  toast: null,
  pendingPeekOverlay: null,
  chatMessages: [],
  chatOpen: false,
  chatUnread: 0,
  audioOpen: false,
  themeOpen: false,
  helpOpen: false,
  setHelpOpen(open) { set({ helpOpen: open }); },
  eliminatedFromRoom: false,
  pendingNumBots: 1,
  setPendingNumBots(n) { set({ pendingNumBots: n }); },
  pendingVariant: "classic",
  setPendingVariant(v) { set({ pendingVariant: v }); },
  setScreen(s) { set({ screen: s }); },
  botDifficulty: null,
  botSpeech: null,
  setBotSpeech(v) { set({ botSpeech: v }); },

  init(numBots, difficulty, variant = "classic") {
    const diff = difficulty ?? null;
    const game = newGame({ players: makePlayers(numBots, diff), variant });
    // Start with the coin toss screen — the actual game state is held in
    // pendingGame until the toss completes and decides the starting player.
    set({
      mode: "sp", training: false, mp: null,
      elim: EMPTY_ELIM,
      game: null,
      pendingGame: game,
      screen: "coin_toss",
      coinToss: {
        humanChoice: null,
        botChoice: null,
        result: null,
        winnerId: null,
        phase: "choosing",
        countdownEndsAt: Date.now() + 5000,
      },
      humanId: "p_human",
      setupPeekRevealed: false, targeting: null, toast: null,
      botDifficulty: diff,
      botSpeech: null,
    });
  },

  trainInit(variant = "classic") {
    // Training Chamber: 1 bot so swap/spy actions have a target to work with.
    // Skip the coin toss in training mode — human always starts for predictable testing.
    // `variant` lets the chamber drill Classic or Cabo Evolved (Dragon, K=0, 7/8
    // peek-or-spy, 9/10 peek+spy, Kamikaze, Carré) — chosen on the menu.
    const game = newGame({ players: makePlayers(1, null), variant });
    set({
      mode: "sp", training: true, mp: null,
      elim: EMPTY_ELIM,
      game, screen: "game",
      pendingGame: null, coinToss: null,
      humanId: "p_human",
      setupPeekRevealed: false, targeting: null, toast: null,
    });
  },

  coinTossChoose(side) {
    const { coinToss, pendingGame } = get();
    if (!coinToss || !pendingGame) return;
    if (coinToss.humanChoice) return;
    const botChoice: CoinSide = side === "heads" ? "tails" : "heads";
    // Bot's choice is locked in immediately (mirror of human's), but we delay
    // revealing it slightly for drama. For now just lock it.
    set({
      coinToss: { ...coinToss, humanChoice: side, botChoice, phase: "flipping" },
    });
    // After a short delay, resolve the coin
    setTimeout(() => get().coinTossResolve(), 900);
  },

  coinTossBotAutoPick() {
    // Called when the 5-second countdown expires and the human hasn't chosen yet.
    // The bot picks first; the human is then assigned the other side.
    const { coinToss } = get();
    if (!coinToss || coinToss.humanChoice) return;
    const botChoice: CoinSide = Math.random() < 0.5 ? "heads" : "tails";
    const humanChoice: CoinSide = botChoice === "heads" ? "tails" : "heads";
    set({
      coinToss: { ...coinToss, humanChoice, botChoice, phase: "flipping" },
    });
    setTimeout(() => get().coinTossResolve(), 900);
  },

  coinTossResolve() {
    const { coinToss, pendingGame } = get();
    if (!coinToss || !pendingGame) return;
    const result: CoinSide = Math.random() < 0.5 ? "heads" : "tails";
    // Determine winner: whichever player chose this side
    let winnerId: string;
    if (coinToss.humanChoice === result) {
      winnerId = "p_human";
    } else {
      // Pick first bot from the pending game
      const firstBot = pendingGame.players.find((p) => p.isBot);
      winnerId = firstBot ? firstBot.id : pendingGame.players[0].id;
    }
    set({
      coinToss: { ...coinToss, result, winnerId, phase: "done" },
    });
  },

  coinTossComplete() {
    const { coinToss, pendingGame } = get();
    if (!coinToss || !pendingGame || !coinToss.winnerId) return;
    // Inject the winning player as currentPlayer
    const startIdx = pendingGame.players.findIndex((p) => p.id === coinToss.winnerId);
    const game = { ...pendingGame, currentPlayer: startIdx >= 0 ? startIdx : 0 };
    set({
      game,
      pendingGame: null,
      coinToss: null,
      screen: "game",
    });
  },

  mpCoinTossPick(side) {
    const { coinToss } = get();
    if (!coinToss || coinToss.humanChoice) return;
    import("./mp").then((m) => (m as any).sendCoinTossPick(side));
    // Optimistic: mark our own choice locally while server confirms
    set({ coinToss: { ...coinToss, humanChoice: side } });
  },

  trainingInjectCard(card) {
    const { game, training, elim } = get();
    if (!game || !training) return;
    set(applySpResult(engineTrainingInject(game, card), elim));
  },

  start() {
    const { mode, game, elim } = get();
    if (mode === "mp") {
      // server-side action
      import("./mp").then((m) => m.sendAction({ type: "start_play" }));
      return;
    }
    if (!game) return;
    set({ ...applySpResult(startPlay(game), elim), setupPeekRevealed: true });
  },

  enterLobby() {
    set({ screen: "lobby", mode: "mp" });
  },

  applyMpRoom(room) {
    const prev = get();
    // Mirror the room's bust/kick/GV fields onto our local elim so UI
    // components can read elim regardless of mode. Preserve our prev
    // roundWins (server doesn't broadcast it — only used for SP tiebreaker).
    const elim = elimFromMpRoom(room, prev.elim.roundWins);

    // When a multiplayer game first starts (lobby → game), route through the
    // coin-toss screen to reveal who goes first. The server already chose
    // currentPlayer — we just animate the reveal then switch to "game".
    const freshGameStart =
      !!room.game &&
      !prev.game &&
      prev.screen !== "game" &&
      prev.screen !== "coin_toss" &&
      prev.screen !== "straw_draw";

    if (freshGameStart && room.game) {
      const playerCount = room.game.players.length;

      // 2 players → interactive coin toss (when not yet resolved).
      // 3+ players → interactive straw draw (when not yet resolved).
      // Otherwise (rejoining mid-game) → straight to game.
      if (playerCount === 2 && room.coinToss && !room.coinToss.result) {
        set({
          mp: room,
          elim,
          humanId: room.viewerId,
          mode: "mp",
          game: null,
          pendingGame: room.game,
          screen: "coin_toss",
          coinToss: {
            humanChoice: null,
            botChoice: null,
            result: null,
            winnerId: null,
            phase: "choosing",
            countdownEndsAt: room.coinToss.startedAt ? room.coinToss.startedAt + 5000 : null,
          },
          targeting: null,
          setupPeekRevealed: false,
        });
      } else if (playerCount >= 3 && room.strawDraw && !room.strawDraw.result) {
        set({
          mp: room,
          elim,
          humanId: room.viewerId,
          mode: "mp",
          game: null,
          pendingGame: room.game,
          screen: "straw_draw",
          targeting: null,
          setupPeekRevealed: false,
        });
      } else {
        set({
          mp: room,
          elim,
          humanId: room.viewerId,
          mode: "mp",
          game: room.game,
          screen: "game",
          targeting: null,
          setupPeekRevealed: false,
        });
      }
      return;
    }

    // Live straw-draw updates: someone picked, or the result just arrived.
    if (prev.screen === "straw_draw" && room.strawDraw) {
      set({ mp: room, elim });
      return;
    }

    // Live coin-toss updates: other player picked / result arrived
    if (prev.screen === "coin_toss" && prev.coinToss?.phase === "choosing" && room.coinToss) {
      const ct = room.coinToss;
      const myId = room.viewerId;
      const other = room.members.find((m) => m.id !== myId);
      const myChoice: CoinSide | null =
        ct.choices.heads === myId ? "heads" : ct.choices.tails === myId ? "tails" : null;
      const otherChoice: CoinSide | null =
        ct.choices.heads === other?.id ? "heads" : ct.choices.tails === other?.id ? "tails" : null;

      if (ct.result && prev.pendingGame) {
        // Both sides assigned and result known → transition to flip
        const winnerPlayerId = ct.result === "heads" ? ct.choices.heads : ct.choices.tails;
        set({
          mp: room,
          elim,
          coinToss: {
            humanChoice: myChoice,
            botChoice: otherChoice,
            result: ct.result,
            winnerId: winnerPlayerId,
            phase: "flipping",
            countdownEndsAt: null,
          },
        });
        setTimeout(() => {
          const st = get();
          if (st.screen !== "coin_toss" || !st.coinToss) return;
          set({ coinToss: { ...st.coinToss, phase: "done" } });
        }, 900);
        return;
      }

      // Partial update: other player just picked but result not yet set
      const countdownEndsAt = ct.startedAt
        ? ct.startedAt + 5000
        : prev.coinToss!.countdownEndsAt;
      set({
        mp: room,
        elim,
        coinToss: { ...prev.coinToss!, humanChoice: myChoice, botChoice: otherChoice, countdownEndsAt },
      });
      return;
    }

    const screen: Screen = room.game ? "game" : "lobby";
    const prevRoundNumber = prev.game?.roundNumber;
    const nextRoundNumber = room.game?.roundNumber;
    const isFreshRound =
      !!room.game &&
      (prevRoundNumber !== nextRoundNumber || prev.screen !== "game");

    // Derive targeting from the new phase when it is THIS viewer's turn.
    // Without this, after a server-sent state with phase=action_peek_own etc.,
    // the client would treat a card-tap as a snap (extra card bug).
    let targeting = prev.targeting;
    let pendingBlindSwapOwnIndex = prev.pendingBlindSwapOwnIndex;
    const g = room.game;
    if (g) {
      // Cinematic-first snap is phase-agnostic and supersedes normal turn
      // targeting while snapPhase !== 'idle'. If I'm the snapper, set
      // targeting to the snap pick set; if someone else is, clear mine.
      if (g.snapPhase !== "idle") {
        if (g.snappingPlayerId === room.viewerId) {
          targeting = g.snapPhase === "armed_self"
            ? "snap_self_target"
            : g.snapPhase === "armed_other"
            ? "snap_other_target"
            : null;
        } else {
          targeting = null;
        }
        pendingBlindSwapOwnIndex = null;
        // Skip the normal-turn switch below — snap takes priority.
        set({
          mp: room,
          elim,
          game: g,
          humanId: room.viewerId,
          screen,
          mode: "mp",
          setupPeekRevealed: isFreshRound ? false : prev.setupPeekRevealed,
          targeting,
          pendingBlindSwapOwnIndex,
        });
        return;
      }
      const isMyTurn = g.players[g.currentPlayer]?.id === room.viewerId;
      if (isMyTurn) {
        switch (g.phase) {
          case "action_peek_own":
            targeting = "peek_own"; pendingBlindSwapOwnIndex = null; break;
          case "action_peek_other":
            targeting = "peek_other"; pendingBlindSwapOwnIndex = null; break;
          case "action_peek_choose":
            // Evolved 7/8 picker — choice is via buttons, no board target yet.
            targeting = null; pendingBlindSwapOwnIndex = null; break;
          case "dragon_choose":
            // Evolved Dragon rank picker — choice is via buttons, no board target.
            targeting = null; pendingBlindSwapOwnIndex = null; break;
          case "action_blind_swap":
            // If we already picked our own card, stay on the target step
            if (pendingBlindSwapOwnIndex === null) targeting = "blind_swap_self";
            break;
          case "action_peek_and_swap_pick":
            targeting = "peek_and_swap_target_pick"; pendingBlindSwapOwnIndex = null; break;
          case "action_peek_and_swap_decide":
            if (prev.targeting !== "peek_and_swap_self") targeting = null;
            break;
          case "turn_drawn":
            // Player chooses Swap or Discard via buttons — clear leftover targeting
            if (prev.targeting !== "swap_hand") targeting = null;
            break;
          case "pending_action":
            // Player chooses Action or Skip via buttons — no targeting yet
            targeting = null;
            pendingBlindSwapOwnIndex = null;
            break;
          case "turn_start":
          case "round_over":
          case "setup_peek":
            targeting = null;
            pendingBlindSwapOwnIndex = null;
            break;
        }
      } else {
        // Not my turn — clear my targeting
        targeting = null;
        pendingBlindSwapOwnIndex = null;
      }
    }

    set({
      mp: room,
      elim,
      game: room.game,
      humanId: room.viewerId,
      screen,
      mode: "mp",
      setupPeekRevealed: isFreshRound ? false : prev.setupPeekRevealed,
      targeting,
      pendingBlindSwapOwnIndex,
    });
  },

  applyBotMove(next) {
    const { elim, mode } = get();
    if (mode !== "sp") return;
    set(applySpResult(next, elim));
  },

  setSetupPeekRevealed(v) {
    set({ setupPeekRevealed: v });
  },

  draw() {
    const { mode, game, elim } = get();
    // Snap pauses the world: while snapPhase !== "idle", no draws / plays /
    // swaps / cabo-calls resolve for ANY player. The drawn card (if any)
    // and pending action stay frozen until the snap finishes.
    if (game && game.snapPhase !== "idle") return;
    if (mode === "mp") {
      import("./mp").then((m) => m.sendAction({ type: "draw_deck" }));
      return;
    }
    if (!game) return;
    set(applySpResult(drawFromDeck(game), elim));
  },

  drawDiscard() {
    const { mode, game, elim } = get();
    if (game && game.snapPhase !== "idle") return;
    if (mode === "mp") {
      import("./mp").then((m) => m.sendAction({ type: "draw_discard" }));
      return;
    }
    if (!game) return;
    set(applySpResult(drawFromDiscard(game), elim));
  },

  setTargeting(m) {
    set({ targeting: m });
  },

  clickOwnCard(index) {
    const { game, targeting, humanId, mode, elim } = get();
    if (!game) return;

    // Fire-and-forget for non-critical actions. For actions that change targeting
    // state, pass onFail so the UI recovers if the server rejects (e.g. due to a
    // brief reconnect causing a phase mismatch).
    const dispatch = (
      type: string,
      payload: Record<string, any> = {},
      onFail?: () => void,
    ) => {
      if (mode === "mp") {
        import("./mp").then((m) =>
          m.sendAction({ type: type as any, ...payload }, onFail),
        );
      }
    };

    // Setup peek: any player may tap up to 2 of THEIR OWN cards.
    if (game.phase === "setup_peek") {
      if (mode === "mp") dispatch("setup_peek_card", { index });
      else set(applySpResult(setupPeekCard(game, humanId, index), elim));
      return;
    }

    // Cinematic-first snap: the engine's snapPhase is the source of truth.
    // If we armed self-snap and the human clicks one of their cards, this
    // is the resolving pick. Phase-agnostic (any turn-phase).
    if (
      game.snapPhase === "armed_self" &&
      game.snappingPlayerId === humanId
    ) {
      get().doSnapSelf(index);
      return;
    }
    // Local targeting fallback (still set by beginSnapSelf for highlight).
    if (targeting === "snap_self_target") {
      get().doSnapSelf(index);
      return;
    }

    // Snap pauses the world: non-snap card clicks (swap_hand pick, peek_own,
    // blind_swap pick, peek+swap pick) are inert until the snap resolves.
    if (game.snapPhase !== "idle") return;

    const player = game.players[game.currentPlayer];
    if (player.id !== humanId) return;

    if (game.phase === "turn_drawn" && targeting === "swap_hand") {
      if (mode === "mp") {
        dispatch("swap_drawn", { handIndex: index }, () => {
          // Server rejected — restore targeting so the player can try again without
          // having to manually re-click "Swap into Hand".
          set({ targeting: "swap_hand" });
        });
      } else {
        set(applySpResult(swapDrawnWithHand(game, index), elim));
      }
      set({ targeting: null });
      return;
    }
    if (game.phase === "action_peek_own" && targeting === "peek_own") {
      if (mode === "mp") {
        dispatch("action_peek_own", { index }, () => set({ targeting: "peek_own" }));
        set({ targeting: null });
      } else {
        // SP: a 9/10 "peek both" routes into the spy step after the own-peek;
        // carry targeting to peek_other in that case, else clear it.
        const res = applySpResult(actionPeekOwn(game, index), elim);
        set({ ...res, targeting: res.game.phase === "action_peek_other" ? "peek_other" : null });
      }
      return;
    }
    if (game.phase === "action_blind_swap" && targeting === "blind_swap_self") {
      set({ pendingBlindSwapOwnIndex: index, targeting: "blind_swap_target" });
      return;
    }
    if (
      game.phase === "action_peek_and_swap_decide" &&
      targeting === "peek_and_swap_self"
    ) {
      if (mode === "mp") {
        dispatch(
          "action_peek_and_swap_decide",
          { doSwap: true, ownIndex: index },
          () => set({ targeting: "peek_and_swap_self" }),
        );
      } else {
        set(applySpResult(actionPeekAndSwapDecide(game, true, index), elim));
      }
      set({ targeting: null });
      return;
    }
  },

  clickOtherCard(playerId, index) {
    const { game, targeting, pendingBlindSwapOwnIndex, mode, humanId, elim } = get();
    if (!game) return;
    const dispatch = (type: string, payload: Record<string, any> = {}) => {
      if (mode === "mp") {
        import("./mp").then((m) => m.sendAction({ type: type as any, ...payload }));
      }
    };
    // Cinematic-first snap: engine snapPhase is the source of truth.
    if (
      game.snapPhase === "armed_other" &&
      game.snappingPlayerId === humanId
    ) {
      get().doSnapOther(playerId, index);
      return;
    }
    // Local targeting fallback (still set by beginSnapOther for highlight).
    if (targeting === "snap_other_target") {
      get().doSnapOther(playerId, index);
      return;
    }
    // Snap pauses the world: non-snap clicks on rival cards (peek_other,
    // blind_swap target, peek+swap pick) are inert until the snap resolves.
    if (game.snapPhase !== "idle") return;
    if (game.phase === "action_peek_other" && targeting === "peek_other") {
      if (mode === "mp") dispatch("action_peek_other", { targetPlayerId: playerId, index });
      else set(applySpResult(actionPeekOther(game, playerId, index), elim));
      set({ targeting: null });
      return;
    }
    if (
      game.phase === "action_blind_swap" &&
      targeting === "blind_swap_target" &&
      pendingBlindSwapOwnIndex !== null
    ) {
      if (mode === "mp") {
        dispatch("action_blind_swap", {
          ownIndex: pendingBlindSwapOwnIndex,
          targetPlayerId: playerId,
          targetIndex: index,
        });
      } else {
        const updated = actionBlindSwap(game, pendingBlindSwapOwnIndex, playerId, index);
        set(applySpResult(updated, elim));
      }
      set({ targeting: null, pendingBlindSwapOwnIndex: null });
      return;
    }
    if (
      game.phase === "action_peek_and_swap_pick" &&
      targeting === "peek_and_swap_target_pick"
    ) {
      if (mode === "mp") dispatch("action_peek_and_swap_pick", { targetPlayerId: playerId, index });
      else set(applySpResult(actionPeekAndSwapPick(game, playerId, index), elim));
      set({ targeting: null });
      return;
    }
  },

  /** Pure discard — no ability triggered, even if the card has one. */
  discardNoAction() {
    const { mode, game, elim } = get();
    if (game && game.snapPhase !== "idle") return;
    if (mode === "mp") {
      import("./mp").then((m) => m.sendAction({ type: "discard_and_skip" }));
      return;
    }
    if (!game) return;
    set({ ...applySpResult(discardDrawnSkipAction(game), elim), targeting: null });
  },

  /** Discard and immediately activate the card's ability. */
  discardAndTrigger() {
    const { mode, game, elim } = get();
    if (game && game.snapPhase !== "idle") return;
    if (mode === "mp") {
      import("./mp").then((m) => m.sendAction({ type: "discard_and_trigger" }));
      return;
    }
    if (!game) return;
    const next = discardDrawnWithAction(game);
    let targeting: ActionTargetingMode = null;
    switch (next.phase) {
      case "action_peek_own": targeting = "peek_own"; break;
      case "action_peek_other": targeting = "peek_other"; break;
      case "action_blind_swap": targeting = "blind_swap_self"; break;
      case "action_peek_and_swap_pick": targeting = "peek_and_swap_target_pick"; break;
      default: break;
    }
    set({ ...applySpResult(next, elim), targeting });
  },

  triggerAction() {
    const { mode, game, elim } = get();
    if (game && game.snapPhase !== "idle") return;
    if (mode === "mp") {
      import("./mp").then((m) => m.sendAction({ type: "trigger_action" } as any));
      return;
    }
    if (!game) return;
    const next = triggerPendingAction(game);
    let targeting: ActionTargetingMode = null;
    switch (next.phase) {
      case "action_peek_own": targeting = "peek_own"; break;
      case "action_peek_other": targeting = "peek_other"; break;
      case "action_blind_swap": targeting = "blind_swap_self"; break;
      case "action_peek_and_swap_pick": targeting = "peek_and_swap_target_pick"; break;
      default: break;
    }
    set({ ...applySpResult(next, elim), targeting });
  },

  skipAction() {
    const { mode, game, elim } = get();
    if (game && game.snapPhase !== "idle") return;
    if (mode === "mp") {
      import("./mp").then((m) => m.sendAction({ type: "skip_action" } as any));
      return;
    }
    if (!game) return;
    set({ ...applySpResult(skipPendingAction(game), elim), targeting: null });
  },

  choosePeek(choice) {
    const { mode, game, elim } = get();
    if (game && game.snapPhase !== "idle") return;
    if (mode === "mp") {
      import("./mp").then((m) => m.sendAction({ type: "action_choose_peek", choice } as any));
      return;
    }
    if (!game) return;
    const next = actionChoosePeek(game, choice);
    const targeting: ActionTargetingMode =
      next.phase === "action_peek_own" ? "peek_own"
      : next.phase === "action_peek_other" ? "peek_other"
      : null;
    set({ ...applySpResult(next, elim), targeting });
  },

  activateDragon() {
    const { mode, game, elim } = get();
    if (game && game.snapPhase !== "idle") return;
    if (mode === "mp") {
      import("./mp").then((m) => m.sendAction({ type: "activate_dragon" } as any));
      return;
    }
    if (!game) return;
    set({ ...applySpResult(engineActivateDragon(game), elim), targeting: null });
  },

  dragonChooseRank(rank) {
    const { mode, game, elim } = get();
    if (game && game.snapPhase !== "idle") return;
    if (mode === "mp") {
      import("./mp").then((m) => m.sendAction({ type: "dragon_choose_rank", rank } as any));
      return;
    }
    if (!game) return;
    set({ ...applySpResult(engineDragonChooseRank(game, rank), elim), targeting: null });
  },

  callCaboAction() {
    const { mode, game, elim } = get();
    if (game && game.snapPhase !== "idle") return;
    if (mode === "mp") {
      import("./mp").then((m) => m.sendAction({ type: "call_cabo" }));
      return;
    }
    if (!game) return;
    set(applySpResult(callCabo(game), elim));
  },

  // ─────────────────────────────────────────────────────────────────────
  // Snap — cinematic-first flow.
  //
  // Pressing a Snap button COMMITS via the engine's actionStartSnap*: the
  // game's snapPhase flips to armed_*, snap_armed_* event fires, and the
  // SNAP! overlay plays before the player picks. No cancel — the player
  // must follow through with a pick. Targeting is still set locally so the
  // PlayerSeat highlight logic doesn't change.
  // ─────────────────────────────────────────────────────────────────────
  beginSnapOther() {
    const { mode, game, humanId, targeting } = get();
    if (!game) return;
    if (game.phase === "setup_peek" || game.phase === "round_over") return;
    if (game.snapPhase !== "idle") return;
    const me = game.players.find((p) => p.id === humanId);
    if (!me || me.snapsUsed.other) return;
    // Refuse if a non-snap action is already targeting — finishing the
    // pending action takes priority.
    if (targeting && targeting !== "snap_self_target" && targeting !== "snap_other_target") return;
    if (mode === "mp") {
      import("./mp").then((m) =>
        m.sendAction(
          { type: "action_start_snap_other" },
          () => set({ targeting: null }),
        ),
      );
      set({ targeting: "snap_other_target" });
      return;
    }
    const next = actionStartSnapOther(game, humanId);
    if (next === game) return; // engine rejected
    const elim = get().elim;
    set({ ...applySpResult(next, elim), targeting: "snap_other_target" });
  },

  beginSnapSelf() {
    const { mode, game, humanId, targeting } = get();
    if (!game) return;
    if (game.phase === "setup_peek" || game.phase === "round_over") return;
    if (game.snapPhase !== "idle") return;
    const me = game.players.find((p) => p.id === humanId);
    if (!me || me.snapsUsed.self) return;
    if (targeting && targeting !== "snap_self_target" && targeting !== "snap_other_target") return;
    if (mode === "mp") {
      import("./mp").then((m) =>
        m.sendAction(
          { type: "action_start_snap_self" },
          () => set({ targeting: null }),
        ),
      );
      set({ targeting: "snap_self_target" });
      return;
    }
    const next = actionStartSnapSelf(game, humanId);
    if (next === game) return;
    const elim = get().elim;
    set({ ...applySpResult(next, elim), targeting: "snap_self_target" });
  },

  /** No-op kept for backwards compatibility — the cinematic flow has no
   *  cancel path. Callers that used to cancel a snap now simply do nothing. */
  cancelSnap() {
    /* intentionally empty — snap commits on press */
  },

  doSnapOther(targetId, targetIndex) {
    const { mode, game, humanId, elim } = get();
    if (mode === "mp") {
      import("./mp").then((m) =>
        m.sendAction(
          { type: "action_snap_other", targetPlayerId: targetId, targetIndex },
          // Server rejected (race against another snap, brief disconnect, etc.)
          // — re-arm targeting so the player can pick a different card without
          // having to click "Snap rival" again.
          () => set({ targeting: "snap_other_target" }),
        ),
      );
      set({ targeting: null });
      return;
    }
    if (!game) return;
    set({ ...applySpResult(actionSnapOther(game, humanId, targetId, targetIndex), elim), targeting: null });
  },

  doSnapSelf(ownIndex) {
    const { mode, game, humanId, elim } = get();
    if (mode === "mp") {
      import("./mp").then((m) =>
        m.sendAction(
          { type: "action_snap_self", ownIndex },
          () => set({ targeting: "snap_self_target" }),
        ),
      );
      set({ targeting: null });
      return;
    }
    if (!game) return;
    set({ ...applySpResult(actionSnapSelf(game, humanId, ownIndex), elim), targeting: null });
  },

  peekSwapDecide(doSwap, ownIndex) {
    const { mode, game, elim } = get();
    if (mode === "mp") {
      if (doSwap && ownIndex === undefined) {
        set({ targeting: "peek_and_swap_self" });
        return;
      }
      import("./mp").then((m) =>
        m.sendAction({ type: "action_peek_and_swap_decide", doSwap, ownIndex }),
      );
      set({ targeting: null });
      return;
    }
    if (!game) return;
    if (doSwap && ownIndex === undefined) {
      set({ targeting: "peek_and_swap_self" });
      return;
    }
    set({ ...applySpResult(actionPeekAndSwapDecide(game, doSwap, ownIndex), elim), targeting: null });
  },

  consumeAnimations() {
    const g = get().game;
    if (!g) return;
    set({ game: clearAnimations(g) });
  },

  consumeReveals() {
    const g = get().game;
    if (!g) return;
    set({ game: clearReveals(g) });
  },

  setToast(s) {
    set({ toast: s });
    if (s) setTimeout(() => {
      if (get().toast === s) set({ toast: null });
    }, 2200);
  },

  setPeekOverlay(v) {
    set({ pendingPeekOverlay: v });
  },

  playAgain() {
    const { mode, game, elim } = get();
    if (mode === "mp") {
      import("./mp").then((m) =>
        m.getSocket().emit("room:play_again", {}, () => undefined),
      );
      return;
    }
    if (!game) return;
    if (elim.gloriosVictory) return; // game over, nothing to play

    // Sudden-death path: contestants play another tie-breaker round. Their
    // busted-but-not-kicked status is preserved (they're still "in" — playing
    // the tiebreaker). Filter the next round's seat list to ONLY the SD
    // contestants. Preserve all scoring history.
    if (elim.suddenDeath?.active) {
      const contestantSet = new Set(elim.suddenDeath.contestants);
      const playerInputs = game.players
        .filter((p) => contestantSet.has(p.id))
        .map((p) => ({ id: p.id, name: p.name, isBot: p.isBot }));
      if (playerInputs.length < 2) {
        // Defensive: SD should never trigger with <2 contestants, but if
        // somehow we land here, declare the lone remaining player.
        const survivor = playerInputs[0]?.id ?? null;
        set({
          elim: {
            ...elim,
            bustedThisRound: [],
            gloriosVictory: survivor,
            gloriosVictoryReason: survivor ? "sudden_death" : null,
            // Keep the SD record (inactive) so end-of-game scoreboards can
            // still split R/F columns.
            suddenDeath: elim.suddenDeath
              ? {
                  active: false,
                  contestants: elim.suddenDeath.contestants,
                  mainRoundsCount: elim.suddenDeath.mainRoundsCount,
                }
              : null,
          },
        });
        return;
      }
      const next = newGame({
        players: playerInputs,
        variant: game.variant,
        roundNumber: game.roundNumber + 1,
        scores: game.scores,
        caboBonus: game.caboBonus,
        caboPenalty: game.caboPenalty,
        snapBonus: game.snapBonus,
        kamikaze: game.kamikaze,
      });
      set({
        game: next,
        elim: {
          ...elim,
          // bustedThisRound resets for the new round; contestants remain
          // "in" (no migration to kickedIds during a SD transition).
          bustedThisRound: [],
        },
        setupPeekRevealed: false,
        targeting: null,
        toast: null,
      });
      return;
    }

    // Finalise busts from the round that just ended: move into permanent
    // kickedIds. This mirrors the server's play_again handler.
    const nextKicked = [...elim.kickedIds];
    for (const id of elim.bustedThisRound) {
      if (!nextKicked.includes(id)) nextKicked.push(id);
    }
    const finalisedElim: ElimState = {
      ...elim,
      bustedThisRound: [],
      kickedIds: nextKicked,
    };

    // Filter out kicked players from the next round's seat list. The Glorious
    // Victor's seat persists; kicks are permanent for the rest.
    const kickedSet = new Set(nextKicked);
    const activePlayers = game.players.filter((p) => !kickedSet.has(p.id));

    if (activePlayers.length <= 1) {
      // Only one (or zero) active players remain — declare GV immediately
      // instead of starting a new round.
      const survivor = activePlayers[0]?.id ?? null;
      set({
        elim: {
          ...finalisedElim,
          gloriosVictory: survivor,
          gloriosVictoryReason: "survivor",
        },
      });
      return;
    }

    const playerInputs = activePlayers.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot }));
    const next = newGame({
      players: playerInputs,
      variant: game.variant,
      roundNumber: game.roundNumber + 1,
      scores: game.scores,
      caboBonus: game.caboBonus,
      caboPenalty: game.caboPenalty,
      snapBonus: game.snapBonus,
      kamikaze: game.kamikaze,
    });
    set({
      game: next,
      elim: finalisedElim,
      setupPeekRevealed: false,
      targeting: null,
      toast: null,
    });
  },

  backToMenu() {
    const { mode, eliminatedFromRoom } = get();
    if (mode === "mp") {
      import("./mp").then((m) => m.leaveRoom());
    }
    // If the player was on the EliminatedOverlay, clear the persisted busted
    // marker so they won't see the elimination screen again on a fresh visit.
    if (eliminatedFromRoom) {
      try { localStorage.removeItem("cobo.mp.busted"); } catch { /* ignore */ }
    }
    set({
      screen: "menu", mode: "sp", training: false, mp: null,
      elim: EMPTY_ELIM,
      game: null, pendingGame: null, coinToss: null,
      targeting: null, toast: null,
      chatMessages: [], chatOpen: false, chatUnread: 0,
      eliminatedFromRoom: false,
      botDifficulty: null, botSpeech: null,
    });
  },

  // Leave the current room but stay in the Lobby (choose mode) instead of
  // going all the way back to the main menu.
  leaveRoomToLobby() {
    import("./mp").then((m) => m.leaveRoom());
    set({
      screen: "lobby", mode: "mp", mp: null,
      elim: EMPTY_ELIM,
      game: null, targeting: null, toast: null,
      chatMessages: [], chatOpen: false, chatUnread: 0,
    });
  },

  receiveChatMessage(msg) {
    const { chatMessages, chatOpen, humanId } = get();
    const next = [...chatMessages, msg].slice(-100);
    const isMine = msg.from === humanId;
    set({
      chatMessages: next,
      chatUnread: isMine || chatOpen ? get().chatUnread : get().chatUnread + 1,
    });
    if (!isMine) Audio.playSfx("chat");
  },

  setChatOpen(open) {
    set({
      chatOpen: open,
      chatUnread: open ? 0 : get().chatUnread,
      audioOpen: open ? false : get().audioOpen,
      themeOpen: open ? false : get().themeOpen,
    });
  },
  setAudioOpen(open) {
    set({
      audioOpen: open,
      chatOpen: open ? false : get().chatOpen,
      themeOpen: open ? false : get().themeOpen,
    });
  },
  setThemeOpen(open) {
    set({
      themeOpen: open,
      chatOpen: open ? false : get().chatOpen,
      audioOpen: open ? false : get().audioOpen,
    });
  },

  clearChat() {
    set({ chatMessages: [], chatOpen: false, chatUnread: 0 });
  },
  proceedFromStrawDraw() {
    const { screen, mode } = get();
    if (screen !== "straw_draw") return;
    if (mode === "mp") {
      // Vote via server — server broadcasts strawDraw: null when all ready,
      // which triggers applyMpRoom to route to the game screen.
      import("./mp").then((m) => m.sendStrawReady());
      return;
    }
    // SP fallback (straw draw is MP-only but guard anyway)
    const st = get();
    set({
      game: st.mp?.game ?? null,
      pendingGame: null,
      screen: "game",
      targeting: null,
      setupPeekRevealed: false,
    });
  },
}));

if (typeof window !== "undefined" && import.meta.env.DEV) {
  (window as unknown as { __store: typeof useStore }).__store = useStore;
}
