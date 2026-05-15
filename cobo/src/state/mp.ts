import { io, type Socket } from "socket.io-client";
import { useStore } from "./store";

// In a production build the Node server serves both the static client and the
// Socket.IO endpoint, so we connect to the same origin (works behind any
// tunnel / cloud deployment without configuration).
// In dev (Vite at :5173) the server runs separately on :8787 — connect by
// hostname so phones on the LAN get the right address.
function defaultServerUrl(): string {
  if (typeof window === "undefined") return "http://localhost:8787";
  if (import.meta.env.PROD) {
    return `${window.location.protocol}//${window.location.host}`;
  }
  const host = window.location.hostname || "localhost";
  return `${window.location.protocol}//${host}:8787`;
}
const SERVER_URL = import.meta.env.VITE_SERVER_URL || defaultServerUrl();
const STORAGE_KEY = "cobo.mp.session";

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
    socket.on("connect", () => {
      const sess = loadSession();
      if (sess) {
        socket!.emit(
          "room:rejoin",
          { code: sess.code, playerId: sess.playerId },
          (resp: { ok: boolean; error?: string }) => {
            if (!resp.ok) {
              clearSession();
              useStore.setState({ mp: null });
            }
          },
        );
      }
    });
    listenersBound = true;
  }
  return socket;
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
  return new Promise<{ ok: boolean; code?: string; playerId?: string; error?: string }>(
    (resolve) => {
      s.emit("room:create", { name }, (resp: any) => {
        if (resp.ok) saveSession({ code: resp.code, playerId: resp.playerId, name });
        resolve(resp);
      });
    },
  );
}

export async function joinRoom(code: string, name: string) {
  const s = getSocket();
  await waitConnected(s);
  return new Promise<{ ok: boolean; code?: string; playerId?: string; error?: string }>(
    (resolve) => {
      s.emit("room:join", { code: code.toUpperCase(), name }, (resp: any) => {
        if (resp.ok) saveSession({ code: code.toUpperCase(), playerId: resp.playerId, name });
        resolve(resp);
      });
    },
  );
}

export async function startGame() {
  return new Promise<any>((resolve) => getSocket().emit("room:start", {}, resolve));
}

export async function playAgainMp() {
  return new Promise<any>((resolve) => getSocket().emit("room:play_again", {}, resolve));
}

export type MpActionType =
  | "draw_deck"
  | "draw_discard"
  | "swap_drawn"
  | "discard_drawn"
  | "trigger_action"
  | "skip_action"
  | "action_peek_own"
  | "action_peek_other"
  | "action_blind_swap"
  | "action_peek_and_swap_pick"
  | "action_peek_and_swap_decide"
  | "call_cabo"
  | "start_play"
  | "setup_peek_card"
  | "clear_animations"
  | "clear_reveals";

export function sendAction(payload: { type: MpActionType } & Record<string, any>) {
  getSocket().emit("action", payload);
}

export function leaveRoom() {
  clearSession();
  useStore.setState({ mp: null });
  socket?.disconnect();
  socket = null;
  listenersBound = false;
}
