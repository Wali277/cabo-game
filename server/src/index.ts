import express from "express";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "cors";
import { Server } from "socket.io";
import { Rooms } from "./rooms.js";
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
  discardDrawnSkipAction,
  discardDrawnWithAction,
  drawFromDeck,
  drawFromDiscard,
  newGame,
  setupPeekCard,
  skipPendingAction,
  startPlay,
  swapDrawnWithHand,
  triggerPendingAction,
} from "./engine/game.js";
import type { GameState } from "./engine/types.js";

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = new Rooms();

// Per-room timers for the ready-up countdown. Stored outside the Room so they
// aren't serialised and can be properly cancelled on early start or room cleanup.
const readyTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Per-room timers for the coin-toss server-side fallback (auto-resolve after
// 5s if only one player has picked — happens when the other player has
// disconnected and their client-side auto-pick never fires).
const coinTossTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Per-room timers for the setup_peek → start_play collective ready-up.
const roundReadyTimers = new Map<string, ReturnType<typeof setTimeout>>();

function startRoomGame(roomCode: string) {
  const room = rooms.get(roomCode);
  if (!room || room.game || room.members.length < 2) return;
  const timerId = readyTimers.get(roomCode);
  if (timerId) clearTimeout(timerId);
  readyTimers.delete(roomCode);
  const players = room.members.map((m) => ({ id: m.playerId, name: m.name, isBot: false }));
  room.game = newGame({ players });
  const startIdx = Math.floor(Math.random() * players.length);
  room.game.currentPlayer = startIdx;
  room.lastStarterIdx = startIdx;
  if (players.length === 2) {
    room.coinToss = { choices: { heads: null, tails: null }, startedAt: null, result: null };
  } else {
    room.coinToss = null;
  }
  room.readyVotes = [];
  room.readyStartedAt = null;
  broadcastRoom(roomCode);
}

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/rooms", (_req, res) =>
  res.json({ count: rooms.size(), rooms: rooms.list() })
);

// Serve the built client (if present) so the whole game runs from this single
// port — that means one tunnel / one deploy URL covers the entire app.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, "..", "..", "cobo", "dist");
const hasBuiltClient = fs.existsSync(path.join(CLIENT_DIST, "index.html"));
if (hasBuiltClient) {
  app.use(express.static(CLIENT_DIST));
  // SPA fallback — anything that isn't a known API path or Socket.IO endpoint
  // returns index.html so /room/<code> works on first load.
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/socket.io")) return next();
    if (req.path === "/health" || req.path === "/rooms") return next();
    res.status(200).sendFile(path.join(CLIENT_DIST, "index.html"));
  });
  console.log(`Serving built client from ${CLIENT_DIST}`);
} else {
  console.log("No built client found at cobo/dist — running in API-only mode (use Vite for the client).");
}

function broadcastRoom(roomCode: string) {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const member of room.members) {
    const socket = io.sockets.sockets.get(member.socketId);
    if (!socket) continue;
    socket.emit("room:state", publicView(room, member.playerId));
  }
}

// Send full game state for friends-only mode. The client controls which cards
// to render face-up via the same rules used in single-player (phase, reveals,
// knownToSelf for self only). This is not cryptographically private — a player
// peeking via dev tools could see opponents' cards — but it's acceptable for
// a friends-only game with no traffic.
function publicView(room: ReturnType<Rooms["get"]> & {}, viewerId: string) {
  // Surface disconnect / forfeit info so the client can render the notification
  // and the victory-by-forfeit overlay.
  const disconnects: Record<string, { startedAt: number; forfeited: boolean }> = {};
  for (const [pid, d] of Object.entries(room.disconnects)) {
    disconnects[pid] = { startedAt: d.startedAt, forfeited: d.forfeited };
  }
  return {
    code: room.code,
    hostId: room.hostId,
    started: !!room.game,
    viewerId,
    members: room.members.map((m) => ({
      id: m.playerId,
      name: m.name,
      connected: m.connected,
      isHost: m.playerId === room.hostId,
    })),
    game: room.game,
    coinToss: room.coinToss,
    playAgainVotes: room.playAgainVotes,
    disconnects,
    readyVotes: room.readyVotes,
    readyStartedAt: room.readyStartedAt,
    roundReadyVotes: room.roundReadyVotes,
    roundReadyStartedAt: room.roundReadyStartedAt,
  };
}

