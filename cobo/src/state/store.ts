import { create } from "zustand";
import type { GameState } from "../engine/types";
import type { Card } from "../engine/types";
import {
  actionBlindSwap,
  actionPeekAndSwapDecide,
  actionPeekAndSwapPick,
  actionPeekOther,
  actionPeekOwn,
  callCabo,
  clearAnimations,
  clearReveals,
  discardDrawnSkipAction,
  discardDrawnWithAction,
  drawFromDeck,
  drawFromDiscard,
  newGame,
  setupPeekCard,
  skipPendingAction,
  startPlay,
  swapDrawnWithHand,
  trainingInjectCard as engineTrainingInject,
  triggerPendingAction,
} from "../engine/game";
import { Audio } from "../audio/sounds";

export type Screen = "menu" | "lobby" | "coin_toss" | "straw_draw" | "game" | "scoring";

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
  gloriosVictoryReason: "survivor" | "more_wins" | "final_round" | null;
}

export type ActionTargetingMode =
  | null
  | "swap_hand"
  | "peek_own"
  | "peek_other"
  | "blind_swap_self"
  | "blind_swap_target"
  | "peek_and_swap_target_pick"
  | "peek_and_swap_self"; // after peek, choose own card to swap

interface StoreState {
  screen: Screen;
  mode: GameMode;
  training: boolean;
  mp: MpRoom | null;
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
  eliminatedFromRoom: boolean;
  init: (numBots: number) => void;
  trainInit: () => void;
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
  callCaboAction: () => void;
  peekSwapDecide: (doSwap: boolean, ownIndex?: number) => void;
  consumeAnimations: () => void;
  consumeReveals: () => void;
  setToast: (s: string | null) => void;
  setPeekOverlay: (v: StoreState["pendingPeekOverlay"]) => void;
  playAgain: () => void;
  backToMenu: () => void;
  leaveRoomToLobby: () => void;
  enterLobby: () => void;
  applyMpRoom: (room: MpRoom) => void;
  proceedFromStrawDraw: () => void;
  receiveChatMessage: (msg: ChatMessage) => void;
  setChatOpen: (open: boolean) => void;
  setAudioOpen: (open: boolean) => void;
  setThemeOpen: (open: boolean) => void;
  clearChat: () => void;
}

const PLAYER_COLORS = ["#ff5b6e", "#ffd86b", "#67e0a3", "#7aa8ff"];

function makePlayers(numBots: number) {
  const human = { id: "p_human", name: "You", isBot: false };
  const bots = [];
  const botNames = ["Beep", "Boop", "Bam"];
  for (let i = 0; i < numBots; i++) {
    bots.push({ id: `p_bot${i + 1}`, name: botNames[i], isBot: true });
  }
  return [human, ...bots];
}

export { PLAYER_COLORS };

