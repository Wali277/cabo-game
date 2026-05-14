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
