// =============================================================================
// auth/email.ts
// Transactional email delivery via Resend for the 6-digit auth codes.
//
//   sendCode(email, code, purpose) — sends a clean, branded "LUMO" email whose
//   subject + copy differ between signup verification and password reset.
//
// SECURITY / RELIABILITY:
//   * RESEND_API_KEY and RESEND_FROM are server-only. If RESEND_API_KEY is
//     unset, sendCode() THROWS a clear error rather than silently succeeding —
//     a code that is never delivered would strand the user.
//   * The plaintext code is rendered into the email body but is NEVER logged.
//   * The Resend client is created lazily so the server can boot without the
//     key when auth isn't in use.
// =============================================================================

import { Resend } from "resend";
import { AUTH_CONFIG, requireEnv } from "./config.js";
import type { CodePurpose } from "./codes.js";

let _resend: Resend | null = null;

function resendClient(): Resend {
  if (_resend) return _resend;
  // Throws a clear "Missing required environment variable: RESEND_API_KEY" if
  // unset — we never want to no-op an email send.
  const apiKey = requireEnv("RESEND_API_KEY");
  _resend = new Resend(apiKey);
  return _resend;
}

/** Subject + intro copy per purpose. */
function copyFor(purpose: CodePurpose): { subject: string; heading: string; intro: string } {
  if (purpose === "signup") {
    return {
      subject: "Your LUMO verification code",
      heading: "Confirm your email",
      intro:
        "Welcome to LUMO! Enter this code in the app to verify your email and finish setting up your account.",
    };
  }
  if (purpose === "change_email") {
    return {
      subject: "Confirm your new LUMO email",
      heading: "Confirm your new email",
      intro:
        "Enter this code in LUMO to confirm this address as your new account email. If you didn't request this change, you can safely ignore this email.",
    };
  }
  return {
    subject: "Your LUMO password reset code",
    heading: "Reset your password",
    intro:
      "We received a request to reset your LUMO password. Enter this code in the app to choose a new one. If you didn't request this, you can safely ignore this email.",
  };
}

/**
 * Render the branded HTML body. Deliberately self-contained inline styles (email
 * clients strip <style>/external CSS).
 *
 * The 6-digit code is laid out as a TABLE ROW with one fixed-size box per digit
 * — a table row physically cannot wrap, so the code always stays on a single
 * line (the old single-<span> + letter-spacing wrapped to two rows on narrow
 * phones). Sized to fit 6 boxes down to ~320px-wide screens.
 *
 * Light card with EXPLICIT backgrounds + color-scheme hints so dark-mode email
 * clients (Gmail mobile, Apple Mail) don't unpredictably invert the palette.
 */
