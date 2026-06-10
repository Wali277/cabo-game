// =============================================================================
// auth/router.ts
// Express router implementing the Phase-1 trusted-server AUTH contract:
//
//   POST /auth/signup           { username, email, password }
//   POST /auth/verify-email     { userId | email, code }
//   POST /auth/resend-code      { email, purpose }
//   POST /auth/login            { identifier, password }
//   POST /auth/forgot-password  { identifier }
//   POST /auth/reset-password   { identifier, code, newPassword }
//
// Security posture (per the project's security-anti-cheat reference):
//   * LOGIN and PASSWORD-RESET return GENERIC errors — they never reveal whether
//     an email/username exists. SIGNUP may reveal username/email taken (UX).
//   * All validation is server-side. No secret (service_role/anon/Resend key,
//     code secret, or the plaintext code) is ever logged.
//   * Unexpected errors return { ok:false, error:"Something went wrong" }.
//
// This is Phase 1 (AUTH ONLY): no XP grants, no socket identity-linking, no
// custom tokens, no cosmetics. Profiles are created with their DB defaults.
// =============================================================================

import { Router, type Request, type Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anonAuth } from "./supabaseClients.js";
import {
  validateUsername,
  validateEmail,
  validatePassword,
} from "./validation.js";
import {
  issueCode,
  verifyCode,
  RateLimitError,
  type CodePurpose,
} from "./codes.js";
import { sendCode } from "./email.js";
import * as loginLimit from "./loginRateLimit.js";
import { verifyAccessToken } from "./verifyToken.js";
import { XP_CONFIG, requireEnv } from "./config.js";
import { buildReward } from "./reward.js";
import { findCosmetic } from "./cosmetics.js";
import { findRedeemCode } from "./redeemCodes.js";
// Account lookups live in lookup.ts (single source of truth) so the Ko-fi
// donation webhook can reuse the SAME logic. Re-exported below for back-compat.
import { findUserByEmail, findProfileByUsername } from "./lookup.js";
export { findUserByEmail, findProfileByUsername } from "./lookup.js";

export const authRouter: Router = Router();

/**
 * Account/progression router. Mounted at /account (separate from /auth) so the
 * contract path POST /account/grant-game is exact. Lives in this file because
 * it shares the same admin client + token-verification posture as auth.
 */
export const accountRouter: Router = Router();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const GENERIC_ERROR = "Something went wrong";

/** Coerce an unknown body field to a trimmed string ("" if absent/non-string). */
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Looks-like-an-email heuristic (mirrors validation's lenient check). */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Client IP for the rate limiters. With `app.set("trust proxy", 1)` in index.ts
 *  (Render/Fly add exactly one proxy hop), Express derives req.ip from
 *  X-Forwarded-For correctly — no manual, spoofable XFF[0] parse. */
function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

/**
 * Resolve a login/reset identifier (email OR username) to an auth user. Returns
 * null when no user is found (callers must NOT reveal that to the client on the
 * login / reset paths). Never throws for "not found" — only for real errors.
 */
async function resolveIdentifierToUser(
  db: SupabaseClient,
  identifier: string,
): Promise<{ id: string; email?: string; email_confirmed_at?: string | null } | null> {
  if (looksLikeEmail(identifier)) {
    return findUserByEmail(db, identifier);
  }
  // Treat as a username → profile → auth user (for the email + confirm status).
  const profile = await findProfileByUsername(db, identifier);
  if (!profile) return null;
  const { data, error } = await db.auth.admin.getUserById(profile.id);
  if (error) {
    throw new Error(`resolveIdentifierToUser: getUserById failed: ${error.message}`);
  }
  const user = data?.user;
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? undefined,
    email_confirmed_at: user.email_confirmed_at ?? null,
  };
}

/** Fetch a profile row (server-side, full columns) by id. */
async function getProfile(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", id)
    .limit(1);
  if (error) {
    throw new Error(`getProfile: ${error.message}`);
  }
  return data?.[0] ?? null;
}

/** Extract the raw bearer token from an Authorization header ("" if absent). */
function bearerToken(req: Request): string {
  const h = req.headers["authorization"];
  if (typeof h !== "string") return "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : "";
}

// ===========================================================================
// ACCOUNT / PROGRESSION ROUTES (accountRouter, mounted at /account)
// ===========================================================================

