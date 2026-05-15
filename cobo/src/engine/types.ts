export type Suit = "S" | "H" | "D" | "C";
export type Rank =
  | "A" | "2" | "3" | "4" | "5" | "6" | "7"
  | "8" | "9" | "10" | "J" | "Q" | "K" | "Joker";

export interface Card {
  id: string;
  rank: Rank;
  suit: Suit;
}

export type ActionKind =
  | "peek_own"
  | "peek_other"
  | "blind_swap"
  | "peek_and_swap";

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  hand: Card[];
  knownToSelf: boolean[];
  calledCabo: boolean;
}

export type Phase =
  | "setup_peek"
  | "turn_start"
  | "turn_drawn"
  | "pending_action"
  | "action_peek_own"
  | "action_peek_other"
  | "action_blind_swap"
  | "action_peek_and_swap_pick"
  | "action_peek_and_swap_decide"
  | "round_over";

export interface Reveal {
  playerId: string;
  index: number;
  card: Card;
  toPlayerIds: string[];
  reason: "setup" | "peek_own" | "peek_other" | "peek_and_swap" | "round_end";
}

export interface AnimationEvent {
  id: string;
  kind:
    | "deal"
    | "draw_deck"
    | "draw_discard"
    | "discard_drawn"
    | "swap_hand"
    | "reveal"
    | "blind_swap"
    | "peek_and_swap"
    | "cabo_called"
    | "round_end";
  payload: Record<string, unknown>;
}

export interface GameState {
  players: PlayerState[];
  currentPlayer: number;
  phase: Phase;
  deck: Card[];
  discard: Card[];
  drawnCard: Card | null;
  drawnFrom: "deck" | "discard" | null;
  pendingActionSource: Card | null;
  peekAndSwapPick: { playerId: string; index: number; card: Card } | null;
  caboCallerId: string | null;
  finalRoundTurnsLeft: number | null;
  reveals: Reveal[];
  animations: AnimationEvent[];
  roundNumber: number;
  scores: Record<string, number[]>;
  winnerId: string | null;
  log: string[];
}

export interface NewGameOptions {
  players: { id: string; name: string; isBot: boolean }[];
  seed?: number;
  roundNumber?: number;
  scores?: Record<string, number[]>;
}
