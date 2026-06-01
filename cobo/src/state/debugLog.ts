/**
 * debugLog — a tiny, dependency-free, framework-agnostic diagnostics buffer.
 *
 * Purpose: let the game owner SEE what caused a runtime error and COPY it to
 * report it, INCLUDING on the live production site. Nothing here is gated
 * behind `import.meta.env.DEV` — it is intentionally production-safe.
 *
 * SECURITY: this is a hidden-information game. Callers must NEVER pass raw game
 * state, the Zustand store, `room:state` payloads, or any card / hidden-hand
 * values into the buffer. Only error messages, stacks, event names, action
 * TYPE strings, and non-sensitive connection metadata belong here. The global
 * capture records error/console text and connection events; note the console
 * patch also surfaces whatever React itself writes to a warning, but cards are
 * keyed by id/index (never by value) and production builds strip warning text,
 * so no hidden card value reaches the buffer in practice.
 *
 * Design: a bounded ring buffer (last ~200 entries) with O(1) push and a cheap
 * subscriber notification. No React, no per-frame work.
 */

export type DebugLevel = "error" | "warn" | "info";

export interface DebugEntry {
  id: number;
  /** epoch ms when the entry was recorded */
  t: number;
  level: DebugLevel;
  /** short origin tag, e.g. "react", "socket", "action", "window", "console" */
  source: string;
  message: string;
  /** optional extra context: a stack trace, location, or rejection detail */
  detail?: string;
}

const MAX_ENTRIES = 200;

const buffer: DebugEntry[] = [];
let nextId = 1;
let errorCount = 0;
/** Bumped on every push/clear. Lets React's useSyncExternalStore cache a stable
 *  snapshot (return the same array identity until the version actually changes),
 *  which avoids the "getSnapshot should be cached" infinite-loop warning. */
let version = 0;
const subscribers = new Set<() => void>();

function notify() {
  // Subscriber callbacks must never break the logger. Swallow anything.
  for (const fn of subscribers) {
    try {
      fn();
    } catch {
      /* ignore subscriber errors */
    }
  }
}

/**
 * Record a diagnostic entry. Cheap and never throws. `detail` is optional and
 * is where stacks / locations go (kept separate so the panel can collapse it).
 */
export function logDebug(
  level: DebugLevel,
  source: string,
  message: string,
  detail?: string,
): void {
  const entry: DebugEntry = {
    id: nextId++,
    t: Date.now(),
    level,
    source,
    message: message == null ? "" : String(message),
    detail: detail == null ? undefined : String(detail),
  };
  buffer.push(entry);
  if (entry.level === "error") errorCount++;
  // Trim from the front so memory stays bounded. If the dropped entry was an
  // error, decrement the badge so it never exceeds the error rows still visible
  // in the buffer.
  if (buffer.length > MAX_ENTRIES) {
    const dropped = buffer.shift();
    if (dropped?.level === "error" && errorCount > 0) errorCount--;
  }
  version++;
  notify();
}

/** A snapshot copy of the current entries (oldest → newest). */
export function getEntries(): DebugEntry[] {
  return buffer.slice();
}

/** Monotonic change counter (push/clear). Used as a snapshot cache key. */
export function getVersion(): number {
  return version;
}

/** Number of `error`-level entries recorded since the last `clear()`. */
export function getErrorCount(): number {
  return errorCount;
}

/** Empty the buffer and reset the error badge count. */
export function clear(): void {
  buffer.length = 0;
  errorCount = 0;
  version++;
  notify();
}

/**
 * Subscribe to buffer changes. Returns an unsubscribe function. The callback
 * fires on every push and on clear; callers that only need the badge can read
 * `getErrorCount()` instead of subscribing.
 */
export function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

// ── Global capture ─────────────────────────────────────────────────────────

let captureInstalled = false;
/** Re-entrancy guard so a patched console called from inside the logger (or a
 *  subscriber) can never recurse into itself. */
let inConsolePatch = false;

/**
 * Safely turn arbitrary console arguments into a single string. Never throws:
 * Errors expose message + stack, objects are JSON-stringified where possible,
 * and anything that resists stringification falls back to a placeholder.
 */
function stringifyArgs(args: unknown[]): string {
  const parts: string[] = [];
  for (const a of args) {
    if (typeof a === "string") {
      parts.push(a);
    } else if (a instanceof Error) {
      parts.push(a.stack ? `${a.message}\n${a.stack}` : a.message);
    } else if (a == null) {
      parts.push(String(a));
    } else {
      try {
        parts.push(JSON.stringify(a));
      } catch {
        try {
          parts.push(String(a));
        } catch {
          parts.push("[unserialisable]");
        }
      }
    }
  }
  return parts.join(" ");
}

/**
 * Install global error/console capture. Idempotent — safe to call more than
 * once; only the first call wires anything up. Must run BEFORE React renders so
 * crashes during the first paint are still recorded.
 */
export function installDebugCapture(): void {
  if (captureInstalled) return;
  if (typeof window === "undefined") return;
  captureInstalled = true;

  window.addEventListener("error", (e: ErrorEvent) => {
    const loc =
      e.filename != null
        ? `${e.filename}:${e.lineno ?? 0}:${e.colno ?? 0}`
        : undefined;
    const stack = e.error instanceof Error ? e.error.stack : undefined;
    const detail = [loc, stack].filter(Boolean).join("\n") || undefined;
    logDebug("error", "window", e.message || "Uncaught error", detail);
  });

  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason = e.reason;
    let message = "Unhandled promise rejection";
    let detail: string | undefined;
    if (reason instanceof Error) {
      message = reason.message || message;
      detail = reason.stack;
    } else if (reason != null) {
      message = stringifyArgs([reason]);
    }
    logDebug("error", "promise", message, detail);
  });

  // Monkey-patch console.error / console.warn so they ALSO land in the buffer,
  // then forward to the original implementation. The re-entrancy guard ensures
  // that if the logger or a subscriber itself calls console.*, we forward only
  // (no second buffer push, no infinite loop).
  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    if (!inConsolePatch) {
      inConsolePatch = true;
      try {
        logDebug("error", "console", stringifyArgs(args));
      } catch {
        /* never let logging break console */
      } finally {
        inConsolePatch = false;
      }
    }
    origError(...args);
  };

  console.warn = (...args: unknown[]) => {
    if (!inConsolePatch) {
      inConsolePatch = true;
      try {
        logDebug("warn", "console", stringifyArgs(args));
      } catch {
        /* never let logging break console */
      } finally {
        inConsolePatch = false;
      }
    }
    origWarn(...args);
  };
}

/** Format a single entry as one plain-text block (used by the "Copy" buttons). */
export function formatEntry(e: DebugEntry): string {
  const ts = new Date(e.t).toLocaleString();
  const head = `[${ts}] ${e.level.toUpperCase()} (${e.source}) ${e.message}`;
  return e.detail ? `${head}\n${e.detail}` : head;
}

/** Format the whole buffer as a plain-text dump (newest first). */
export function formatAll(): string {
  return getEntries()
    .slice()
    .reverse()
    .map(formatEntry)
    .join("\n\n");
}

/**
 * Copy text to the clipboard, resolving to whether it actually succeeded. Falls
 * back to a hidden-textarea + execCommand path for insecure origins (e.g. LAN
 * http on a phone) where navigator.clipboard is unavailable — so the UI never
 * shows a false "Copied!" confirmation.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