// ---------------------------------------------------------------------------
// POST /account/grant-game   { gameKey: string, source: 'sp' }
//   Authorization: Bearer <supabase access_token>
//
// Server-authoritative single-player XP grant. The client asserts only that it
// finished a bot game (TRUST-BASED for SP — acceptable per spec at this scale);
// the SERVER owns the AMOUNT (XP_CONFIG.BOT_GAME) and the idempotency. We never
// accept an amount, a level, or an outcome from the client.
//
//   * A valid JWT is REQUIRED — verifyAccessToken resolves the real userId.
//     No/!valid token → 401 { ok:false }. The client cannot forge another user.
//   * gameKey must be a non-empty string — it is the per-user idempotency key
//     (ledger UNIQUE(user_id, game_key)); replaying it is a no-op in grant_xp.
//   * Only source:'sp' is grantable here. MP is 100% server-initiated and is
//     NEVER grantable via this client route.
// ---------------------------------------------------------------------------
accountRouter.post("/grant-game", async (req: Request, res: Response) => {
  try {
    // 1. Identity — a valid Supabase JWT is mandatory.
    const userId = await verifyAccessToken(bearerToken(req));
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    }

    // 2. Validate the body. gameKey required; source must be exactly 'sp'.
    const gameKey = str(req.body?.gameKey);
    const source = str(req.body?.source);
    if (!gameKey) {
      return res.status(400).json({ ok: false, error: "gameKey is required" });
    }
    if (source !== "sp") {
      // MP grants are server-initiated only — refuse to mint one from here.
      return res.status(400).json({ ok: false, error: "Invalid source" });
    }

    // 3. Grant. The amount comes from server CONFIG, never the request.
    const db = admin();
    const { data, error } = await db.rpc("grant_xp", {
      p_user: userId,
      p_game_key: gameKey,
      p_amount: XP_CONFIG.BOT_GAME,
      p_source: "sp",
    });
    if (error) {
      throw new Error(`grant-game: grant_xp failed: ${error.message}`);
    }

    // grant_xp returns a single composite row. supabase-js may surface it as the
    // row object directly or as a one-element array depending on the call shape;
    // accept both. buildReward defaults missing fields, so a replay/no-op still
    // returns a well-formed payload (gained shows the amount; leveled_up=false,
    // tokens_earned=0 because the ledger-conflict path returns current state).
    const row = Array.isArray(data) ? data[0] : data;
    const reward = buildReward(row, "sp", XP_CONFIG.BOT_GAME);

    return res.json({ ok: true, reward });
  } catch (err) {
    logError("grant-game", err);
    return res.status(500).json({ ok: false, error: GENERIC_ERROR });
  }
});

// ---------------------------------------------------------------------------
// POST /account/purchase   { kind: 'skin'|'wallpaper', id: string }
//   Authorization: Bearer <supabase access_token>
//
// Spend tokens to unlock a cosmetic. SERVER-AUTHORITATIVE: the client sends only
// the item it wants; the SERVER looks up the price from its catalog and passes
// it to purchase_cosmetic (which atomically checks ownership + balance under a
// row lock, so no double-spend). The client never sends a price.
// ---------------------------------------------------------------------------
accountRouter.post("/purchase", async (req: Request, res: Response) => {
  try {
    const userId = await verifyAccessToken(bearerToken(req));
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    }

    const kind = str(req.body?.kind);
    const id = str(req.body?.id);
    const item = findCosmetic(kind, id);
    // Reject before touching the DB:
    //  - unknown ids / `evolved` aren't in the catalog;
    //  - free defaults are already owned from signup;
    //  - LEVEL-REWARD items (e.g. 'custom' @ level 2) are NOT buyable — they're
    //    earned by leveling up, so you can't buy past the gate (price would be 0).
    if (!item || item.free || item.levelUnlock != null) {
      return res.status(400).json({ ok: false, code: "invalid", error: "That item isn't available." });
    }

    const db = admin();
    const { data, error } = await db.rpc("purchase_cosmetic", {
      p_user: userId,
      p_kind: kind,
      p_id: id,
      p_price: item.price, // authoritative price — never from the client
    });
    if (error) {
      throw new Error(`purchase: purchase_cosmetic failed: ${error.message}`);
    }
    const row = Array.isArray(data) ? data[0] : data;
    const status: string | undefined = row?.status;

    if (status === "ok") {
      const profile = await getProfile(db, userId);
      return res.json({ ok: true, profile });
    }
    if (status === "insufficient") {
      return res.json({ ok: false, code: "insufficient", error: "You don't have enough tokens." });
    }
    if (status === "already_owned") {
      return res.json({ ok: false, code: "already_owned", error: "You already own that." });
    }
    return res.status(400).json({ ok: false, code: "invalid", error: "That item isn't available." });
  } catch (err) {
    logError("purchase", err);
    return res.status(500).json({ ok: false, error: GENERIC_ERROR });
  }
});

