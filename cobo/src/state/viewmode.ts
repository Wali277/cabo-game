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
import { useEffect, useState } from "react";

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
 *  1. Narrow viewport → always "mobile" (overrides any saved preference).
 *  2. Otherwise an explicit saved preference wins.
 *  3. First visit on a wider screen: a coarse (touch) pointer implies a
 *     tablet that prefers the phone layout; otherwise desktop.
 */
function resolveMode(): ViewMode {
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

/** Subscribe to the effective view mode; re-renders on the explicit toggle
 *  and whenever the viewport crosses the phone breakpoint. */
export function useViewMode(): ViewMode {
  const [mode, setMode] = useState<ViewMode>(() => resolveMode());
  useEffect(() => {
    const update = () => setMode(resolveMode());
    window.addEventListener(EVENT_NAME, update);
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia(NARROW_QUERY);
      mq.addEventListener("change", update);
    } catch {
      /* matchMedia unavailable — fall back to the initial value */
    }
    // Re-sync after mount in case the viewport differs from the initial guess.
    update();
    return () => {
      window.removeEventListener(EVENT_NAME, update);
      try {
        mq?.removeEventListener("change", update);
      } catch {
        /* ignore */
      }
    };
  }, []);
  return mode;
}
