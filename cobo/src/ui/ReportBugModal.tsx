import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";
import { useViewMode } from "../state/viewmode";
import { formatAll, getErrorCount } from "../state/debugLog";
import { reportBug } from "../state/reportBug";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * REPORT A BUG — in-app feedback / error report form
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Opened from the Settings speed-dial (the 🐛 button). Self-gates on the store's
 * `reportBugOpen` (false → renders nothing), so App.tsx mounts it globally — the
 * same shape as {@link TokenPurchaseOverlay}. It "falls" in from above with the
 * same spring, and respects `useReducedMotion()` + `body.mobile-mode`.
 *
 * The form collects a free-text description PLUS, optionally, a technical log —
 * which is PRE-FILLED from the client's captured console/error buffer (see
 * state/debugLog.ts) so the user doesn't have to open the browser console, but
 * they can also paste an error there themselves. An optional contact email lets
 * the owner follow up. Submitting POSTs to /api/report-bug (state/reportBug.ts).
 *
 * Closes on ✕ / Cancel / Escape. It deliberately does NOT close on an outside
 * click (unlike the celebration overlays) so a stray tap can't wipe a half-typed
 * report.
 */
export function ReportBugModal() {
  const open = useStore((s) => s.reportBugOpen);
  const setOpen = useStore((s) => s.setReportBugOpen);
  const close = () => setOpen(false);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay report-bug-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2, ease: "easeIn" } }}
          role="dialog"
          aria-modal="true"
          aria-label="Report a bug"
        >
          {/* The card mounts/unmounts with `open` (the conditional above), so its
              useState resets to a clean form on every open — no key needed. */}
          <ReportBugCard onClose={close} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ReportBugCard({ onClose }: { onClose: () => void }) {
  const reduced = useReducedMotion() ?? false;
  const mobile = useViewMode() === "mobile";
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Snapshot the captured console/error log ONCE when the form opens.
  const capturedLog = useMemo(() => formatAll(), []);
  const errorCount = useMemo(() => getErrorCount(), []);

  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  // Technical details: pre-filled with the captured log when errors exist (so it
  // rides along by default), otherwise empty so the field reads as "paste here".
  const [details, setDetails] = useState(errorCount > 0 ? capturedLog : "");
  const [showDetails, setShowDetails] = useState(errorCount > 0);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Focus the textarea + wire Escape-to-close. Cleans up the auto-close timer.
  useEffect(() => {
    const raf = requestAnimationFrame(() => panelRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [onClose]);

  const canSend = message.trim().length > 0 && status !== "sending";

  async function submit() {
    if (!canSend) return;
    Audio.playSfx("click");
    setStatus("sending");
    setErrorMsg("");
    const res = await reportBug({
      message,
      consoleLog: showDetails ? details : "",
      email,
    });
    if (res.ok) {
      setStatus("sent");
      Audio.playSfx("win");
      // Linger on the thank-you, then close.
      closeTimer.current = setTimeout(onClose, 1800);
    } else {
      setStatus("error");
      setErrorMsg(res.error || "Something went wrong. Please try again.");
    }
  }

  return (
    <motion.div
      className="report-bug-card"
      ref={panelRef}
      tabIndex={-1}
      initial={reduced ? { opacity: 0 } : { scale: 0.86, y: -40, opacity: 0 }}
      animate={reduced ? { opacity: 1 } : { scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 0.92, opacity: 0 }}
      transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 240, damping: 20 }}
    >
      <button className="report-bug-close" onClick={onClose} aria-label="Close" type="button">
        ✕
      </button>

      {status === "sent" ? (
        <div className="report-bug-done" role="status" aria-live="polite">
          <div className="report-bug-done-icon" aria-hidden="true">💜</div>
          <h2 className="report-bug-title">Thank you!</h2>
          <p className="report-bug-sub">
            Your report was sent. It really helps make Lumo better.
          </p>
        </div>
      ) : (
        <>
          <span className="report-bug-kicker" aria-hidden="true">🐛 Report a bug</span>
          <h2 className="report-bug-title">Something not working?</h2>
          <p className="report-bug-sub">
            Tell us what happened — the more detail, the faster we can fix it.
          </p>

          <label className="report-bug-label" htmlFor="report-bug-message">
            What went wrong?
          </label>
          <textarea
            id="report-bug-message"
            className="report-bug-textarea"
            placeholder="e.g. The game froze after I called Cabo on round 2…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={4000}
            rows={mobile ? 4 : 5}
            autoFocus
          />

          <label className="report-bug-label" htmlFor="report-bug-email">
            Your email <span className="report-bug-opt">(optional — so we can follow up)</span>
          </label>
          <input
            id="report-bug-email"
            className="report-bug-input"
            type="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
          />

          <div className="report-bug-details">
            <button
              type="button"
              className="report-bug-details-toggle"
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
            >
              <span>{showDetails ? "▾" : "▸"} Technical details</span>
              {errorCount > 0 && (
                <span className="report-bug-badge" title="Errors detected on this device">
                  ⚠ {errorCount} error{errorCount === 1 ? "" : "s"} detected
                </span>
              )}
            </button>
            {showDetails && (
              <>
                <p className="report-bug-hint">
                  {errorCount > 0
                    ? "We attached the recent errors automatically. You can edit this or paste anything from the browser console."
                    : "Optional — paste any error from the browser console here."}
                </p>
                <textarea
                  id="report-bug-details"
                  aria-label="Technical details"
                  className="report-bug-textarea report-bug-log"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Paste console output / error text here…"
                  rows={mobile ? 4 : 6}
                  spellCheck={false}
                />
              </>
            )}
          </div>

          {status === "error" && (
            <p className="report-bug-error" role="alert">{errorMsg}</p>
          )}

          <div className="report-bug-actions">
            <button type="button" className="btn report-bug-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary report-bug-send"
              onClick={submit}
              disabled={!canSend}
              aria-label={
                status === "sending"
                  ? "Sending bug report…"
                  : message.trim().length === 0
                    ? "Send report (describe the problem first)"
                    : "Send report"
              }
            >
              {status === "sending" ? "Sending…" : "Send report"}
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
