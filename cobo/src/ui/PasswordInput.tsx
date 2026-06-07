/**
 * Reusable password input with a built-in show/hide reveal toggle.
 *
 * Drop-in replacement for a `<input type="password" className="input" .../>`:
 * extends every native input attribute (id, value, onChange, autoComplete,
 * placeholder, maxLength, disabled, autoFocus, onKeyDown, aria-*, className…)
 * and OMITS `type` — the component owns it, flipping between "password" (dots)
 * and "text" (plaintext) when the eye button is pressed.
 *
 * The reveal button is `type="button"` so it NEVER submits the surrounding
 * form, stays keyboard-focusable, and exposes aria-label / aria-pressed / title
 * for screen readers.
 */
import { useState } from "react";
import type { InputHTMLAttributes } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function PasswordInput({ className = "input", ...rest }: PasswordInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-input-wrap">
      <input {...rest} className={className} type={show ? "text" : "password"} />
      <button
        type="button"
        className="password-reveal-btn"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        title={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
