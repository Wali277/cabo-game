export type Suit = "S" | "H" | "D" | "C";
export type Rank =
  | "A" | "2" | "3" | "4" | "5" | "6" | "7"
  | "8" | "9" | "10" | "J" | "Q" | "K" | "Joker" | "Dragon";

/** Rule variant. "classic" = original Cabo. "evolved" = Cabo Evolved
 *  (5 cards, K = 0 / no action, 7/8 picker, 9/10 both, Kamikaze, Carré). */
export type GameVariant = "classic" | "evolved";

export interface Card {
  id: string;
  rank: Rank;
  suit: Suit;
}

export type ActionKind =
  | "peek_own"
  | "peek_other"
  | "blind_swap"
  | "peek_and_swap"
  // Cabo Evolved only:
  | "peek_choose" // 7/8 — choose peek-own OR spy-other
  | "peek_both";  // 9/10 — peek-own AND spy-other (two steps)

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
  | "action_peek_choose"
  | "dragon_choose"
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
    | "dragon_activate"
    | "dragon_transform"
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
  /** Active rule variant for this game (classic vs Cabo Evolved). */
  variant: GameVariant;
  players: PlayerState[];
  currentPlayer: number;
  phase: Phase;
  deck: Card[];
  discard: Card[];
  drawnCard: Card | null;
  drawnFrom: "deck" | "discard" | null;
  pendingActionSource: Card | null;
  peekAndSwapPick: { playerId: string; index: number; card: Card } | null;
  /** Cabo Evolved 9/10 "peek both" sequencing: set to "peek_other" after the
   *  own-peek resolves so the engine routes into the spy step instead of
   *  ending the turn. Null in classic and at all other times. */
  pendingPeek: "peek_other" | null;
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
  /** Per-round Cabo Evolved Kamikaze levy: +20 charged to every player who did
   *  NOT finish on 0 when someone scored a Kamikaze. This amount is ALSO folded
   *  into `scores` (so every total stays correct); it is mirrored here only so
   *  the scoreboard can surface the +20 in the Penalty column. 0 otherwise. */
  kamikaze: Record<string, number[]>;
  winnerId: string | null;
  log: string[];
  /** Current step in the cinematic-first snap flow. 'idle' when nobody has
   *  pressed a Snap button. Synced with the rest of GameState so every
   *  viewer renders the overlay / pick-gating consistently. */
  snapPhase: SnapPhase;
  /** Player id of whoever pressed Snap and is now expected to pick. Null
   *  when snapPhase is idle. */
  snappingPlayerId: string | null;
  /** Cabo Evolved end-of-round special outcomes, set in endRound to drive the
   *  dedicated Kamikaze / Carré cinematics. Null in classic and mid-round. */
  roundOutcome:
    | { kamikaze: string[]; carre: { playerId: string; rank: Rank }[] }
    | null;
}

export interface NewGameOptions {
  players: { id: string; name: string; isBot: boolean }[];
  /** Rule variant; defaults to "classic" when omitted. */
  variant?: GameVariant;
  seed?: number;
  roundNumber?: number;
  scores?: Record<string, number[]>;
  caboBonus?: Record<string, number[]>;
  caboPenalty?: Record<string, number[]>;
  snapBonus?: Record<string, number[]>;
  kamikaze?: Record<string, number[]>;
}
