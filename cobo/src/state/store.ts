import { create } from "zustand";
import type { GameState, GameVariant } from "../engine/types";
import type { Card, Rank } from "../engine/types";
// SP round-end bust / glorious-victory resolution lives in a PURE module so it
// stays unit-testable in isolation (this store pulls in browser-only globals).
// We re-export the ElimState type below for existing consumers.
import {
  computeSpBust,
  computeSpPlayAgain,
  EMPTY_ELIM,
  type ElimState,
} from "./spBust";
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
// Accounts layer (Phase 1 — auth only). Type-only import so there's no static
// dependency cycle with auth.ts (which imports this store); runtime calls into
// auth.ts use a dynamic import(), matching the mp.ts pattern below.
import type { Profile } from "./auth";
import { readLastSeenTokens, writeLastSeenTokens } from "./tokenGrant";

/**
 * Accounts layer (Phase 4 — XP reward). The end-of-game reward payload, granted
 * SERVER-SIDE and surfaced here verbatim. Shape is the SHARED CONTRACT — it
 * matches both the SP `/account/grant-game` HTTP response's `reward` and the MP
 * `xp:reward` socket event. The client NEVER computes or asserts an amount; it
 * only renders the numbers the server returns.
 *
 *   source        which path granted it ("sp" | "mp"), for copy/telemetry only
 *   gained        XP awarded by THIS game (the "+N XP" the overlay celebrates)
 *   total_xp      the account's NEW lifetime XP after the grant
 *   level         the account's NEW level after the grant
 *   tokens        the account's NEW token balance after the grant
 *   xp_into_level / xp_for_next   server's view of the new bar (informational —
 *                 the overlay recomputes from total_xp via xpToLevel to animate)
 *   leveled_up    true when this grant crossed at least one level boundary
 *   tokens_earned tokens awarded by THIS grant (0 unless a milestone was hit)
 *   old_level / new_level   level before / after the grant
 */
export interface RewardPayload {
  source: "sp" | "mp";
  gained: number;
  total_xp: number;
  level: number;
  tokens: number;
  xp_into_level: number;
  xp_for_next: number;
  leveled_up: boolean;
  tokens_earned: number;
  old_level: number;
  new_level: number;
}

export type Screen =
  | "menu"
  | "botPicker"
  | "lobby"
  | "coin_toss"
  | "straw_draw"
  | "game"
  | "scoring"
  // ── Accounts layer (Phase 1 — auth screens) ──
  | "login"
  | "signup"
  | "forgot";

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

