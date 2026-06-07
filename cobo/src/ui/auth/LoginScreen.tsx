/**
 * Accounts layer (Phase 1 — auth only).
 *
 * Login screen: identifier (email OR username) + password. Links to forgot
 * password, sign up, and back to the menu. If the server reports the account
 * still `needsVerification`, we swap to the shared VerifyStep (prefilled with
 * the returned email) and, once verified, finish the login with the same
 * credentials the user already typed.
 */
import { useState } from "react";
import { useStore } from "../../state/store";
import { Audio } from "../../audio/sounds";
import { login } from "../../state/auth";
import { AuthShell, Field } from "./authShared";
import { VerifyStep } from "./VerifyStep";
import { PasswordInput } from "../PasswordInput";

export function LoginScreen() {
  const setScreen = useStore((s) => s.setScreen);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When the account needs email verification we hold the user here with the
  // shared verify step, remembering the userId/email + the credentials so we
  // can complete the login automatically once they verify.
  const [verify, setVerify] = useState<{ userId: string; email: string } | null>(null);

  const canSubmit = identifier.trim().length > 0 && password.length > 0 && !busy;

  /** Finish a successful auth: account is set inside login(); go to the menu. */
  function finishLogin() {
    Audio.playSfx("win");
    setScreen("menu");
  }

  async function doLogin() {
    if (!canSubmit) return;
    Audio.playSfx("click");
    setBusy(true);
    setError(null);
    try {
      const res = await login({ identifier: identifier.trim(), password });
      if (res.ok && res.session) {
        finishLogin();
        return;
      }
      if (res.needsVerification) {
        // The server returns the userId (as a generic field) + email so we can
        // run the shared verify step. Fall back to the typed identifier if the
        // server didn't echo an email back.
        setVerify({
          userId: res.userId ?? "",
          email: res.email ?? identifier.trim(),
        });
        return;
      }
      setError(res.error ?? "Wrong email/username or password.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // ── Verification interstitial ──────────────────────────────────────────────
  if (verify) {
    return (
      <AuthShell subtitle="One more step">
        <VerifyStep
          userId={verify.userId}
          email={verify.email}
          onVerified={async () => {
            // Re-attempt the login with the same credentials now that the
            // account is verified; login() sets the account on success.
            const res = await login({ identifier: identifier.trim(), password });
            if (res.ok && res.session) {
              finishLogin();
            } else {
              // Verified but auto-login failed (rare) — send them to a clean
              // login form with a hint.
              setVerify(null);
              setError("Email verified — please log in.");
            }
          }}
        />
        <button
          type="button"
          className="btn ghost"
          onClick={() => { Audio.playSfx("click"); setVerify(null); }}
        >
          ← Back to login
        </button>
      </AuthShell>
    );
  }

  // ── Login form ──────────────────────────────────────────────────────────────
  return (
    <AuthShell subtitle="Welcome back">
      <form
        className="auth-form"
        onSubmit={(e) => { e.preventDefault(); void doLogin(); }}
      >
        <Field label="Email or username" htmlFor="login-identifier">
          <input
            id="login-identifier"
            className="input"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@example.com"
            aria-describedby={error ? "login-error" : undefined}
            aria-invalid={!!error}
          />
        </Field>

        <Field label="Password" htmlFor="login-password">
          <PasswordInput
            id="login-password"
            className="input"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            aria-describedby={error ? "login-error" : undefined}
            aria-invalid={!!error}
          />
        </Field>

        <button
          type="button"
          className="auth-link"
          onClick={() => { Audio.playSfx("click"); setScreen("forgot"); }}
        >
          Forgot password?
        </button>

        {error && <div className="error" id="login-error" role="alert">{error}</div>}

        <button className="btn primary big" type="submit" disabled={!canSubmit}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>

      <div className="divider"><span>new here?</span></div>

      <button
        className="btn big"
        onClick={() => { Audio.playSfx("click"); setScreen("signup"); }}
      >
        Create an account
      </button>

      <button
        className="btn ghost"
        onClick={() => { Audio.playSfx("click"); setScreen("menu"); }}
      >
        ← Back
      </button>
    </AuthShell>
  );
}
