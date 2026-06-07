// =============================================================================
// auth/reward.ts
// The single definition of the server→client XP "reward" payload + the mapper
// from a grant_xp() result row to that payload. Shared by BOTH grant paths:
//   * the SP HTTP route  (POST /account/grant-game)  → reward in the response
//   * the MP socket grant (xp:reward event)          → reward per granted member
// Defining the shape in one place guarantees SP and MP stay byte-identical to
// the client's expectations.
//
// SHARED CONTRACT (must match the client EXACTLY):
//   { source: 'sp'|'mp', gained: number,
//     total_xp, level, tokens, xp_into_level, xp_for_next,
//     leveled_up, tokens_earned, old_level, new_level }
//   = the grant_xp_result fields + `source` + `gained` (the amount granted).
//
// SECURITY: this payload carries ONLY the recipient's own XP/level/token
// numbers. It contains NO private game state (no hands, no opponents' cards).
// It is sent only to the member it belongs to — never broadcast room-wide.
// =============================================================================

/** The grant_xp() RPC return row (composite type public.grant_xp_result). */
export interface GrantXpRow {
  total_xp: number;
  level: number;
  tokens: number;
  xp_into_level: number;
  xp_for_next: number;
  leveled_up: boolean;
  tokens_earned: number;
  old_level: number;
  new_level: number;
}

/** The reward payload sent to the client (SP response body / MP socket event). */
export interface RewardPayload extends GrantXpRow {
  source: "sp" | "mp";
  /** The XP amount granted by THIS call (server-owned; from XP_CONFIG). */
  gained: number;
}

/**
 * Map a grant_xp() result row → the client reward payload.
 *
 * `row` is whatever Supabase returned for the single composite row; we read its
 * fields defensively (numbers default to 0, booleans to false) so a partial /
 * unexpected shape can never throw here or leak `undefined` into the contract.
 * `gained` is the SERVER's amount (never the client's), `source` the mode.
 */
export function buildReward(
  row: Partial<GrantXpRow> | null | undefined,
  source: "sp" | "mp",
  gained: number,
): RewardPayload {
  const r = row ?? {};
  const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
  return {
    source,
    gained,
    total_xp: num(r.total_xp),
    level: num(r.level),
    tokens: num(r.tokens),
    xp_into_level: num(r.xp_into_level),
    xp_for_next: num(r.xp_for_next),
    leveled_up: r.leveled_up === true,
    tokens_earned: num(r.tokens_earned),
    old_level: num(r.old_level),
    new_level: num(r.new_level),
  };
}
