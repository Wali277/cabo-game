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
// Per-room timers for the straw-draw fallback (10s after first pick).
const strawDrawTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Per-room timers for the straw-continue collective ready-up (10s after first click).
const strawReadyTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
    room.strawDraw = null;
  } else {
    room.coinToss = null;
    // Build N straws with lengths 0..N-1, then shuffle so positions are random.
    const lengths = Array.from({ length: players.length }, (_, i) => i);
    for (let i = lengths.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lengths[i], lengths[j]] = [lengths[j], lengths[i]];
    }
    room.strawDraw = {
      straws: lengths.map((length) => ({ length, ownerId: null, revealed: false })),
      startedAt: null,
      result: null,
    };
  }
  room.readyVotes = [];
  room.readyStartedAt = null;
  broadcastRoom(roomCode);
}

// Finalise a straw draw: assign any unclaimed straws to players who didn't
// pick, compute the turn order from straw lengths (longest = first), and
// update game.currentPlayer accordingly.
function finalizeStrawDraw(roomCode: string) {
  const r = rooms.get(roomCode);
  if (!r || !r.game || !r.strawDraw || r.strawDraw.result) return;
  const sd = r.strawDraw;
  // Players who haven't yet been assigned a straw
  const assignedIds = new Set(sd.straws.map((s) => s.ownerId).filter(Boolean) as string[]);
  const remainingPlayers = r.game.players
    .map((p) => p.id)
    .filter((id) => !assignedIds.has(id));
  // Straws still unclaimed, randomised
  const remainingStrawIdxs = sd.straws
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.ownerId === null)
    .map(({ i }) => i)
    .sort(() => Math.random() - 0.5);
  for (let k = 0; k < Math.min(remainingPlayers.length, remainingStrawIdxs.length); k++) {
    sd.straws[remainingStrawIdxs[k]].ownerId = remainingPlayers[k];
  }
  // Determine turn order: longest straw (highest length value) plays first.
  const order = [...sd.straws]
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.ownerId !== null)
    .sort((a, b) => b.s.length - a.s.length)
    .map(({ s }) => s.ownerId as string);
  sd.result = order;
  // Mark all straws as revealed for the reveal animation
  sd.straws.forEach((s) => { s.revealed = true; });
  // Set the game's currentPlayer to the first in the new order
  const firstIdx = r.game.players.findIndex((p) => p.id === order[0]);
  if (firstIdx >= 0) {
    r.game.currentPlayer = firstIdx;
    r.lastStarterIdx = firstIdx;
  }
  strawDrawTimers.delete(roomCode);
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

/**
 * Auto-advance the turn past any player who is permanently kicked (forfeit,
 * bust, kick). Loops in case multiple consecutive players are kicked. Resets
 * the per-turn transient fields (drawn card / pending action) the way
 * advanceTurn() does in the engine.
 *
 * Stays inside the server because it depends on `kickedIds` (a room concept,
 * not engine state). The engine's own advanceTurn doesn't know about kicks.
 */
function skipKickedTurn(game: GameState, kickedIds: string[]): GameState {
  if (game.phase === "round_over") return game;
  if (game.players.length === 0) return game;
  // FAST PATH — current seat is fine. Don't touch state. This is the
  // common case (every action after a normal move), and resetting the
  // phase here was breaking draw/flip/swap. Only intervene when we
  // actually need to step past a kicked seat.
  if (!kickedIds.includes(game.players[game.currentPlayer]?.id ?? "")) {
    return game;
  }
  let attempts = game.players.length;
  while (
    attempts > 0 &&
    kickedIds.includes(game.players[game.currentPlayer]?.id ?? "")
  ) {
    game.currentPlayer = (game.currentPlayer + 1) % game.players.length;
    attempts -= 1;
    // Stop and resolve as round_over if we wrap into the cabo caller's seat.
    if (game.caboCallerId && game.players[game.currentPlayer]?.id === game.caboCallerId) {
      break;
    }
  }
  // We advanced past at least one kicked seat — reset per-turn transient
  // state so the new current player starts a clean turn.
  game.phase = "turn_start";
  game.drawnCard = null;
  game.drawnFrom = null;
  game.pendingActionSource = null;
  game.peekAndSwapPick = null;
  return game;
}

