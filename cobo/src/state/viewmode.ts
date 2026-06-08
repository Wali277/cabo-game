/**
 * View-mode preference — toggles between the default desktop layout and the
 * phone-optimised layout (compact spatial table, top-bar overflow menu,
 * larger tap targets).
 *
 * Persistence: an explicit choice is saved in localStorage under
 * `cabo:viewmode`. Reactivity: components subscribe via `useViewMode()`; the
 * mode is recomputed on the explicit toggle AND whenever the viewport crosses
 * the phone breakpoint (resize / orientation change).
 *
 * IMPORTANT resolution rule: a NARROW viewport (≤820px) is ALWAYS treated as
 * mobile, regardless of any saved preference. The desktop layout overflows a
 * phone screen, and a stale `desktop` preference must never trap a phone user
 * in the unusable desktop layout (this was the cause of phones rendering the
 * giant desktop table). A saved preference therefore only applies on wider
 * screens — e.g. a desktop user previewing the phone layout, or choosing
 * desktop on a tablet.
 */
import { useSyncExternalStore } from "react";
import { getDeviceClass, getOrientation } from "./deviceClass";

export type ViewMode = "desktop" | "mobile";
export const DEFAULT_VIEW_MODE: ViewMode = "desktop";

const STORAGE_KEY = "cabo:viewmode";
const EVENT_NAME = "cabo:viewmode-change";
const VALID: ReadonlyArray<ViewMode> = ["desktop", "mobile"];
/** Phones (and most phone-width windows) sit at/under this width. */
const NARROW_QUERY = "(max-width: 820px)";

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  desktop: "Desktop layout",
  mobile:  "Phone layout",
};

function mediaMatches(query: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/** True when launched as an installed PWA — iOS home-screen ("standalone") or a
 *  display-mode:standalone window. These have no browser chrome, so we lean on
 *  the full-bleed mobile layout to use the extra space. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      (navigator as { standalone?: boolean }).standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches
    );
  } catch {
    return false;
  }
}

function readSaved(): ViewMode | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && VALID.includes(raw as ViewMode)) return raw as ViewMode;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * The effective view mode for the current viewport.
 *  0. DEVICE-CLASS layer (see deviceClass.ts): genuine touch devices resolve by
 *     orientation regardless of any saved preference —
 *       phone (either orientation) → mobile,
 *       tablet-portrait            → mobile,
 *       tablet-landscape           → desktop.
 *     This makes the resolution-table contract hold for real phones/tablets.
 *  1. Narrow viewport → always "mobile" (overrides any saved preference).
 *  2. Otherwise an explicit saved preference wins.
 *  3. First visit on a wider screen: a coarse (touch) pointer implies a
 *     tablet that prefers the phone layout; otherwise desktop.
 */
function resolveMode(): ViewMode {
  // Device-class layer first: a genuine phone/tablet (touch-first) is driven by
  // its physical class + orientation, never trapped by a stale saved pref. A
  // non-touch device returns "desktop" here, so we fall through to the existing
  // width/standalone/preference logic below (manual phone toggle still works).
  const device = getDeviceClass();
  if (device === "phone") return "mobile";
  if (device === "tablet") {
    return getOrientation() === "landscape" ? "desktop" : "mobile";
  }

  if (mediaMatches(NARROW_QUERY)) return "mobile";
  // Installed on a touch device (iPhone/iPad/Android home screen): always use
  // the spacious full-bleed layout, even over a stale "desktop" preference.
  // Desktop PWA installs (fine pointer) are left alone.
  if (isStandalone() && mediaMatches("(pointer: coarse)")) return "mobile";
  const saved = readSaved();
  if (saved) return saved;
  if (mediaMatches("(pointer: coarse)")) return "mobile";
  return DEFAULT_VIEW_MODE;
}

export function getViewMode(): ViewMode {
  return resolveMode();
}

export function setViewMode(m: ViewMode): void {
  if (!VALID.includes(m)) return;
  try {
    localStorage.setItem(STORAGE_KEY, m);
  } catch {
    /* ignore */
  }
  // resolveMode() may still pin "mobile" on a narrow screen — that's intended;
  // the toggle is hidden on phones, so this only meaningfully fires on wide
  // screens where the saved preference applies.
  window.dispatchEvent(new CustomEvent<ViewMode>(EVENT_NAME, { detail: m }));
}

/* ── Shared module-level store ────────────────────────────────────────────────
 * Like deviceClass.ts, `useViewMode()` is called by every `Card` and many other
 * components, so a full board would otherwise mount O(cards) duplicate
 * window/matchMedia listeners. Back the hook with a SINGLE module-level
 * subscription, ref-counted (installed on the first subscriber, removed on the
 * last). The mode is a primitive string, so its snapshot is trivially stable —
 * no object caching needed. `resolveMode()` is unchanged. */
let cachedMode: ViewMode =
  typeof window === "undefined" ? DEFAULT_VIEW_MODE : resolveMode();

const modeSubscribers = new Set<() => void>();
let modeListenersInstalled = false;
let narrowMql: MediaQueryList | null = null;
let orientationMql: MediaQueryList | null = null;

function recomputeMode(): void {
  const next = resolveMode();
  if (next === cachedMode) return; // unchanged → primitive identity stable
  cachedMode = next;
  for (const cb of modeSubscribers) cb();
}

function installModeListeners(): void {
  if (modeListenersInstalled || typeof window === "undefined") return;
  modeListenersInstalled = true;
  window.addEventListener(EVENT_NAME, recomputeMode);
  try {
    narrowMql = window.matchMedia(NARROW_QUERY);
    narrowMql.addEventListener("change", recomputeMode);
  } catch {
    /* matchMedia unavailable — fall back to the initial value */
  }
  try {
    // A tablet rotating between portrait/landscape flips the resolved mode
    // (tablet-portrait → mobile, tablet-landscape → desktop), so re-resolve
    // on orientation change too.
    orientationMql = window.matchMedia("(orientation: portrait)");
    orientationMql.addEventListener("change", recomputeMode);
  } catch {
    /* matchMedia unavailable — fall back to the initial value */
  }
  // Re-sync in case the viewport differs from the initial guess.
  recomputeMode();
}

function removeModeListeners(): void {
  if (!modeListenersInstalled || typeof window === "undefined") return;
  modeListenersInstalled = false;
  window.removeEventListener(EVENT_NAME, recomputeMode);
  try {
    narrowMql?.removeEventListener("change", recomputeMode);
  } catch {
    /* ignore */
  }
  try {
    orientationMql?.removeEventListener("change", recomputeMode);
  } catch {
    /* ignore */
  }
  narrowMql = null;
  orientationMql = null;
}

function subscribeMode(cb: () => void): () => void {
  modeSubscribers.add(cb);
  if (modeSubscribers.size === 1) installModeListeners();
  return () => {
    modeSubscribers.delete(cb);
    if (modeSubscribers.size === 0) removeModeListeners();
  };
}

function getModeSnapshot(): ViewMode {
  return cachedMode;
}

function getModeServerSnapshot(): ViewMode {
  return DEFAULT_VIEW_MODE;
}

/** Subscribe to the effective view mode; re-renders on the explicit toggle
 *  and whenever the viewport crosses the phone breakpoint. Backed by a SINGLE
 *  shared module-level subscription (one set of listeners for the whole app). */
export function useViewMode(): ViewMode {
  return useSyncExternalStore(
    subscribeMode,
    getModeSnapshot,
    getModeServerSnapshot,
  );
}
