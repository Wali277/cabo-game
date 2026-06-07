/**
 * Accounts layer (Phase 1 — auth only).
 *
 * Shared email-verification step. Used by SignupScreen (step 2) and by
 * LoginScreen when the server says an account still `needsVerification`. Takes
 * the `userId` to verify against and the `email` (for the resend call + display
 * + the auto-login the parent performs afterwards).
 *
 * On a correct code it calls `onVerified()` — the PARENT decides what happens
 * next (both current callers auto-login with the known credentials, then route
 * to the menu). Presentational: the only API calls here are verify + resend.
 */
import { useEffect, useRef, useState } from "react";
import { Audio } from "../../audio/sounds";
import { resendCode, verifyEmail } from "../../state/auth";
import { CodeInput } from "./CodeInput";
import { RESEND_COOLDOWN_S, SUPPORT_EMAIL } from "./authValidation";

interface Props {
  /** User id to verify against (signup has it; login-needs-verify may not). */
  userId?: string;
  /** Email to verify against / resend to / display. Either userId or email
   *  identifies the account server-side; we forward whichever we have. */
  email: string;
  /** Called after the code is accepted. The parent finishes the flow. */
  onVerified: () => void | Promise<void>;
}

export function VerifyStep({ userId, email, onVerified }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Announced separately via an aria-live region so the count is read out.
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const [resent, setResent] = useState(false);
  // Guards against a double-submit when onComplete and the button both fire.
  const submittingRef = useRef(false);

  // Tick the resend cooldown down to 0.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submit(value: string) {
    if (submittingRef.current) return;
    if (value.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    setError(null);
    setAttemptsLeft(null);
    Audio.playSfx("click");
    try {
      // Forward BOTH identifiers; the server (and verifyEmail) use whichever is
      // present. Signup passes a real userId; login-needs-verify passes email.
      const res = await verifyEmail({ userId, email, code: value });
      if (res.ok) {
        Audio.playSfx("action_trigger");
        await onVerified();
        return; // parent navigates away; leave busy state as-is
      }
      const left =
        typeof res.attemptsLeft === "number"
          ? ` ${res.attemptsLeft} attempt${res.attemptsLeft === 1 ? "" : "s"} left.`
          : "";
      setError((res.error ?? "That code isn't right.") + left);
      setAttemptsLeft(typeof res.attemptsLeft === "number" ? res.attemptsLeft : null);
      setCode("");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || busy) return;
    Audio.playSfx("click");
    setResent(false);
    setError(null);
    await resendCode({ email, purpose: "signup" });
    setResent(true);
    setCooldown(RESEND_COOLDOWN_S);
  }

  return (
    <>
      <div className="auth-verify-intro">
        <h2 className="menu-label">Check your email</h2>
        <p className="auth-muted">
          We sent a 6-digit code to <strong>{email}</strong>. Enter it below to
          verify your account.
        </p>
      </div>

      <CodeInput
        value={code}
        onChange={(v) => {
          setCode(v);
          if (error) setError(null);
          if (attemptsLeft !== null) setAttemptsLeft(null);
        }}
        onComplete={submit}
        disabled={busy}
        autoFocus
        ariaLabel="Email verification code"
      />

      {error && <div className="error" role="alert">{error}</div>}
      {resent && !error && (
        <div className="auth-notice" role="alert">A fresh code is on its way.</div>
      )}
      {/* Screen-reader-only running count of remaining attempts. */}
      <div className="sr-only" aria-live="polite">
        {attemptsLeft !== null
          ? `${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left`
          : ""}
      </div>

      <button
        className="btn primary big"
        disabled={busy || code.length !== 6}
        onClick={() => submit(code)}
      >
        {busy ? "Verifying…" : "Verify"}
      </button>

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
    </>
  );
}
