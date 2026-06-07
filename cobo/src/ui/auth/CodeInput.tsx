/**
 * Accounts layer (Phase 1 — auth only).
 *
 * Segmented 6-digit verification code input. Six boxes that feel like a single
 * field: typing advances, Backspace retreats, arrows move, and a full 6-digit
 * paste fills every box at once. Fully keyboard-usable and mobile-friendly
 * (numeric keypad via inputMode, ≥44px tap targets via CSS).
 *
 * Controlled: `value` is the current 0–6 char string of digits; `onChange`
 * fires with the cleaned string. `onComplete` fires once when the 6th digit
 * lands (e.g. to auto-submit). `autoFocus` focuses the first box on mount.
 */
import { useEffect, useRef } from "react";
import type React from "react";

/** Distribute a run of digits across the boxes starting at `start`, returning
 *  the new 0–6 char value. Shared by paste and multi-char (iOS SMS autofill)
 *  input so both fill left-to-right from the active box instead of dropping
 *  everything but one char. */
function fillFrom(current: string, start: number, incoming: string, length: number): string {
  const arr = Array.from({ length }, (_, i) => current[i] ?? "");
  let cursor = start;
  for (const ch of incoming) {
    if (cursor >= length) break;
    arr[cursor] = ch;
    cursor += 1;
  }
  return arr.join("").slice(0, length);
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Accessible label for the group (the visible <label> text). */
  ariaLabel?: string;
}

const LENGTH = 6;

export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
  ariaLabel = "6-digit verification code",
}: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  // Tracks the previous value so we can detect a content → "" transition (a
  // failed verify clears the parent's value while we stay mounted) and refocus
  // the first box for an immediate retry.
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  // Refocus box 1 when the code is cleared after having had content (e.g. the
  // parent resets `value` to "" in its wrong-code branch). Cursor returns to the
  // start so the user just retypes.
  useEffect(() => {
    if (value === "" && prevValueRef.current !== "") {
      refs.current[0]?.focus();
    }
    prevValueRef.current = value;
  }, [value]);

  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? "");

  function commit(next: string, focusIdx: number) {
    onChange(next);
    refs.current[Math.min(focusIdx, LENGTH - 1)]?.focus();
    if (next.length === LENGTH) onComplete?.(next);
  }

  function setDigit(index: number, raw: string) {
    const clean = raw.replace(/\D/g, "");
    if (!clean) {
      // Clearing this box.
      const next = (value.slice(0, index) + value.slice(index + 1)).slice(0, LENGTH);
      onChange(next);
      return;
    }
    // Multiple chars at once (iOS SMS autofill or a paste routed through the
    // change event) → distribute them across the boxes from here, mirroring
    // the paste behaviour, rather than keeping only the last char.
    if (clean.length > 1) {
      const next = fillFrom(value, index, clean, LENGTH);
      commit(next, index + clean.length);
      return;
    }
    // Single char: place it here and advance.
    const arr = digits.slice();
    arr[index] = clean;
    commit(arr.join("").slice(0, LENGTH), index + 1);
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      // Standard OTP backspace: always swallow the native delete, clear a digit
      // (this box if it has one, else the previous box), then step focus back.
      e.preventDefault();
      const target = digits[index] ? index : Math.max(0, index - 1);
      if (digits[target]) {
        const next = (value.slice(0, target) + value.slice(target + 1)).slice(0, LENGTH);
        onChange(next);
      }
      refs.current[Math.max(0, index - 1)]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < LENGTH - 1) {
      e.preventDefault();
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(index: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    e.preventDefault();
    // Distribute from the box that received the paste (mirrors multi-char input).
    const next = fillFrom(value, index, pasted.slice(0, LENGTH), LENGTH);
    commit(next, index + pasted.length);
  }

  return (
    <div
      className="auth-code"
      role="group"
      aria-label={ariaLabel}
    >
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className="auth-code-box"
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          pattern="[0-9]*"
          maxLength={1}
          value={d}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
