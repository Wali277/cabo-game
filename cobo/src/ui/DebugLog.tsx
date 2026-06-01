import { useState, useCallback, useMemo, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  subscribe,
  getEntries,
  getErrorCount,
  getVersion,
  clear,
  formatAll,
  copyToClipboard,
  type DebugEntry,
} from "../state/debugLog";

/** Local time as HH:MM:SS for an entry timestamp. */
function fmtTime(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Never resubscribe (used by the entries hook when the panel is closed). */
const noopSubscribe = () => () => {};

// Cached entries snapshot for useSyncExternalStore: getEntries() returns a fresh
// array each call, which would loop the store. We memoise on the buffer version
// so the same array identity is returned until the buffer actually changes.
let cachedVersion = -1;
let cachedEntries: DebugEntry[] = [];
function getEntriesSnapshot(): DebugEntry[] {
  const v = getVersion();
  if (v !== cachedVersion) {
    cachedVersion = v;
    cachedEntries = getEntries();
  }
  return cachedEntries;
}

/**
 * Floating Debug / Error Log overlay.
 *
 * A small bottom-LEFT toggle (the other FABs all live bottom-right, so this
 * corner is free and never collides). A red badge shows the error count when
 * non-zero. Opening reveals a panel listing buffer entries newest-first with a
 * color-coded level chip and an expandable stack/detail.
 *
 * Perf: while CLOSED we subscribe only to refresh the cheap error-count badge.
 * The full entry list is read (and re-read on push) ONLY while the panel is
 * open, so closed state costs nothing per frame.
 */
export function DebugLog() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  // Badge: subscribe to the buffer but read only the cheap error count (a stable
  // primitive snapshot). This is the only always-on subscription.
  const errors = useSyncExternalStore(subscribe, getErrorCount, getErrorCount);

  // Entries: subscribe ONLY while the panel is open. When closed we pass a no-op
  // subscriber so no work happens per push; the snapshot is version-cached so it
  // never loops. This keeps closed-state cost at just the badge above.
  const entriesSubscribe = open ? subscribe : noopSubscribe;
  const entries = useSyncExternalStore(
    entriesSubscribe,
    getEntriesSnapshot,
    getEntriesSnapshot,
  );

  const toggleExpand = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCopyAll = useCallback(() => {
    void copyToClipboard(formatAll()).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  }, []);

  const handleClear = useCallback(() => {
    clear();
    setExpanded(new Set());
  }, []);

  // Newest first. Memoised so we only re-reverse when the buffer changes.
  const ordered = useMemo(() => entries.slice().reverse(), [entries]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="debug-panel"
            className="debug-panel"
            initial={{ opacity: 0, y: 20, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
          >
            <div className="debug-header">
              <span className="debug-title">Debug log</span>
              <div className="debug-header-actions">
                <button
                  className="debug-btn"
                  onClick={handleCopyAll}
                  disabled={ordered.length === 0}
                >
                  {copied ? "Copied!" : "Copy all"}
                </button>
                <button
                  className="debug-btn"
                  onClick={handleClear}
                  disabled={ordered.length === 0}
                >
                  Clear
                </button>
                <button
                  className="debug-close"
                  onClick={() => setOpen(false)}
                  aria-label="Close debug log"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="debug-list">
              {ordered.length === 0 ? (
                <div className="debug-empty">No log entries yet.</div>
              ) : (
                ordered.map((e) => (
                  <div key={e.id} className={`debug-entry lvl-${e.level}`}>
                    <button
                      className="debug-entry-head"
                      onClick={() => e.detail && toggleExpand(e.id)}
                      aria-expanded={expanded.has(e.id)}
                    >
                      <span className="debug-time">{fmtTime(e.t)}</span>
                      <span className={`debug-chip chip-${e.level}`}>
                        {e.level}
                      </span>
                      <span className="debug-source">{e.source}</span>
                      <span className="debug-message">{e.message}</span>
                      {e.detail && (
                        <span className="debug-caret">
                          {expanded.has(e.id) ? "▾" : "▸"}
                        </span>
                      )}
                    </button>
                    {e.detail && expanded.has(e.id) && (
                      <pre className="debug-detail">{e.detail}</pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        className={`debug-toggle ${open ? "open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close debug log" : "Open debug log"}
        title="Debug log"
      >
        <span className="debug-toggle-icon">🐞</span>
        {!open && errors > 0 && (
          <span className="debug-badge">{errors > 99 ? "99+" : errors}</span>
        )}
      </button>
    </>
  );
}
