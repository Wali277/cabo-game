// =============================================================================
// reportBug.ts — client side of the in-app "Report a bug" form.
// -----------------------------------------------------------------------------
// Thin REST helper that POSTs a report to the SAME Node server that serves
// sockets/auth (reuse serverUrl() — never hardcode localhost). Auth is OPTIONAL:
// if the player is signed in we attach their access token so the report is
// attributed to their account server-side; guests can report too.
//
// The endpoint also captures useful, NON-SENSITIVE diagnostics automatically
// (app version, current screen, viewport, error count) so the report is
// actionable without the user knowing any technical details. We deliberately do
// NOT attach raw game/store state — this is a hidden-information game (see the
// SECURITY note in state/debugLog.ts).
// =============================================================================
import { serverUrl } from "./mp";
import { getAccessToken } from "./auth";
import { useStore } from "./store";
import { getErrorCount } from "./debugLog";

// Keep in sync with cobo/package.json "version". Diagnostics-only — a slight
// drift is harmless; it just labels which build a report came from.
export const APP_VERSION = "3.0.0";

// Client-side caps so the payload stays comfortably under the server's 16kb
// JSON limit. The server truncates again (never trusts these), but capping here
// avoids a confusing 413 on a huge console dump.
const MAX_MESSAGE = 4000;
const MAX_CONSOLE = 6000;

export interface BugReportInput {
  /** The user's description (required). */
  message: string;
  /** Optional captured console/error log text (auto-filled from debugLog). */
  consoleLog?: string;
  /** Optional contact address so the owner can follow up. */
  email?: string;
}

export interface BugReportResult {
  ok: boolean;
  error?: string;
}

/** Small, non-sensitive diagnostics object stored alongside the report. */
function gatherMeta(): Record<string, unknown> {
  const st = useStore.getState();
  const meta: Record<string, unknown> = {
    mode: st.mode ?? null,
    mpCode: st.mp?.code ?? null,
    errorCount: getErrorCount(),
  };
  try {
    meta.viewport = `${window.innerWidth}x${window.innerHeight}`;
    meta.dpr = window.devicePixelRatio;
    meta.lang = navigator.language;
    meta.path = window.location.pathname;
    meta.mobileMode = document.body.classList.contains("mobile-mode");
  } catch {
    /* window/navigator unavailable — meta is best-effort */
  }
  return meta;
}

/**
 * Submit a bug report. Resolves to `{ ok }` and never throws — a network failure
 * becomes a friendly `{ ok:false, error }` the caller can show.
 */
export async function reportBug(input: BugReportInput): Promise<BugReportResult> {
  const base = serverUrl();
  const message = (input.message ?? "").trim().slice(0, MAX_MESSAGE);
  const consoleLog = (input.consoleLog ?? "").slice(0, MAX_CONSOLE);
  const email = (input.email ?? "").trim().slice(0, 200);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Optional identity — best-effort; a guest simply has no token.
  try {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* not signed in / token unavailable → guest report */
  }

  const body = {
    message,
    consoleLog: consoleLog || undefined,
    email: email || undefined,
    appVersion: APP_VERSION,
    screen: useStore.getState().screen,
    meta: gatherMeta(),
  };

  try {
    const res = await fetch(`${base}/api/report-bug`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Partial<BugReportResult>;
    if (typeof data.ok === "boolean") return data as BugReportResult;
    return { ok: res.ok, error: data.error };
  } catch {
    return {
      ok: false,
      error: "Couldn't reach the server. Check your connection and try again.",
    };
  }
}