type ActionMsg =
  | { type: "draw_deck" }
  | { type: "draw_discard" }
  | { type: "swap_drawn"; handIndex: number }
  | { type: "discard_drawn" }
  | { type: "discard_and_trigger" }
  | { type: "discard_and_skip" }
  | { type: "trigger_action" }
  | { type: "skip_action" }
  | { type: "action_peek_own"; index: number }
  | { type: "action_peek_other"; targetPlayerId: string; index: number }
  | { type: "action_blind_swap"; ownIndex: number; targetPlayerId: string; targetIndex: number }
  | { type: "action_peek_and_swap_pick"; targetPlayerId: string; index: number }
  | { type: "action_peek_and_swap_decide"; doSwap: boolean; ownIndex?: number }
  | { type: "call_cabo" }
  | { type: "start_play" }
  | { type: "setup_peek_card"; index: number }
  | { type: "clear_animations" }
  | { type: "clear_reveals" };

function applyAction(game: GameState, playerId: string, action: ActionMsg): GameState | null {
  // Most actions can only be performed by the current player; snap is open.
  const cur = game.players[game.currentPlayer]?.id;
  const requireCurrent = () => playerId === cur;

  switch (action.type) {
    case "start_play":
      return startPlay(game);
    case "setup_peek_card":
      return setupPeekCard(game, playerId, action.index);
    case "draw_deck":
      if (!requireCurrent()) return null;
      return drawFromDeck(game);
    case "draw_discard":
      if (!requireCurrent()) return null;
      return drawFromDiscard(game);
    case "swap_drawn":
      if (!requireCurrent()) return null;
      return swapDrawnWithHand(game, action.handIndex);
    case "discard_drawn":
      if (!requireCurrent()) return null;
      return discardDrawn(game);
    case "discard_and_trigger":
      if (!requireCurrent()) return null;
      return discardDrawnWithAction(game);
    case "discard_and_skip":
      if (!requireCurrent()) return null;
      return discardDrawnSkipAction(game);
    case "trigger_action":
      if (!requireCurrent()) return null;
      return triggerPendingAction(game);
    case "skip_action":
      if (!requireCurrent()) return null;
      return skipPendingAction(game);
    case "action_peek_own":
      if (!requireCurrent()) return null;
      return actionPeekOwn(game, action.index);
    case "action_peek_other":
      if (!requireCurrent()) return null;
      return actionPeekOther(game, action.targetPlayerId, action.index);
    case "action_blind_swap":
      if (!requireCurrent()) return null;
      return actionBlindSwap(game, action.ownIndex, action.targetPlayerId, action.targetIndex);
    case "action_peek_and_swap_pick":
      if (!requireCurrent()) return null;
      return actionPeekAndSwapPick(game, action.targetPlayerId, action.index);
    case "action_peek_and_swap_decide":
      if (!requireCurrent()) return null;
      return actionPeekAndSwapDecide(game, action.doSwap, action.ownIndex);
    case "call_cabo":
      if (!requireCurrent()) return null;
      return callCabo(game);
    case "clear_animations":
      return clearAnimations(game);
    case "clear_reveals":
      return clearReveals(game);
  }
}

