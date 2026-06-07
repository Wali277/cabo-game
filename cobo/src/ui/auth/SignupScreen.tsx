/**
 * Accounts layer (Phase 1 — auth only).
 *
 * Signup is two steps in one component:
 *   Step 1 (details): username / email / password with INLINE validation.
 *     Submit is disabled until all three are valid. On a `field` error from the
 *     server we attach it to that field; on success we advance to step 2.
 *   Step 2 (verify): the shared VerifyStep. Once the code is accepted we
 *     auto-login with the just-entered email + password, set the account, and
 *     route to the menu.
 */
import { useState } from "react";
import { useStore } from "../../state/store";
import { Audio } from "../../audio/sounds";
import { login, signup } from "../../state/auth";
import { AuthShell, Field } from "./authShared";
import {
  validateEmail,
  validatePassword,
  validateUsername,
} from "./authValidation";
import { VerifyStep } from "./VerifyStep";
import { PasswordInput } from "../PasswordInput";

export function SignupScreen() {
  const setScreen = useStore((s) => s.setScreen);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Which fields the user has interacted with — only show inline errors after
  // a blur so the form doesn't scream at someone who's still typing.
  const [touched, setTouched] = useState<{ [k: string]: boolean }>({});
  // Server-attached field error (e.g. "email already in use").
  const [serverFieldError, setServerFieldError] = useState<{ field: string; error: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // After step 1 succeeds we hold the userId for verification.
  const [userId, setUserId] = useState<string | null>(null);

  const usernameErr = validateUsername(username);
  const emailErr = validateEmail(email);
  const passwordErr = validatePassword(password);
  const allValid = !usernameErr && !emailErr && !passwordErr;

  /** Show a field's error: client-side once touched, plus any server error. */
  function fieldError(name: "username" | "email" | "password", clientErr: string | null) {
    if (serverFieldError?.field === name) return serverFieldError.error;
    return touched[name] ? clientErr : null;
  }

  function markTouched(name: string) {
    setTouched((t) => ({ ...t, [name]: true }));
  }

  async function doSignup() {
    if (!allValid || busy) return;
    Audio.playSfx("click");
    setBusy(true);
    setError(null);
    setServerFieldError(null);
    try {
      const res = await signup({
        username: username.trim(),
        email: email.trim(),
        password,
      });
      if (res.ok) {
        Audio.playSfx("action_trigger");
        setUserId(res.userId ?? "");
        return;
      }
      if (res.field && res.error) {
        setServerFieldError({ field: res.field, error: res.error });
      } else {
        setError(res.error ?? "Couldn't create your account. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // ── Step 2: verify ──────────────────────────────────────────────────────────
  if (userId !== null) {
    return (
      <AuthShell subtitle="Verify your email">
        <VerifyStep
          userId={userId}
          email={email.trim()}
          onVerified={async () => {
            // Auto-login with the credentials we already have; login() sets the
            // account on success.
            const res = await login({ identifier: email.trim(), password });
            Audio.playSfx("win");
            setScreen(res.ok && res.session ? "menu" : "login");
          }}
        />
        <button
          type="button"
          className="btn ghost"
          onClick={() => { Audio.playSfx("click"); setUserId(null); }}
        >
          ← Edit details
        </button>
      </AuthShell>
    );
  }

  // ── Step 1: details ───────────────────────────────────────────────────────────
  return (
    <AuthShell subtitle="Create your account">
      {/* Sign-up bonus — purely presentational. A live Emerald wallpaper swatch
          (same renderer the store uses) + a "free wallpaper" line, to advertise
          the freebie every new account receives. Only on this details step. */}
      <div className="signup-bonus">
        <span
          className="signup-bonus-swatch theme-swatch-preview"
          data-theme="emerald"
          aria-hidden="true"
        />
        <span className="signup-bonus-text">
          🎁 Sign-up bonus — the <strong>Emerald Felt</strong> wallpaper, free!
        </span>
      </div>

      <form
        className="auth-form"
        onSubmit={(e) => { e.preventDefault(); void doSignup(); }}
      >
        <Field label="Username" htmlFor="signup-username" error={fieldError("username", usernameErr)}>
          <input
            id="signup-username"
            className="input"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (serverFieldError?.field === "username") setServerFieldError(null);
            }}
            onBlur={() => markTouched("username")}
            placeholder="3–20 letters, numbers, _"
            aria-describedby="signup-username-err"
            aria-invalid={!!fieldError("username", usernameErr)}
          />
        </Field>

        <Field label="Email" htmlFor="signup-email" error={fieldError("email", emailErr)}>
          <input
            id="signup-email"
            className="input"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (serverFieldError?.field === "email") setServerFieldError(null);
            }}
            onBlur={() => markTouched("email")}
            placeholder="you@example.com"
            aria-describedby="signup-email-err"
            aria-invalid={!!fieldError("email", emailErr)}
          />
        </Field>

        <Field label="Password" htmlFor="signup-password" error={fieldError("password", passwordErr)}>
          <PasswordInput
            id="signup-password"
            className="input"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (serverFieldError?.field === "password") setServerFieldError(null);
            }}
            onBlur={() => markTouched("password")}
            placeholder="At least 8 characters"
            aria-describedby="signup-password-err"
            aria-invalid={!!fieldError("password", passwordErr)}
          />
        </Field>

        {error && <div className="error" role="alert">{error}</div>}

        <button className="btn primary big" type="submit" disabled={!allValid || busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>

      <div className="divider"><span>already have one?</span></div>

      <button
        className="btn big"
        onClick={() => { Audio.playSfx("click"); setScreen("login"); }}
      >
        Log in instead
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