/** Players who can still participate: not forfeited and not permanently kicked. */
function activePlayerIds(room: { members: { playerId: string }[]; disconnects: Record<string, { forfeited: boolean }>; kickedIds: string[] }): string[] {
  return room.members
    .map((m) => m.playerId)
    .filter((pid) => !room.disconnects[pid]?.forfeited && !room.kickedIds.includes(pid));
}

function broadcastRoom(roomCode: string) {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const member of room.members) {
    const socket = io.sockets.sockets.get(member.socketId);
    if (!socket) continue;
    socket.emit("room:state", publicView(room, member.playerId));
  }
  // Animations are single-use — clear them immediately after every broadcast so
  // they don't replay when the next action triggers another broadcast.
  if (room.game && room.game.animations.length > 0) {
    room.game = clearAnimations(room.game);
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
  // Exclude busted/kicked players entirely — their absence is a gameplay
  // elimination, not a tab-close. The bust system handles their UI separately.
  const disconnects: Record<string, { startedAt: number; forfeited: boolean }> = {};
  for (const [pid, d] of Object.entries(room.disconnects)) {
    if (room.kickedIds.includes(pid) || room.bustedThisRound.includes(pid)) continue;
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
    strawDraw: room.strawDraw,
    playAgainVotes: room.playAgainVotes,
    disconnects,
    readyVotes: room.readyVotes,
    readyStartedAt: room.readyStartedAt,
    roundReadyVotes: room.roundReadyVotes,
    roundReadyStartedAt: room.roundReadyStartedAt,
    strawReadyVotes: room.strawReadyVotes,
    strawReadyStartedAt: room.strawReadyStartedAt,
    bustedThisRound: room.bustedThisRound,
    kickedIds: room.kickedIds,
    gloriosVictory: room.gloriosVictory,
    gloriosVictoryReason: room.gloriosVictoryReason,
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
    case "action_peek_and_swap_decide": {
      if (!requireCurrent()) return null;
      const decided = actionPeekAndSwapDecide(game, action.doSwap, action.ownIndex);
      if (!decided) return null;
      // The peek_and_swap reveal is only needed during the decide phase.
      // Clear it immediately so cards flip back face-down on all clients.
      return { ...decided, reveals: decided.reveals.filter((r) => r.reason !== "peek_and_swap") };
    }
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
    if (room.kickedIds.includes(playerId)) {
      return cb({ ok: false, error: "You have been eliminated from this game." });
    }
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

    const activeIds = activePlayerIds(room);
    const allVoted = activeIds.every((pid) => room.readyVotes.includes(pid));

    if (!room.readyStartedAt) {
      // First player to click — arm the 10s countdown.
      room.readyStartedAt = Date.now();
      const localCode = bound.roomCode;
      const timerId = setTimeout(() => { startRoomGame(localCode); }, 10_000);
      readyTimers.set(bound.roomCode, timerId);
    }

    if (allVoted) {
      // Everyone clicked — cancel the timer and start now.
      const timerId = readyTimers.get(bound.roomCode);
      if (timerId) clearTimeout(timerId);
      readyTimers.delete(bound.roomCode);
      startRoomGame(bound.roomCode); // broadcasts internally
      cb?.({ ok: true });
      return;
    }

    cb?.({ ok: true });
    broadcastRoom(bound.roomCode);
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

  socket.on("room:straw_pick", ({ index }: { index: number }, cb) => {
    if (!bound) return cb?.({ ok: false });
    const room = rooms.get(bound.roomCode);
    if (!room || !room.strawDraw || !room.game) return cb?.({ ok: false, error: "No straw draw" });
    const sd = room.strawDraw;
    if (sd.result) return cb?.({ ok: false, error: "Already drawn" });
    if (index < 0 || index >= sd.straws.length) return cb?.({ ok: false, error: "Bad index" });
    const straw = sd.straws[index];
    if (straw.ownerId) return cb?.({ ok: false, error: "Straw already taken" });
    // A player gets only one straw — silently no-op if they pick a second time.
    if (sd.straws.some((s) => s.ownerId === bound!.playerId)) return cb?.({ ok: false, error: "Already picked" });

    straw.ownerId = bound.playerId;

    if (!sd.startedAt) {
      sd.startedAt = Date.now();
      // Start the 10s window for everyone else
      const localCode = bound.roomCode;
      const existing = strawDrawTimers.get(localCode);
      if (existing) clearTimeout(existing);
      const timerId = setTimeout(() => finalizeStrawDraw(localCode), 10_000);
      strawDrawTimers.set(localCode, timerId);
    }

    // If every straw is now claimed, finalise immediately.
    if (sd.straws.every((s) => s.ownerId !== null)) {
      finalizeStrawDraw(bound.roomCode);
      cb?.({ ok: true });
      return;
    }

    cb?.({ ok: true });
    broadcastRoom(bound.roomCode);
  });

  // All players click "Continue" after straw reveal — same approval pattern as ready-up.
  socket.on("room:straw_ready", (_payload, cb) => {
    if (!bound) return cb?.({ ok: false });
    const room = rooms.get(bound.roomCode);
    if (!room || !room.strawDraw?.result) return cb?.({ ok: false, error: "No straw result" });

    if (!room.strawReadyVotes.includes(bound.playerId)) {
      room.strawReadyVotes.push(bound.playerId);
    }

    const activeIds = activePlayerIds(room);
    const allVoted = activeIds.every((pid) => room.strawReadyVotes.includes(pid));

    function startFromStraw() {
      if (!room) return;
      const existing = strawReadyTimers.get(bound!.roomCode);
      if (existing) clearTimeout(existing);
      strawReadyTimers.delete(bound!.roomCode);
      room.strawReadyVotes = [];
      room.strawReadyStartedAt = null;
      // Game already has the correct currentPlayer from finalizeStrawDraw.
      broadcastRoom(bound!.roomCode);
      // Signal clients to transition: send a special flag they can detect.
      // We set strawDraw to null so the client's applyMpRoom routes to "game".
      room.strawDraw = null;
      broadcastRoom(bound!.roomCode);
    }

    if (!room.strawReadyStartedAt) {
      room.strawReadyStartedAt = Date.now();
      const localCode = bound.roomCode;
      const timerId = setTimeout(() => {
        const r = rooms.get(localCode);
        if (!r || !r.strawDraw?.result) return;
        startFromStraw();
      }, 10_000);
      strawReadyTimers.set(bound.roomCode, timerId);
    }

    if (allVoted) {
      startFromStraw();
      cb?.({ ok: true });
      return;
    }

    cb?.({ ok: true });
    broadcastRoom(bound.roomCode);
  });

  socket.on("room:play_again", (_payload, cb) => {
    if (!bound) return cb({ ok: false, error: "Not in a room" });
    const room = rooms.get(bound.roomCode);
    if (!room || !room.game) return cb({ ok: false, error: "No game" });
    if (room.game.phase !== "round_over") return cb({ ok: false, error: "Round not over" });

    // If glory was auto-declared at round-end (because only 1 survivor remained),
    // there is nothing to vote on — reject stray play_again requests.
    if (room.gloriosVictory) {
      return cb({ ok: false, error: "Game over — a winner has already been declared" });
    }

    // Clear any old victory state from a previous game session.
    room.gloriosVictory = null;
    room.gloriosVictoryReason = null;

    // Finalise busts from the round that just ended: move to permanent kicked list.
    for (const id of room.bustedThisRound) {
      if (!room.kickedIds.includes(id)) room.kickedIds.push(id);
    }
    room.bustedThisRound = [];

    // Record this player's vote (idempotent).
    if (!room.playAgainVotes.includes(bound.playerId)) {
      room.playAgainVotes.push(bound.playerId);
    }

    // Active players = members who have not forfeited AND have not been kicked.
    const activeIds = activePlayerIds(room);
    if (activeIds.length <= 1) {
      // Only one (or zero) active players remain after this round's busts —
      // declare glorious victory immediately without waiting for more votes.
      room.gloriosVictory = activeIds[0] ?? null;
      room.gloriosVictoryReason = "survivor";
      room.playAgainVotes = [];
      cb({ ok: true });
      broadcastRoom(bound.roomCode);
      return;
    }
    const allVoted = activeIds.every((pid) => room.playAgainVotes.includes(pid));

    if (!allVoted) {
      // Just broadcast the vote — other players see "X wants a rematch".
      cb({ ok: true, waiting: true });
      broadcastRoom(bound.roomCode);
      return;
    }

    // Everyone has voted — determine players for next round (exclude kicked).
    const playersForNextRound = room.game.players.filter(
      (p) => !room.kickedIds.includes(p.id)
    );

    if (playersForNextRound.length <= 1) {
      // Only one player left — declare glorious victory.
      room.gloriosVictory = playersForNextRound[0]?.id ?? null;
      room.gloriosVictoryReason = "survivor";
      room.playAgainVotes = [];
      cb({ ok: true });
      broadcastRoom(bound.roomCode);
      return;
    }

    // Continue with remaining (non-kicked) players only.
    const players = playersForNextRound.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: false,
    }));
    const nextStarterIdx = (room.lastStarterIdx + 1) % players.length;
    room.game = newGame({
      players,
      roundNumber: room.game.roundNumber + 1,
      scores: room.game.scores,
    });
    room.game.currentPlayer = nextStarterIdx;
    room.lastStarterIdx = nextStarterIdx;
    room.coinToss = null;
    room.strawDraw = null; // No straw draw from round 2 onward — alternation handles order.
    room.playAgainVotes = [];
    room.readyVotes = [];
    room.readyStartedAt = null;
    room.roundReadyVotes = [];
    room.roundReadyStartedAt = null;
    room.strawReadyVotes = [];
    room.strawReadyStartedAt = null;
    room.bustedThisRound = [];
    // kickedIds intentionally not cleared — eliminations persist across rounds.
    // Clear stale disconnect/forfeit state from the previous round so every
    // new round starts with all members treated as active.
    room.disconnects = {};
    const rrTimer = roundReadyTimers.get(bound.roomCode);
    if (rrTimer) clearTimeout(rrTimer);
    roundReadyTimers.delete(bound.roomCode);
    const srTimer = strawReadyTimers.get(bound.roomCode);
    if (srTimer) clearTimeout(srTimer);
    strawReadyTimers.delete(bound.roomCode);
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

      const activeRoundIds = activePlayerIds(room);
      const allRoundVoted = activeRoundIds.every((pid) => room.roundReadyVotes.includes(pid));

      if (!room.roundReadyStartedAt) {
        // First click — arm the 10s countdown.
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
        if (!allRoundVoted) {
          cb?.({ ok: true });
          broadcastRoom(bound.roomCode);
          return;
        }
      } else if (!allRoundVoted) {
        // Timer already running, not everyone voted yet — just update the vote count.
        cb?.({ ok: true });
        broadcastRoom(bound.roomCode);
        return;
      }

      // Everyone voted — cancel timer and fall through to applyAction (startPlay).
      const timerId = roundReadyTimers.get(bound.roomCode);
      if (timerId) clearTimeout(timerId);
      roundReadyTimers.delete(bound.roomCode);
      room.roundReadyVotes = [];
      room.roundReadyStartedAt = null;
      // Fall through to applyAction below.
    }

    const next = applyAction(room.game, bound.playerId, action);
    // `next === room.game` means the engine returned the same reference — a silent
    // precondition failure (e.g. wrong phase, null drawnCard). Treat it identically
    // to a null return: reject the action so the client knows to retry.
    if (!next || next === room.game) return cb?.({ ok: false, error: "Illegal action" });
    room.game = next;

    // Defensive: if the resulting state lands the turn on a kicked
    // (forfeited / busted-and-permanently-out) player, skip past them
    // so the game doesn't stall waiting for someone who can't play.
    room.game = skipKickedTurn(room.game, room.kickedIds);

    // After a round ends: track wins, detect busts, and determine if the game ends.
    if (room.game.phase === "round_over") {
      // ── 0. Filter winner against kickedIds ────────────────────────────────
      // The engine's endRound() doesn't know about room-level kicks (forfeit
      // or prior-round busts), so a kicked player with an empty hand (0 pts)
      // could be picked as round winner. Recompute against non-kicked
      // players so the cinematic "X wins the round" beat shows a real player.
      const kickedSetForWinner = new Set(room.kickedIds);
      if (room.game.winnerId && kickedSetForWinner.has(room.game.winnerId)) {
        const live = room.game.players
          .filter((p) => !kickedSetForWinner.has(p.id))
          .map((p) => ({
            id: p.id,
            roundScore: (room.game!.scores[p.id] ?? []).slice(-1)[0] ?? 0,
          }));
        if (live.length > 0) {
          const minScore = Math.min(...live.map((l) => l.roundScore));
          const newWinner = live.find((l) => l.roundScore === minScore);
          if (newWinner) room.game.winnerId = newWinner.id;
        }
      }

      // ── 1. Track round wins ──────────────────────────────────────────────────
      // Increment the win counter for whoever had the lowest hand this round.
      const roundWinnerId = room.game.winnerId;
      if (roundWinnerId && !kickedSetForWinner.has(roundWinnerId)) {
        room.roundWins[roundWinnerId] = (room.roundWins[roundWinnerId] ?? 0) + 1;
      }

      // ── 2. Compute newly busted players (cumulative score > 60) ─────────────
      room.bustedThisRound = room.game.players
        .filter((p) => (room.game!.scores[p.id] ?? []).reduce((a: number, b: number) => a + b, 0) > 60)
        .map((p) => p.id);

      if (room.bustedThisRound.length > 0) {
        const allEliminated = new Set([...room.kickedIds, ...room.bustedThisRound]);
        const survivors = room.members
          .map((m) => m.playerId)
          .filter((pid) => !allEliminated.has(pid) && !room.disconnects[pid]?.forfeited);

        if (survivors.length === 1) {
          // ── One clear survivor after busts → regular Glorious Victory ────────
          for (const id of room.bustedThisRound) {
            if (!room.kickedIds.includes(id)) room.kickedIds.push(id);
          }
          room.gloriosVictory = survivors[0];
          room.gloriosVictoryReason = "survivor";

        } else if (survivors.length === 0) {
          // ── Everyone busted simultaneously → tiebreaker ──────────────────────
          // Only consider players who were active in this round (not previously kicked).
          const contestants = room.bustedThisRound.filter(
            (pid) => !room.kickedIds.includes(pid),
          );

          let gloriousWinnerId: string | null = null;
          let gloriousReason: "survivor" | "more_wins" | "final_round" = "survivor";

          if (contestants.length === 1) {
            // Only one active buster — they win by default.
            gloriousWinnerId = contestants[0];
            gloriousReason = "survivor";
          } else if (contestants.length > 1) {
            // Tiebreaker 1: most round wins accumulated across all previous rounds.
            const maxWins = Math.max(...contestants.map((pid) => room.roundWins[pid] ?? 0));
            const topByWins = contestants.filter((pid) => (room.roundWins[pid] ?? 0) === maxWins);

            if (topByWins.length === 1) {
              gloriousWinnerId = topByWins[0];
              gloriousReason = "more_wins";
            } else {
              // Tiebreaker 2: whoever won this last round is the Glorious Victor.
              // (There is always exactly one round winner, so this always resolves.)
              const lastWinner = room.game.winnerId;
              gloriousWinnerId =
                lastWinner && topByWins.includes(lastWinner)
                  ? lastWinner
                  : topByWins[0]; // ultra-rare fallback
              gloriousReason = "final_round";
            }
          }

          if (gloriousWinnerId) {
            // The Glorious Victor technically busted but wins by tiebreaker.
            // Remove them from bustedThisRound so they see GloriousVictory, not BustedOverlay.
            room.bustedThisRound = room.bustedThisRound.filter((id) => id !== gloriousWinnerId);
            // Permanently kick the actual losers (the victor is exempt — game is over).
            for (const id of room.bustedThisRound) {
              if (!room.kickedIds.includes(id)) room.kickedIds.push(id);
            }
            room.gloriosVictory = gloriousWinnerId;
            room.gloriosVictoryReason = gloriousReason;
          }
          // If contestants.length === 0 (edge case: all were already kicked), do nothing.
        }
        // survivors.length > 1: multiple players still active → normal play-again flow.
      }
    }

    cb?.({ ok: true });
    broadcastRoom(bound.roomCode);
  });

  // Chat: ephemeral broadcast — no server-side persistence. Messages exist
  // only in connected clients' memory, and only while the room exists.
  socket.on("room:chat", ({ text }: { text: string }, cb) => {
    if (!bound) return cb?.({ ok: false });
    const room = rooms.get(bound.roomCode);
    if (!room) return cb?.({ ok: false });
    const member = room.members.find((m) => m.playerId === bound!.playerId);
    if (!member) return cb?.({ ok: false });
    const trimmed = String(text ?? "").slice(0, 200).trim();
    if (!trimmed) return cb?.({ ok: false });
    const msg = { from: bound.playerId, name: member.name, text: trimmed, at: Date.now() };
    io.to(bound.roomCode).emit("chat:message", msg);
    cb?.({ ok: true });
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
    //
    // CRITICAL: Bust ≠ disconnect. A player who has been busted/kicked or who
    // is leaving an ended game must NEVER trigger the forfeit countdown — they
    // were removed by the game's bust system, not by leaving. These two systems
    // are completely separate: bust = gameplay elimination (tracked in
    // bustedThisRound/kickedIds, no timer), disconnect = network/tab-close
    // (tracked in disconnects, 20s forfeit timer). They must not collide.
    const isBustedOrKicked =
      room.kickedIds.includes(bound.playerId) ||
      room.bustedThisRound.includes(bound.playerId);
    const gameIsOver = !!room.gloriosVictory;
    if (
      room.game &&
      room.game.phase !== "round_over" &&
      !isBustedOrKicked &&
      !gameIsOver &&
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

        if (r.game && r.game.phase !== "round_over") {
          const forfeiter = r.game.players.find((p) => p.id === localBound.playerId);
          const wasTheirTurn =
            r.game.players[r.game.currentPlayer]?.id === localBound.playerId;

          if (forfeiter) {
            // Move their hand + any drawn card to the BOTTOM of the discard
            // pile (unshift = oldest). Putting them at the top would let
            // remaining players "loot" the leaver's cards via draw-from-
            // discard, which would warp the game. Going to the bottom keeps
            // the cards out of circulation while preserving deck count.
            for (const card of forfeiter.hand) {
              if (card) r.game.discard.unshift(card);
            }
            forfeiter.hand = [];
            forfeiter.knownToSelf = [];

            if (wasTheirTurn && r.game.drawnCard) {
              r.game.discard.unshift(r.game.drawnCard);
              r.game.drawnCard = null;
              r.game.drawnFrom = null;
              r.game.pendingActionSource = null;
              r.game.peekAndSwapPick = null;
            }
          }

          // Permanently remove them from the room's active rotation.
          if (!r.kickedIds.includes(localBound.playerId)) {
            r.kickedIds.push(localBound.playerId);
          }

          // If they were on the clock, advance the turn past them. The
          // skip helper handles consecutive kicked seats too.
          if (wasTheirTurn) {
            r.game = skipKickedTurn(r.game, r.kickedIds);
          }
        }

        // If the forfeit just left exactly one active player, declare them
        // the Glorious Victor by forfeit. Otherwise the match continues
        // with the remaining players.
        const survivors = activePlayerIds(r);
        if (survivors.length === 1 && !r.gloriosVictory) {
          r.gloriosVictory = survivors[0];
          r.gloriosVictoryReason = "survivor";
        }

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
