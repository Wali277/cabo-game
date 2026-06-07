// =============================================================================
// auth/codes.ts
// Issue and verify the short-lived 6-digit email codes (signup verification +
// password reset). The two race-prone steps (count-then-insert on issue, and
// read-compare-update on verify) are performed ATOMICALLY in the database via
// the public.issue_code / public.verify_code SECURITY DEFINER RPCs (migration
// 0003_code_rpcs.sql). This module only generates/hashes codes and marshals the
// RPC calls; all persistence + concurrency control lives in Postgres.
//
// SECURITY:
//   * Codes are generated with a cryptographically-secure RNG (node:crypto).
//   * Only the HMAC-SHA256 hash (keyed by AUTH_CODE_SECRET) is ever stored.
//   * The plaintext code is returned by issueCode() solely so the caller can
//     email it — it is NEVER logged here and never persisted.
//   * Hash comparison happens inside verify_code. Comparing two HMAC-SHA256 hex
//     digests with `=` is safe: an attacker can't forge the HMAC without the
//     server secret, so equality-timing leaks nothing about the code.
//   * Rate limiting (max requests / 15 min) and per-code attempt lockout are
//     enforced atomically in the RPCs from the values in AUTH_CONFIG.
// =============================================================================

import { createHmac, randomInt } from "node:crypto";
import { AUTH_CONFIG, requireEnv } from "./config.js";
import { admin } from "./supabaseClients.js";

export type CodePurpose = "signup" | "reset" | "change_email";

/**
 * Thrown by issueCode() when the per-user 15-minute request limit is exceeded.
 * The router catches this to return a user-facing throttle message without
 * leaking account existence. (Declared first so it's in scope for issueCode.)
 */
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Generate a cryptographically-random decimal code of CONFIG.CODE_LENGTH
 * digits, zero-padded (so leading zeros are preserved, e.g. "004217").
 * randomInt is uniform and CSPRNG-backed — no modulo bias.
 */
export function generateCode(): string {
  const max = 10 ** AUTH_CONFIG.CODE_LENGTH; // exclusive upper bound
  const n = randomInt(0, max);
  return String(n).padStart(AUTH_CONFIG.CODE_LENGTH, "0");
}

/**
 * HMAC-SHA256 of the code keyed by the server-only AUTH_CODE_SECRET, hex-encoded.
 * Same input → same digest, so we can look up by hashing the submitted code and
 * comparing. The secret never leaves the server and is never logged.
 */
export function hashCode(code: string): string {
  const secret = requireEnv("AUTH_CODE_SECRET");
  return createHmac("sha256", secret).update(code).digest("hex");
}

/**
 * Issue a new code for (userId, email, purpose).
 *
 * The rate-limit count + insert are performed ATOMICALLY by the
 * public.issue_code RPC under a per-(user,purpose) advisory lock, so concurrent
 * requests cannot over-issue past CONFIG.CODE_MAX_REQUESTS_PER_15MIN. The RPC
 * returns false when the 15-minute window is already full → we throw a
 * RateLimitError (the router maps it to a generic message). On success the RPC
 * has persisted the HASHED row and we RETURN THE PLAINTEXT CODE for the emailer.
 * The plaintext is never persisted or logged.
 */
export async function issueCode(
  userId: string,
  email: string,
  purpose: CodePurpose,
): Promise<string> {
  const db = admin();

  // Generate + hash the code, and compute the rolling-window bounds. Only the
  // hash is sent to the DB; the plaintext never leaves this function except as
  // the return value (for the emailer).
  const code = generateCode();
  const codeHash = hashCode(code);
  const now = Date.now();
  const expiresAt = new Date(
    now + AUTH_CONFIG.CODE_EXPIRY_MIN * 60 * 1000,
  ).toISOString();
  const windowStart = new Date(now - 15 * 60 * 1000).toISOString();

  // Atomic count-then-insert inside the DB (advisory-locked per user+purpose).
  const { data: issued, error } = await db.rpc("issue_code", {
    p_user: userId,
    p_email: email,
    p_purpose: purpose,
    p_code_hash: codeHash,
    p_expires_at: expiresAt,
    p_max: AUTH_CONFIG.CODE_MAX_REQUESTS_PER_15MIN,
    p_window_start: windowStart,
  });

  if (error) {
    throw new Error(`issueCode: issue_code RPC failed: ${error.message}`);
  }
  if (issued !== true) {
    // Window already full — over the per-user limit for this purpose.
    throw new RateLimitError(
      "Too many code requests. Please wait a few minutes and try again.",
    );
  }

  // Hand the PLAINTEXT back to the caller to email. Do NOT log it.
  return code;
}

export interface VerifyResult {
  ok: boolean;
  /** Present on success — the owning user's id (handy for the caller). */
  userId?: string;
  /** Present on failure — remaining attempts before the code locks (>= 0). */
  attemptsLeft?: number;
  /** Machine-readable failure reason for the router to map to a message. */
  reason?: "no_code" | "expired" | "locked" | "mismatch";
}

/**
 * Verify a submitted code for (email, purpose).
 *
 * Delegates to the public.verify_code RPC, which selects the NEWEST unconsumed,
 * non-expired row FOR UPDATE and does the compare/consume/increment atomically —
 * so parallel wrong guesses serialize on the row and can't bypass the attempt
 * cap. We just hash the submitted code, call the RPC, and map its status:
 *   * 'no_code' → { ok:false, reason:'no_code', attemptsLeft:0 } (also expired/used).
 *   * 'locked'  → { ok:false, reason:'locked', attemptsLeft:0 }.
 *   * 'mismatch'→ { ok:false, reason:'mismatch', attemptsLeft } (attempts bumped).
 *   * 'ok'      → { ok:true, userId } (code consumed by the RPC).
 *
 * Email is matched case-insensitively because the column / param is citext; we
 * still pass a normalized email from the router.
 */
export async function verifyCode(
  email: string,
  purpose: CodePurpose,
  code: string,
): Promise<VerifyResult> {
  const db = admin();

  const { data, error } = await db.rpc("verify_code", {
    p_email: email,
    p_purpose: purpose,
    p_code_hash: hashCode(code),
    p_max_attempts: AUTH_CONFIG.CODE_MAX_VERIFY_ATTEMPTS,
  });

  if (error) {
    throw new Error(`verifyCode: verify_code RPC failed: ${error.message}`);
  }

  // The RPC RETURNS TABLE(...), so PostgREST yields an array; take the one row.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    // Defensive: a set-returning RPC should always yield exactly one row.
    return { ok: false, reason: "no_code", attemptsLeft: 0 };
  }

  const status = row.status as VerifyResult["reason"] | "ok";
  if (status === "ok") {
    return { ok: true, userId: row.user_id ?? undefined };
  }
  const attemptsLeft = Math.max(0, Number(row.attempts_left ?? 0));
  return { ok: false, reason: status, attemptsLeft };
}
