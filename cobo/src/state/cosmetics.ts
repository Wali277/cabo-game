/**
 * ────────────────────────────────────────────────────────────────────────────
 * COSMETICS CATALOG (Phase 6 — the Styles store)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The DISPLAY catalog for the token store: every purchasable / equippable card
 * skin and table wallpaper, in the order they appear in the store grid, with a
 * label (from `SKIN_LABELS` / `THEME_LABELS`) and a DISPLAY price in tokens.
 *
 * ⚠️ KEEP IN SYNC WITH THE SERVER. The server (`server/src/auth/cosmetics.ts`,
 * used by the `/account/purchase` + `/account/equip` endpoints) owns the
 * AUTHORITATIVE catalog — ids, prices, and which items are free-by-default. The
 * price shown here is DISPLAY-ONLY: the server re-checks the price, the caller's
 * token balance, and ownership on every `/account/purchase`. The parity test
 * `server/scripts/check-cosmetics.ts` asserts the client and server catalogs
 * match (kind + id + price + free), so any edit here MUST mirror the server.
 *
 *   - Free items (`free: true`) are owned by every account by default — they
 *     never cost a token and are immediately equippable.
 *   - `evolved` is intentionally EXCLUDED from both lists: it's a mode-forced
 *     render override, never a chosen/purchasable cosmetic.
 */
import { SKIN_LABELS, type CardSkin } from "./cardskin";
import { THEME_LABELS, type TableTheme } from "./theme";

/** The two cosmetic categories the store sells. */
export type CosmeticKind = "skin" | "wallpaper";

export interface CosmeticItem {
  kind: CosmeticKind;
  /** The skin / theme id (matches `CardSkin` / `TableTheme` ids). */
  id: string;
  /** Display label, pulled from the existing label maps. */
  label: string;
  /** Display price in tokens (0 for free items). Server is authoritative. */
  price: number;
  /** Owned-by-default (free) — never costs a token. */
  free: boolean;
  /** If set, this item is a LEVEL REWARD: not free and not token-purchasable —
   *  it's unlocked automatically on reaching this level (the server's grant_xp
   *  adds it to unlocked_skins). The store shows a "Reach level N" lock until
   *  the id appears in the profile's unlocked_* array. */
  levelUnlock?: number;
}

// ── Card skins ───────────────────────────────────────────────────────────────
// Order mirrors the in-game picker (ThemePicker `SKINS`). `evolved` excluded.
const SKIN_PRICES: ReadonlyArray<{
  id: CardSkin;
  price: number;
  free: boolean;
  levelUnlock?: number;
}> = [
  { id: "classic",        price: 0, free: true },
  // "Recolor" skin (Phase 7) — a LEVEL-2 REWARD (not free, not buyable). Unlocked
  // by grant_xp on reaching level 2, then tinted via the player's
  // custom_card_colors. Mirrors the server catalog entry; the parity test asserts
  // this pair (id + price + free + levelUnlock) matches.
  { id: "custom",         price: 0, free: false, levelUnlock: 2 },
  { id: "royal",          price: 1, free: false },
  { id: "neon",           price: 1, free: false },
  // Premium art-deco skin — 2 tokens.
  { id: "deco",           price: 2, free: false },
  // Legendary minimalist set (ivory/eclipse replace minimalist/handdrawn). LAST.
  { id: "ivory",          price: 1, free: false },
  { id: "eclipse",        price: 1, free: false },
  { id: "vesica",         price: 2, free: false },
  { id: "orbit",          price: 2, free: false },
];

// ── Table wallpapers ─────────────────────────────────────────────────────────
// Order mirrors the in-game picker (ThemePicker `THEMES`).
const WALLPAPER_PRICES: ReadonlyArray<{ id: TableTheme; price: number; free: boolean }> = [
  // Horizon is the FREE default wallpaper (owned by everyone from signup). Emerald
  // and Crimson are now token unlocks (they used to be the free defaults).
  { id: "horizon",  price: 0, free: true },
  { id: "emerald",  price: 1, free: false },
  { id: "crimson",  price: 1, free: false },
  { id: "ocean",    price: 1, free: false },
  { id: "northern", price: 1, free: false },
  { id: "cosmic",   price: 1, free: false },
  { id: "aquarium", price: 1, free: false },
  // Lumo live wallpapers (Lagoon / Aurora Indigo) — additive, placed LAST. 2 tokens.
  { id: "lagoon",       price: 2, free: false },
  { id: "auroraindigo", price: 2, free: false },
];

/** Ordered card-skin catalog for the store grid. */
export const skinCatalog: ReadonlyArray<CosmeticItem> = SKIN_PRICES.map((s) => ({
  kind: "skin",
  id: s.id,
  label: SKIN_LABELS[s.id],
  price: s.price,
  free: s.free,
  ...(s.levelUnlock != null ? { levelUnlock: s.levelUnlock } : {}),
}));

/** Ordered table-wallpaper catalog for the store grid. */
export const wallpaperCatalog: ReadonlyArray<CosmeticItem> = WALLPAPER_PRICES.map((w) => ({
  kind: "wallpaper",
  id: w.id,
  label: THEME_LABELS[w.id],
  price: w.price,
  free: w.free,
}));

/** Both catalogs concatenated (skins first), for tests / lookups. */
export const cosmeticsCatalog: ReadonlyArray<CosmeticItem> = [
  ...skinCatalog,
  ...wallpaperCatalog,
];

/** Find a catalog entry by kind + id, or `undefined` for an unknown pair. */
export function findCosmetic(
  kind: CosmeticKind,
  id: string,
): CosmeticItem | undefined {
  const list = kind === "skin" ? skinCatalog : wallpaperCatalog;
  return list.find((c) => c.id === id);
}

/** The DISPLAY price of a cosmetic (0 when free / unknown). Server is the
 *  source of truth; this is only for rendering the price chip. */
export function priceOf(kind: CosmeticKind, id: string): number {
  return findCosmetic(kind, id)?.price ?? 0;
}
