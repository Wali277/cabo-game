/**
 * ────────────────────────────────────────────────────────────────────────────
 * ACCOUNTS LAYER (Phase 1 — AUTH ONLY)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Client-side auth module for the Lumo accounts system. This is intentionally
 * isolated from the game/engine/mp logic — it only owns:
 *   - the Supabase browser client (session persistence + auto-refresh)
 *   - thin REST helpers that POST to the SAME Node server that serves sockets
 *   - profile fetch via Supabase RLS (returns only the caller's own row)
 *   - app-load bootstrap (`initAuth`) that hydrates the store's `account`
 *
 * Phase 1 = login / signup (with 6-digit email verification) / forgot-password
 * reset ONLY. Profile menu, XP bars, tokens and cosmetics come in later phases.
 *
 * The auth REST API base is the SAME origin as the multiplayer server (one Node
 * process serves both). We reuse `serverUrl()` from `mp.ts` so this resolves
 * correctly behind tunnels / cloud / the Electron file:// build — never
 * hardcode localhost here.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverUrl } from "./mp";
import { useStore } from "./store";
import type { RewardPayload } from "./store";
import { writeLastSeenTokens } from "./tokenGrant";

// ── Supabase browser client (LAZY + GUARDED) ────────────────────────────────
// CRITICAL: supabase-js's createClient() THROWS ("supabaseUrl is required") when
// the URL/key are empty. This module is imported eagerly by App.tsx (initAuth),
// so creating the client at module scope would crash the ENTIRE app — including
// guest play — whenever the Supabase env isn't set (local dev with no .env, or
// any build that didn't bake VITE_SUPABASE_*). Accounts are OPTIONAL (guests
// play immediately), so we create the client lazily on first use and treat a
// missing env as "accounts unavailable" rather than a hard crash.
//
// The anon key is PUBLIC by design (RLS guards the data) — never a service-role
// key here. Default options persist the session in localStorage + auto-refresh.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when the Supabase env is present, so accounts/auth can function. The
 *  UI uses this to hide auth entry points on guest-only (unconfigured) builds. */
export function isAuthConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

let _client: SupabaseClient | null = null;
/** The Supabase browser client, or `null` when auth isn't configured. Created on
 *  first use (NEVER at import) so a missing env can't crash app load. */
export function getSupabase(): SupabaseClient | null {
  if (!isAuthConfigured()) return null;
  if (!_client) _client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  return _client;
}

