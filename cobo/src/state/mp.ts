import { io, type Socket } from "socket.io-client";
import { useStore } from "./store";
import type { RewardPayload } from "./store";
import { logDebug } from "./debugLog";

// In a production web build the Node server serves both the static client and
// the Socket.IO endpoint, so we connect to the same origin (works behind any
// tunnel / cloud deployment without configuration).
// In dev (Vite at :5173) the server runs separately on :8787 — connect by
// hostname so phones on the LAN get the right address.
// In the Electron desktop app the renderer loads from file://, so
// window.location.host is empty. We fall back to VITE_SERVER_URL which is
// baked into the electron build from cobo/.env.electron at build time.
function defaultServerUrl(): string {
  if (typeof window === "undefined") return "http://localhost:8787";
  // Electron: file:// protocol means window.location.host is empty.
  if (window.location.protocol === "file:") {
    return import.meta.env.VITE_SERVER_URL ?? "";
  }
  if (import.meta.env.PROD) {
    return `${window.location.protocol}//${window.location.host}`;
  }
  const host = window.location.hostname || "localhost";
  return `${window.location.protocol}//${host}:8787`;
}
const SERVER_URL = import.meta.env.VITE_SERVER_URL || defaultServerUrl();
const STORAGE_KEY = "cobo.mp.session";

/**
 * The resolved server origin (same Node process that serves sockets). Shared
 * with the accounts layer (`state/auth.ts`) so the auth REST API hits the SAME
 * origin as multiplayer — works behind tunnels / cloud / the Electron file://
 * build without hardcoding localhost.
 */
export function serverUrl(): string {
  return SERVER_URL;
}

interface Session {
  code: string;
  playerId: string;
  name: string;
}

let socket: Socket | null = null;
let listenersBound = false;

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(SERVER_URL, { autoConnect: true });
  if (!listenersBound) {
    socket.on("room:state", (state) => {
      useStore.getState().applyMpRoom(state);
    });
    socket.on("chat:message", (msg: { from: string; name: string; text: string; at: number }) => {
      useStore.getState().receiveChatMessage(msg);
    });
    // Accounts layer (Phase 4 — MP XP reward). The server grants end-of-game XP
    // server-side and emits the SHARED reward payload here; we hand it straight
    // to the store, whose XpRewardOverlay celebrates it and folds the new totals
    // into the profile. The amount is server-authoritative — we never assert it.
    socket.on("xp:reward", (reward: RewardPayload) => {
      useStore.getState().setXpReward(reward);
    });
    // The room HOST removed us from the lobby. Clear our session so we don't
    // auto-rejoin, drop the room, and raise the DISTINCT "kicked" flag (its own
    // screen — never the bust/eliminated overlay).
    socket.on("room:kicked", () => {
      clearSession();
      useStore.setState({ mp: null, kickedByHost: true });
    });
    socket.on("connect", () => {
      const sess = loadSession();
      if (sess) {
        // Re-link account identity on reconnect/rejoin (best-effort; absent for
        // guests). Fetch the access token first, then emit the rejoin.
        void getAccessTokenSafe().then((accessToken) => {
        socket!.emit(
          "room:rejoin",
          { code: sess.code, playerId: sess.playerId, accessToken },
          (resp: { ok: boolean; error?: string }) => {
            if (!resp.ok) {
              clearSession();
              if (resp.error === "You have been eliminated from this game.") {
                useStore.setState({ mp: null, eliminatedFromRoom: true });
              } else {
                useStore.setState({ mp: null });
              }
            }
          },
        );
        });
      }
    });
    // ── Connection diagnostics ────────────────────────────────────────────
    // Log non-sensitive socket lifecycle events to the debug buffer so the
    // owner can see dropped connections / handshake failures. We only record
    // event names and error messages here — never room or card data.
    socket.on("connect_error", (err) => {
      logDebug("warn", "socket", "connect_error", err?.message);
    });
    socket.on("disconnect", (reason) => {
      logDebug("warn", "socket", "disconnected", String(reason));
    });
    listenersBound = true;
  }
  return socket;
}

/**
 * Accounts layer (Phase 4): the Supabase access token, fetched lazily via a
 * dynamic import so this module has NO static dependency on auth.ts (auth.ts
 * imports mp.ts for `serverUrl`). Resolves to null for guests / unconfigured
 * builds / any error — passing an absent token on create/join is fine; the
 * server simply treats the socket as a guest. NEVER throws.
 */
async function getAccessTokenSafe(): Promise<string | null> {
  try {
    const auth = await import("./auth");
    return await auth.getAccessToken();
  } catch {
    return null;
  }
}

function saveSession(s: Session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

function waitConnected(s: Socket, timeoutMs = 8000): Promise<void> {
  if (s.connected) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      s.off("connect", onConnect);
      s.off("connect_error", onError);
      reject(new Error("Could not connect to server — is it running?"));
    }, timeoutMs);
    function onConnect() {
      clearTimeout(timer);
      s.off("connect_error", onError);
      resolve();
    }
    function onError(err: Error) {
      clearTimeout(timer);
      s.off("connect", onConnect);
      reject(err);
    }
    s.once("connect", onConnect);
    s.once("connect_error", onError);
  });
}