// ElimState — round-bust / kick / glorious-victory tracking. Defined in the
// pure ./spBust module (imported above) and re-exported here so existing
// consumers (e.g. TrainingPanel) keep importing it from the store unchanged.
export type { ElimState };

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
  /** The combined Settings FAB popover (Help + Sound buttons that glide up).
   *  Part of the same one-at-a-time FAB mutex as chat/audio/theme. */
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  /** Toggle for the in-game Help / Tutorial overlay. Independent of menu's
   *  tutorial — same Tutorial component, surfaced via this flag from a
   *  floating in-game button. */
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  /** Toggle for the "Report a bug" modal, opened from the Settings speed-dial.
   *  A simple self-gating overlay (like helpOpen) — not part of the FAB mutex. */
  reportBugOpen: boolean;
  setReportBugOpen: (open: boolean) => void;
  /** Developer mode. Persisted client flag, switched on when the DEV-BOOST dev
   *  code is redeemed (see ProfilePanel). It re-enables the in-game Theme/skin
   *  override FAB — hidden for normal players, who pick cosmetics they actually
   *  own in their profile — so testing can swap skins without unlocking them.
   *  Purely local/visual: it never grants ownership or touches the economy. */
  devMode: boolean;
  setDevMode: (on: boolean) => void;
  eliminatedFromRoom: boolean;
  /** True when the room HOST removed you from the lobby. Drives the distinct
   *  KickedOverlay — deliberately SEPARATE from the bust/eliminated screen so a
   *  removed player isn't told they "busted". */
  kickedByHost: boolean;
  /** Number of bots the user has chosen on the main menu while routing to
   *  the difficulty picker. Default 1; updated when they tap a count tile. */
  pendingNumBots: number;
  setPendingNumBots: (n: number) => void;
  /** Selected rule variant for the next single-player game (chosen on the bot picker). */
  pendingVariant: GameVariant;
  setPendingVariant: (v: GameVariant) => void;
  setScreen: (s: Screen) => void;

  // ── Accounts layer (Phase 1 — auth only) ──────────────────────────────────
  // supabase-js owns the actual session (persisted + auto-refreshed in
  // localStorage); we mirror ONLY the profile here for the UI. Null when
  // signed out. Game/elim/mp state is completely independent of this.
  account: { profile: Profile } | null;
  /** Set (or clear) the signed-in account from a fetched profile. */
  setAccount: (profile: Profile | null) => void;
  /** Re-fetch the current user's profile from Supabase and update `account`. */
  refreshProfile: () => Promise<void>;
  /** Sign out: clears the Supabase session + local account, returns to menu. */
  logoutAccount: () => Promise<void>;
  /** Accounts layer (Phase 3 — profile menu): whether the large Account ·
   *  Styles · Settings modal is open. Opened from the bottom-left account tab
   *  on the MENU (and optionally the token counter). NOT mutexed with the
   *  in-game audio/chat/theme FABs — those live on the game screen, this opens
   *  from the menu — so it has its own isolated flag. */
  profilePanelOpen: boolean;
  setProfilePanelOpen: (open: boolean) => void;
  /** Accounts layer (Phase 4 — XP reward): the latest server-granted reward to
   *  celebrate, or null when nothing is pending. Set from the SP grant HTTP
   *  response and the MP `xp:reward` socket event; the global XpRewardOverlay
   *  self-gates on it. Cleared on dismiss + on backToMenu. */
  xpReward: RewardPayload | null;
  /** Apply a server-granted reward: stash it for the overlay AND fold the new
   *  totals into `account.profile` so the profile panel / token counter reflect
   *  the gain. Pass null to dismiss (the overlay only). */
  setXpReward: (reward: RewardPayload | null) => void;
  /** Accounts layer — token-purchase celebration (frontend-only). The pending
   *  "you received N tokens" reveal, or null. Set by `checkTokenGrant()` when the
   *  balance rises; the global TokenPurchaseOverlay self-gates on it. Cleared on
   *  Claim / dismiss. The tokens are ALREADY credited — this is celebration only. */
  tokenGrant: { amount: number } | null;
  setTokenGrant: (grant: { amount: number } | null) => void;
  /** Compare the current token balance to the per-device baseline; if it rose,
   *  fire the reveal (menu only, never over an xpReward) and advance the baseline.
   *  First run just records the baseline. Frontend-only — no server call here. */
  checkTokenGrant: () => void;
  /** Accounts layer (Phase 4): a stable id for the CURRENT single-player match,
   *  generated when an SP game begins. The SP grant sends it so the server's
   *  idempotency keys the award to the match (a replay reuses the same key →
   *  no double-grant). Null outside an SP match; cleared on backToMenu. */
  spGameKey: string | null;
  /** Accounts layer (Phase 4 — end-of-game sequencing): the `spGameKey` whose
   *  end-of-match XP reward flow has fully RESOLVED — the reward overlay was
   *  dismissed (manually or by auto-dismiss), OR the grant returned nothing
   *  (guest race / grant failure). While this does NOT equal the current
   *  `spGameKey`, the SP result overlays (GloriousVictory / GameLostOverlay)
   *  DEFER, so the XP "experience" plays FIRST and the scoreboard slides in
   *  AFTER. Keyed by match so it auto-rearms every game: a fresh `spGameKey`
   *  never matches a stale resolved key, so a brand-new match defers correctly
   *  without an explicit reset. MP/guests/training never set it. */
  rewardResolvedKey: string | null;
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

