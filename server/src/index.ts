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
  drawFromDeck,
  drawFromDiscard,
  newGame,
  setupPeekCard,
  snap,
  startPlay,
  swapDrawnWithHand,
} from "./engine/game.js";
import type { GameState } from "./engine/types.js";

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = new Rooms();

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
  };
}

type ActionMsg =
  | { type: "draw_deck" }
  | { type: "draw_discard" }
  | { type: "swap_drawn"; handIndex: number }
  | { type: "discard_drawn" }
  | { type: "action_peek_own"; index: number }
  | { type: "action_peek_other"; targetPlayerId: string; index: number }
  | { type: "action_blind_swap"; ownIndex: number; targetPlayerId: string; targetIndex: number }
  | { type: "action_peek_and_swap_pick"; targetPlayerId: string; index: number }
  | { type: "action_peek_and_swap_decide"; doSwap: boolean; ownIndex?: number }
  | { type: "call_cabo" }
  | { type: "snap"; handIndex: number }
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
    case "snap":
      return snap(game, playerId, action.handIndex);
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
    bound = { roomCode: code, playerId };
    socket.join(code);
    cb({ ok: true });
    broadcastRoom(code);
  });

  socket.on("room:start", (_payload, cb) => {
    if (!bound) return cb({ ok: false, error: "Not in a room" });
    const room = rooms.get(bound.roomCode);
    if (!room) return cb({ ok: false, error: "Room not found" });
    if (room.hostId !== bound.playerId) return cb({ ok: false, error: "Only host can start" });
    if (room.members.length < 2) return cb({ ok: false, error: "Need at least 2 players" });
    if (room.game) return cb({ ok: false, error: "Already started" });
    const players = room.members.map((m) => ({ id: m.playerId, name: m.name, isBot: false }));
    room.game = newGame({ players });
    cb({ ok: true });
    broadcastRoom(bound.roomCode);
  });

  socket.on("room:play_again", (_payload, cb) => {
    if (!bound) return cb({ ok: false, error: "Not in a room" });
    const room = rooms.get(bound.roomCode);
    if (!room || !room.game) return cb({ ok: false, error: "No game" });
    if (room.hostId !== bound.playerId) return cb({ ok: false, error: "Only host" });
    const players = room.game.players.map((p) => ({ id: p.id, name: p.name, isBot: false }));
    room.game = newGame({
      players,
      roundNumber: room.game.roundNumber + 1,
      scores: room.game.scores,
    });
    cb({ ok: true });
    broadcastRoom(bound.roomCode);
  });

  socket.on("action", (action: ActionMsg, cb) => {
    if (!bound) return cb?.({ ok: false, error: "Not in a room" });
    const room = rooms.get(bound.roomCode);
    if (!room || !room.game) return cb?.({ ok: false, error: "No game" });
    const next = applyAction(room.game, bound.playerId, action);
    if (!next) return cb?.({ ok: false, error: "Illegal action" });
    room.game = next;
    cb?.({ ok: true });
    broadcastRoom(bound.roomCode);
  });

  socket.on("disconnect", () => {
    if (!bound) return;
    const room = rooms.get(bound.roomCode);
    if (!room) return;
    const member = room.members.find((m) => m.playerId === bound!.playerId);
    if (member) {
      member.connected = false;
      member.socketId = "";
    }
    broadcastRoom(bound.roomCode);
    // Garbage-collect empty rooms after a minute
    setTimeout(() => {
      const r = rooms.get(bound!.roomCode);
      if (r && r.members.every((m) => !m.connected)) {
        rooms.remove(bound!.roomCode);
      }
    }, 60_000);
  });
});

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || "0.0.0.0";
server.listen(PORT, HOST, () =>
  console.log(`Cobo server listening on ${HOST}:${PORT}`),
);
