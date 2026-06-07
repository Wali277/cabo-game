/**
 * Accounts layer (Phase 1 — auth only).
 *
 * Pure constants + validators for the auth screens. Kept in a plain .ts module
 * (no JSX/components) so Fast Refresh stays happy and these can be unit-tested
 * in isolation.
 */

/** Where users are told to write if they lose access to their email. The
 *  backend owner swaps this for the real address before launch. Until it
 *  contains an "@", the UI hides the "contact support" line entirely so the
 *  literal placeholder never reaches a user (see VerifyStep / ForgotPassword). */
export const SUPPORT_EMAIL = "SUPPORT_EMAIL_PLACEHOLDER";

/** Seconds the "Resend code" link stays disabled after a send. Shared by the
 *  verify (signup / login) and forgot-password flows so the cooldown is
 *  identical everywhere. */
export const RESEND_COOLDOWN_S = 30;

/** Usernames nobody may register (impersonation / brand protection). */
export const RESERVED_USERNAMES = [
  "admin",
  "moderator",
  "mod",
  "support",
  "cabo",
  "lumo",
  "system",
];

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns an error string for an invalid username, or null when valid. */
export function validateUsername(raw: string): string | null {
  const v = raw.trim();
  if (v.length < 3 || v.length > 20) return "Username must be 3–20 characters.";
  if (!USERNAME_RE.test(v)) return "Use only letters, numbers and underscores.";
  if (RESERVED_USERNAMES.includes(v.toLowerCase())) return "That username isn't available.";
  return null;
}

/** Returns an error string for an invalid email, or null when valid. */
export function validateEmail(raw: string): string | null {
  if (!EMAIL_RE.test(raw.trim())) return "Enter a valid email address.";
  return null;
}

/** Returns an error string for an invalid password, or null when valid. */
export function validatePassword(raw: string): string | null {
  if (raw.length < 8) return "Password must be at least 8 characters.";
  return null;
}
