import type { GameState, GameVariant } from "./engine/types.js";

export interface Member {
  socketId: string;
  playerId: string;
  name: string;
  connected: boolean;
  /** Supabase user id, set when the member joined with a VALID access token
   *  (resolved server-side via verifyAccessToken). Undefined for guests — a
   *  guest plays normally but earns no XP (only linked members get grants). */
  userId?: string;
  /** Raw Supabase access token (JWT), kept IN-MEMORY only so the XP grant can
   *  do a best-effort end-of-match RE-LINK if the original fire-and-forget
   *  verify hasn't resolved by the time the match ends. It is NEVER broadcast
   *  (not in publicView), NEVER logged, and is fine to keep in memory: it's the
   *  same secret the socket that delivered it is already handling. Guests never
   *  set it. */
  authToken?: string;
}

export interface Room {
  code: string;
  hostId: string | null;
  members: Member[];
  game: GameState | null;
  /** Rule variant for this room, chosen by the host in the lobby. Joiners see
   *  it read-only. Locked once the game starts. Passed into every newGame(). */
  variant: GameVariant;
  createdAt: number;
  lastStarterIdx: number;
  coinToss: {
    choices: { heads: string | null; tails: string | null };
    startedAt: number | null; // null until first pick (that's when the 5s window opens)
    result: "heads" | "tails" | null;
  } | null;
  // Used for 3+ player games instead of coinToss. Each player picks one straw;
  // the shortest = goes last, the longest = goes first.
  strawDraw: {
    straws: { length: number; ownerId: string | null; revealed: boolean }[];
    startedAt: number | null; // null until first pick
    result: string[] | null; // player ids in turn order (first → last)
  } | null;
  playAgainVotes: string[];
  disconnects: Record<string, { startedAt: number; forfeited: boolean }>;
  bustedThisRound: string[];
  kickedIds: string[];
  gloriosVictory: string | null;
  /** Why this player won — drives the tiebreaker message on the client. */
  gloriosVictoryReason: "survivor" | "more_wins" | "final_round" | "sudden_death" | null;
  /** Number of rounds each player has won (lowest hand at round end). Used for
   *  the simultaneous-bust tiebreaker: most wins → Glorious Victor. */
  roundWins: Record<string, number>;
  /** Sudden-death tiebreaker state, broadcast to clients via publicView.
   *  - null when no sudden death has been triggered this game.
   *  - { active: true, contestants, mainRoundsCount } during SD.
   *  - contestants stays frozen across repeat SD rounds.
   *  - mainRoundsCount = scores[id].length captured at SD trigger time. */
  suddenDeath: { active: boolean; contestants: string[]; mainRoundsCount: number } | null;
  // Lobby ready-up: EVERY active player must click Ready before the game starts
  // (no timer — players can withdraw via room:unready, so nobody feels rushed).
  readyVotes: string[];
  // Same "first click arms a 10s timer" system for the in-game "Start round" button (setup_peek).
  roundReadyVotes: string[];
  roundReadyStartedAt: number | null;
  // Straw-draw continue: all players must click Continue (or timer runs out).
  strawReadyVotes: string[];
  strawReadyStartedAt: number | null;
  // --- XP grant idempotency (Phase 4) ---------------------------------------
  /** Monotonic per-room match counter. Bumped in startRoomGame to mint a fresh
   *  matchId. We use a counter (NOT Date.now/Math.random) so the id is stable
   *  and deterministic for a given room+match — handy for the ledger game_key. */
  matchSeq: number;
  /** Stable id for the CURRENT match, e.g. "ABCD-m1". The MP grant game_key is
   *  `mp:${matchId}`, so the xp_grants UNIQUE(user_id, game_key) makes a grant
   *  idempotent across this match (a replay/double-fire can't double-pay). */
  matchId: string;
  /** True once grantMpRewards has run for the current match. Guards against the
   *  many code paths that can declare a winner from firing the grant twice.
   *  RESET to false in startRoomGame so each new match can grant again. */
  xpGranted: boolean;
}

function randomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // omit confusing chars
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export class Rooms {
  private map: Map<string, Room> = new Map();

  size() {
    return this.map.size;
  }

  create(): Room {
    let code = randomCode();
    while (this.map.has(code)) code = randomCode();
    const room: Room = {
      code,
      hostId: null,
      members: [],
      game: null,
      variant: "classic",
      createdAt: Date.now(),
      lastStarterIdx: 0,
      coinToss: null,
      strawDraw: null,
      playAgainVotes: [],
      disconnects: {},
      bustedThisRound: [],
      kickedIds: [],
      gloriosVictory: null,
      gloriosVictoryReason: null,
      roundWins: {},
      suddenDeath: null,
      readyVotes: [],
      roundReadyVotes: [],
      roundReadyStartedAt: null,
      strawReadyVotes: [],
      strawReadyStartedAt: null,
      matchSeq: 0,
      matchId: "",
      xpGranted: false,
    };
    this.map.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.map.get(code.toUpperCase());
  }

  join(code: string, member: Member): Room | undefined {
    const room = this.get(code);
    if (!room) return;
    room.members.push(member);
    return room;
  }

  setHost(code: string, playerId: string) {
    const room = this.get(code);
    if (room) room.hostId = playerId;
  }

  remove(code: string) {
    this.map.delete(code.toUpperCase());
  }
}
