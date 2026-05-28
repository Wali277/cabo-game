import type { GameState } from "./engine/types.js";

export interface Member {
  socketId: string;
  playerId: string;
  name: string;
  connected: boolean;
}

export interface Room {
  code: string;
  hostId: string | null;
  members: Member[];
  game: GameState | null;
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
  // Ready-up system: first player to click arms a 10s timer; second click starts immediately.
  readyVotes: string[];
  readyStartedAt: number | null;
  // Same system for the "Start round" button inside the game (setup_peek phase).
  roundReadyVotes: string[];
  roundReadyStartedAt: number | null;
  // Straw-draw continue: all players must click Continue (or timer runs out).
  strawReadyVotes: string[];
  strawReadyStartedAt: number | null;
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

  list() {
    return Array.from(this.map.values()).map((r) => ({
      code: r.code,
      members: r.members.length,
      started: !!r.game,
    }));
  }

  create(): Room {
    let code = randomCode();
    while (this.map.has(code)) code = randomCode();
    const room: Room = {
      code,
      hostId: null,
      members: [],
      game: null,
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
      readyStartedAt: null,
      roundReadyVotes: [],
      roundReadyStartedAt: null,
      strawReadyVotes: [],
      strawReadyStartedAt: null,
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
