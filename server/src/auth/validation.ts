// =============================================================================
// auth/validation.ts
// Server-side input validation for the auth layer. ALL validation is enforced
// here (never trust the client). Each validator returns { ok, error } so the
// router can surface a precise, user-facing message and field name.
// =============================================================================

import { AUTH_CONFIG } from "./config.js";

export interface ValidationResult {
  ok: boolean;
  /** Human-readable reason, present only when ok === false. */
  error?: string;
}

const OK: ValidationResult = { ok: true };

/**
 * Username rules (mirror the profiles_username_format DB CHECK as defense in
 * depth): length CONFIG.USERNAME_MIN..USERNAME_MAX, letters/digits/underscore
 * only, and not on the reserved list (case-insensitive). Expects an already
 * trimmed string but is defensive about whitespace anyway.
 */
export function validateUsername(name: string): ValidationResult {
  const value = (name ?? "").trim();
  if (value.length === 0) {
    return { ok: false, error: "Please choose a username" };
  }
  if (value.length < AUTH_CONFIG.USERNAME_MIN) {
    return {
      ok: false,
      error: `Username must be at least ${AUTH_CONFIG.USERNAME_MIN} characters`,
    };
  }
  if (value.length > AUTH_CONFIG.USERNAME_MAX) {
    return {
      ok: false,
      error: `Username must be at most ${AUTH_CONFIG.USERNAME_MAX} characters`,
    };
  }
  if (!AUTH_CONFIG.USERNAME_ALLOWED.test(value)) {
    return {
      ok: false,
      error: "Username can only contain letters, numbers and underscores",
    };
  }
  // Reserved-list check is case-insensitive (usernames are citext / collide on
  // case in the DB, so the reserved set must too).
  const lower = value.toLowerCase();
  if (AUTH_CONFIG.USERNAME_RESERVED.some((r) => r.toLowerCase() === lower)) {
    return { ok: false, error: "That username isn't available" };
  }
  return OK;
}

/**
 * Email format check. Deliberately lenient (single-@, non-empty local/domain,
 * a dot in the domain, no spaces) — Supabase is the ultimate authority on
 * deliverable addresses, and overly strict regexes reject valid emails. We only
 * reject obvious garbage here.
 */
export function validateEmail(email: string): ValidationResult {
  const value = (email ?? "").trim();
  if (value.length === 0) {
    return { ok: false, error: "Please enter your email" };
  }
  // local@domain.tld — no whitespace, exactly one @, a dot in the domain part.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_RE.test(value)) {
    return { ok: false, error: "Please enter a valid email address" };
  }
  return OK;
}

/**
 * Password rule: at least CONFIG.PASSWORD_MIN characters and at most 128 (an
 * upper bound that bounds bcrypt work / request size without rejecting any
 * reasonable passphrase; no composition rules per spec). We do NOT trim
 * passwords: leading/trailing characters are legitimate password content.
 */
export function validatePassword(password: string): ValidationResult {
  const value = password ?? "";
  if (value.length < AUTH_CONFIG.PASSWORD_MIN) {
    return {
      ok: false,
      error: `Password must be at least ${AUTH_CONFIG.PASSWORD_MIN} characters`,
    };
  }
  if (value.length > 128) {
    return { ok: false, error: "Password is too long" };
  }
  return OK;
}