export async function createRoom(name: string) {
  const s = getSocket();
  await waitConnected(s);
  // Pass the Supabase access token (absent for guests) so the server can link
  // this socket to an account for the end-of-game XP grant. Phase 4.
  const accessToken = await getAccessTokenSafe();
  return new Promise<{ ok: boolean; code?: string; playerId?: string; error?: string }>(
    (resolve) => {
      s.emit("room:create", { name, accessToken }, (resp: any) => {
        if (resp.ok) saveSession({ code: resp.code, playerId: resp.playerId, name });
        resolve(resp);
      });
    },
  );
}

export async function joinRoom(code: string, name: string) {
  const s = getSocket();
  await waitConnected(s);
  const accessToken = await getAccessTokenSafe();
  return new Promise<{ ok: boolean; code?: string; playerId?: string; error?: string }>(
    (resolve) => {
      s.emit("room:join", { code: code.toUpperCase(), name, accessToken }, (resp: any) => {
        if (resp.ok) saveSession({ code: code.toUpperCase(), playerId: resp.playerId, name });
        resolve(resp);
      });
    },
  );
}

export async function startGame() {
  return new Promise<any>((resolve) => getSocket().emit("room:start", {}, resolve));
}

/** Host-only: set the rule variant for the room before the game starts. */
export async function setVariantMp(variant: "classic" | "evolved") {
  return new Promise<{ ok: boolean; error?: string }>((resolve) =>
    getSocket().emit("room:set_variant", { variant }, resolve),
  );
}

/** Host-only: remove a player from the lobby before the game starts. The server
 *  verifies the caller is the host; the removed player gets a `room:kicked`
 *  event (→ the distinct KickedOverlay). Resolves the server's {ok,error}. */
export async function kickPlayer(targetPlayerId: string) {
  return new Promise<{ ok: boolean; error?: string }>((resolve) =>
    getSocket().emit("room:kick", { targetPlayerId }, resolve),
  );
}

export async function playAgainMp() {
  return new Promise<any>((resolve) => getSocket().emit("room:play_again", {}, resolve));
}

export type MpActionType =
  | "draw_deck"
  | "draw_discard"
  | "swap_drawn"
  | "discard_drawn"
  | "discard_and_trigger"
  | "discard_and_skip"
  | "trigger_action"
  | "skip_action"
  | "action_peek_own"
  | "action_peek_other"
  | "action_choose_peek"
  | "action_blind_swap"
  | "action_peek_and_swap_pick"
  | "action_peek_and_swap_decide"
  | "action_start_snap_other"
  | "action_start_snap_self"
  | "action_snap_other"
  | "action_snap_self"
  | "call_cabo"
  | "start_play"
  | "setup_peek_card"
  | "activate_dragon"
  | "dragon_choose_rank"
  | "clear_animations"
  | "clear_reveals";

export function sendAction(
  payload: { type: MpActionType } & Record<string, any>,
  onFail?: () => void,
) {
  getSocket().emit("action", payload, (resp: { ok: boolean; error?: string }) => {
    if (resp?.ok === false) {
      // Log only the action TYPE + server error string — never the payload,
      // which can carry card indices / hidden-info choices.
      logDebug("warn", "action", `action ${payload.type} rejected`, resp?.error);
    }
    if (!resp?.ok && onFail) onFail();
  });
}

export function leaveRoom() {
  // Tell the server we're leaving on purpose so the other player can be
  // notified immediately rather than waiting for the socket to time out.
  try { socket?.emit("room:leave"); } catch { /* ignore */ }
  clearSession();
  useStore.setState({ mp: null });
  socket?.disconnect();
  socket = null;
  listenersBound = false;
  if (typeof window !== "undefined") {
    window.history.replaceState({}, "", "/");
  }
}

export function sendCoinTossPick(side: "heads" | "tails") {
  getSocket().emit("room:coin_toss_pick", { side });
}

export function sendStrawPick(index: number) {
  return new Promise<any>((resolve) =>
    getSocket().emit("room:straw_pick", { index }, resolve),
  );
}

export function sendReady() {
  return new Promise<any>((resolve) => getSocket().emit("room:ready", {}, resolve));
}

/** Withdraw a ready vote (the room "cancel"). Holds a pending start until the
 *  player re-readies; every active player must be ready for the game to begin. */
export function sendUnready() {
  return new Promise<any>((resolve) => getSocket().emit("room:unready", {}, resolve));
}

export function sendStrawReady() {
  return new Promise<any>((resolve) => getSocket().emit("room:straw_ready", {}, resolve));
}

export function sendChat(text: string) {
  return new Promise<any>((resolve) => getSocket().emit("room:chat", { text }, resolve));
}
