// =============================================================================
// webhooks/kofi.ts — Ko-fi webhook → credit in-game tokens for "buy tokens"
// SHOP purchases. POST /webhooks/kofi
// -----------------------------------------------------------------------------
// SECURITY: this endpoint can grant in-game currency, so it is gated entirely on
// Ko-fi's verification_token (constant-time compare; FAIL-CLOSED when the env var
// is unset) and is idempotent on kofi_transaction_id (the credit_donation RPC
// dedupes, so Ko-fi retries / replays can never double-credit).
//
// SCOPE: only Ko-fi "Shop Order" events grant tokens — plain "Donation" events
// NEVER do. That implements the "donate freely (no tokens) / buy tokens as a
// shop item" split. If KOFI_TOKEN_PRODUCT_CODE is set, the order must also
// contain that specific shop product (its direct_link_code). Tokens = floor(order
// amount): 1 unit of your Ko-fi payout currency = 1 token (so if that's USD,
// $1 = 1 token). Price the token shop item at 1.00 per token and SELL IT ALONE —
// the credit is the whole order total, so a mixed cart would convert everything.
//
// ACCOUNT MATCH: the buyer's account is resolved by email first, else by the
// in-game username typed in the order note. No match → recorded as 'unmatched'
// (NOT lost) so it can be credited/refunded manually. Never logs the token, the
// supporter email, or the message body.
// =============================================================================
import express, { Router, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { admin } from "../auth/supabaseClients.js";
import { findUserByEmail, findProfileByUsername } from "../auth/lookup.js";

export const kofiRouter: Router = Router();

/** Constant-time string compare (avoids leaking the token via timing). Length
 *  mismatch returns false WITHOUT calling timingSafeEqual (which throws on
 *  unequal-length buffers). */
export function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** 1 currency unit = 1 token, floored. Non-finite / negative / unparseable → 0. */
export function tokensFromAmount(amount: unknown): number {
  const n = Math.floor(Number(amount));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface KofiShopItem {
  direct_link_code?: string;
  variation_name?: string;
  quantity?: number;
}

export interface KofiPayload {
  verification_token?: string;
  kofi_transaction_id?: string;
  type?: string; // "Donation" | "Subscription" | "Commission" | "Shop Order"
  from_name?: string;
  message?: string | null;
  amount?: string; // decimal string in the creator's currency
  currency?: string;
  email?: string;
  is_public?: boolean;
  shop_items?: KofiShopItem[] | null;
}

/** Does this Ko-fi event grant tokens? ONLY "Shop Order" events qualify (plain
 *  donations never do). When productCode is provided, the order must also contain
 *  that shop product (matched on direct_link_code). */
export function isTokenGrantingEvent(
  payload: Pick<KofiPayload, "type" | "shop_items">,
  productCode?: string,
): boolean {
  if (payload.type !== "Shop Order") return false;
  if (!productCode) return true; // no extra scoping configured → any shop order
  return (
    Array.isArray(payload.shop_items) &&
    payload.shop_items.some((it) => it?.direct_link_code === productCode)
  );
}

kofiRouter.post(
  "/kofi",
  // Ko-fi POSTs application/x-www-form-urlencoded with a single `data` field
  // (a JSON string). The app's global express.json() won't populate this, so
  // parse urlencoded for THIS route. (json() no-ops on non-JSON content types,
  // leaving the body stream intact for this parser.)
  express.urlencoded({ extended: false, limit: "16kb" }),
  async (req: Request, res: Response) => {
    try {
      const secret = process.env.KOFI_VERIFICATION_TOKEN;
      if (!secret) {
        // FAIL CLOSED: never accept a token-minting request while unconfigured.
        console.error("[kofi] KOFI_VERIFICATION_TOKEN is not set — refusing webhook.");
        return res.status(503).json({ ok: false });
      }

      const raw = typeof req.body?.data === "string" ? req.body.data : "";
      let payload: KofiPayload;
      try {
        payload = JSON.parse(raw) as KofiPayload;
      } catch {
        return res.status(400).json({ ok: false, error: "Bad payload" });
      }

      // AUTH — the ONLY trust boundary. Verify it's really from Ko-fi.
      const token =
        typeof payload.verification_token === "string" ? payload.verification_token : "";
      if (!constantTimeEqual(token, secret)) {
        return res.status(401).json({ ok: false });
      }

      const txnId =
        typeof payload.kofi_transaction_id === "string" ? payload.kofi_transaction_id : "";
      if (!txnId) {
        return res.status(400).json({ ok: false, error: "Missing transaction id" });
      }

      // From here the request is VERIFIED Ko-fi. We always return 200 for a
      // verified request (idempotency makes Ko-fi retries safe), EXCEPT on a real
      // DB error (500) so Ko-fi retries that one.
      const productCode = process.env.KOFI_TOKEN_PRODUCT_CODE || undefined;
      const grantsTokens = isTokenGrantingEvent(payload, productCode);

      if (!grantsTokens) {
        // Plain donation / non-token shop order → acknowledge, credit nothing.
        console.log(`[kofi] txn=${txnId} ignored (type=${payload.type ?? "?"} — not a token shop order)`);
        return res.status(200).json({ ok: true });
      }

      const tokens = tokensFromAmount(payload.amount);
      const db = admin();

      // Resolve the buyer's account: email first, then the username typed in the
      // order note. Lookup failures degrade to "unmatched" (recorded, not lost).
      let userId: string | null = null;
      const email = typeof payload.email === "string" ? payload.email.trim() : "";
      if (email) {
        try {
          const u = await findUserByEmail(db, email);
          // Only credit a CONFIRMED account. An unconfirmed signup made on someone
          // else's email must NOT intercept that person's purchase — fall through
          // to the username-note match / 'unmatched' instead.
          userId = u && u.email_confirmed_at ? u.id : null;
        } catch {
          userId = null;
        }
      }
      if (!userId) {
        const note = typeof payload.message === "string" ? payload.message.trim() : "";
        if (note) {
          try {
            userId = (await findProfileByUsername(db, note))?.id ?? null;
          } catch {
            userId = null;
          }
        }
      }

      const { data, error } = await db.rpc("credit_donation", {
        p_txn_id: txnId,
        p_user: userId,
        p_tokens: tokens,
        p_amount: Number(payload.amount) || 0,
        p_currency: payload.currency ?? null,
        p_email: payload.email ?? null,
        p_from: payload.from_name ?? null,
        p_message: payload.message ?? null,
      });
      if (error) {
        // Real DB error → 500 so Ko-fi retries (safe: idempotent on txnId).
        console.error(`[kofi] credit_donation failed for txn ${txnId}: ${error.message}`);
        return res.status(500).json({ ok: false });
      }
      const row = Array.isArray(data) ? data[0] : data;
      const status: string = row?.status ?? "unknown";
      // NON-PII log only: txn id + status + token count + matched y/n. Never the
      // email, message, or verification token.
      console.log(`[kofi] txn=${txnId} status=${status} tokens=${tokens} matched=${userId ? "y" : "n"}`);

      return res.status(200).json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[kofi] webhook error: ${msg}`);
      return res.status(500).json({ ok: false });
    }
  },
);