// ---------------------------------------------------------------------------
// POST /account/equip   { kind: 'skin'|'wallpaper', id: string }
//   Authorization: Bearer <supabase access_token>
//
// Equip an OWNED cosmetic. equip_cosmetic refuses to equip anything the player
// hasn't unlocked (the free defaults count as owned via the 0001 DB defaults).
// ---------------------------------------------------------------------------
accountRouter.post("/equip", async (req: Request, res: Response) => {
  try {
    const userId = await verifyAccessToken(bearerToken(req));
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    }

    const kind = str(req.body?.kind);
    const id = str(req.body?.id);
    const item = findCosmetic(kind, id);
    if (!item) {
      return res.status(400).json({ ok: false, code: "invalid", error: "That item isn't available." });
    }

    const db = admin();
    const { data, error } = await db.rpc("equip_cosmetic", {
      p_user: userId,
      p_kind: kind,
      p_id: id,
    });
    if (error) {
      throw new Error(`equip: equip_cosmetic failed: ${error.message}`);
    }
    const row = Array.isArray(data) ? data[0] : data;
    const status: string | undefined = row?.status;

    if (status === "ok") {
      const profile = await getProfile(db, userId);
      return res.json({ ok: true, profile });
    }
    if (status === "not_owned") {
      return res.json({ ok: false, code: "not_owned", error: "You don't own that yet." });
    }
    return res.status(400).json({ ok: false, code: "invalid", error: "That item isn't available." });
  } catch (err) {
    logError("equip", err);
    return res.status(500).json({ ok: false, error: GENERIC_ERROR });
  }
});

// ---------------------------------------------------------------------------
// POST /account/redeem   { code: string }
//   Authorization: Bearer <supabase access_token>
//
// Redeem a code for its reward (currently tokens). SERVER-AUTHORITATIVE: the
// valid codes + their amounts live in redeemCodes.ts; the client only submits a
// string. Redemption is ONCE PER ACCOUNT (enforced atomically by the
// redeem_code RPC via code_redemptions UNIQUE(user_id, code)). Invalid-code
// attempts are throttled (per user+ip) to resist brute-forcing future codes;
// an "already redeemed" reply is a VALID code, so it does NOT count as a fail.
// ---------------------------------------------------------------------------
accountRouter.post("/redeem", async (req: Request, res: Response) => {
  try {
    const userId = await verifyAccessToken(bearerToken(req));
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    }

    const ip = clientIp(req);
    const limiterKey = `redeem:${userId}`;
    const gate = loginLimit.check(limiterKey, ip);
    if (!gate.allowed) {
      return res.status(429).json({
        ok: false,
        code: "rate_limited",
        error: "Too many attempts. Please wait a bit and try again.",
        retryAfterSec: gate.retryAfterSec,
      });
    }

    const reward = findRedeemCode(str(req.body?.code));
    if (!reward) {
      // Unknown code → count it against the brute-force budget.
      loginLimit.recordFail(limiterKey, ip);
      return res.json({ ok: false, code: "invalid", error: "That code isn't valid." });
    }

    const db = admin();
    const { data, error } = await db.rpc("redeem_code", {
      p_user: userId,
      p_code: reward.canonical, // canonical form — never the raw client string
      p_tokens: reward.tokens ?? 0, // authoritative amounts — never from the client
      p_xp: reward.xp ?? 0,
    });
    if (error) {
      throw new Error(`redeem: redeem_code failed: ${error.message}`);
    }
    const row = Array.isArray(data) ? data[0] : data;
    const status: string | undefined = row?.status;

    if (status === "ok") {
      // Valid + first redemption: clear the throttle and return the new profile.
      loginLimit.reset(limiterKey, ip);
      const profile = await getProfile(db, userId);
      return res.json({
        ok: true,
        reward: { tokens: reward.tokens ?? 0, xp: reward.xp ?? 0 },
        profile,
      });
    }
    if (status === "already") {
      // A valid code this account already used — not a brute-force signal. Return
      // the current profile too so the client store stays in sync (e.g. another
      // session already credited it), keeping the response complete on this path.
      const profile = await getProfile(db, userId);
      return res.json({
        ok: false,
        code: "already_redeemed",
        error: "You've already redeemed this code.",
        profile,
      });
    }
    // 'invalid' from the RPC (defensive) or any unexpected status.
    return res.status(500).json({ ok: false, error: GENERIC_ERROR });
  } catch (err) {
    logError("redeem", err);
    return res.status(500).json({ ok: false, error: GENERIC_ERROR });
  }
});

// ---------------------------------------------------------------------------
// POST /account/card-colors   { body, border }  (each '#RRGGBB')
//   Authorization: Bearer <supabase access_token>
//
// Save the player's custom card tint (the two colours for the "custom" skin):
//   body   = card face + the back's LUMO pill chip
//   border = frame, the back background + the LUMO wordmark text
// The SERVER validates the format (#RRGGBB) so only well-formed hex is stored —
// the client can't inject arbitrary CSS into the render. service_role write
// (RLS-bypassing) but scoped to the token's own profile.
// ---------------------------------------------------------------------------
const HEX6 = /^#[0-9a-fA-F]{6}$/;
accountRouter.post("/card-colors", async (req: Request, res: Response) => {
  try {
    const userId = await verifyAccessToken(bearerToken(req));
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    }
    const body = str(req.body?.body);
    const border = str(req.body?.border);
    if (!HEX6.test(body) || !HEX6.test(border)) {
      return res.status(400).json({ ok: false, code: "invalid", error: "Colours must be #RRGGBB hex." });
    }

    const db = admin();
    const { error } = await db
      .from("profiles")
      .update({
        custom_card_colors: {
          body: body.toLowerCase(),
          border: border.toLowerCase(),
        },
      })
      .eq("id", userId);
    if (error) {
      throw new Error(`card-colors: update failed: ${error.message}`);
    }
    const profile = await getProfile(db, userId);
    return res.json({ ok: true, profile });
  } catch (err) {
    logError("card-colors", err);
    return res.status(500).json({ ok: false, error: GENERIC_ERROR });
  }
});

