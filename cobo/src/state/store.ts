import { create } from "zustand";
import type { GameState } from "../engine/types";
import {
  actionBlindSwap,
  actionPeekAndSwapDecide,
  actionPeekAndSwapPick,
  actionPeekOther,
  actionPeekOwn,
  callCabo,
  clearAnimations,
  clearReveals,
  discardDrawn,
  drawFromDeck,
  drawFromDiscard,
  newGame,
  setupPeekCard,
  snap,
  startPlay,
  swapDrawnWithHand,
} from "../engine/game";

export type Screen = "menu" | "lobby" | "game" | "scoring";
export type GameMode = "sp" | "mp";

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
  mp: MpRoom | null;
  game: GameState | null;
  humanId: string;
  setupPeekRevealed: boolean;
  targeting: ActionTargetingMode;
  pendingBlindSwapOwnIndex: number | null;
  toast: string | null;
  pendingPeekOverlay: { playerId: string; index: number; rank: string; suit: string } | null;
  init: (numBots: number) => void;
  start: () => void;
  setSetupPeekRevealed: (v: boolean) => void;
  draw: () => void;
  drawDiscard: () => void;
  setTargeting: (m: ActionTargetingMode) => void;
  clickOwnCard: (index: number) => void;
  clickOtherCard: (playerId: string, index: number) => void;
  discardDrawnAction: () => void;
  callCaboAction: () => void;
  peekSwapDecide: (doSwap: boolean, ownIndex?: number) => void;
  trySnap: (playerId: string, handIndex: number) => void;
  consumeAnimations: () => void;
  consumeReveals: () => void;
  setToast: (s: string | null) => void;
  setPeekOverlay: (v: StoreState["pendingPeekOverlay"]) => void;
  playAgain: () => void;
  backToMenu: () => void;
  leaveRoomToLobby: () => void;
  enterLobby: () => void;
  applyMpRoom: (room: MpRoom) => void;
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
  mp: null,
  game: null,
  humanId: "p_human",
  setupPeekRevealed: false,
  targeting: null,
  pendingBlindSwapOwnIndex: null,
  toast: null,
  pendingPeekOverlay: null,

  init(numBots) {
    const game = newGame({ players: makePlayers(numBots) });
    set({
      mode: "sp", mp: null, game, screen: "game",
      humanId: "p_human",
      setupPeekRevealed: false, targeting: null, toast: null,
    });
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
    const screen: Screen = room.game ? "game" : "lobby";
    const prev = get();
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

    const dispatch = (type: string, payload: Record<string, any> = {}) => {
      if (mode === "mp") {
        import("./mp").then((m) => m.sendAction({ type: type as any, ...payload }));
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
      if (mode === "mp") dispatch("swap_drawn", { handIndex: index });
      else set({ game: swapDrawnWithHand(game, index) });
      set({ targeting: null });
      return;
    }
    if (game.phase === "action_peek_own" && targeting === "peek_own") {
      if (mode === "mp") dispatch("action_peek_own", { index });
      else set({ game: actionPeekOwn(game, index) });
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
      if (mode === "mp") dispatch("action_peek_and_swap_decide", { doSwap: true, ownIndex: index });
      else set({ game: actionPeekAndSwapDecide(game, true, index) });
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

  discardDrawnAction() {
    const { mode, game } = get();
    if (mode === "mp") {
      import("./mp").then((m) => m.sendAction({ type: "discard_drawn" }));
      return;
    }
    if (!game) return;
    const next = discardDrawn(game);
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

  trySnap(playerId, handIndex) {
    const { mode, game } = get();
    if (mode === "mp") {
      import("./mp").then((m) => m.sendAction({ type: "snap", handIndex }));
      return;
    }
    if (!game) return;
    set({ game: snap(game, playerId, handIndex) });
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
    const { mode } = get();
    if (mode === "mp") {
      import("./mp").then((m) => m.leaveRoom());
    }
    set({
      screen: "menu", mode: "sp", mp: null,
      game: null, targeting: null, toast: null,
    });
  },

  // Leave the current room but stay in the Lobby (choose mode) instead of
  // going all the way back to the main menu.
  leaveRoomToLobby() {
    import("./mp").then((m) => m.leaveRoom());
    set({
      screen: "lobby", mode: "mp", mp: null,
      game: null, targeting: null, toast: null,
    });
  },
}));

if (typeof window !== "undefined") {
  (window as any).__store = useStore;
}
