// =============================================================================
// auth/loginRateLimit.ts
// In-memory brute-force throttle for the /auth/login route.
//
// Keyed by `identifierLower|ip`, so an attacker can't lock out a victim from
// every IP at once, and a shared IP can't be locked out by one bad identifier.
// After CONFIG.LOGIN_MAX_ATTEMPTS_BEFORE_LOCK consecutive FAILED attempts the
// key is locked for CONFIG.LOGIN_LOCKOUT_MIN minutes; a success resets it.
//
// In-memory is acceptable and intentional here — it matches the existing
// in-memory rooms model. NOTE: this state resets on every server restart, and
// is per-process (a multi-instance deploy would not share it). Good enough for
// the current single-instance server; revisit if we scale out.
// =============================================================================

import { AUTH_CONFIG } from "./config.js";

interface Entry {
  /** Consecutive failed attempts since the last success/expiry. */
  fails: number;
  /** Epoch ms until which the key is locked; 0 = not locked. */
  lockedUntil: number;
}

const buckets = new Map<string, Entry>();

// Bound the Map so a flood of distinct identifier|ip pairs can't grow it without
// limit (memory-exhaustion guard). Two mechanisms:
//   1. A periodic prune that drops "dead" entries — no active lock AND no
//      accumulated fails (i.e. nothing worth remembering). Unref'd so it never
//      keeps the process alive on its own.
//   2. A hard cap: if we somehow exceed MAX_ENTRIES, evict the oldest-inserted
//      keys (Map preserves insertion order) until back under the cap.
const MAX_ENTRIES = 10_000;
const PRUNE_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

/** Drop entries whose lock has expired AND that have no recorded fails. */
function prune(): void {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.fails === 0 && entry.lockedUntil <= now) {
      buckets.delete(key);
    }
  }
}

const pruneTimer = setInterval(prune, PRUNE_INTERVAL_MS);
// Don't let this housekeeping timer hold the event loop open at shutdown.
if (typeof pruneTimer.unref === "function") pruneTimer.unref();

/** Hard-cap safety net: evict oldest-inserted keys until under MAX_ENTRIES. */
function enforceCap(): void {
  while (buckets.size > MAX_ENTRIES) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}

function keyFor(identifier: string, ip: string): string {
  return `${identifier.trim().toLowerCase()}|${ip}`;
}

export interface CheckResult {
  /** True if the request may proceed. */
  allowed: boolean;
  /** When locked, whole seconds remaining (for a user-facing message). */
  retryAfterSec?: number;
}

/**
 * Should this (identifier, ip) be allowed to attempt a login right now?
 * Returns { allowed:false, retryAfterSec } while a lock is active; the lock is
 * cleared lazily once it expires.
 */
export function check(identifier: string, ip: string): CheckResult {
  const key = keyFor(identifier, ip);
  const entry = buckets.get(key);
  if (!entry) return { allowed: true };

  if (entry.lockedUntil > Date.now()) {
    const retryAfterSec = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    return { allowed: false, retryAfterSec };
  }

  // Lock (if any) has expired — reset the counter so the user starts fresh.
  if (entry.lockedUntil !== 0) {
    buckets.delete(key);
  }
  return { allowed: true };
}

/**
 * Record a failed login. Increments the fail counter and, once it reaches the
 * configured threshold, arms a lockout window.
 */
export function recordFail(identifier: string, ip: string): void {
  const key = keyFor(identifier, ip);
  const entry = buckets.get(key) ?? { fails: 0, lockedUntil: 0 };
  entry.fails += 1;
  if (entry.fails >= AUTH_CONFIG.LOGIN_MAX_ATTEMPTS_BEFORE_LOCK) {
    entry.lockedUntil = Date.now() + AUTH_CONFIG.LOGIN_LOCKOUT_MIN * 60 * 1000;
    // Reset the counter so the NEXT lock requires another full run of fails.
    entry.fails = 0;
  }
  buckets.set(key, entry);
  // recordFail is the only path that can ADD a key, so bound the Map here.
  enforceCap();
}

/** Clear all throttle state for a key after a successful login. */
export function reset(identifier: string, ip: string): void {
  buckets.delete(keyFor(identifier, ip));
}