/**
 * Accounts layer (Phase 4): a stable, unique key for one SP match. Generated
 * when an SP game starts and sent on the end-of-game grant so the server can
 * make the award idempotent (replays of the same match reuse the same key →
 * the server grants once). `crypto.randomUUID` where available; falls back to a
 * time+random string on older runtimes.
 */
function genGameKey(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return `sp_${c.randomUUID()}`;
  } catch {
    /* fall through to the manual key below */
  }
  return `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

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
  settingsOpen: false,
  helpOpen: false,
  setHelpOpen(open) { set({ helpOpen: open }); },
  reportBugOpen: false,
  setReportBugOpen(open) { set({ reportBugOpen: open }); },
  devMode: (() => {
    try { return localStorage.getItem("cobo.devMode") === "1"; }
    catch { return false; }
  })(),
  setDevMode(on) {
    try {
      if (on) localStorage.setItem("cobo.devMode", "1");
      else localStorage.removeItem("cobo.devMode");
    } catch { /* private mode — flag is in-memory only for this session */ }
    set({ devMode: on });
  },
  eliminatedFromRoom: false,
  kickedByHost: false,
  pendingNumBots: 1,
  setPendingNumBots(n) { set({ pendingNumBots: n }); },
  pendingVariant: "classic",
  setPendingVariant(v) { set({ pendingVariant: v }); },
  setScreen(s) { set({ screen: s }); },

  // ── Accounts layer (Phase 1 — auth only) ──────────────────────────────────
  account: null,
  setAccount(profile) {
    set({ account: profile ? { profile } : null });
  },
  async refreshProfile() {
    const auth = await import("./auth");
    const profile = await auth.getMyProfile();
    // Only overwrite on a SUCCESSFUL fetch — never clear the account on a
    // transient null (that would log a validly-signed-in user out). Explicit
    // sign-out goes through logoutAccount() / auth.logout(), not here.
    if (profile) set({ account: { profile } });
  },
  async logoutAccount() {
    const auth = await import("./auth");
    await auth.logout(); // clears the Supabase session + calls setAccount(null)
    set({ account: null, tokenGrant: null, screen: "menu", profilePanelOpen: false });
  },
  // Accounts layer (Phase 3 — profile menu shell). Isolated UI flag.
  profilePanelOpen: false,
  setProfilePanelOpen(open) { set({ profilePanelOpen: open }); },

  // Accounts layer (Phase 4 — XP reward). Pending reward + stable SP match key.
  xpReward: null,
  spGameKey: null,
  rewardResolvedKey: null,
  setXpReward(reward) {
    if (!reward) {
      // Dismiss (manual, Continue, Escape, or auto-dismiss). Mark THIS match's
      // reward flow resolved so the deferred SP result overlay (scoreboard) can
      // now slide in. In MP/guests spGameKey is null — harmless (those overlays
      // don't defer on it).
      set({ xpReward: null, rewardResolvedKey: get().spGameKey });
      return;
    }
    // Fold the server-authoritative new totals into the mirrored profile so the
    // profile panel / token counter reflect the gain (the overlay animates the
    // bar separately). We only touch the numeric XP/level/token fields and keep
    // every other profile field as-is. No-op on the profile if signed out.
    const { account } = get();
    const nextAccount = account
      ? {
          profile: {
            ...account.profile,
            total_xp: reward.total_xp,
            level: reward.level,
            tokens: reward.tokens,
          },
        }
      : account;
    // Keep the token-purchase watcher's baseline in lockstep with this KNOWN
    // grant. A milestone token is already celebrated by THIS XP overlay, so
    // advancing the baseline stops the menu-side token reveal from re-celebrating
    // the same token when the player returns to the menu.
    if (nextAccount) writeLastSeenTokens(nextAccount.profile.id, reward.tokens);
    set({ xpReward: reward, account: nextAccount });
  },

  // Accounts layer — token-purchase celebration (frontend-only). Tokens are
  // already credited server-side; this is purely the reveal + "Claim".
  tokenGrant: null,
  setTokenGrant(grant) {
    set({ tokenGrant: grant });
  },
  checkTokenGrant() {
    const { account, screen, xpReward, tokenGrant } = get();
    if (!account) return;
    const id = account.profile.id;
    const current = Math.max(0, Math.floor(account.profile.tokens ?? 0));
    const lastSeen = readLastSeenTokens(id);
    // First time we've seen this account on this device: record the baseline,
    // never celebrate the pre-existing balance.
    if (lastSeen === null) {
      writeLastSeenTokens(id, current);
      return;
    }
    if (current <= lastSeen) {
      // Spent tokens (e.g. bought a skin) → lower the baseline silently so the
      // next real increase is measured from the correct floor.
      if (current < lastSeen) writeLastSeenTokens(id, current);
      return;
    }
    // Balance rose. Only reveal on the MENU, never over an XP-reward cinematic
    // or an already-open grant. If a guard blocks it we DON'T advance the
    // baseline — so it pops the next time the player is back on the menu.
    if (screen !== "menu" || xpReward || tokenGrant) return;
    const amount = current - lastSeen;
    writeLastSeenTokens(id, current);
    set({ tokenGrant: { amount } });
  },

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
      // Accounts layer (Phase 4): fresh stable key for THIS SP match. Reused by
      // the end-of-game grant across replays of the same match so the server's
      // idempotency holds. Cleared on backToMenu.
      spGameKey: genGameKey(),
      // New match → no reward resolved yet, so the end-of-game result overlay
      // will correctly defer behind this match's XP experience.
      rewardResolvedKey: null,
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
      // Training earns no XP — keep these null so the end-of-game result
      // overlays never defer here (no stale SP match key can leak in).
      spGameKey: null, rewardResolvedKey: null,
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

    // PURE seat-selection + finalisation lives in spBust.ts so the whole SP
    // continuation loop (resolve → seat next round) is unit-testable without
    // the store. We only own the side-effects here: newGame() and set().
    const result = computeSpPlayAgain(game, elim);
    if (result.kind === "noop") return;
    if (result.kind === "game_over") {
      set({ elim: result.nextElim });
      return;
    }
    // result.kind === "seat" — game is non-null here (computeSpPlayAgain only
    // returns "seat" after its `if (!game)` noop guard).
    const next = newGame({
      players: result.players,
      variant: game!.variant,
      roundNumber: game!.roundNumber + 1,
      scores: game!.scores,
      caboBonus: game!.caboBonus,
      caboPenalty: game!.caboPenalty,
      snapBonus: game!.snapBonus,
      kamikaze: game!.kamikaze,
    });
    set({
      game: next,
      elim: result.nextElim,
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
      kickedByHost: false,
      botDifficulty: null, botSpeech: null,
      // Accounts layer (Phase 4): clear any pending reward + retire the SP match
      // key so the next match grants under a fresh idempotency key.
      xpReward: null, spGameKey: null, rewardResolvedKey: null,
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
      settingsOpen: open ? false : get().settingsOpen,
    });
  },
  setAudioOpen(open) {
    set({
      audioOpen: open,
      chatOpen: open ? false : get().chatOpen,
      themeOpen: open ? false : get().themeOpen,
      settingsOpen: open ? false : get().settingsOpen,
    });
  },
  setThemeOpen(open) {
    set({
      themeOpen: open,
      chatOpen: open ? false : get().chatOpen,
      audioOpen: open ? false : get().audioOpen,
      settingsOpen: open ? false : get().settingsOpen,
    });
  },
  setSettingsOpen(open) {
    set({
      settingsOpen: open,
      chatOpen: open ? false : get().chatOpen,
      audioOpen: open ? false : get().audioOpen,
      themeOpen: open ? false : get().themeOpen,
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
