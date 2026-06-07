/**
 * Accounts layer (Phase 1 — auth only).
 *
 * Forgot-password reset, two steps in one component:
 *   Step 1 (request): identifier (email OR username) → forgotPassword(). The
 *     server ALWAYS reports ok (never reveals whether the account exists), so
 *     we always advance to step 2 with the neutral "if that account exists…"
 *     notice.
 *   Step 2 (reset): 6-digit code + new password → resetPassword(). On success
 *     we show a notice and route back to "login".
 */
import { useEffect, useState } from "react";
import { useStore } from "../../state/store";
import { Audio } from "../../audio/sounds";
import { forgotPassword, resendCode, resetPassword } from "../../state/auth";
import { CodeInput } from "./CodeInput";
import { AuthShell, Field } from "./authShared";
import { RESEND_COOLDOWN_S, SUPPORT_EMAIL, validatePassword } from "./authValidation";
import { PasswordInput } from "../PasswordInput";

export function ForgotPasswordScreen() {
  const setScreen = useStore((s) => s.setScreen);

  // "done" shows a confirmation notice in-card (the global toast only renders
  // on the game screen, so we can't rely on it here) before auto-routing to
  // the login screen.
  const [step, setStep] = useState<"request" | "reset" | "done">("request");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [touchedPw, setTouchedPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const pwErr = validatePassword(newPassword);
  const canReset = code.length === 6 && !pwErr && !busy;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // After a successful reset, auto-return to login (the user can also tap the
  // button immediately).
  useEffect(() => {
    if (step !== "done") return;
    const t = setTimeout(() => setScreen("login"), 2600);
    return () => clearTimeout(t);
  }, [step, setScreen]);

  async function doRequest() {
    if (!identifier.trim() || busy) return;
    Audio.playSfx("click");
    setBusy(true);
    setError(null);
    try {
      await forgotPassword({ identifier: identifier.trim() });
      // Always ok — never reveal whether the account exists.
      setStep("reset");
      setCooldown(RESEND_COOLDOWN_S);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function doReset() {
    if (!canReset) return;
    Audio.playSfx("click");
    setBusy(true);
    setError(null);
    try {
      const res = await resetPassword({
        identifier: identifier.trim(),
        code,
        newPassword,
      });
      if (res.ok) {
        Audio.playSfx("win");
        setStep("done");
        return;
      }
      setError(res.error ?? "That code isn't right or has expired.");
      setCode("");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || busy) return;
    Audio.playSfx("click");
    setError(null);
    await resendCode({ email: identifier.trim(), purpose: "reset" });
    setCooldown(RESEND_COOLDOWN_S);
  }

  // ── Success ───────────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <AuthShell subtitle="All set">
        <div className="auth-verify-intro">
          <p className="auth-notice" role="alert">Password updated — you can log in now.</p>
          <p className="auth-muted">Taking you to the login screen…</p>
        </div>
        <button
          className="btn primary big"
          onClick={() => { Audio.playSfx("click"); setScreen("login"); }}
        >
          Go to login
        </button>
      </AuthShell>
    );
  }

  // ── Step 2: reset ─────────────────────────────────────────────────────────────
  if (step === "reset") {
    return (
      <AuthShell subtitle="Reset your password">
        <div className="auth-verify-intro">
          <h2 className="menu-label">Check your email</h2>
          <p className="auth-notice" role="alert">
            If that account exists, we sent a 6-digit code to its email.
          </p>
          <p className="auth-muted">Enter the code and choose a new password.</p>
        </div>

        <form
          className="auth-form"
          onSubmit={(e) => { e.preventDefault(); void doReset(); }}
        >
          {/* CodeInput carries its own group label via `ariaLabel`, so we don't
              wrap it in <Field> — that would add a second, disconnected <label>
              (FE-M2). The visible field label lives in the intro heading above. */}
          <CodeInput
            value={code}
            onChange={(v) => { setCode(v); if (error) setError(null); }}
            disabled={busy}
            autoFocus
            ariaLabel="Verification code"
          />

          <Field label="New password" htmlFor="reset-password" error={touchedPw ? pwErr : null}>
            <PasswordInput
              id="reset-password"
              className="input"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onBlur={() => setTouchedPw(true)}
              placeholder="At least 8 characters"
              aria-describedby="reset-password-err"
              aria-invalid={!!(touchedPw && pwErr)}
            />
          </Field>

          {error && <div className="error" role="alert">{error}</div>}

          <button className="btn primary big" type="submit" disabled={!canReset}>
            {busy ? "Updating…" : "Reset password"}
          </button>
        </form>

        <button
          type="button"
          className="auth-link"
          disabled={cooldown > 0 || busy}
          onClick={handleResend}
        >
          {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
        </button>

        {SUPPORT_EMAIL.includes("@") && (
          <p className="auth-support">
            Lost access to your email? Contact{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
        )}

        <button
          className="btn ghost"
          onClick={() => { Audio.playSfx("click"); setScreen("login"); }}
        >
          ← Back to login
        </button>
      </AuthShell>
    );
  }

  // ── Step 1: request ──────────────────────────────────────────────────────────
  return (
    <AuthShell subtitle="Forgot your password?">
      <form
        className="auth-form"
        onSubmit={(e) => { e.preventDefault(); void doRequest(); }}
      >
        <p className="auth-muted">
          Enter your email or username and we'll send a code to reset your
          password.
        </p>

        <Field label="Email or username" htmlFor="forgot-identifier">
          <input
            id="forgot-identifier"
            className="input"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@example.com"
            aria-describedby={error ? "forgot-error" : undefined}
            aria-invalid={!!error}
          />
        </Field>

        {error && <div className="error" id="forgot-error" role="alert">{error}</div>}

        <button
          className="btn primary big"
          type="submit"
          disabled={!identifier.trim() || busy}
        >
          {busy ? "Sending…" : "Send reset code"}
        </button>
      </form>

      <button
        className="btn ghost"
        onClick={() => { Audio.playSfx("click"); setScreen("login"); }}
      >
        ← Back to login
      </button>
    </AuthShell>
  );
}