export function renderHtml(code: string, purpose: CodePurpose): string {
  const { heading, intro } = copyFor(purpose);
  const mins = AUTH_CONFIG.CODE_EXPIRY_MIN;

  // One box per digit + a thin spacer cell between digits. 6×40 + 5×6 = 270px,
  // which fits inside the 16px-padded card even on a 320px-wide phone.
  const spacer = `<td style="width:6px;font-size:0;line-height:0;">&nbsp;</td>`;
  const digitCells = code
    .split("")
    .map(
      (d) =>
        `<td align="center" valign="middle" style="width:40px;height:52px;background:#f5f6fb;border:1px solid #e0e3ef;border-radius:10px;text-align:center;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:25px;font-weight:800;color:#4f46e5;">${d}</td>`,
    )
    .join(spacer);

  const preheader =
    purpose === "reset"
      ? "Use this code to reset your password."
      : purpose === "change_email"
        ? "Use this code to confirm your new email address."
        : "Use this code to verify your email.";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${heading}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef0f6;-webkit-text-size-adjust:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef0f6;font-size:1px;line-height:1px;">${preheader} It expires in ${mins} minutes.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef0f6;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;width:100%;background:#ffffff;border:1px solid #e6e8f0;border-radius:18px;overflow:hidden;">
            <tr><td style="height:5px;background:#6d5cf5;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr>
              <td style="padding:30px 32px 0 32px;text-align:center;">
                <div style="font-size:24px;font-weight:800;letter-spacing:7px;color:#b8860b;">LUMO</div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 34px 0 34px;text-align:center;">
                <h1 style="margin:0 0 8px 0;font-size:21px;font-weight:700;color:#1b1d29;">${heading}</h1>
                <p style="margin:0;font-size:15px;line-height:1.6;color:#5b6175;">${intro}</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:26px 16px 6px 16px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                  <tr>${digitCells}</tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 34px 0 34px;text-align:center;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#8a90a2;">This code expires in <strong style="color:#5b6175;">${mins} minutes</strong>. For your security, never share it with anyone.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 34px 28px 34px;">
                <div style="border-top:1px solid #eceef4;line-height:0;font-size:0;">&nbsp;</div>
                <p style="margin:16px 0 0 0;font-size:12px;line-height:1.6;color:#9aa0b0;text-align:center;">If you didn't request this, you can safely ignore this email.<br>© LUMO</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Plaintext fallback for clients that don't render HTML. */
function renderText(code: string, purpose: CodePurpose): string {
  const { intro } = copyFor(purpose);
  return `LUMO\n\n${intro}\n\nYour code: ${code}\n\nThis code expires in ${AUTH_CONFIG.CODE_EXPIRY_MIN} minutes. Never share it with anyone.`;
}

/**
 * Send a 6-digit code to `email`. Throws on missing config or a Resend error
 * (so the caller can decide how to respond) — never silently no-ops. The code
 * is never written to any log.
 */
export async function sendCode(
  email: string,
  code: string,
  purpose: CodePurpose,
): Promise<void> {
  const resend = resendClient();
  const from = requireEnv("RESEND_FROM");
  const { subject } = copyFor(purpose);

  const { error } = await resend.emails.send({
    from,
    to: email,
    subject,
    html: renderHtml(code, purpose),
    text: renderText(code, purpose),
  });

  if (error) {
    // error.message may contain provider detail but never the code.
    throw new Error(`sendCode: Resend failed to send: ${error.message}`);
  }
}

/** Small HTML-escape so a reporter's text can't inject markup into the digest. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One submitted bug report, rendered into the owner's notification email. */
export interface BugReportEmail {
  message: string;
  consoleLog: string | null;
  contactEmail: string | null;
  reporter: string; // account username, or "Guest"
  screen: string | null;
  appVersion: string | null;
  unresolved: number; // total unresolved reports, including this one
}

/**
 * Email the owner a single bug report the moment it's submitted. Called by the
 * bug-report endpoint on EVERY report so nothing is missed at low volume. The
 * full report (description + console dump + contact + diagnostics) is rendered
 * inline so it can be triaged straight from the inbox; the canonical copy lives
 * in the Supabase bug_reports table.
 *
 *   * Recipient: BUG_REPORT_TO if set, else falls back to RESEND_FROM (send to
 *     self) so a misconfigured recipient never silently drops the alert.
 *   * Best-effort: the caller wraps this in try/catch and never fails the user's
 *     submission over an email send.
 *   * This email intentionally carries the reporter's text / contact / console
 *     dump — it is the delivery channel for exactly that. (That same data must
 *     still NEVER be written to server logs.)
 */
export async function sendBugReportEmail(r: BugReportEmail): Promise<void> {
  const resend = resendClient();
  const from = requireEnv("RESEND_FROM");
  // Fall back to RESEND_FROM (self) rather than throwing if BUG_REPORT_TO is
  // unset — a delivered-to-self alert beats a dropped one.
  const to = (process.env.BUG_REPORT_TO || "").trim() || from;

  const reporter = r.reporter?.trim() || "Guest";
  const message = escapeHtml(r.message.slice(0, 4000)) || "(no description)";
  const consoleLog = r.consoleLog ? escapeHtml(r.consoleLog.slice(0, 6000)) : "";
  const contact = r.contactEmail ? escapeHtml(r.contactEmail) : "—";
  const screen = r.screen ? escapeHtml(r.screen) : "—";
  const ver = r.appVersion ? escapeHtml(r.appVersion) : "—";
  const subject = `🐛 New LUMO bug report — ${reporter}`;

  const consoleBlock = consoleLog
    ? `<tr><td style="padding:16px 34px 0 34px;">
            <div style="font-size:12px;font-weight:700;letter-spacing:0.5px;color:#8a90a2;text-transform:uppercase;margin-bottom:6px;">Console / technical details</div>
            <pre style="margin:0;white-space:pre-wrap;word-break:break-word;background:#0f1117;color:#d6d9e6;border-radius:12px;padding:14px 16px;font-size:12px;line-height:1.5;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${consoleLog}</pre>
          </td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;padding:0;background:#eef0f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef0f6;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;background:#ffffff;border:1px solid #e6e8f0;border-radius:18px;overflow:hidden;">
          <tr><td style="height:5px;background:#6d5cf5;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:24px 32px 0 32px;text-align:center;">
            <div style="font-size:22px;font-weight:800;letter-spacing:7px;color:#b8860b;">LUMO</div>
          </td></tr>
          <tr><td style="padding:12px 34px 0 34px;text-align:center;">
            <h1 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#1b1d29;">🐛 New bug report</h1>
            <p style="margin:0;font-size:13px;color:#8a90a2;">from <strong style="color:#5b6175;">${escapeHtml(reporter)}</strong> · ${r.unresolved} unresolved total</p>
          </td></tr>
          <tr><td style="padding:18px 34px 0 34px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;color:#3a3f52;border-collapse:collapse;">
              <tr><td style="padding:4px 0;color:#8a90a2;width:90px;">Contact</td><td style="padding:4px 0;">${contact}</td></tr>
              <tr><td style="padding:4px 0;color:#8a90a2;">Screen</td><td style="padding:4px 0;">${screen}</td></tr>
              <tr><td style="padding:4px 0;color:#8a90a2;">Version</td><td style="padding:4px 0;">${ver}</td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:16px 34px 0 34px;">
            <div style="font-size:12px;font-weight:700;letter-spacing:0.5px;color:#8a90a2;text-transform:uppercase;margin-bottom:6px;">What went wrong</div>
            <div style="background:#f5f6fb;border:1px solid #e0e3ef;border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.6;color:#3a3f52;white-space:pre-wrap;word-break:break-word;">${message}</div>
          </td></tr>
          ${consoleBlock}
          <tr><td style="padding:22px 34px 28px 34px;">
            <div style="border-top:1px solid #eceef4;line-height:0;font-size:0;">&nbsp;</div>
            <p style="margin:16px 0 0 0;font-size:12px;line-height:1.6;color:#9aa0b0;text-align:center;">Sent on every report. The full list lives in your Supabase <code>bug_reports</code> table — mark rows <code>triaged</code> / <code>fixed</code> when done. © LUMO</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  const text = `LUMO — new bug report from ${reporter} (${r.unresolved} unresolved total)\n\nContact: ${r.contactEmail || "—"}\nScreen: ${r.screen || "—"}   Version: ${r.appVersion || "—"}\n\nWhat went wrong:\n${r.message.slice(0, 4000)}\n${r.consoleLog ? `\nConsole / technical details:\n${r.consoleLog.slice(0, 6000)}\n` : ""}\nManage all reports in your Supabase bug_reports table.`;

  const { error } = await resend.emails.send({ from, to, subject, html, text });
  if (error) {
    throw new Error(`sendBugReportEmail: Resend failed to send: ${error.message}`);
  }
}
