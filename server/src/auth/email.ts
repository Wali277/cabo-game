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