// ── Profile shape ───────────────────────────────────────────────────────────
// Mirrors the `profiles` table columns. Phase 1 only reads `id`/`username` for
// UI, but we type the full row now so later phases (XP, tokens, cosmetics) can
// consume the same `account.profile` without a breaking change.
export interface Profile {
  id: string;
  username: string;
  total_xp: number;
  level: number;
  tokens: number;
  unlocked_skins: string[];
  unlocked_wallpapers: string[];
  active_skin: string | null;
  active_wallpaper: string | null;
  /** Player-chosen custom card face colours (JSON map). Shape owned by later
   *  phases; kept loose here so a schema tweak doesn't break the client. */
  custom_card_colors: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

// ── REST contract types ─────────────────────────────────────────────────────
export interface SignupResult {
  ok: boolean;
  userId?: string;
  /** Which field the error applies to ("username" | "email" | "password"). */
  field?: string;
  error?: string;
}
export interface VerifyEmailResult {
  ok: boolean;
  error?: string;
  attemptsLeft?: number;
}
export interface LoginResult {
  ok: boolean;
  session?: { access_token: string; refresh_token: string };
  profile?: Profile;
  /** Set when the account exists but its email hasn't been verified yet. */
  needsVerification?: boolean;
  email?: string;
  /** Returned alongside `needsVerification` so the client can run the shared
   *  verify step against the user's id (the verify endpoint also accepts the
   *  email). */
  userId?: string;
  error?: string;
}
export interface ResetPasswordResult {
  ok: boolean;
  error?: string;
}

/** Purpose tag for the resend-code endpoint. */
export type CodePurpose = "signup" | "reset";

// ── Low-level POST helper ───────────────────────────────────────────────────
// Posts JSON to `${serverUrl()}/auth/<path>` and parses the JSON body. Network
// failures resolve to a generic `{ ok: false }` so callers can surface a
// friendly message instead of an unhandled rejection.
async function postAuth<T extends { ok: boolean; error?: string }>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const base = serverUrl();
  try {
    const res = await fetch(`${base}/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // Parse the body even on non-2xx — the server returns structured errors
    // (e.g. { ok:false, field, error }) with 4xx codes.
    const data = (await res.json().catch(() => ({}))) as Partial<T>;
    if (typeof data.ok === "boolean") return data as T;
    return { ok: res.ok, error: data.error } as T;
  } catch {
    return {
      ok: false,
      error: "Couldn't reach the server. Check your connection and try again.",
    } as T;
  }
}

// ── Auth API ────────────────────────────────────────────────────────────────

export function signup(input: {
  username: string;
  email: string;
  password: string;
}): Promise<SignupResult> {
  return postAuth<SignupResult>("signup", input);
}

/**
 * Verify an email with a 6-digit code. The server's `/auth/verify-email`
 * accepts EITHER `{ userId, code }` (signup, where we have the new user's id)
 * OR `{ email, code }` (login-needs-verification, where we only have the
 * email). We forward whichever identifier(s) the caller supplies plus the code
 * — stripping any `undefined` so the server only sees real values.
 */
export function verifyEmail(input: {
  userId?: string;
  email?: string;
  code: string;
}): Promise<VerifyEmailResult> {
  const body: Record<string, unknown> = { code: input.code };
  if (input.userId) body.userId = input.userId;
  if (input.email) body.email = input.email;
  return postAuth<VerifyEmailResult>("verify-email", body);
}

export function resendCode(input: {
  email: string;
  purpose: CodePurpose;
}): Promise<{ ok: boolean }> {
  return postAuth<{ ok: boolean }>("resend-code", input);
}

/**
 * Log in with an email OR username plus password. On success the server
 * returns a Supabase session — we hand it to supabase-js (so it persists +
 * auto-refreshes) and mirror the profile into the store for the UI.
 */
export async function login(input: {
  identifier: string;
  password: string;
}): Promise<LoginResult> {
  const result = await postAuth<LoginResult>("login", input);
  if (result.ok && result.session) {
    const sb = getSupabase();
    if (sb) {
      const { error: sessionErr } = await sb.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });
      if (sessionErr) {
        // The server already minted a VALID session, so a failure here almost
        // always means the client's Supabase project doesn't match the server's
        // — typically VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY pointing at a
        // different project (or a stray "/rest/v1" path on the URL). Without this
        // log the user appears "signed in" (the profile below still renders) yet
        // EVERY account action fails with "You need to be signed in." because the
        // session never persisted. Make that misconfiguration loud + diagnosable.
        console.error(
          "[auth] Supabase setSession failed — the session was NOT persisted. " +
            "Check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY match the " +
            "server's Supabase project exactly (base URL, no /rest/v1). Error:",
          sessionErr.message,
        );
      }
    }
    if (result.profile) {
      useStore.getState().setAccount(result.profile);
    }
  }
  return result;
}

/** Always resolves ok (the server never reveals whether the account exists). */
export function forgotPassword(input: {
  identifier: string;
}): Promise<{ ok: boolean }> {
  return postAuth<{ ok: boolean }>("forgot-password", input);
}

export function resetPassword(input: {
  identifier: string;
  code: string;
  newPassword: string;
}): Promise<ResetPasswordResult> {
  return postAuth<ResetPasswordResult>("reset-password", input);
}

/** Sign out of Supabase and clear the local account state. */
export async function logout(): Promise<void> {
  try {
    await getSupabase()?.auth.signOut();
  } finally {
    useStore.getState().setAccount(null);
  }
}

/**
 * Fetch the signed-in user's own profile row. RLS on `profiles` guarantees a
 * caller can only read their own row, so this returns `null` when not signed
 * in or on any error.
 */
export async function getMyProfile(): Promise<Profile | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: userData } = await sb.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;
  const { data, error } = await sb
    .from("profiles")
    .select("*")
    .eq("id", uid)
    .single();
  if (error || !data) return null;
  return data as Profile;
}

/**
 * `getMyProfile` with a few quick retries. A signed-in user has a valid session
 * persisted in localStorage; a TRANSIENT failure to fetch their profile (network
 * blip, cold server) must NOT be treated as "logged out". We retry a couple of
 * times before giving up. Returns null only when there's genuinely nothing to
 * read (or every attempt failed) — callers must NOT clear the account on null.
 */
async function getMyProfileResilient(attempts = 3): Promise<Profile | null> {
  for (let i = 0; i < attempts; i++) {
    const p = await getMyProfile();
    if (p) return p;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  return null;
}

let authInitialised = false;

/**
 * App-load bootstrap. Restores any persisted Supabase session, hydrates the
 * store's `account` from the profile, and keeps it synced via
 * `onAuthStateChange`. Safe to call multiple times — the subscription is only
 * wired once.
 */
export async function initAuth(): Promise<void> {
  // Accounts not configured (no Supabase env) → no-op. The app runs normally in
  // guest mode; this is the guard that lets the game load without a crash.
  const sb = getSupabase();
  if (!sb) return;

  // Hydrate from an existing persisted session on first call.
  try {
    const { data } = await sb.auth.getSession();
    if (data.session) {
      // A persisted session means the user IS signed in. Only set the account
      // when the profile actually loads — a transient fetch failure must NOT
      // clear it (that would log a validly-signed-in user out on refresh).
      const profile = await getMyProfileResilient();
      if (profile) useStore.getState().setAccount(profile);
    }
  } catch {
    /* offline / misconfigured env — leave account null, UI still works */
  }

  if (authInitialised) return;
  authInitialised = true;

  // Keep the store in lockstep with supabase-js session changes (token
  // refresh, sign-out from another tab, etc.).
  sb.auth.onAuthStateChange((event, session) => {
    // Clear ONLY on a genuine sign-out: explicit logout, an expired/revoked
    // refresh token, or sign-out from another tab — supabase-js always emits
    // SIGNED_OUT for these. We deliberately do NOT clear on a falsy `session`
    // for any other event, so a transient null can never log the user out.
    if (event === "SIGNED_OUT") {
      useStore.getState().setAccount(null);
      return;
    }
    if (!session) return;
    // SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED → refresh the mirrored profile,
    // but only OVERWRITE the account on a SUCCESSFUL fetch (never clear on a
    // transient null — that was a spurious-logout bug).
    void getMyProfileResilient().then((profile) => {
      if (profile) useStore.getState().setAccount(profile);
    });
  });
}

// ── XP grant (Phase 4) ───────────────────────────────────────────────────────

/**
 * The current Supabase ACCESS TOKEN (JWT), or null when signed out / unconfigured.
 * Used to authenticate server writes (the XP grant) and to link socket identity
 * on MP create/join. supabase-js owns refresh, so `getSession()` returns a live
 * token — we never persist or compute it ourselves.
 */
export async function getAccessToken(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Grant the end-of-SP-match XP reward (the ONLY SP grant path; MP is granted by
 * the server over the socket). POSTs the stable per-match `gameKey` with the
 * access token; the server owns the amount AND idempotency (a replay of the same
 * match reuses `gameKey` → granted once). Resolves to the reward on success, or
 * null on any failure / signed-out (caller treats null as "no celebration").
 *
 * SECURITY: the client never sends or asserts an XP amount — only the gameKey +
 * source. The returned `reward` is rendered verbatim.
 */
export async function grantSpGame(
  gameKey: string,
): Promise<RewardPayload | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${serverUrl()}/account/grant-game`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ gameKey, source: "sp" }),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok: true; reward: RewardPayload }
      | { ok: false }
      | null;
    if (data && data.ok && data.reward) return data.reward;
    return null;
  } catch {
    return null;
  }
}