// ---------------------------------------------------------------------------
// POST /account/change-password   { currentPassword, newPassword }
//   Authorization: Bearer <supabase access_token>
//
// Strict: re-authenticate with the CURRENT password (signInWithPassword) before
// setting the new one. The token alone isn't enough — a stolen/leftover session
// must not be able to silently change the password.
// ---------------------------------------------------------------------------
accountRouter.post("/change-password", async (req: Request, res: Response) => {
  try {
    // Keep the raw token: after a successful change we revoke every OTHER
    // session via admin.signOut(token, "others"), which needs this JWT.
    const accessToken = bearerToken(req);
    const userId = await verifyAccessToken(accessToken);
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    }
    const currentPassword =
      typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword =
      typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

    const pCheck = validatePassword(newPassword);
    if (!pCheck.ok) {
      return res.status(400).json({ ok: false, field: "newPassword", error: pCheck.error });
    }

    const db = admin();
    const { data: u, error: uErr } = await db.auth.admin.getUserById(userId);
    if (uErr || !u?.user?.email) {
      throw new Error(`change-password: getUserById: ${uErr?.message ?? "no email"}`);
    }
    const email = u.user.email.toLowerCase();

    // Re-auth with the current password before allowing the change.
    const { error: signInErr } = await anonAuth().auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (signInErr) {
      return res.json({ ok: false, code: "wrong_password", error: "Your current password is incorrect." });
    }

    const { error: updErr } = await db.auth.admin.updateUserById(userId, { password: newPassword });
    if (updErr) {
      throw new Error(`change-password: updateUserById: ${updErr.message}`);
    }

    // Revoke every OTHER session for this user (GoTrue does NOT do this on an
    // admin password update): a stolen/leftover session elsewhere must not
    // survive a password change. Scope "others" keeps THIS session — the one
    // that just proved the current password — signed in (better UX), and also
    // reaps the short-lived re-auth session minted by signInWithPassword
    // above. verifyAccessToken re-checks the session against Supabase on every
    // request, so revoked tokens die immediately server-side. If revocation
    // fails we still return ok — the password DID change; we log it instead.
    const { error: revokeErr } = await db.auth.admin.signOut(accessToken, "others");
    if (revokeErr) {
      logError("change-password(revoke-sessions)", revokeErr);
    }
    return res.json({ ok: true });
  } catch (err) {
    logError("change-password", err);
    return res.status(500).json({ ok: false, error: GENERIC_ERROR });
  }
});

// ---------------------------------------------------------------------------
// POST /account/request-email-change   { newEmail }
//   Authorization: Bearer <supabase access_token>
//
// Step 1 of an email change: validate + ensure the new address is free, then
// email a 6-digit 'change_email' code TO THE NEW ADDRESS. The change only takes
// effect after /account/confirm-email-change verifies that code.
// ---------------------------------------------------------------------------
accountRouter.post("/request-email-change", async (req: Request, res: Response) => {
  try {
    const userId = await verifyAccessToken(bearerToken(req));
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    }
    const newEmail = str(req.body?.newEmail).toLowerCase();
    const eCheck = validateEmail(newEmail);
    if (!eCheck.ok) {
      return res.status(400).json({ ok: false, code: "invalid", error: eCheck.error });
    }

    const db = admin();
    const existing = await findUserByEmail(db, newEmail);
    if (existing) {
      // Includes the case where it's already this user's email — nothing to do.
      return res.json({ ok: false, code: "taken", error: "That email is already in use." });
    }

    try {
      const code = await issueCode(userId, newEmail, "change_email");
      await sendCode(newEmail, code, "change_email");
    } catch (inner) {
      if (inner instanceof RateLimitError) {
        return res.json({ ok: false, code: "rate_limited", error: "Too many requests. Please wait a few minutes." });
      }
      throw inner;
    }
    return res.json({ ok: true });
  } catch (err) {
    logError("request-email-change", err);
    return res.status(500).json({ ok: false, error: GENERIC_ERROR });
  }
});