io.on("connection", (socket) => {
  let bound: { roomCode: string; playerId: string } | null = null;

  socket.on("room:create", ({ name }, cb) => {
    const room = rooms.create();
    const playerId = `p_${Math.random().toString(36).slice(2, 8)}`;
    rooms.join(room.code, { socketId: socket.id, playerId, name, connected: true });
    rooms.setHost(room.code, playerId);
    bound = { roomCode: room.code, playerId };
    socket.join(room.code);
    cb({ ok: true, code: room.code, playerId });
    broadcastRoom(room.code);
  });

  socket.on("room:join", ({ code, name }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb({ ok: false, error: "Room not found" });
    if (room.members.length >= 4) return cb({ ok: false, error: "Room full" });
    if (room.game) return cb({ ok: false, error: "Game already started" });
    const playerId = `p_${Math.random().toString(36).slice(2, 8)}`;
    rooms.join(code, { socketId: socket.id, playerId, name, connected: true });
    bound = { roomCode: code, playerId };
    socket.join(code);
    cb({ ok: true, code, playerId });
    broadcastRoom(code);
  });

  socket.on("room:rejoin", ({ code, playerId }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb({ ok: false, error: "Room not found" });
    const member = room.members.find((m) => m.playerId === playerId);
    if (!member) return cb({ ok: false, error: "Not a member" });
    member.socketId = socket.id;
    member.connected = true;
    // Clear any in-progress disconnect timer for this player
    delete room.disconnects[playerId];
    bound = { roomCode: code, playerId };
    socket.join(code);
    cb({ ok: true });
    broadcastRoom(code);
  });

  socket.on("room:start", (_payload, cb) => {
    if (!bound) return cb({ ok: false, error: "Not in a room" });
    const room = rooms.get(bound.roomCode);
    if (!room) return cb({ ok: false, error: "Room not found" });
    if (room.members.length < 2) return cb({ ok: false, error: "Need at least 2 players" });
    if (room.game) return cb({ ok: false, error: "Already started" });
    startRoomGame(bound.roomCode);
    cb({ ok: true });
  });

  socket.on("room:ready", (_payload, cb) => {
    if (!bound) return cb?.({ ok: false });
    const room = rooms.get(bound.roomCode);
    if (!room || room.game) return cb?.({ ok: false, error: "Already started" });
    if (room.members.length < 2) return cb?.({ ok: false, error: "Need at least 2 players" });

    if (!room.readyVotes.includes(bound.playerId)) {
      room.readyVotes.push(bound.playerId);
    }

    if (!room.readyStartedAt) {
      // First player to click — arm the 10s countdown.
      room.readyStartedAt = Date.now();
      const localCode = bound.roomCode;
      const timerId = setTimeout(() => { startRoomGame(localCode); }, 10_000);
      readyTimers.set(bound.roomCode, timerId);
      cb?.({ ok: true });
      broadcastRoom(bound.roomCode);
    } else {
      // A second player clicked (or timer already running) — start immediately.
      startRoomGame(bound.roomCode);
      cb?.({ ok: true });
    }
  });

  socket.on("room:coin_toss_pick", ({ side }: { side: "heads" | "tails" }, cb) => {
    if (!bound) return cb?.({ ok: false });
    const room = rooms.get(bound.roomCode);
    if (!room || !room.coinToss || !room.game) return cb?.({ ok: false, error: "No coin toss" });
    const ct = room.coinToss;
    const otherSide: "heads" | "tails" = side === "heads" ? "tails" : "heads";
    if (ct.choices[side]) return cb?.({ ok: false, error: "Side already taken" });

    ct.choices[side] = bound.playerId;

    if (!ct.choices[otherSide]) {
      // First pick — start the 5-second window for the other player.
      ct.startedAt = Date.now();
      // Server-side fallback: auto-resolve if the other player doesn't pick.
      // The client-side timer only fires for active clients, so if the other
      // player has disconnected we'd otherwise be stuck forever.
      const localCode = bound.roomCode;
      const pickerId = bound.playerId;
      const existing = coinTossTimers.get(localCode);
      if (existing) clearTimeout(existing);
      const timerId = setTimeout(() => {
        const r = rooms.get(localCode);
        if (!r || !r.coinToss || !r.game) return;
        const ctNow = r.coinToss;
        if (ctNow.result) return;
        const otherMember = r.members.find((m) => m.playerId !== pickerId);
        if (!otherMember) return;
        const remainingSide: "heads" | "tails" =
          ctNow.choices.heads === pickerId ? "tails" : "heads";
        if (ctNow.choices[remainingSide]) return;
        ctNow.choices[remainingSide] = otherMember.playerId;
        const winner = r.game.players[r.game.currentPlayer];
        ctNow.result = ctNow.choices.heads === winner.id ? "heads" : "tails";
        coinTossTimers.delete(localCode);
        broadcastRoom(localCode);
      }, 5000);
      coinTossTimers.set(localCode, timerId);
    } else {
      // Second pick — both sides are now assigned; determine the result.
      const existing = coinTossTimers.get(bound.roomCode);
      if (existing) clearTimeout(existing);
      coinTossTimers.delete(bound.roomCode);
      const winner = room.game.players[room.game.currentPlayer];
      ct.result = ct.choices.heads === winner.id ? "heads" : "tails";
    }

    cb?.({ ok: true });
    broadcastRoom(bound.roomCode);
  });

  socket.on("room:play_again", (_payload, cb) => {
    if (!bound) return cb({ ok: false, error: "Not in a room" });
    const room = rooms.get(bound.roomCode);
    if (!room || !room.game) return cb({ ok: false, error: "No game" });
    if (room.game.phase !== "round_over") return cb({ ok: false, error: "Round not over" });

    // Record this player's vote (idempotent).
    if (!room.playAgainVotes.includes(bound.playerId)) {
      room.playAgainVotes.push(bound.playerId);
    }

    // Active players = members who have not forfeited. We need ALL of them to vote.
    const activeIds = room.members
      .map((m) => m.playerId)
      .filter((pid) => !room.disconnects[pid]?.forfeited);
    const allVoted = activeIds.every((pid) => room.playAgainVotes.includes(pid));

    if (!allVoted) {
      // Just broadcast the vote — other players see "X wants a rematch".
      cb({ ok: true, waiting: true });
      broadcastRoom(bound.roomCode);
      return;
    }

    // Everyone has voted — start the next round.
    const players = room.game.players.map((p) => ({ id: p.id, name: p.name, isBot: false }));
    const nextStarter = (room.lastStarterIdx + 1) % players.length;
    room.game = newGame({
      players,
      roundNumber: room.game.roundNumber + 1,
      scores: room.game.scores,
    });
    room.game.currentPlayer = nextStarter;
    room.lastStarterIdx = nextStarter;
    room.coinToss = null;
    room.playAgainVotes = [];
    room.readyVotes = [];
    room.readyStartedAt = null;
    room.roundReadyVotes = [];
    room.roundReadyStartedAt = null;
    const rrTimer = roundReadyTimers.get(bound.roomCode);
    if (rrTimer) clearTimeout(rrTimer);
    roundReadyTimers.delete(bound.roomCode);
    cb({ ok: true });
    broadcastRoom(bound.roomCode);
  });

  socket.on("action", (action: ActionMsg, cb) => {
    if (!bound) return cb?.({ ok: false, error: "Not in a room" });
    const room = rooms.get(bound.roomCode);
    if (!room || !room.game) return cb?.({ ok: false, error: "No game" });

    // Intercept start_play during setup_peek: collective ready-up with 10s timer.
    // First player to click arms the timer; second click (or timer expiry) starts.
    if (action.type === "start_play" && room.game.phase === "setup_peek") {
      if (!room.roundReadyVotes.includes(bound.playerId)) {
        room.roundReadyVotes.push(bound.playerId);
      }
      const otherVoted = room.roundReadyVotes.some((id) => id !== bound!.playerId);

      if (!room.roundReadyStartedAt) {
        room.roundReadyStartedAt = Date.now();
        const localCode = bound.roomCode;
        const timerId = setTimeout(() => {
          const r = rooms.get(localCode);
          if (!r || !r.game || r.game.phase !== "setup_peek") return;
          r.game = startPlay(r.game);
          r.roundReadyVotes = [];
          r.roundReadyStartedAt = null;
          roundReadyTimers.delete(localCode);
          broadcastRoom(localCode);
        }, 10_000);
        roundReadyTimers.set(bound.roomCode, timerId);
        cb?.({ ok: true });
        broadcastRoom(bound.roomCode);
        return;
      } else if (otherVoted) {
        // Second player clicked — start immediately.
        const timerId = roundReadyTimers.get(bound.roomCode);
        if (timerId) clearTimeout(timerId);
        roundReadyTimers.delete(bound.roomCode);
        room.roundReadyVotes = [];
        room.roundReadyStartedAt = null;
        // Fall through to applyAction below.
      } else {
        // Same player clicking again while timer is running — ignore.
        cb?.({ ok: true });
        return;
      }
    }

    const next = applyAction(room.game, bound.playerId, action);
    if (!next) return cb?.({ ok: false, error: "Illegal action" });
    room.game = next;
    cb?.({ ok: true });
    broadcastRoom(bound.roomCode);
  });

  // The client calls this when the local player explicitly leaves the room
  // (back-to-menu, leave-room button). We treat it as an immediate disconnect
  // so the other player gets the "X left" notification right away.
  socket.on("room:leave", () => {
    handleDisconnect();
  });

  socket.on("disconnect", () => {
    handleDisconnect();
  });

  function handleDisconnect() {
    if (!bound) return;
    const room = rooms.get(bound.roomCode);
    if (!room) return;
    const wasAlreadyDisconnected = !!room.disconnects[bound.playerId];
    const member = room.members.find((m) => m.playerId === bound!.playerId);
    if (member) {
      member.connected = false;
      member.socketId = "";
    }
    // If a game is in progress, start a forfeit countdown for this player.
    // Don't track disconnects in the lobby (no game yet). Idempotent — if we
    // already started a timer (e.g. room:leave then real disconnect) reuse it.
    if (
      room.game &&
      room.game.phase !== "round_over" &&
      !wasAlreadyDisconnected &&
      !room.disconnects[bound.playerId]?.forfeited
    ) {
      room.disconnects[bound.playerId] = { startedAt: Date.now(), forfeited: false };
      const localBound = bound;
      setTimeout(() => {
        const r = rooms.get(localBound.roomCode);
        if (!r) return;
        const d = r.disconnects[localBound.playerId];
        if (!d || d.forfeited) return;
        // If they reconnected, the entry was deleted in room:rejoin — bail.
        const m = r.members.find((mm) => mm.playerId === localBound.playerId);
        if (m?.connected) return;
        d.forfeited = true;
        broadcastRoom(localBound.roomCode);
      }, 20_000);
    }
    broadcastRoom(bound.roomCode);
    // Garbage-collect empty rooms after a minute
    setTimeout(() => {
      const r = rooms.get(bound!.roomCode);
      if (r && r.members.every((m) => !m.connected)) {
        rooms.remove(bound!.roomCode);
      }
    }, 60_000);
  }
});

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || "0.0.0.0";
server.listen(PORT, HOST, () =>
  console.log(`Cobo server listening on ${HOST}:${PORT}`),
);
