import express from "express";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "cors";
import helmet from "helmet";
import { Server } from "socket.io";
import { Rooms } from "./rooms.js";
import {
  ALLOWED_DRAGON_RANKS,
  activateDragon,
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
  discardDrawn,
  discardDrawnSkipAction,
  discardDrawnWithAction,
  dragonChooseRank,
  drawFromDeck,
  drawFromDiscard,
  newGame,
  setupPeekCard,
  skipPendingAction,
  startPlay,
  swapDrawnWithHand,
  triggerPendingAction,
} from "./engine/game.js";
import type { GameState, Rank } from "./engine/types.js";
import { resolveRoundOver, seatSuddenDeathNextRound } from "./roundResolve.js";
import { authRouter, accountRouter } from "./auth/router.js";
import { verifyAccessToken } from "./auth/verifyToken.js";
import { admin } from "./auth/supabaseClients.js";
import { DEV_REDEEM_CODES_ACTIVE } from "./auth/redeemCodes.js";
import { grantMpRewards } from "./mpGrants.js";
import { kofiRouter } from "./webhooks/kofi.js";
import { bugReportRouter } from "./api/bugReport.js";

/**
 * Allowed CORS origins. Production locks to the known LUMO domains; dev stays
 * permissive so localhost:5173 AND phones on the LAN (http://<lan-ip>:5173) can
 * still test. Requests with NO Origin header — Electron's file:// renderer sends
 * Origin "null", and curl / native / server-to-server send none — are always
 * allowed (auth is a Bearer header, never a cookie, so CORS isn't the auth boundary).
 */
const PROD_ORIGINS = [
  "https://playlumo.net",
  "https://www.playlumo.net",
  "https://cabo-game-r5xb.onrender.com",
];
function originAllowed(origin: string | undefined): boolean {
  if (!origin || origin === "null") return true;
  if (process.env.NODE_ENV !== "production") return true;
  return PROD_ORIGINS.includes(origin);
}

const app = express();
// Render/Fly sit exactly ONE proxy hop in front of us. Trusting that single hop
// makes Express compute req.ip from X-Forwarded-For correctly, so the auth
// rate-limiter keys on the real client IP instead of a manually-parsed (spoofable) value.
app.set("trust proxy", 1);
app.use(
  helmet({
    // The Vite-built SPA uses inline/eval; a full web CSP is a separate later task.
    contentSecurityPolicy: false,
    // Don't block the SPA's assets or the socket handshake.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    // Drop two legacy headers browser devtools flag as unneeded. X-Frame-Options
    // is superseded by CSP frame-ancestors (a later task); X-XSS-Protection is
    // deprecated (helmet sets it to "0"). Safe to omit for this same-origin app.
    xFrameOptions: false,
    xXssProtection: false,
  }),
);
app.use(cors({ origin: (origin, cb) => cb(null, originAllowed(origin)) }));
// Parse JSON bodies for the auth POST routes. Must come BEFORE the static /
// SPA-fallback middleware so JSON posts are parsed and the catch-all doesn't
// swallow them. Socket.IO is unaffected (it doesn't use Express body parsing).
app.use(express.json({ limit: "16kb" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: (origin, cb) => cb(null, originAllowed(origin)) },
});

const rooms = new Rooms();

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
  // New match → fresh idempotency identity. Bump the per-room counter (NOT a
  // timestamp/random) for a stable matchId, and re-arm xpGranted so this match
  // can grant its own end-of-match XP exactly once.
  room.matchSeq += 1;
  room.matchId = `${room.code}-m${room.matchSeq}`;
  room.xpGranted = false;
  const players = room.members.map((m) => ({ id: m.playerId, name: m.name, isBot: false }));
  room.game = newGame({ players, variant: room.variant });
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
  broadcastRoom(roomCode);
}

