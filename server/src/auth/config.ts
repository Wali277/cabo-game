// =============================================================================
// auth/config.ts
// Single source of truth for every tunable in the accounts AUTH layer (Phase 1).
// Everything that has a knob lives here so behaviour can be adjusted in one
// place. No secrets live here — secrets are read from the environment via
// requireEnv() at the point of use.
// =============================================================================

export const AUTH_CONFIG = {
  // --- 6-digit email codes (signup verification + password reset) -----------
  /** Number of decimal digits in an emailed code. */
  CODE_LENGTH: 6,
  /** Minutes a freshly-issued code stays valid. */
  CODE_EXPIRY_MIN: 15,
  /** Max codes a user may request, per purpose, in a rolling 15-minute window. */
  CODE_MAX_REQUESTS_PER_15MIN: 3,
  /**
   * Max failed verify attempts against a single code. Once reached the code is
   * locked and the user must request a new one (we never silently extend it).
   */
  CODE_MAX_VERIFY_ATTEMPTS: 5,

  // --- Login throttling ------------------------------------------------------
  /** Failed login attempts (per identifier+ip) before a temporary lockout. */
  LOGIN_MAX_ATTEMPTS_BEFORE_LOCK: 5,
  /** How long that lockout lasts, in minutes. */
  LOGIN_LOCKOUT_MIN: 15,

  // --- Username rules (mirror the DB CHECK in 0001_accounts.sql) ------------
  USERNAME_MIN: 3,
  USERNAME_MAX: 20,
  /** Letters, digits, underscore only. Same class as the profiles CHECK. */
  USERNAME_ALLOWED: /^[a-zA-Z0-9_]+$/,
  /**
   * Handles nobody may register. Matched case-insensitively. Includes "lumo"
   * (the product name) per spec, alongside the standard staff/system reserves.
   */
  USERNAME_RESERVED: [
    "admin",
    "moderator",
    "mod",
    "support",
    "cabo",
    "system",
    "lumo",
  ],

  // --- Password rules --------------------------------------------------------
  PASSWORD_MIN: 8,
} as const;

// =============================================================================
// XP_CONFIG — §7 XP amounts (Phase 4 grant pipeline)
// -----------------------------------------------------------------------------
// The SERVER owns every one of these amounts. The client NEVER sends an XP
// amount or a game outcome — it only asserts "I finished a bot game" (SP) or
// plays the match out (MP, where the server alone decides the winner). The
// server resolves the real user from a verified JWT and grants the amount from
// THIS table, so a tampered client can never inflate its own rewards.
//
//   BOT_GAME         — finishing any single-player game vs bots.
//   FRIEND_WIN       — winning an online (friends) match (the Glorious Victor).
//   FRIEND_LOSS      — finishing an online match without winning it.
//   OPPONENT_ABANDON — your match ended because an opponent forfeited/left,
//                      and at least one full round had completed.
//   ON_LEAVE         — YOU left/forfeited the match → no reward (explicit 0).
// =============================================================================
export const XP_CONFIG = {
  BOT_GAME: 100,
  FRIEND_WIN: 600,
  FRIEND_LOSS: 300,
  OPPONENT_ABANDON: 300,
  ON_LEAVE: 0,
} as const;

/**
 * Read a required environment variable, throwing a clear error if it is missing
 * or blank. Call this lazily (at the point a secret is actually needed) so the
 * server process can still boot for non-auth use even when auth env vars are
 * unset — only the auth routes will then fail, and they fail loudly.
 *
 * The error message names the variable but NEVER its value (values are secrets).
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === null || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in the server environment (see server/.env.example).`,
    );
  }
  return value;
}
