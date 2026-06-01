/**
 * Card-skin state — the user-selectable visual style applied to every
 * playing card. Mirrors `theme.ts` exactly:
 *
 *   load → get → set → useCardSkin   + a `cabo:cardskin-change` custom event
 *
 * Persistence: localStorage under `cabo:cardskin`. Reactivity through a
 * window-level custom event so components that need it can subscribe
 * without pulling in Zustand for what is purely a local visual preference.
 *
 * Adding a new skin is one entry here + one entry in `ui/cardSkins.tsx`.
 */
import { useEffect, useState } from "react";

export type CardSkin =
  | "classic"
  | "royal"
  | "neon"
  | "handdrawn"
  | "minimalist"
  | "mclaren_papaya"
  | "mclaren_senna"
  // Mode-exclusive: forced on in Cabo Evolved, never offered in the picker
  // (intentionally absent from VALID + the ThemePicker SKINS list).
  | "evolved";

export const DEFAULT_SKIN: CardSkin = "classic";

const STORAGE_KEY = "cabo:cardskin";
const EVENT_NAME = "cabo:cardskin-change";
const VALID: ReadonlyArray<CardSkin> = [
  "classic",
  "royal",
  "neon",
  "handdrawn",
  "minimalist",
  "mclaren_papaya",
  "mclaren_senna",
];

export const SKIN_LABELS: Record<CardSkin, string> = {
  classic:         "Classic",
  royal:           "Royal",
  neon:            "Neon",
  handdrawn:       "Hand-drawn",
  minimalist:      "Minimalist",
  mclaren_papaya:  "McLaren Papaya",
  mclaren_senna:   "Senna Monaco '24",
  evolved:         "Cabo Evolved",
};

function loadFromStorage(): CardSkin {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && VALID.includes(raw as CardSkin)) return raw as CardSkin;
  } catch { /* ignore */ }
  return DEFAULT_SKIN;
}

let current: CardSkin = loadFromStorage();

export function getCardSkin(): CardSkin {
  return current;
}

export function setCardSkin(s: CardSkin): void {
  if (!VALID.includes(s)) return;
  current = s;
  try { localStorage.setItem(STORAGE_KEY, s); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent<CardSkin>(EVENT_NAME, { detail: s }));
}

/** Subscribe to the current card skin; re-renders the component on change. */
export function useCardSkin(): CardSkin {
  const [skin, setLocal] = useState<CardSkin>(current);
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<CardSkin>).detail;
      if (detail && VALID.includes(detail)) setLocal(detail);
    }
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);
  return skin;
}