// Start the room's game the instant every CONNECTED, still-active player has
// clicked Ready (minimum 2). Disconnected players are deliberately excluded:
// they can't click, so requiring them would stall the room forever — and if a
// game does start without one, the in-game forfeit flow handles them. Returns
// true if it started (in which case it has already broadcast). This is the
// single source of truth for "everyone's ready", called from room:ready and
// whenever lobby membership changes (a leaver may be the last one awaited).
function maybeStartRoom(roomCode: string): boolean {
  const room = rooms.get(roomCode);
  if (!room || room.game) return false;
  const required = room.members
    .filter(
      (m) =>
        m.connected &&
        !room.disconnects[m.playerId]?.forfeited &&
        !room.kickedIds.includes(m.playerId),
    )
    .map((m) => m.playerId);
  if (required.length < 2) return false;
  if (!required.every((pid) => room.readyVotes.includes(pid))) return false;
  startRoomGame(roomCode); // resets readyVotes + broadcasts internally
  return true;
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
app.get("/rooms", (_req, res) => res.json({ count: rooms.size() }));

// Accounts auth API (signup / verify / login / password reset). Mounted BEFORE
// the static + SPA-fallback block so auth POSTs aren't served index.html.
app.use("/auth", authRouter);
// Accounts progression API (server-authoritative XP grants). Same ordering
// reason: must precede the SPA fallback so POST /account/grant-game is handled.
app.use("/account", accountRouter);
// Ko-fi donation webhook (server-authoritative token credit for "buy tokens"
// shop purchases). Same ordering reason: must precede the SPA fallback so
// POST /webhooks/kofi is handled rather than served index.html.
app.use("/webhooks", kofiRouter);
// In-app bug reports (POST /api/report-bug). Same ordering reason: must precede
// the SPA fallback so the POST is handled rather than served index.html.
app.use("/api", bugReportRouter);

// Serve the built client (if present) so the whole game runs from this single
// port — that means one tunnel / one deploy URL covers the entire app.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, "..", "..", "cobo", "dist");
const hasBuiltClient = fs.existsSync(path.join(CLIENT_DIST, "index.html"));
if (hasBuiltClient) {
  // Hash-named assets (Vite) are immutable → cache them hard. `index: false`
  // makes "/" (and other directory requests) fall through to the SPA handler
  // below instead of being served — and cached — by express.static, so the
  // entry HTML is NEVER long-term cached (otherwise users would never get new
  // builds). Only the fingerprinted assets get the 1-year cache.
  app.use(express.static(CLIENT_DIST, { maxAge: "1y", index: false }));
  // SPA fallback — anything that isn't a known API path or Socket.IO endpoint
  // returns index.html so /room/<code> works on first load.
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/socket.io")) return next();
    if (req.path.startsWith("/auth")) return next();
    if (req.path.startsWith("/account")) return next();
    if (req.path.startsWith("/webhooks")) return next();
    if (req.path.startsWith("/api")) return next();
    if (req.path === "/health" || req.path === "/rooms") return next();
    // index.html must ALWAYS revalidate so a new deploy's hashed bundle names
    // are picked up immediately; the hashed assets themselves are cached above.
    // Explicit charset utf-8 (sendFile doesn't set one) clears a devtools warning.
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
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
    variant: room.variant,
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
    roundReadyVotes: room.roundReadyVotes,
    roundReadyStartedAt: room.roundReadyStartedAt,
    strawReadyVotes: room.strawReadyVotes,
    strawReadyStartedAt: room.strawReadyStartedAt,
    bustedThisRound: room.bustedThisRound,
    kickedIds: room.kickedIds,
    gloriosVictory: room.gloriosVictory,
    gloriosVictoryReason: room.gloriosVictoryReason,
    suddenDeath: room.suddenDeath,
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
  | { type: "action_choose_peek"; choice: "own" | "other" }
  | { type: "action_blind_swap"; ownIndex: number; targetPlayerId: string; targetIndex: number }
  | { type: "action_peek_and_swap_pick"; targetPlayerId: string; index: number }
  | { type: "action_peek_and_swap_decide"; doSwap: boolean; ownIndex?: number }
  | { type: "call_cabo" }
  | { type: "action_snap_other"; targetPlayerId: string; targetIndex: number }
  | { type: "action_snap_self"; ownIndex: number }
  | { type: "action_start_snap_other" }
  | { type: "action_start_snap_self" }
  | { type: "start_play" }
  | { type: "setup_peek_card"; index: number }
  | { type: "activate_dragon" }
  | { type: "dragon_choose_rank"; rank: Rank }
  | { type: "clear_animations" }
  | { type: "clear_reveals" };

function applyAction(game: GameState, playerId: string, action: ActionMsg): GameState | null {
  // Most actions can only be performed by the current player; snap is open.
  const cur = game.players[game.currentPlayer]?.id;
  const requireCurrent = () => playerId === cur;
  // Boundary validation — client payloads are raw socket data and fully
  // untrusted. Indices must be integers inside the relevant hand; player ids
  // must resolve to a seated player (and differ from the actor where the
  // rules require a rival). Invalid → null, the existing illegal-action
  // rejection path. The engine re-guards everything (defense in depth).
  const handOf = (pid: unknown) =>
    typeof pid === "string" ? game.players.find((p) => p.id === pid)?.hand : undefined;
  const validIdx = (i: unknown, hand: ReturnType<typeof handOf>) =>
    !!hand && Number.isInteger(i) && (i as number) >= 0 && (i as number) < hand.length;

  switch (action.type) {
    case "start_play":
      return startPlay(game);
    case "setup_peek_card":
      if (!validIdx(action.index, handOf(playerId))) return null;
      return setupPeekCard(game, playerId, action.index);
    case "draw_deck":
      if (!requireCurrent()) return null;
      return drawFromDeck(game);
    case "draw_discard":
      if (!requireCurrent()) return null;
      return drawFromDiscard(game);
    case "swap_drawn":
      if (!requireCurrent()) return null;
      if (!validIdx(action.handIndex, handOf(playerId))) return null;
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
      if (!validIdx(action.index, handOf(playerId))) return null;
      return actionPeekOwn(game, action.index);
    case "action_peek_other":
      if (!requireCurrent()) return null;
      if (action.targetPlayerId === playerId) return null;
      if (!validIdx(action.index, handOf(action.targetPlayerId))) return null;
      return actionPeekOther(game, action.targetPlayerId, action.index);
    case "action_choose_peek":
      if (!requireCurrent()) return null;
      if (action.choice !== "own" && action.choice !== "other") return null;
      return actionChoosePeek(game, action.choice);
    case "action_blind_swap":
      if (!requireCurrent()) return null;
      if (action.targetPlayerId === playerId) return null;
      if (!validIdx(action.ownIndex, handOf(playerId))) return null;
      if (!validIdx(action.targetIndex, handOf(action.targetPlayerId))) return null;
      return actionBlindSwap(game, action.ownIndex, action.targetPlayerId, action.targetIndex);
    case "action_peek_and_swap_pick":
      if (!requireCurrent()) return null;
      if (!validIdx(action.index, handOf(action.targetPlayerId))) return null;
      return actionPeekAndSwapPick(game, action.targetPlayerId, action.index);
    case "action_peek_and_swap_decide": {
      if (!requireCurrent()) return null;
      if (typeof action.doSwap !== "boolean") return null;
      // ownIndex is optional (omitted on "don't swap"); when present it must
      // be a real slot index. In-range empty slots stay legal (engine logs
      // "couldn't swap" for those) — only malformed indices are rejected.
      if (action.ownIndex !== undefined && !validIdx(action.ownIndex, handOf(playerId))) {
        return null;
      }
      const decided = actionPeekAndSwapDecide(game, action.doSwap, action.ownIndex);
      if (!decided) return null;
      // The peek_and_swap reveal is only needed during the decide phase.
      // Clear it immediately so cards flip back face-down on all clients.
      return { ...decided, reveals: decided.reveals.filter((r) => r.reason !== "peek_and_swap") };
    }
    case "call_cabo":
      if (!requireCurrent()) return null;
      return callCabo(game);
    case "action_start_snap_other":
      // Open action — any active player may arm a rival snap (cinematic-first).
      return actionStartSnapOther(game, playerId);
    case "action_start_snap_self":
      // Open action — any active player may arm a self snap (cinematic-first).
      return actionStartSnapSelf(game, playerId);
    case "action_snap_other":
      // Snap is an open action — any active player may attempt one.
      if (action.targetPlayerId === playerId) return null;
      if (!validIdx(action.targetIndex, handOf(action.targetPlayerId))) return null;
      return actionSnapOther(game, playerId, action.targetPlayerId, action.targetIndex);
    case "action_snap_self":
      if (!validIdx(action.ownIndex, handOf(playerId))) return null;
      return actionSnapSelf(game, playerId, action.ownIndex);
    case "activate_dragon":
      if (!requireCurrent()) return null;
      return activateDragon(game);
    case "dragon_choose_rank":
      if (!requireCurrent()) return null;
      if (!ALLOWED_DRAGON_RANKS.includes(action.rank)) return null;
      return dragonChooseRank(game, action.rank);
    case "clear_animations":
      return clearAnimations(game);
    case "clear_reveals":
      return clearReveals(game);
  }
}

/**
 * Socket.IO does NOT catch listener exceptions — a single throw inside any
 * handler (e.g. a malformed payload blowing up a destructure) would crash the
 * process and kill every live game. Wrap every handler: log the failure with
 * its event name and, when the client passed an ack callback (always the last
 * argument in our protocol), answer it with a generic failure so the client
 * isn't left hanging. Never leaks error details to the client.
 */
function wrap(event: string, handler: (...args: any[]) => void): (...args: any[]) => void {
  return (...args: any[]) => {
    try {
      handler(...args);
    } catch (err) {
      console.error(`[socket] '${event}' handler crashed:`, err instanceof Error ? err.stack : err);
      const cb = args[args.length - 1];
      if (typeof cb === "function") {
        try {
          cb({ ok: false, error: "server_error" });
        } catch {
          /* ack may already have been consumed before the throw — ignore */
        }
      }
    }
  };
}

io.on("connection", (socket) => {
  let bound: { roomCode: string; playerId: string } | null = null;

  // All handlers register through this so every one is crash-wrapped — see wrap().
  const on = (event: string, handler: (...args: any[]) => void) =>
    socket.on(event, wrap(event, handler));

  // Resolve an optional Supabase access token to a userId and stamp it onto the
  // member — WITHOUT blocking the join. We run this fire-and-forget AFTER the
  // synchronous join + cb + broadcast so a guest (or a slow/failed token
  // verify) never delays or breaks the existing room flow. The userId is only
  // consumed at match-end (XP grants), long after this resolves. We re-fetch the
  // member by playerId inside the callback because the socket may have left in
  // the meantime; if so we simply drop the (now-irrelevant) result.
  function linkIdentity(roomCode: string, playerId: string, accessToken?: string) {
    if (typeof accessToken !== "string" || accessToken.trim() === "") return;
    // Stash the raw token on the member FIRST (in-memory only; never broadcast
    // or logged) so grantMpRewards can do a best-effort re-link at match-end if
    // this fire-and-forget verify hasn't resolved yet. On rejoin with a fresh
    // token we update it; we never clear an existing link on a missing token
    // (the missing-token early return above guarantees that).
    {
      const r = rooms.get(roomCode);
      const m = r?.members.find((mm) => mm.playerId === playerId);
      if (m) m.authToken = accessToken;
    }
    verifyAccessToken(accessToken)
      .then(async (userId) => {
        if (!userId) return; // invalid/expired token → stays a guest
        const r = rooms.get(roomCode);
        const m = r?.members.find((mm) => mm.playerId === playerId);
        if (!m) return;
        m.userId = userId;
        // Account holders ALWAYS display their real account username (lobby,
        // chat, scoreboard) — server-authoritative, so a logged-in client can't
        // spoof a different name. Best-effort: any lookup failure simply keeps
        // the client-supplied name (current behaviour), so it can never break
        // the join. Guests (no userId) never reach here → keep their typed name.
        try {
          const { data } = await admin()
            .from("profiles")
            .select("username")
            .eq("id", userId)
            .maybeSingle();
          const username =
            data && typeof data.username === "string" ? data.username.trim() : "";
          if (username && m.name !== username) {
            m.name = username;
            broadcastRoom(roomCode);
          }
        } catch {
          /* keep the client-supplied name on any profiles lookup error */
        }
      })
      .catch(() => {
        /* verifyAccessToken never rejects, but be defensive — never crash. */
      });
  }

  on("room:create", ({ name, accessToken }, cb) => {
    // Server-side guard: the UI requires a non-empty name, but a raw socket
    // emit could send "" — reject it so no blank-named member can be created.
    const display = typeof name === "string" ? name.trim().slice(0, 24) : "";
    if (!display) return cb({ ok: false, error: "Name required" });
    const room = rooms.create();
    const playerId = `p_${Math.random().toString(36).slice(2, 8)}`;
    rooms.join(room.code, { socketId: socket.id, playerId, name: display, connected: true });
    rooms.setHost(room.code, playerId);
    bound = { roomCode: room.code, playerId };
    socket.join(room.code);
    cb({ ok: true, code: room.code, playerId });
    broadcastRoom(room.code);
    // Non-blocking identity link (guests just get no userId).
    linkIdentity(room.code, playerId, accessToken);
  });

  on("room:join", ({ code, name, accessToken }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb({ ok: false, error: "Room not found" });
    if (room.members.length >= 4) return cb({ ok: false, error: "Room full" });
    if (room.game) return cb({ ok: false, error: "Game already started" });
    // Server-side guard (mirrors the UI check) against a raw blank-name emit.
    const display = typeof name === "string" ? name.trim().slice(0, 24) : "";
    if (!display) return cb({ ok: false, error: "Name required" });
    const playerId = `p_${Math.random().toString(36).slice(2, 8)}`;
    rooms.join(code, { socketId: socket.id, playerId, name: display, connected: true });
    bound = { roomCode: code, playerId };
    socket.join(code);
    cb({ ok: true, code, playerId });
    broadcastRoom(code);
    // Non-blocking identity link (guests just get no userId).
    linkIdentity(code, playerId, accessToken);
  });

  on("room:rejoin", ({ code, playerId, accessToken }, cb) => {
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
    // Re-link on reconnect: a player may rejoin with a (re)issued token. Only
    // sets userId on success; never clears an existing link on a missing token.
    linkIdentity(code, playerId, accessToken);
  });

  on("room:start", (_payload, cb) => {
    if (!bound) return cb({ ok: false, error: "Not in a room" });
    const room = rooms.get(bound.roomCode);
    if (!room) return cb({ ok: false, error: "Room not found" });
    if (room.members.length < 2) return cb({ ok: false, error: "Need at least 2 players" });
    if (room.game) return cb({ ok: false, error: "Already started" });
    startRoomGame(bound.roomCode);
    cb({ ok: true });
  });

  on("room:set_variant", ({ variant }: { variant: "classic" | "evolved" }, cb) => {
    if (!bound) return cb?.({ ok: false, error: "Not in a room" });
    const room = rooms.get(bound.roomCode);
    if (!room) return cb?.({ ok: false, error: "Room not found" });
    // Only the host may change the mode, and only before the game starts.
    if (room.hostId !== bound.playerId) {
      return cb?.({ ok: false, error: "Only the host can change the game mode" });
    }
    if (room.game) return cb?.({ ok: false, error: "Game already started" });
    if (variant !== "classic" && variant !== "evolved") {
      return cb?.({ ok: false, error: "Invalid mode" });
    }
    room.variant = variant;
    cb?.({ ok: true });
    broadcastRoom(bound.roomCode);
  });

  // Host-only: remove a player from the lobby BEFORE the game starts. Same
  // authority posture as room:set_variant. The removed player is evicted from
  // the roster, blocked from rejoining (kickedIds), detached from the socket
  // room, and told via a dedicated `room:kicked` event (→ the distinct client
  // KickedOverlay). In-game removal is intentionally NOT supported here (mid-
  // match player removal is the forfeit system's job).
  on("room:kick", ({ targetPlayerId }: { targetPlayerId: string }, cb) => {
    if (!bound) return cb?.({ ok: false, error: "Not in a room" });
    const room = rooms.get(bound.roomCode);
    if (!room) return cb?.({ ok: false, error: "Room not found" });
    if (room.hostId !== bound.playerId) {
      return cb?.({ ok: false, error: "Only the host can remove players" });
    }
    if (room.game) {
      return cb?.({ ok: false, error: "Can't remove players after the game has started" });
    }
    if (typeof targetPlayerId !== "string" || targetPlayerId === bound.playerId) {
      return cb?.({ ok: false, error: "Invalid player" });
    }
    const target = room.members.find((m) => m.playerId === targetPlayerId);
    if (!target) return cb?.({ ok: false, error: "Player not found" });

    // Block this id from rejoining, then evict from the roster + any votes.
    if (!room.kickedIds.includes(targetPlayerId)) room.kickedIds.push(targetPlayerId);
    const targetSocket = io.sockets.sockets.get(target.socketId);
    room.members = room.members.filter((m) => m.playerId !== targetPlayerId);
    room.readyVotes = room.readyVotes.filter((id) => id !== targetPlayerId);
    delete room.disconnects[targetPlayerId];
    // Notify the removed player (distinct kicked screen) + detach their socket.
    if (targetSocket) {
      targetSocket.emit("room:kicked", {});
      targetSocket.leave(room.code);
    }
    cb?.({ ok: true });
    broadcastRoom(bound.roomCode);
  });

  on("room:ready", (_payload, cb) => {
    if (!bound) return cb?.({ ok: false });
    const room = rooms.get(bound.roomCode);
    if (!room || room.game) return cb?.({ ok: false, error: "Already started" });
    if (room.members.length < 2) return cb?.({ ok: false, error: "Need at least 2 players" });

    if (!room.readyVotes.includes(bound.playerId)) {
      room.readyVotes.push(bound.playerId);
    }
    cb?.({ ok: true });

    // The game proceeds to the coin toss / straw draw ONLY once every connected
    // player has clicked Ready. No single player can start a countdown, so
    // nobody is rushed; players can withdraw via room:unready. If not all are
    // ready yet, just sync the updated vote tally to everyone.
    if (!maybeStartRoom(bound.roomCode)) broadcastRoom(bound.roomCode);
  });

  // Withdraw a ready vote — the room's "cancel". Lets a player call off a
  // pending start (or undo a misclick) without leaving the room. Once anyone
  // is un-ready the all-ready condition no longer holds, so the start is held.
  on("room:unready", (_payload, cb) => {
    if (!bound) return cb?.({ ok: false });
    const room = rooms.get(bound.roomCode);
    if (!room || room.game) return cb?.({ ok: false, error: "Already started" });
    const before = room.readyVotes.length;
    room.readyVotes = room.readyVotes.filter((id) => id !== bound!.playerId);
    cb?.({ ok: true });
    if (room.readyVotes.length !== before) broadcastRoom(bound.roomCode);
  });

  on("room:coin_toss_pick", ({ side }: { side: "heads" | "tails" }, cb) => {
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

  on("room:straw_pick", ({ index }: { index: number }, cb) => {
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
  on("room:straw_ready", (_payload, cb) => {
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

  on("room:play_again", (_payload, cb) => {
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

    // Sudden-death path: contestants play another round. DO NOT migrate
    // bustedThisRound to kickedIds — contestants are still "in", just
    // playing the tiebreaker. Their seat in game.players will be the
    // filtered SD-only roster.
    const isSuddenDeath = !!room.suddenDeath?.active;

    if (!isSuddenDeath) {
      // Finalise busts from the round that just ended: move to permanent kicked list.
      for (const id of room.bustedThisRound) {
        if (!room.kickedIds.includes(id)) room.kickedIds.push(id);
      }
    }
    room.bustedThisRound = [];

    // Record this player's vote (idempotent).
    if (!room.playAgainVotes.includes(bound.playerId)) {
      room.playAgainVotes.push(bound.playerId);
    }

    // Active players = members who have not forfeited AND have not been kicked.
    // During sudden death, only the SD contestants count as "active".
    const activeIds = isSuddenDeath && room.suddenDeath
      ? room.suddenDeath.contestants.filter(
          (pid) => !room.disconnects[pid]?.forfeited && !room.kickedIds.includes(pid),
        )
      : activePlayerIds(room);
    if (activeIds.length <= 1) {
      // Only one (or zero) active players remain after this round's busts —
      // declare glorious victory immediately without waiting for more votes.
      room.gloriosVictory = activeIds[0] ?? null;
      room.gloriosVictoryReason = isSuddenDeath ? "sudden_death" : "survivor";
      // Preserve SD record (inactive) so end-of-game scoreboard can still
      // split R/F columns. Pure null when no SD ever occurred.
      if (isSuddenDeath && room.suddenDeath) {
        room.suddenDeath = {
          active: false,
          contestants: room.suddenDeath.contestants,
          mainRoundsCount: room.suddenDeath.mainRoundsCount,
        };
      }
      room.playAgainVotes = [];
      // XP grant (Phase 4): this branch ended the MATCH (≤1 active player left
      // after busts). Grant end-of-match MP XP. Cause 'bust' — the match reached
      // a winner through normal play. Fire-and-forget; xpGranted guards dupes.
      if (room.gloriosVictory) {
        grantMpRewards(io, room, "bust").catch((err) => {
          console.error(`[mp:grant] play_again/bust failed: ${err?.message ?? err}`);
        });
      }
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

    // Everyone has voted — determine players for next round.
    // Sudden death: only the SD contestants seat. Normal: all non-kicked.
    //
    // SUDDEN-DEATH SEATING is delegated to the pure seatSuddenDeathNextRound()
    // (roundResolve.ts) so the full SD continuation loop is unit-testable. It
    // performs guard-2 (<=1 contestant → terminal GV) and the newGame() reseat,
    // mutating room.game/suddenDeath/gloriosVictory/bustedThisRound exactly as
    // the inline code used to. We keep the NON-SD path inline here.
    if (isSuddenDeath && room.suddenDeath) {
      const seat = seatSuddenDeathNextRound(room);
      if (seat.gameOver) {
        // Only one contestant left → glorious victory (reason already set).
        room.playAgainVotes = [];
        if (room.gloriosVictory) {
          grantMpRewards(io, room, "bust").catch((err) => {
            console.error(`[mp:grant] play_again/bust failed: ${err?.message ?? err}`);
          });
        }
        cb({ ok: true });
        broadcastRoom(bound.roomCode);
        return;
      }
      // Continuation: a fresh SD round was seated. Reset the same per-round
      // room state the inline continue path cleared (votes, timers, coin/straw,
      // disconnects). room.game / suddenDeath were updated by the seat fn.
      room.coinToss = null;
      room.strawDraw = null;
      room.playAgainVotes = [];
      room.readyVotes = [];
      room.roundReadyVotes = [];
      room.roundReadyStartedAt = null;
      room.strawReadyVotes = [];
      room.strawReadyStartedAt = null;
      room.disconnects = {};
      const rrTimerSd = roundReadyTimers.get(bound.roomCode);
      if (rrTimerSd) clearTimeout(rrTimerSd);
      roundReadyTimers.delete(bound.roomCode);
      const srTimerSd = strawReadyTimers.get(bound.roomCode);
      if (srTimerSd) clearTimeout(srTimerSd);
      strawReadyTimers.delete(bound.roomCode);
      cb({ ok: true });
      broadcastRoom(bound.roomCode);
      return;
    }

    const playersForNextRound = room.game.players.filter((p) => !room.kickedIds.includes(p.id));

    if (playersForNextRound.length <= 1) {
      // Only one player left — declare glorious victory.
      room.gloriosVictory = playersForNextRound[0]?.id ?? null;
      room.gloriosVictoryReason = "survivor";
      room.playAgainVotes = [];
      // XP grant (Phase 4): everyone voted to continue but only one player
      // remains → match over. Grant end-of-match MP XP. Cause 'bust'.
      if (room.gloriosVictory) {
        grantMpRewards(io, room, "bust").catch((err) => {
          console.error(`[mp:grant] play_again/bust failed: ${err?.message ?? err}`);
        });
      }
      cb({ ok: true });
      broadcastRoom(bound.roomCode);
      return;
    }

    // Continue with remaining players only.
    const players = playersForNextRound.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: false,
    }));
    const nextStarterIdx = (room.lastStarterIdx + 1) % players.length;
    room.game = newGame({
      players,
      variant: room.variant,
      roundNumber: room.game.roundNumber + 1,
      scores: room.game.scores,
      caboBonus: room.game.caboBonus,
      caboPenalty: room.game.caboPenalty,
      snapBonus: room.game.snapBonus,
      kamikaze: room.game.kamikaze,
    });
    room.game.currentPlayer = nextStarterIdx;
    room.lastStarterIdx = nextStarterIdx;
    room.coinToss = null;
    room.strawDraw = null; // No straw draw from round 2 onward — alternation handles order.
    room.playAgainVotes = [];
    room.readyVotes = [];
    room.roundReadyVotes = [];
    room.roundReadyStartedAt = null;
    room.strawReadyVotes = [];
    room.strawReadyStartedAt = null;
    room.bustedThisRound = [];
    // kickedIds intentionally not cleared — eliminations persist across rounds.
    // suddenDeath state preserved (contestants frozen across SD repeats).
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

  on("action", (action: ActionMsg, cb) => {
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
      // Pure resolution (bust detection, round-win credit, GV / sudden-death
      // tiebreaker) — extracted VERBATIM into resolveRoundOver so it can be
      // unit-tested with synthetic rooms. It mutates room's bust/GV/SD fields
      // ONLY; the XP grant + broadcast side effects stay here, AFTER the call.
      resolveRoundOver(room);

      // XP grant (Phase 4): if THIS round_over resolution declared a Glorious
      // Victor (any of the bust / tiebreaker / sudden-death branches above),
      // grant end-of-match MP XP now. Fire-and-forget — the grant is server-side
      // and must not delay the client response. The room.xpGranted guard makes
      // this safe even though several sibling branches could reach here across
      // calls; only the first declaration actually grants. Cause 'bust' = the
      // match reached a winner through normal play.
      if (room.gloriosVictory) {
        grantMpRewards(io, room, "bust").catch((err) => {
          console.error(`[mp:grant] action/bust failed: ${err?.message ?? err}`);
        });
      }
    }

    cb?.({ ok: true });
    broadcastRoom(bound.roomCode);
  });

  // Chat: ephemeral broadcast — no server-side persistence. Messages exist
  // only in connected clients' memory, and only while the room exists.
  on("room:chat", ({ text }: { text: string }, cb) => {
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
  on("room:leave", () => {
    handleDisconnect();
  });

  on("disconnect", () => {
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
          // skip helper handles consecutive kicked seats too — and if that skip
          // wraps to the cabo caller / exhausts all seats it ENDS the round, so
          // run the same bust + round-win bookkeeping the action handler would.
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
          // XP grant (Phase 4): the match ended because an opponent forfeited.
          // Cause 'forfeit' → the survivor earns OPPONENT_ABANDON (if a round
          // completed); the forfeiter (already flagged d.forfeited above) earns
          // ON_LEAVE (0). Fire-and-forget; xpGranted guards dupes.
          grantMpRewards(io, r, "forfeit").catch((err) => {
            console.error(`[mp:grant] forfeit failed: ${err?.message ?? err}`);
          });
        }

        broadcastRoom(localBound.roomCode);
      }, 20_000);
    }
    // Lobby-only: a player leaving may have been the last one the others were
    // waiting on to be ready. Re-check so remaining ready players aren't
    // stranded (no-op once a game exists). It broadcasts if it starts.
    if (!room.game) maybeStartRoom(bound.roomCode);
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

// Last-resort process guards. An uncaughtException leaves the process in an
// undefined state — log the stack and exit so the host (Render) restarts us
// clean, rather than limping on with possibly-corrupt room state. Unhandled
// rejections are log-only: every known async path is already .catch()ed, so
// this is a diagnostic net, not a crash.
process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaughtException:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[error] unhandledRejection:", reason instanceof Error ? reason.stack : reason);
});

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || "0.0.0.0";
server.listen(PORT, HOST, () => {
  console.log(`Cobo server listening on ${HOST}:${PORT}`);
  // Make the dev-code guard observable: if this ever logs "ENABLED" on a
  // production deploy, NODE_ENV is misconfigured and high-impact dev codes
  // (DEV-BOOST) are live — fix the env immediately.
  if (DEV_REDEEM_CODES_ACTIVE) {
    console.warn(
      `[startup] ⚠️  DEV REDEEM CODES ACTIVE (NODE_ENV=${process.env.NODE_ENV ?? "(unset)"}). ` +
        `High-impact codes like DEV-BOOST are LIVE. This MUST read "disabled" in production — ` +
        `set NODE_ENV=production on the host.`,
    );
  } else {
    console.log(
      `[startup] NODE_ENV=${process.env.NODE_ENV ?? "(unset)"} — dev redeem codes disabled.`,
    );
  }
});
