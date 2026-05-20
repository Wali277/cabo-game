/**
 * View-mode preference — toggles between the default desktop layout and the
 * phone-optimised layout (single column, slide-up drawers, larger tap targets).
 *
 * Persistence: localStorage under `cabo:viewmode` (matches the `cabo:*`
 * convention used by audio / theme / mp session).
 *
 * Reactivity: components subscribe via `useViewMode()`. Updates dispatched via
 * a custom event keep multiple subscribers in sync without pulling in Zustand
 * for a purely-local visual preference. Mirrors `cobo/src/state/theme.ts`.
 *
 * Auto-detect: on a user's very first visit (no saved value), if the viewport
 * is narrow (≤820px) OR the primary pointer is coarse (touchscreen), the
 * mode defaults to "mobile" so phone users land on the right layout
 * automatically. Subsequent visits use whatever the user picked last —
 * the toggle in the main menu always wins.
 */
import { useEffect, useState } from "react";

export type ViewMode = "desktop" | "mobile";
export const DEFAULT_VIEW_MODE: ViewMode = "desktop";

const STORAGE_KEY = "cabo:viewmode";
const EVENT_NAME = "cabo:viewmode-change";
const VALID: ReadonlyArray<ViewMode> = ["desktop", "mobile"];

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  desktop: "Desktop layout",
  mobile:  "Phone layout",
};

/**
 * Heuristic for "this is a phone-sized device" used only when no preference
 * has ever been saved. Either condition is enough:
 *  - narrow viewport (max-width: 820px) — covers most phone portraits
 *  - coarse pointer — covers tablets + phones that are wider than 820px
 */
function autoDetect(): ViewMode | null {
  if (typeof window === "undefined") return null;
  try {
    const narrow = window.matchMedia("(max-width: 820px)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (narrow || coarse) return "mobile";
  } catch {
    /* matchMedia not available — fall through to desktop default */
  }
  return null;
}

function loadFromStorage(): ViewMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && VALID.includes(raw as ViewMode)) {
      return raw as ViewMode;
    }
    // First visit with no saved preference → try autodetect
    const guess = autoDetect();
    if (guess) {
      // Persist immediately so we don't redetect on later visits (the user's
      // explicit choice always wins from this point forward).
      try { localStorage.setItem(STORAGE_KEY, guess); } catch { /* ignore */ }
      return guess;
    }
  } catch {
    /* ignore — fall back to default */
  }
  return DEFAULT_VIEW_MODE;
}

// Module-level current value so `getViewMode()` is consistent across reads
// and newly-mounted components hydrate to the right value immediately.
let current: ViewMode = loadFromStorage();

export function getViewMode(): ViewMode {
  return current;
}

export function setViewMode(m: ViewMode): void {
  if (!VALID.includes(m)) return;
  current = m;
  try { localStorage.setItem(STORAGE_KEY, m); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent<ViewMode>(EVENT_NAME, { detail: m }));
}

/** Subscribe to the current view mode; re-renders the component on change. */
export function useViewMode(): ViewMode {
  const [mode, setLocal] = useState<ViewMode>(current);
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<ViewMode>).detail;
      if (detail && VALID.includes(detail)) setLocal(detail);
    }
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);
  return mode;
}
