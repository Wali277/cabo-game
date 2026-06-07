// =============================================================================
// auth/redeemCodes.ts — SERVER-AUTHORITATIVE redeem-code catalog.
// -----------------------------------------------------------------------------
// The single source of truth for which codes are valid and what they grant. The
// /account/redeem route looks a submitted code up here and passes the
// AUTHORITATIVE reward to the redeem_code RPC — the client never sends an
// amount. Codes are matched case-insensitively and whitespace-insensitively
// (so "lumo-test", "LUMO-TEST", and " lumo test " all resolve to the same code).
//
// Redemption is ONCE PER ACCOUNT, enforced atomically by the DB
// (code_redemptions UNIQUE(user_id, code) + public.redeem_code). The `canonical`
// string below is what gets stored in code_redemptions, so two input spellings
// of the same code can never both be redeemed.
//
// Adding a code later: add an entry keyed by its CANONICAL (normalized) form.
// The reward shape is intentionally extensible (tokens today; XP / cosmetics /
// dev flags can be added when those reward kinds are wired through redeem_code).
// =============================================================================

export interface RedeemReward {
  /** Canonical (normalized) code — stored in code_redemptions; see normalizeCode. */
  canonical: string;
  /** Flat tokens granted. REQUIRED (use 0 explicitly for an XP-only reward) so a
   *  new catalog entry can't silently credit nothing by forgetting the field.
   *  Server-authoritative — never from the client. */
  tokens: number;
  /** Optional XP granted via grant_xp (recomputes level, unlocks level-reward
   *  skins like 'custom' @ level 2, and awards any milestone tokens). Omit / 0
   *  for no XP. Once-per-account like the whole redemption. */
  xp?: number;
  /** Human-readable note (for logs / future admin UI; never sent to the client). */
  description: string;
}

/**
 * Normalize raw user input to a canonical code: trim, upper-case, and collapse
 * ALL internal/leading/trailing whitespace away. Keys in CODES MUST already be
 * in this canonical form.
 */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, "");
}

// Publicly-available codes — loaded in ALL environments.
const PUBLIC_CODES: Record<string, RedeemReward> = {
  // TEST code — grants 1 token. Type "LUMO-TEST" (case-insensitive) in Settings →
  // Redeem a code. Once per account. (Low impact; safe to ship if desired.)
  "LUMO-TEST": {
    canonical: "LUMO-TEST",
    tokens: 1,
    description: "Test code — grants 1 token (once per account).",
  },
};

// DEVELOPER / TESTING codes — high-impact (grant XP/levels). These are loaded
// ONLY in non-production so a forgotten entry can NEVER reach real players (see
// the production guard below). Still: delete them before launch as the primary
// control — the guard is the safety net.
const DEV_CODES: Record<string, RedeemReward> = {
  // Grants 1500 XP (jumps a fresh account to LEVEL 2, which unlocks the 'custom'
  // Recolor skin) plus 10 tokens to exercise the store. ⚠️ REMOVE BEFORE LAUNCH.
  "DEV-BOOST": {
    canonical: "DEV-BOOST",
    tokens: 10,
    xp: 1500,
    description: "DEV: +1500 XP (→ level 2, unlocks Custom) + 10 tokens. Remove before launch.",
  },
};

// PRODUCTION GUARD: dev/testing codes are excluded when NODE_ENV === 'production'
// (e.g. on Render), so an un-deleted high-impact code can't disrupt the live
// economy. They load in local/dev (where NODE_ENV is unset) so you can test.
const IS_PRODUCTION = process.env.NODE_ENV === "production";
/** True when the high-impact DEV codes (e.g. DEV-BOOST) are loaded — i.e. NOT
 *  production. Exported so the server can LOG this at startup, making a silent
 *  NODE_ENV misconfiguration (dev codes live in prod) impossible to miss. */
export const DEV_REDEEM_CODES_ACTIVE = !IS_PRODUCTION;
const CODES: Readonly<Record<string, RedeemReward>> = IS_PRODUCTION
  ? PUBLIC_CODES
  : { ...PUBLIC_CODES, ...DEV_CODES };

/** Look up a (possibly messy) user-submitted code. Returns null if unknown. */
export function findRedeemCode(raw: string): RedeemReward | null {
  const key = normalizeCode(raw);
  if (!key) return null;
  return CODES[key] ?? null;
}
