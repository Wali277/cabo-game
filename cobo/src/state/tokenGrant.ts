/**
 * Accounts layer — token-purchase celebration (frontend-only).
 *
 * Tokens are credited SERVER-SIDE (the Ko-fi webhook adds them straight to
 * `profiles.tokens`). There is no "pending/unclaimed" concept on the server, so
 * the client celebrates a purchase purely by noticing the balance went UP since
 * the last value it persisted on THIS device.
 *
 * This module is just the tiny localStorage baseline ("last seen tokens", keyed
 * per account id). The comparison + firing lives in the store's
 * `checkTokenGrant()`; the trigger wiring (focus / poll) lives in
 * `useTokenGrantWatch`.
 *
 * Caveats accepted by this frontend-only design:
 *   - it celebrates ANY balance increase (a redeem code counts too, not strictly
 *     a Ko-fi purchase), and
 *   - the baseline is per-device (a purchase seen on one device won't re-pop on
 *     another that already advanced its baseline).
 */

const PREFIX = "lumo.lastSeenTokens.";

const keyFor = (accountId: string): string => `${PREFIX}${accountId}`;

/**
 * The last token balance we recorded for this account on this device, or `null`
 * if we've never recorded one (first run → establish a baseline, don't celebrate
 * the pre-existing balance). Malformed/blocked storage degrades to `null`.
 */
export function readLastSeenTokens(accountId: string): number | null {
  try {
    const raw = localStorage.getItem(keyFor(accountId));
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Persist the current balance as the new baseline. No-op in private mode. */
export function writeLastSeenTokens(accountId: string, tokens: number): void {
  try {
    localStorage.setItem(keyFor(accountId), String(Math.max(0, Math.floor(tokens))));
  } catch {
    /* private/blocked storage — baseline is in-memory only for this session */
  }
}