// ---------------------------------------------------------------------------
// POST /account/confirm-email-change   { code }
//   Authorization: Bearer <supabase access_token>
//
// Step 2: verify the 'change_email' code (issued to the new address) and apply
// the new email. We look up the pending new email from the newest unconsumed
// change_email code for this user, verify, re-check it's still free, then update.
// ---------------------------------------------------------------------------
accountRouter.post("/confirm-email-change", async (req: Request, res: Response) => {
  try {
    const userId = await verifyAccessToken(bearerToken(req));
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    }
    const code = str(req.body?.code);
    if (!code) {
      return res.status(400).json({ ok: false, error: "Code is required" });
    }

    const db = admin();
    // Which new email did they request? Newest unconsumed change_email code.
    const { data: rows, error: qErr } = await db
      .from("email_codes")
      .select("email")
      .eq("user_id", userId)
      .eq("purpose", "change_email")
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (qErr) {
      throw new Error(`confirm-email-change: query: ${qErr.message}`);
    }
    const newEmail = (rows?.[0]?.email as string | undefined)?.toLowerCase();
    if (!newEmail) {
      return res.json({ ok: false, code: "invalid_code", error: "No pending email change — request one first." });
    }

    const result = await verifyCode(newEmail, "change_email", code);
    if (!result.ok) {
      return res.json({ ok: false, code: "invalid_code", error: "Invalid or expired code", attemptsLeft: result.attemptsLeft });
    }
    // BIND the verified code to THIS user. verify_code keys only on
    // (email, purpose) and returns the owning user_id; if a *different* user had
    // a newer pending change to the same address and their row matched, refuse
    // rather than apply another account's verified email to this one.
    if (result.userId && result.userId !== userId) {
      return res.json({ ok: false, code: "invalid_code", error: "Invalid or expired code" });
    }

    // Re-check it's still free (a race since the request was made).
    const existing = await findUserByEmail(db, newEmail);
    if (existing && existing.id !== userId) {
      return res.json({ ok: false, code: "taken", error: "That email is already in use." });
    }

    const { error: updErr } = await db.auth.admin.updateUserById(userId, {
      email: newEmail,
      email_confirm: true,
    });
    if (updErr) {
      throw new Error(`confirm-email-change: updateUserById: ${updErr.message}`);
    }
    const profile = await getProfile(db, userId);
    return res.json({ ok: true, profile, email: newEmail });
  } catch (err) {
    logError("confirm-email-change", err);
    return res.status(500).json({ ok: false, error: GENERIC_ERROR });
  }
});

