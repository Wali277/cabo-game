// =============================================================================
// api/bugReport.ts — in-app "Report a bug" submissions. POST /api/report-bug
// -----------------------------------------------------------------------------
// PUBLIC endpoint (guests can report too), so it is hardened independently of
// auth:
//   * Per-IP rate limit (in-memory sliding window) so it can't be spammed.
//   * Strict input validation + server-side truncation — never trusts client
//     sizes (the global express.json() cap is the outer guard).
//   * OPTIONAL identity: a Bearer access token, if present + valid, attributes
//     the report to that account (username resolved server-side). No token →
//     recorded as a guest report (account_id null). A bad/expired token is
//     simply ignored (treated as a guest) — it never rejects the report.
//
// Reports are written to public.bug_reports via the service_role-only submit_bug
// RPC (migration 0010). On EVERY report we fire a best-effort notification email
// to the owner (BUG_REPORT_TO, else RESEND_FROM) containing the full report, so
// nothing is missed at low volume. A failed email NEVER fails the submission.
// =============================================================================
import { Router, type Request, type Response } from "express";
import { admin } from "../auth/supabaseClients.js";
import { verifyAccessToken } from "../auth/verifyToken.js";
import { sendBugReportEmail } from "../auth/email.js";

export const bugReportRouter: Router = Router();

// Server-side caps (defence-in-depth — the client also caps before sending, and
// express.json's 16kb limit is the outer wall). Truncate, don't reject, so a
// chatty console dump still gets a usable report through.
const MAX_MESSAGE = 4000;
const MAX_CONSOLE = 6000;
const MAX_EMAIL = 200;
const MAX_SHORT = 60; // app_version / screen
const MAX_USERNAME = 40;

/** Trim + coerce to string. */
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
/** Trim + cap length (never throws). */
function capped(v: unknown, max: number): string {
  return str(v).slice(0, max);
}
/** Bearer token from the Authorization header, or "". */
function bearerToken(req: Request): string {
  const h = req.headers["authorization"];
  if (typeof h !== "string") return "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : "";
}
/** Real client IP (trust proxy is set in index.ts so req.ip is the X-Forwarded-For hop). */
function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

// ── Tiny in-memory per-IP sliding-window rate limit ──────────────────────────
// No external dep (same posture as the in-memory rooms / auth limiter). A burst
// guard for a public form; resets on server restart, which is fine.
const RL_WINDOW_MS = 10 * 60_000; // 10 minutes
const RL_MAX = 6; // max reports per IP per window
const rlHits = new Map<string, number[]>();

function rateLimited(ip: string, now: number): boolean {
  const cutoff = now - RL_WINDOW_MS;
  const hits = (rlHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (hits.length >= RL_MAX) {
    rlHits.set(ip, hits); // keep the trimmed list
    return true;
  }
  hits.push(now);
  rlHits.set(ip, hits);
  // Opportunistic GC so the map can't grow unbounded across many IPs.
  if (rlHits.size > 5000) {
    for (const [k, v] of rlHits) {
      const kept = v.filter((t) => t > cutoff);
      if (kept.length === 0) rlHits.delete(k);
      else rlHits.set(k, kept);
    }
  }
  return false;
}

bugReportRouter.post("/report-bug", async (req: Request, res: Response) => {
  try {
    const now = Date.now();
    const ip = clientIp(req);
    if (rateLimited(ip, now)) {
      return res
        .status(429)
        .json({ ok: false, error: "You've sent a lot of reports — please wait a bit and try again." });
    }

    const message = capped(req.body?.message, MAX_MESSAGE);
    if (!message) {
      return res.status(400).json({ ok: false, error: "Please describe the problem." });
    }
    const consoleLog = capped(req.body?.consoleLog, MAX_CONSOLE) || null;
    const email = capped(req.body?.email, MAX_EMAIL) || null;
    const appVersion = capped(req.body?.appVersion, MAX_SHORT) || null;
    const screen = capped(req.body?.screen, MAX_SHORT) || null;
    // The request's own User-Agent header is more trustworthy than a client field.
    const userAgent = capped(req.headers["user-agent"], 400) || null;

    // Optional, non-sensitive diagnostics object. Keep it small + plain.
    let meta: Record<string, unknown> | null = null;
    if (req.body?.meta && typeof req.body.meta === "object" && !Array.isArray(req.body.meta)) {
      try {
        // Round-trip through JSON with a size cap so a huge/odd object can't bloat the row.
        const json = JSON.stringify(req.body.meta).slice(0, 2000);
        meta = JSON.parse(json) as Record<string, unknown>;
      } catch {
        meta = null;
      }
    }

    // OPTIONAL identity: attribute to an account if a valid token is supplied.
    // A missing/invalid/expired token just means "guest report" — never reject.
    let accountId: string | null = null;
    let username: string | null = null;
    const token = bearerToken(req);
    const db = admin();
    if (token) {
      try {
        const uid = await verifyAccessToken(token);
        if (uid) {
          accountId = uid;
          try {
            const { data } = await db
              .from("profiles")
              .select("username")
              .eq("id", uid)
              .maybeSingle();
            username =
              data && typeof data.username === "string" ? data.username.trim() : null;
          } catch {
            /* keep accountId; username stays null on lookup failure */
          }
        }
      } catch {
        /* invalid token → treat as guest */
      }
    }

    const { data, error } = await db.rpc("submit_bug", {
      p_account_id: accountId,
      p_username: username,
      p_email: email,
      p_message: message,
      p_console_log: consoleLog,
      p_user_agent: userAgent,
      p_app_version: appVersion,
      p_screen: screen,
      p_meta: meta,
    });
    if (error) {
      console.error(`[bug-report] submit_bug failed: ${error.message}`);
      return res.status(500).json({ ok: false, error: "Couldn't save your report. Please try again." });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const newCount: number = Number(row?.new_count) || 0;
    // NON-PII log only: report id + unresolved backlog + signed-in y/n. Never the
    // message body, contact email, or console dump.
    console.log(
      `[bug-report] id=${row?.id ?? "?"} unresolved=${newCount} account=${accountId ? "y" : "n"}`,
    );

    // Email the owner on EVERY report (best-effort, fire-and-forget) so nothing
    // is missed at low volume. An email failure must NOT fail the submission.
    sendBugReportEmail({
      message,
      consoleLog,
      contactEmail: email,
      reporter: username || "Guest",
      screen,
      appVersion,
      unresolved: newCount,
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[bug-report] notification email failed: ${msg}`);
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[bug-report] error: ${msg}`);
    return res.status(500).json({ ok: false, error: "Something went wrong. Please try again." });
  }
});
