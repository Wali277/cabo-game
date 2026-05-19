/**
 * Table-theme state — the user-selectable background that paints behind the
 * in-game table. Only applies on the `game` screen; menu/lobby always keep the
 * cosmic purple gradient defined on `body` in `index.css`.
 *
 * Persistence: localStorage under `cabo:theme` (matches the `cabo:*` convention
 * used by audio settings and the multiplayer session).
 *
 * Reactivity: components subscribe via `useTheme()`. Updates dispatched via a
 * custom event keep multiple subscribers in sync without pulling in Zustand
 * for what is purely a local visual preference.
 */
import { useEffect, useState } from "react";

export type TableTheme = "emerald" | "ocean" | "crimson" | "northern" | "cosmic";
export const DEFAULT_THEME: TableTheme = "emerald";

const STORAGE_KEY = "cabo:theme";
const EVENT_NAME = "cabo:theme-change";
const VALID: ReadonlyArray<TableTheme> = [
  "emerald", "ocean", "crimson", "northern", "cosmic",
];

/** Labels shown in the picker UI. */
export const THEME_LABELS: Record<TableTheme, string> = {
  emerald:  "Emerald Felt",
  ocean:    "Midnight Ocean",
  crimson:  "Royal Crimson",
  northern: "Northern Lights",
  cosmic:   "Cosmic Legacy",
};

/**
 * Map deprecated v2.14 theme IDs to their v2.15 replacements so anyone who
 * picked "velvet" / "aurora" before the rename lands on the equivalent new
 * theme transparently. Returns the same value if no migration is needed.
 */
function migrateLegacyId(v: string | null): string | null {
  if (v === "velvet") return "ocean";
  if (v === "aurora") return "northern";
  return v;
}

function loadFromStorage(): TableTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const migrated = migrateLegacyId(raw);
    // If we rewrote the value, persist the new ID so future loads are cheap
    // and so we don't keep migrating on every page open.
    if (migrated !== raw && migrated) {
      try { localStorage.setItem(STORAGE_KEY, migrated); } catch { /* ignore */ }
    }
    if (migrated && VALID.includes(migrated as TableTheme)) {
      return migrated as TableTheme;
    }
  } catch { /* ignore — fall back to default */ }
  return DEFAULT_THEME;
}

// Module-level current value so `getTheme()` is consistent across reads
// (and so newly-mounted components hydrate to the right value immediately).
let current: TableTheme = loadFromStorage();

export function getTheme(): TableTheme {
  return current;
}

export function setTheme(t: TableTheme): void {
  if (!VALID.includes(t)) return;
  current = t;
  try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent<TableTheme>(EVENT_NAME, { detail: t }));
}

/** Subscribe to the current theme; re-renders the component on change. */
export function useTheme(): TableTheme {
  const [theme, setLocal] = useState<TableTheme>(current);
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<TableTheme>).detail;
      if (detail && VALID.includes(detail)) setLocal(detail);
    }
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);
  return theme;
}