// ---------------------------------------------------------------------------
// POST /account/delete   { password }
//   Authorization: Bearer <supabase access_token>
//
// Permanently delete the account. Strict: re-authenticate with the password
// first. deleteUser cascades the profile / email_codes / xp_grants via the
// ON DELETE CASCADE foreign keys in 0001/0002.
// ---------------------------------------------------------------------------
accountRouter.post("/delete", async (req: Request, res: Response) => {
  try {
    const userId = await verifyAccessToken(bearerToken(req));
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    }
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    const db = admin();
    const { data: u, error: uErr } = await db.auth.admin.getUserById(userId);
    if (uErr || !u?.user?.email) {
      throw new Error(`delete: getUserById: ${uErr?.message ?? "no email"}`);
    }
    const email = u.user.email.toLowerCase();

    const { error: signInErr } = await anonAuth().auth.signInWithPassword({ email, password });
    if (signInErr) {
      return res.json({ ok: false, code: "wrong_password", error: "Your password is incorrect." });
    }

    const { error: delErr } = await db.auth.admin.deleteUser(userId);
    if (delErr) {
      throw new Error(`delete: deleteUser: ${delErr.message}`);
    }
    return res.json({ ok: true });
  } catch (err) {
    logError("delete", err);
    return res.status(500).json({ ok: false, error: GENERIC_ERROR });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/signup
// ---------------------------------------------------------------------------
authRouter.post("/signup", async (req: Request, res: Response) => {
  try {
    const username = str(req.body?.username);
    const email = str(req.body?.email).toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    // Validate everything server-side. Field-tagged so the client can highlight.
    const uCheck = validateUsername(username);
    if (!uCheck.ok) return res.status(400).json({ ok: false, field: "username", error: uCheck.error });
    const eCheck = validateEmail(email);
    if (!eCheck.ok) return res.status(400).json({ ok: false, field: "email", error: eCheck.error });
    const pCheck = validatePassword(password);
    if (!pCheck.ok) return res.status(400).json({ ok: false, field: "password", error: pCheck.error });

    const db = admin();

    // Username availability (citext unique). SIGNUP may reveal taken (UX).
    const existingProfile = await findProfileByUsername(db, username);
    if (existingProfile) {
      return res.json({ ok: false, field: "username", error: "That username is taken" });
    }

    // Email availability.
    const existingUser = await findUserByEmail(db, email);
    if (existingUser) {
      return res.json({ ok: false, field: "email", error: "That email is taken" });
    }

    // Create the auth user UNCONFIRMED — our own 6-digit code confirms it.
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
    });
    if (createErr || !created?.user) {
      // Supabase may reject a duplicate email here even if our scan missed it
      // (race). Surface as an email-taken-style message without leaking detail.
      const msg = (createErr?.message ?? "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return res.json({ ok: false, field: "email", error: "That email is taken" });
      }
      throw new Error(`signup: createUser failed: ${createErr?.message ?? "no user returned"}`);
    }

    const userId = created.user.id;

    // Insert the profile row; DB defaults fill XP/level/cosmetics.
    const { error: profileErr } = await db
      .from("profiles")
      // Sign-up bonus: every new account starts owning the Emerald Felt wallpaper
      // (a 1-token item) for free, on top of the always-free Horizon default which
      // stays the active wallpaper. Set explicitly so the grant doesn't depend on
      // the DB column defaults (which vary by which migration has been applied).
      .insert({
        id: userId,
        username,
        unlocked_wallpapers: ["horizon", "emerald"],
        active_wallpaper: "horizon",
      });
    if (profileErr) {
      // Most likely the unique-username index fired due to a race between our
      // availability check and this insert. Roll back the just-created auth user
      // so we don't orphan it, then report the username as taken.
      await db.auth.admin.deleteUser(userId).catch(() => {});
      return res.json({ ok: false, field: "username", error: "That username is taken" });
    }

    // Issue + email a signup verification code. If the email send fails, the
    // account still exists (unconfirmed) and the user can hit resend-code.
    const code = await issueCode(userId, email, "signup");
    await sendCode(email, code, "signup");

    return res.json({ ok: true, userId });
  } catch (err) {
    logError("signup", err);
    return res.status(500).json({ ok: false, error: GENERIC_ERROR });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/verify-email
// Accepts { userId, code } or { email, code }.
// ---------------------------------------------------------------------------
authRouter.post("/verify-email", async (req: Request, res: Response) => {
  try {
    const code = str(req.body?.code);
    const userId = str(req.body?.userId);
    let email = str(req.body?.email).toLowerCase();

    if (!code) return res.status(400).json({ ok: false, error: "Code is required" });

    const db = admin();

    // Resolve the email we verify against. When a userId is supplied it is
    // AUTHORITATIVE — always resolve the email from it, never trust a body-
    // supplied `email`, so a valid code for one address can't be used to confirm
    // a different account. (Email-only callers, e.g. login-needs-verification,
    // keep using their supplied email.)
    let resolvedUserId = userId;
    if (userId) {
      const { data, error } = await db.auth.admin.getUserById(userId);
      if (error) throw new Error(`verify-email: getUserById failed: ${error.message}`);
      email = (data?.user?.email ?? "").toLowerCase();
    }
    if (!email) {
      return res.status(400).json({ ok: false, error: "Email or userId is required" });
    }

    const result = await verifyCode(email, "signup", code);
    if (!result.ok) {
      return res.json({
        ok: false,
        error: "Invalid or expired code",
        attemptsLeft: result.attemptsLeft,
      });
    }

    // Bind the verified code to the supplied user. verify_code keys only on
    // (email, purpose) and returns the code's owning user_id; if a userId was
    // supplied and it doesn't match, refuse rather than confirm the wrong
    // account. (Mirrors /confirm-email-change.)
    if (userId && result.userId && result.userId !== userId) {
      return res.json({ ok: false, error: "Invalid or expired code" });
    }

    // Code matched — mark the user's email confirmed.
    resolvedUserId = resolvedUserId || result.userId || "";
    if (!resolvedUserId) {
      throw new Error("verify-email: could not resolve userId after verification");
    }
    const { error: confirmErr } = await db.auth.admin.updateUserById(resolvedUserId, {
      email_confirm: true,
    });
    if (confirmErr) {
      throw new Error(`verify-email: updateUserById failed: ${confirmErr.message}`);
    }

    return res.json({ ok: true });
  } catch (err) {
    logError("verify-email", err);
    return res.status(500).json({ ok: false, error: GENERIC_ERROR });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/resend-code   { email | identifier, purpose }
// Always returns { ok:true } (no enumeration), even if the account is unknown.
// Accepts either `email` (back-compat) or `identifier` (email OR username, used
// by the reset flow where the user may have typed a username). When both are
// absent we still return a generic OK.
// ---------------------------------------------------------------------------
authRouter.post("/resend-code", async (req: Request, res: Response) => {
  try {
    const email = str(req.body?.email).toLowerCase();
    const identifier = str(req.body?.identifier);
    const rawPurpose = str(req.body?.purpose);
    const purpose: CodePurpose = rawPurpose === "reset" ? "reset" : "signup";

    if (!email && !identifier) {
      // Malformed input — still don't reveal anything; generic OK is fine.
      return res.json({ ok: true });
    }

    const db = admin();
    // Prefer an explicit email; otherwise resolve the identifier (email OR
    // username) so a username-typed reset can still receive its code.
    const user = email
      ? await findUserByEmail(db, email)
      : await resolveIdentifierToUser(db, identifier);
    if (user?.email) {
      const target = user.email.toLowerCase();
      try {
        const code = await issueCode(user.id, target, purpose);
        await sendCode(target, code, purpose);
      } catch (inner) {
        // Swallow rate-limit / send errors so we don't leak existence or state.
        // (Still log non-secret detail server-side for diagnostics.)
        if (!(inner instanceof RateLimitError)) logError("resend-code", inner);
      }
    }
    // Generic success regardless of whether the user exists.
    return res.json({ ok: true });
  } catch (err) {
    logError("resend-code", err);
    // Even on unexpected error, prefer the non-enumerating generic OK.
    return res.json({ ok: true });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/login   { identifier, password }
// ---------------------------------------------------------------------------
authRouter.post("/login", async (req: Request, res: Response) => {
  const identifier = str(req.body?.identifier);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const ip = clientIp(req);

  try {
    if (!identifier || !password) {
      return res.status(400).json({ ok: false, error: "Invalid login credentials" });
    }

    // Brute-force throttle (per identifier+ip).
    const gate = loginLimit.check(identifier, ip);
    if (!gate.allowed) {
      return res.status(429).json({
        ok: false,
        error: "Too many attempts. Please try again later.",
        retryAfterSec: gate.retryAfterSec,
      });
    }

    const db = admin();

    // Resolve identifier → the user's email (sign-in is always by email).
    // SECURITY TODO (Phase-1 deferred; acceptable at friends-scale): findUserByEmail pages listUsers O(users) and the unknown-username branch returns before signInWithPassword, creating a username-existence timing oracle. Before any public/scaled launch: store lower(email) on profiles (indexed) for O(1) lookup, and add a constant-time dummy sign-in on the unknown-identifier path so existing-vs-missing latency matches. Response bodies are already generic.
    let email: string;
    if (looksLikeEmail(identifier)) {
      email = identifier.toLowerCase();
    } else {
      const user = await resolveIdentifierToUser(db, identifier);
      if (!user?.email) {
        // Unknown username — generic failure, count it against the limiter.
        loginLimit.recordFail(identifier, ip);
        return res.json({ ok: false, error: "Invalid login credentials" });
      }
      email = user.email.toLowerCase();
    }

    // Exercise the real password sign-in path via the anon client.
    const { data: signIn, error: signInErr } = await anonAuth().auth.signInWithPassword({
      email,
      password,
    });

    if (signInErr || !signIn?.user || !signIn.session) {
      // Distinguish "email not confirmed" (the password WAS correct — Supabase
      // rejects the sign-in only because its "Confirm email" setting is ON) from
      // genuinely-bad credentials. The former must NOT strand the user behind a
      // generic error: route it to the verify flow and re-issue a code, exactly
      // like the email_confirmed_at branch below (which only runs when "Confirm
      // email" is OFF). This makes login robust regardless of that DB toggle.
      const errCode = (signInErr as { code?: string } | null)?.code ?? "";
      const errMsg = (signInErr?.message ?? "").toLowerCase();
      const notConfirmed =
        errCode === "email_not_confirmed" || errMsg.includes("not confirmed");
      if (notConfirmed) {
        const unverified = await findUserByEmail(db, email);
        if (unverified?.id) {
          try {
            const code = await issueCode(unverified.id, email, "signup");
            await sendCode(email, code, "signup");
          } catch (inner) {
            if (!(inner instanceof RateLimitError)) logError("login(reissue)", inner);
          }
          // Valid creds but unverified → NOT a brute-force failure; send them to
          // the verify step with a fresh code instead of a dead-end error.
          return res.json({
            ok: false,
            error: "Please verify your email first",
            needsVerification: true,
            email,
            userId: unverified.id,
          });
        }
        // Couldn't resolve the user — fall through to the generic failure.
      }
      loginLimit.recordFail(identifier, ip);
      return res.json({ ok: false, error: "Invalid login credentials" });
    }

    // Credentials were valid. If the email isn't confirmed, block login and
    // re-issue a signup code so the user can complete verification.
    if (!signIn.user.email_confirmed_at) {
      try {
        const code = await issueCode(signIn.user.id, email, "signup");
        await sendCode(email, code, "signup");
      } catch (inner) {
        if (!(inner instanceof RateLimitError)) logError("login(reissue)", inner);
      }
      // Valid creds but unverified → DON'T count as a brute-force failure.
      // Return userId too (belt-and-suspenders): the client can verify by
      // userId even if it doesn't echo the email back.
      return res.json({
        ok: false,
        error: "Please verify your email first",
        needsVerification: true,
        email,
        userId: signIn.user.id,
      });
    }

    // Full success — clear the limiter and return the session + profile.
    loginLimit.reset(identifier, ip);
    const profile = await getProfile(db, signIn.user.id);
    const s = signIn.session;
    return res.json({
      ok: true,
      session: {
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        expires_at: s.expires_at,
        expires_in: s.expires_in,
        token_type: s.token_type,
      },
      profile,
    });
  } catch (err) {
    logError("login", err);
    return res.status(500).json({ ok: false, error: GENERIC_ERROR });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/forgot-password   { identifier }
// Always returns { ok:true } — never reveals whether the account exists.
// ---------------------------------------------------------------------------
authRouter.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const identifier = str(req.body?.identifier);
    if (!identifier) return res.json({ ok: true });

    const db = admin();
    const user = await resolveIdentifierToUser(db, identifier);
    if (user?.email) {
      try {
        const code = await issueCode(user.id, user.email.toLowerCase(), "reset");
        await sendCode(user.email.toLowerCase(), code, "reset");
      } catch (inner) {
        if (!(inner instanceof RateLimitError)) logError("forgot-password", inner);
      }
    }
    return res.json({ ok: true });
  } catch (err) {
    logError("forgot-password", err);
    // Non-enumerating: still return generic OK.
    return res.json({ ok: true });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/reset-password   { identifier, code, newPassword }
// Generic failure message ("Invalid or expired code") — no enumeration.
// ---------------------------------------------------------------------------
authRouter.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const identifier = str(req.body?.identifier);
    const code = str(req.body?.code);
    const newPassword =
      typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

    // Validate the new password first (this IS safe to reveal — it's about the
    // submitted value, not account existence).
    const pCheck = validatePassword(newPassword);
    if (!pCheck.ok) {
      return res.status(400).json({ ok: false, field: "newPassword", error: pCheck.error });
    }
    if (!identifier || !code) {
      return res.json({ ok: false, error: "Invalid or expired code" });
    }

    const db = admin();
    const user = await resolveIdentifierToUser(db, identifier);
    if (!user?.email) {
      // Unknown account — generic failure (no enumeration).
      return res.json({ ok: false, error: "Invalid or expired code" });
    }

    const result = await verifyCode(user.email.toLowerCase(), "reset", code);
    if (!result.ok) {
      return res.json({
        ok: false,
        error: "Invalid or expired code",
        attemptsLeft: result.attemptsLeft,
      });
    }

    // Code valid — set the new password.
    const { error: updErr } = await db.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });
    if (updErr) {
      throw new Error(`reset-password: updateUserById failed: ${updErr.message}`);
    }

    // Kill ALL previously-issued sessions: an attacker holding a stolen
    // session must not survive the victim's password reset. GoTrue does NOT
    // revoke sessions on an admin password update.
    //
    // PRIMARY: the GoTrue admin logout-by-user-id endpoint
    // (POST /auth/v1/admin/users/{id}/logout, service-role auth). No sign-in
    // is involved, so it cannot be starved by GoTrue's password-grant rate
    // limiter — a throwaway sign-in originates from THIS server's IP, and an
    // attacker spamming /auth/login could 429 it, silently skipping the
    // revocation while the route still returned ok.
    //
    // FALLBACK (older GoTrue without that endpoint, or any non-2xx): mint a
    // throwaway session with the NEW password, then sign it out with scope
    // "global" (destroys every session, including the throwaway).
    //
    // verifyAccessToken re-checks the session against Supabase on every
    // request, so revoked tokens die immediately server-side. If BOTH paths
    // fail we still return ok — the password DID change; we log loudly
    // instead of failing the reset.
    let adminLogoutFailure: unknown = null;
    try {
      const baseUrl = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
      const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
      const resp = await fetch(
        `${baseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}/logout`,
        {
          method: "POST",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        },
      );
      if (!resp.ok) {
        throw new Error(`admin logout endpoint returned HTTP ${resp.status}`);
      }
    } catch (err) {
      adminLogoutFailure = err;
    }
    if (adminLogoutFailure !== null) {
      try {
        const { data: revokeSignIn, error: revokeSignInErr } =
          await anonAuth().auth.signInWithPassword({
            email: user.email.toLowerCase(),
            password: newPassword,
          });
        const jwt = revokeSignIn?.session?.access_token;
        if (revokeSignInErr || !jwt) {
          throw new Error(revokeSignInErr?.message ?? "sign-in minted no session");
        }
        const { error: revokeErr } = await db.auth.admin.signOut(jwt, "global");
        if (revokeErr) {
          throw new Error(revokeErr.message);
        }
      } catch (revokeFailure) {
        // BOTH revocation paths failed — log each so the cause is diagnosable.
        logError("reset-password(revoke-sessions:admin-logout)", adminLogoutFailure);
        logError("reset-password(revoke-sessions)", revokeFailure);
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    logError("reset-password", err);
    return res.status(500).json({ ok: false, error: GENERIC_ERROR });
  }
});

// ---------------------------------------------------------------------------
// Logging — NEVER logs secrets (keys, code secret, plaintext codes). We log a
// route tag + the error message only. Callers must not pass secrets into Error
// messages (none of the above do).
// ---------------------------------------------------------------------------
function logError(route: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[auth:${route}] ${message}`);
}