// ── Cosmetics store (Phase 6) ─────────────────────────────────────────────────

/** Result of a purchase / equip round-trip. Never throws — a network failure or
 *  signed-out state resolves to `{ ok:false, error }` so the UI can surface a
 *  friendly inline message instead of an unhandled rejection. */
export interface CosmeticResult {
  ok: boolean;
  error?: string;
  /** Server-supplied machine code for branchable handling, e.g.
   *  "insufficient" | "already_owned" | "not_owned" | "invalid". */
  code?: string;
}

/**
 * Shared Bearer-token POST to `${serverUrl()}/account/<path>` for the cosmetic
 * endpoints. Mirrors `grantSpGame`'s token + fetch pattern. The SERVER is
 * authoritative on price / token balance / ownership — the client only sends
 * `{ kind, id }`. On `{ ok:true, profile }` we fold the FULL returned profile
 * into the store (which re-applies the equipped cosmetic via the cosmetics
 * bridge) and resolve `{ ok:true }`; any other shape resolves `{ ok:false }`.
 */
async function postCosmetic(
  path: "purchase" | "equip",
  kind: "skin" | "wallpaper",
  id: string,
): Promise<CosmeticResult> {
  const token = await getAccessToken();
  if (!token) {
    return { ok: false, error: "You need to be signed in.", code: "unauthorized" };
  }
  try {
    const res = await fetch(`${serverUrl()}/account/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ kind, id }),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok: true; profile: Profile }
      | { ok: false; error?: string; code?: string }
      | null;

    if (data && data.ok && data.profile) {
      useStore.getState().setAccount(data.profile);
      return { ok: true };
    }
    // 401 (often `{ ok:false }` with no message) or a structured server error.
    if (res.status === 401) {
      return { ok: false, error: "You need to be signed in.", code: "unauthorized" };
    }
    return {
      ok: false,
      error: (data && !data.ok && data.error) || "Something went wrong. Try again.",
      code: data && !data.ok ? data.code : undefined,
    };
  } catch {
    return {
      ok: false,
      error: "Couldn't reach the server. Check your connection and try again.",
    };
  }
}

/**
 * Buy a cosmetic with tokens. POSTs `{ kind, id }` with the access token; the
 * server checks the price, the caller's balance, and ownership, then returns the
 * full updated `Profile`. On success the store is updated and the item becomes
 * owned. Resolves `{ ok:false, error, code }` on insufficient tokens
 * ("insufficient"), already-owned ("already_owned"), an invalid id ("invalid"),
 * or a network/auth failure.
 */
export function purchaseCosmetic(
  kind: "skin" | "wallpaper",
  id: string,
): Promise<CosmeticResult> {
  return postCosmetic("purchase", kind, id);
}

/**
 * Equip an OWNED cosmetic. POSTs `{ kind, id }` with the access token; the
 * server verifies ownership and returns the full updated `Profile` with the new
 * `active_skin` / `active_wallpaper`. Folding that profile into the store makes
 * the cosmetics bridge re-apply the equipped style to the live game. Resolves
 * `{ ok:false, error, code }` on a not-owned ("not_owned") / invalid id
 * ("invalid") / network / auth failure.
 */
export function equipCosmetic(
  kind: "skin" | "wallpaper",
  id: string,
): Promise<CosmeticResult> {
  return postCosmetic("equip", kind, id);
}

// ── Custom card colours (Phase 7 — the free "Recolor" skin) ───────────────────

/** Client-side `#RRGGBB` guard — mirrors the server's HEX6 so we never POST a
 *  value the server will reject (better UX: fail fast, no flicker). The server
 *  re-validates and is authoritative. */
const HEX6 = /^#[0-9a-fA-F]{6}$/;

/**
 * Save the player's custom card tint (body + border) for the "custom" skin.
 * POSTs `{ body, border }` (`#RRGGBB`) with the access token to
 * `/account/card-colors`; the SERVER validates the hex, stores
 * `custom_card_colors`, and returns the full updated `Profile`. On
 * `{ ok:true, profile }` we fold that profile into the store so the live game +
 * the store preview repaint from the new colours. Never throws — a malformed
 * value, signed-out state, or network failure resolves to `{ ok:false, error }`.
 *
 * Server-authoritative: the client only sends `{ body, border }`; it asserts no
 * other state. The client-side hex check is a UX guard, not a security boundary.
 */
export async function setCardColors(
  body: string,
  border: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!HEX6.test(body) || !HEX6.test(border)) {
    return { ok: false, error: "Colours must be #RRGGBB hex." };
  }
  const token = await getAccessToken();
  if (!token) {
    return { ok: false, error: "You need to be signed in." };
  }
  try {
    const res = await fetch(`${serverUrl()}/account/card-colors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ body, border }),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok: true; profile: Profile }
      | { ok: false; error?: string; code?: string }
      | null;

    if (data && data.ok && data.profile) {
      useStore.getState().setAccount(data.profile);
      return { ok: true };
    }
    if (res.status === 401) {
      return { ok: false, error: "You need to be signed in." };
    }
    return {
      ok: false,
      error: (data && !data.ok && data.error) || "Something went wrong. Try again.",
    };
  } catch {
    return {
      ok: false,
      error: "Couldn't reach the server. Check your connection and try again.",
    };
  }
}

// ── Account settings (Phase 7 — change password / email / delete) ─────────────

/** Result of a settings round-trip. Never throws — a network failure, signed-out
 *  state, or 401 resolves to `{ ok:false, error }` so the UI surfaces a friendly
 *  inline message. `field` scopes a validation error to one input; `code` is the
 *  server's machine-readable reason for branchable handling. */
export interface SettingsResult {
  ok: boolean;
  error?: string;
  /** Which field the error applies to ("currentPassword" | "newPassword" | …). */
  field?: string;
  /** Machine code, e.g. "wrong_password" | "taken" | "rate_limited" |
   *  "invalid" | "invalid_code". */
  code?: string;
  /** confirm-email-change only: attempts remaining before the code is burned. */
  attemptsLeft?: number;
}

/**
 * Shared Bearer-token POST to `${serverUrl()}/account/<path>` for the settings
 * endpoints. Mirrors `postCosmetic`'s token + fetch pattern but returns the raw
 * structured body (each caller maps `code`/`field`/`profile` itself, since the
 * shapes differ). Never throws — network → friendly `{ ok:false }`, 401 → a
 * "signed in" message.
 */
async function postSettings<
  T extends { ok: boolean; error?: string; code?: string },
>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    return {
      ok: false,
      error: "You need to be signed in.",
      code: "unauthorized",
    } as T;
  }
  try {
    const res = await fetch(`${serverUrl()}/account/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Partial<T>;
    if (typeof data.ok === "boolean") return data as T;
    // 401 with an empty/garbled body, or any non-structured non-2xx.
    if (res.status === 401) {
      return {
        ok: false,
        error: "You need to be signed in.",
        code: "unauthorized",
      } as T;
    }
    return {
      ok: res.ok,
      error: data.error ?? "Something went wrong. Try again.",
    } as T;
  } catch {
    return {
      ok: false,
      error: "Couldn't reach the server. Check your connection and try again.",
    } as T;
  }
}

/**
 * The account email lives in the Supabase auth user, NOT the `profiles` row, so
 * we read it from the live session via `getUser()`. Returns null when signed
 * out, unconfigured, or on any error (the UI then hides the current-email line).
 */
export async function getCurrentEmail(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Change the signed-in user's password. STRICT: the server re-checks the current
 * password and is authoritative. POSTs `{ currentPassword, newPassword }` with
 * the access token. Resolves `{ ok:false, code:"wrong_password" }` when the
 * current password is incorrect, `{ ok:false, field }` on a validation reject,
 * or a network/auth failure.
 */
export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<SettingsResult> {
  return postSettings<SettingsResult>("change-password", {
    currentPassword,
    newPassword,
  });
}

/**
 * Step 1 of the email change: ask the server to email a 6-digit code to the
 * NEW address. POSTs `{ newEmail }` with the access token. Resolves
 * `{ ok:false, code }` on "taken" (already in use), "invalid" (malformed), or
 * "rate_limited" (too many requests). The account email is NOT changed until
 * `confirmEmailChange` succeeds.
 */
export function requestEmailChange(newEmail: string): Promise<SettingsResult> {
  return postSettings<SettingsResult>("request-email-change", { newEmail });
}

/**
 * Step 2 of the email change: confirm the 6-digit code mailed to the new
 * address. POSTs `{ code }` with the access token. On `{ ok:true, profile }`
 * we fold the returned profile into the store (keeps `account` fresh) and
 * resolve `{ ok:true, email }` — the caller reads the returned `email` for
 * display. Resolves `{ ok:false, code }` on "invalid_code" (with `attemptsLeft`)
 * or "taken".
 */
export async function confirmEmailChange(
  code: string,
): Promise<SettingsResult & { email?: string }> {
  const res = await postSettings<
    SettingsResult & { profile?: Profile; email?: string }
  >("confirm-email-change", { code });
  if (res.ok && res.profile) {
    useStore.getState().setAccount(res.profile);
  }
  return {
    ok: res.ok,
    error: res.error,
    code: res.code,
    attemptsLeft: res.attemptsLeft,
    email: res.email,
  };
}

/**
 * Permanently delete the signed-in account. STRICT: the server re-checks the
 * password and is authoritative. POSTs `{ password }` with the access token.
 * Resolves `{ ok:false, code:"wrong_password" }` on a bad password, or a
 * network/auth failure. On success the CALLER signs the local session out
 * (`logoutAccount`) — this helper only performs the server delete.
 */
export function deleteAccount(password: string): Promise<SettingsResult> {
  return postSettings<SettingsResult>("delete", { password });
}

// ── Redeem codes ──────────────────────────────────────────────────────────────

/** Result of a redeem-code round-trip. Never throws. `code` is the server's
 *  machine reason: "invalid" | "already_redeemed" | "rate_limited" |
 *  "unauthorized". On success `reward` describes what was granted. */
export interface RedeemResult {
  ok: boolean;
  error?: string;
  code?: string;
  reward?: { tokens: number; xp?: number };
}

/**
 * Redeem a code for its reward. SERVER-AUTHORITATIVE: the client only sends the
 * code string; the server owns the catalog + amounts and enforces once-per-
 * account redemption. POSTs `{ code }` with the access token to
 * `/account/redeem`. On `{ ok:true, profile }` we fold the returned profile into
 * the store (so the token balance updates live) and return the granted reward.
 * Resolves `{ ok:false, code }` on "invalid" / "already_redeemed" /
 * "rate_limited", or a network/auth failure.
 */
export async function redeemCode(code: string): Promise<RedeemResult> {
  const token = await getAccessToken();
  if (!token) {
    return { ok: false, error: "You need to be signed in.", code: "unauthorized" };
  }
  try {
    const res = await fetch(`${serverUrl()}/account/redeem`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code }),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok: true; reward: { tokens: number; xp?: number }; profile: Profile }
      | { ok: false; error?: string; code?: string; profile?: Profile }
      | null;

    if (data && data.ok && data.profile) {
      useStore.getState().setAccount(data.profile);
      // Redeem already shows its own inline "Redeemed! +N 🪙" confirmation, so
      // align the token-purchase watcher's baseline to this KNOWN grant — else
      // the menu-side token reveal would re-celebrate the redeemed tokens.
      writeLastSeenTokens(data.profile.id, data.profile.tokens);
      return { ok: true, reward: data.reward };
    }
    // Some non-ok responses (e.g. already_redeemed) still carry the current
    // profile — fold it so the store reflects the authoritative balance.
    if (data && !data.ok && data.profile) {
      useStore.getState().setAccount(data.profile);
      writeLastSeenTokens(data.profile.id, data.profile.tokens);
    }
    if (res.status === 401) {
      return { ok: false, error: "You need to be signed in.", code: "unauthorized" };
    }
    return {
      ok: false,
      error: (data && !data.ok && data.error) || "Something went wrong. Try again.",
      code: data && !data.ok ? data.code : undefined,
    };
  } catch {
    return {
      ok: false,
      error: "Couldn't reach the server. Check your connection and try again.",
    };
  }
}
