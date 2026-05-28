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

/** Per-round snap budget. Each player gets one snap targeting an opponent's
 *  card and one targeting their own face-down card, per round. Reset to
 *  { other: false, self: false } when a new round starts. */
export interface SnapsUsed {
  other: boolean;
  self: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  /** Indexed slots, parallel to `knownToSelf`. A `null` entry is an empty
   *  slot left behind by a successful self-snap (which removes the card
   *  but preserves slot position so a player's positional memory of their
   *  other cards is not disrupted). Empty slots are filled in by future
   *  penalty cards (wrong-snap draws) before extending the hand. */
  hand: (Card | null)[];
  knownToSelf: boolean[];
  calledCabo: boolean;
  snapsUsed: SnapsUsed;
  /** Per-round flags: did the player land a CORRECT rival-snap and/or
   *  self-snap this round? When both flags are true, they earn a -5 snap
   *  bonus that's deducted from their round score. Reset on newGame. */
  snapsCorrect: SnapsUsed;
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
  reason:
    | "setup"
    | "peek_own"
    | "peek_other"
    | "peek_and_swap"
    | "snap_reveal"
    | "round_end";
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
    | "snap_armed_self"
    | "snap_armed_other"
    | "snap_reveal"
    | "snap_correct"
    | "snap_wrong"
    | "snap_penalty_draw"
    | "snap_bonus"
    | "round_end";
  payload: Record<string, unknown>;
}

/**
 * Snap state machine: cinematic-first flow. Press → armed_* (SNAP! overlay) →
 * (revealing for rival-snap only) → resolving (outcome cinematic + card
 * motion) → idle. Carried on GameState so it syncs through the existing
 * server→client broadcast and is identical for all viewers.
 */
export type SnapPhase =
  | "idle"
  | "armed_self"
  | "armed_other"
  | "revealing"
  | "resolving";

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
  /** Per-round hand totals (sum of card values at round end). Parallel to
   *  caboBonus / caboPenalty so the scoreboard can show breakdowns. */
  scores: Record<string, number[]>;
  /** Per-round cabo bonus: amount SUBTRACTED from running total when the
   *  cabo caller wins with hand <= 7. Stored as the magnitude (positive); the
   *  scoreboard renders it as a negative adjustment. 0 for rounds without
   *  a bonus. */
  caboBonus: Record<string, number[]>;
  /** Per-round cabo penalty: flat +5 added when a player called cabo and
   *  didn't win the round. 0 for rounds without a penalty. */
  caboPenalty: Record<string, number[]>;
  /** Per-round snap bonus: flat -5 subtracted when a player lands BOTH a
   *  correct rival-snap and a correct self-snap in the same round. Stored
   *  as the magnitude (positive); the scoreboard renders it as a negative
   *  adjustment. 0 for rounds without a bonus. */
  snapBonus: Record<string, number[]>;
  winnerId: string | null;
  log: string[];
  /** Current step in the cinematic-first snap flow. 'idle' when nobody has
   *  pressed a Snap button. Synced with the rest of GameState so every
   *  viewer renders the overlay / pick-gating consistently. */
  snapPhase: SnapPhase;
  /** Player id of whoever pressed Snap and is now expected to pick. Null
   *  when snapPhase is idle. */
  snappingPlayerId: string | null;
}

export interface NewGameOptions {
  players: { id: string; name: string; isBot: boolean }[];
  seed?: number;
  roundNumber?: number;
  scores?: Record<string, number[]>;
  caboBonus?: Record<string, number[]>;
  caboPenalty?: Record<string, number[]>;
  snapBonus?: Record<string, number[]>;
}