export const useStore = create<StoreState>((set, get) => ({
  screen: "menu",
  mode: "sp",
  training: false,
  mp: null,
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
  eliminatedFromRoom: false,

  init(numBots) {
    const game = newGame({ players: makePlayers(numBots) });
    // Start with the coin toss screen — the actual game state is held in
    // pendingGame until the toss completes and decides the starting player.
    set({
      mode: "sp", training: false, mp: null,
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
    });
  },

  trainInit() {
    // Training Chamber: 1 bot so swap/spy actions have a target to work with.
    // Skip the coin toss in training mode — human always starts for predictable testing.
    const game = newGame({ players: makePlayers(1) });
    set({
      mode: "sp", training: true, mp: null, game, screen: "game",
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
    const { game, training } = get();
    if (!game || !training) return;
    set({ game: engineTrainingInject(game, card) });
  },

  start() {
    const { mode, game } = get();
    if (mode === "mp") {
      // server-side action
      import("./mp").then((m) => m.sendAction({ type: "start_play" }));
      return;
    }
    if (!game) return;
    set({ game: startPlay(game), setupPeekRevealed: true });
  },

  enterLobby() {
    set({ screen: "lobby", mode: "mp" });
  },

  applyMpRoom(room) {
    const prev = get();

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
      set({ mp: room });
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
      const isMyTurn = g.players[g.currentPlayer]?.id === room.viewerId;
      if (isMyTurn) {
        switch (g.phase) {
          case "action_peek_own":
            targeting = "peek_own"; pendingBlindSwapOwnIndex = null; break;
          case "action_peek_other":
            targeting = "peek_other"; pendingBlindSwapOwnIndex = null; break;
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
      game: room.game,
      humanId: room.viewerId,
      screen,
      mode: "mp",
      setupPeekRevealed: isFreshRound ? false : prev.setupPeekRevealed,
      targeting,
      pendingBlindSwapOwnIndex,
    });
  },

  setSetupPeekRevealed(v) {
    set({ setupPeekRevealed: v });
  },

  draw() {
    const { mode, game } = get();
    if (mode === "mp") {
      import("./mp").then((m) => m.sendAction({ type: "draw_deck" }));
      return;
    }
    if (!game) return;
    set({ game: drawFromDeck(game) });
  },

  drawDiscard() {
    const { mode, game } = get();
    if (mode === "mp") {
      import("./mp").then((m) => m.sendAction({ type: "draw_discard" }));
      return;
    }
    if (!game) return;
    set({ game: drawFromDiscard(game) });
  },

  setTargeting(m) {
    set({ targeting: m });
  },

  clickOwnCard(index) {
    const { game, targeting, humanId, mode } = get();
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
      else set({ game: setupPeekCard(game, humanId, index) });
      return;
    }

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
        set({ game: swapDrawnWithHand(game, index) });
      }
      set({ targeting: null });
      return;
    }
    if (game.phase === "action_peek_own" && targeting === "peek_own") {
      if (mode === "mp") {
        dispatch("action_peek_own", { index }, () => set({ targeting: "peek_own" }));
      } else {
        set({ game: actionPeekOwn(game, index) });
      }
      set({ targeting: null });
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
        set({ game: actionPeekAndSwapDecide(game, true, index) });
      }
      set({ targeting: null });
      return;
    }
  },

  clickOtherCard(playerId, index) {
    const { game, targeting, pendingBlindSwapOwnIndex, mode } = get();
    if (!game) return;
    const dispatch = (type: string, payload: Record<string, any> = {}) => {
      if (mode === "mp") {
        import("./mp").then((m) => m.sendAction({ type: type as any, ...payload }));
      }
    };
    if (game.phase === "action_peek_other" && targeting === "peek_other") {
      if (mode === "mp") dispatch("action_peek_other", { targetPlayerId: playerId, index });
      else set({ game: actionPeekOther(game, playerId, index) });
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
        set({ game: updated });
      }
      set({ targeting: null, pendingBlindSwapOwnIndex: null });
      return;
    }
    if (
      game.phase === "action_peek_and_swap_pick" &&
      targeting === "peek_and_swap_target_pick"
    ) {
      if (mode === "mp") dispatch("action_peek_and_swap_pick", { targetPlayerId: playerId, index });
      else set({ game: actionPeekAndSwapPick(game, playerId, index) });
      set({ targeting: null });
      return;
    }
  },

  /** Pure discard — no ability triggered, even if the card has one. */
  discardNoAction() {
    const { mode, game } = get();
    if (mode === "mp") {
      import("./mp").then((m) => m.sendAction({ type: "discard_and_skip" }));
      return;
    }
    if (!game) return;
    set({ game: discardDrawnSkipAction(game), targeting: null });
  },

  /** Discard and immediately activate the card's ability. */
  discardAndTrigger() {
    const { mode, game } = get();
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
    set({ game: next, targeting });
  },

  triggerAction() {
    const { mode, game } = get();
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
    set({ game: next, targeting });
  },

  skipAction() {
    const { mode, game } = get();
    if (mode === "mp") {
      import("./mp").then((m) => m.sendAction({ type: "skip_action" } as any));
      return;
    }
    if (!game) return;
    set({ game: skipPendingAction(game), targeting: null });
  },

  callCaboAction() {
    const { mode, game } = get();
    if (mode === "mp") {
      import("./mp").then((m) => m.sendAction({ type: "call_cabo" }));
      return;
    }
    if (!game) return;
    set({ game: callCabo(game) });
  },

  peekSwapDecide(doSwap, ownIndex) {
    const { mode, game } = get();
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
    set({ game: actionPeekAndSwapDecide(game, doSwap, ownIndex), targeting: null });
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
    const { mode, game } = get();
    if (mode === "mp") {
      import("./mp").then((m) =>
        m.getSocket().emit("room:play_again", {}, () => undefined),
      );
      return;
    }
    if (!game) return;
    const playerInputs = game.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot }));
    const next = newGame({
      players: playerInputs,
      roundNumber: game.roundNumber + 1,
      scores: game.scores,
    });
    set({ game: next, setupPeekRevealed: false, targeting: null, toast: null });
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
      game: null, pendingGame: null, coinToss: null,
      targeting: null, toast: null,
      chatMessages: [], chatOpen: false, chatUnread: 0,
      eliminatedFromRoom: false,
    });
  },

  // Leave the current room but stay in the Lobby (choose mode) instead of
  // going all the way back to the main menu.
  leaveRoomToLobby() {
    import("./mp").then((m) => m.leaveRoom());
    set({
      screen: "lobby", mode: "mp", mp: null,
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

if (typeof window !== "undefined") {
  (window as any).__store = useStore;
}
