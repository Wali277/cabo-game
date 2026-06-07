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
  // FREE "Recolor" skin (Phase 7): a base face/back the player tints via their
  // own `custom_card_colors` (body + border). A valid, selectable skin — the
  // tint is layered at render time in Card.tsx, the base lives in cardSkins.tsx.
  | "custom"
  | "royal"
  | "neon"
  // Premium art-deco skin (gold/emerald/crimson back) — 2-token unlock.
  | "deco"
  // Legendary two-tone minimalist set (ported from the approved skin-preview
  // artwork). `ivory` replaces the retired `minimalist`, `eclipse` replaces the
  // retired `handdrawn`; `vesica` + `orbit` are new editions.
  | "ivory"
  | "eclipse"
  | "vesica"
  | "orbit"
  // Mode-exclusive: forced on in Lumo Evolved, never offered in the picker
  // (intentionally absent from VALID + the ThemePicker SKINS list).
  | "evolved";

export const DEFAULT_SKIN: CardSkin = "classic";

/**
 * Default body + border for the FREE "Custom" recolor skin — used as the BASE
 * (in `ui/cardSkins.tsx`) and the render-time FALLBACK (in `ui/Card.tsx`) until
 * the player has tinted their own (`profile.custom_card_colors` is null/missing).
 * Lives here (a pure module) so both the style table and the renderer share one
 * source of truth. Classic-like banana/ink so an untinted Custom card still
 * looks finished.
 */
export const CUSTOM_SKIN_DEFAULTS = {
  body: "#ffd86b", // BODY — card face + the back's LUMO pill chip
  border: "#1c1d2b", // BORDER — frame, the back background + the LUMO text
} as const;

const STORAGE_KEY = "cabo:cardskin";
const EVENT_NAME = "cabo:cardskin-change";
const VALID: ReadonlyArray<CardSkin> = [
  "classic",
  "custom",
  "royal",
  "neon",
  "deco",
  // Legendary set last, after `deco`.
  "ivory",
  "eclipse",
  "vesica",
  "orbit",
];

export const SKIN_LABELS: Record<CardSkin, string> = {
  classic:         "Classic",
  custom:          "Custom",
  royal:           "Royal",
  neon:            "Neon",
  deco:            "Art Deco",
  ivory:           "Ivory",
  eclipse:         "Eclipse",
  vesica:          "Vesica",
  orbit:           "Orbit",
  evolved:         "Lumo Evolved",
};

/**
 * Legacy id → new id remap. The retired `minimalist` / `handdrawn` skins were
 * replaced by `ivory` / `eclipse`. A player who owned (or had equipped) a legacy
 * skin must resolve to its successor rather than clamp to the default — so no
 * purchase is lost. Used by `coerceSkin` (profile/active_skin) and
 * `loadFromStorage` (the local card-skin preference). Mirrors the DB migration
 * `supabase/migrations/0008_skin_rename.sql`.
 */
const LEGACY_SKIN_ALIASES: Record<string, CardSkin> = {
  minimalist: "ivory",
  handdrawn: "eclipse",
};

/**
 * Type guard: is `v` a user-selectable card skin? VALID intentionally EXCLUDES
 * `evolved` (a mode-forced render override, never a chosen skin), so a profile
 * that somehow stored `active_skin: "evolved"` clamps to the default rather
 * than locking the player into the Evolved face outside an Evolved game.
 */
export function isValidSkin(v: string): v is CardSkin {
  return VALID.includes(v as CardSkin);
}

/**
 * Coerce an arbitrary stored/profile value to a valid skin: returns it when
 * valid, otherwise falls back to `DEFAULT_SKIN`. Tolerates null/undefined so
 * callers can pass `profile.active_skin` directly.
 */
export function coerceSkin(v: string | null | undefined): CardSkin {
  if (v == null) return DEFAULT_SKIN;
  if (isValidSkin(v)) return v;
  // A retired skin id (minimalist/handdrawn) maps forward to its successor
  // BEFORE we fall back to the default, so legacy owners keep their skin.
  const alias = LEGACY_SKIN_ALIASES[v];
  return alias ?? DEFAULT_SKIN;
}

function loadFromStorage(): CardSkin {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Route through coerceSkin so a stored legacy id (minimalist/handdrawn)
    // resolves to its successor (ivory/eclipse) instead of clamping to classic.
    if (raw) return coerceSkin(raw);
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
