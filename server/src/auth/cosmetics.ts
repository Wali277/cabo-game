// =============================================================================
// auth/cosmetics.ts — SERVER-AUTHORITATIVE cosmetics catalog (Phase 6 store).
// -----------------------------------------------------------------------------
// The single source of truth for what cosmetics exist and what they COST. The
// /account/purchase + /account/equip routes validate against this and pass the
// authoritative price to purchase_cosmetic — the client never sends a price.
//
// The CLIENT mirror lives at cobo/src/state/cosmetics.ts and MUST stay identical
// (ids + prices). `evolved` is intentionally absent (a mode-forced render
// override, never a buyable skin). The free defaults (classic / emerald /
// crimson) match the unlocked_* DB defaults in 0001 and are NOT purchasable.
// =============================================================================

export type CosmeticKind = "skin" | "wallpaper";

export interface CosmeticItem {
  kind: CosmeticKind;
  id: string;
  /** Token cost. 0 for free defaults (which are not purchasable). */
  price: number;
  /** Owned by every account from signup (matches the 0001 unlocked_* defaults). */
  free: boolean;
  /** If set, this item is a LEVEL REWARD: not free and NOT token-purchasable —
   *  it is granted automatically by public.grant_xp on reaching this level. The
   *  purchase route rejects these (you can't buy your way past the gate). */
  levelUnlock?: number;
}

export const COSMETICS: readonly CosmeticItem[] = [
  // ── Card skins ──────────────────────────────────────────────────────────
  { kind: "skin", id: "classic",        price: 0, free: true },
  // The "Recolor" skin (Phase 7) — a LEVEL-2 REWARD (not free, not buyable).
  // grant_xp adds it to unlocked_skins at level 2; then it's tinted via the
  // player's custom_card_colors (saved through /account/card-colors).
  { kind: "skin", id: "custom",         price: 0, free: false, levelUnlock: 2 },
  { kind: "skin", id: "royal",          price: 1, free: false },
  { kind: "skin", id: "neon",           price: 1, free: false },
  // Premium art-deco skin — 2 tokens.
  { kind: "skin", id: "deco",           price: 2, free: false },
  // Legendary minimalist set (ivory/eclipse replace the retired
  // minimalist/handdrawn; vesica/orbit are new). Placed LAST, before wallpapers.
  { kind: "skin", id: "ivory",          price: 1, free: false },
  { kind: "skin", id: "eclipse",        price: 1, free: false },
  { kind: "skin", id: "vesica",         price: 2, free: false },
  { kind: "skin", id: "orbit",          price: 2, free: false },
  // ── Table wallpapers ────────────────────────────────────────────────────
  // Horizon is the FREE default (matches the 0007 unlocked_wallpapers default).
  // Emerald + Crimson are now token unlocks (they used to be the free defaults).
  { kind: "wallpaper", id: "horizon",  price: 0, free: true },
  { kind: "wallpaper", id: "emerald",  price: 1, free: false },
  { kind: "wallpaper", id: "crimson",  price: 1, free: false },
  { kind: "wallpaper", id: "ocean",    price: 1, free: false },
  { kind: "wallpaper", id: "northern", price: 1, free: false },
  { kind: "wallpaper", id: "cosmic",   price: 1, free: false },
  { kind: "wallpaper", id: "aquarium", price: 1, free: false },
  // Lumo live wallpapers (Lagoon / Aurora Indigo) — additive, placed LAST. 2 tokens.
  { kind: "wallpaper", id: "lagoon",       price: 2, free: false },
  { kind: "wallpaper", id: "auroraindigo", price: 2, free: false },
] as const;

/** Find a catalog item by kind+id, or null if it isn't a real cosmetic. */
export function findCosmetic(kind: string, id: string): CosmeticItem | null {
  return COSMETICS.find((c) => c.kind === kind && c.id === id) ?? null;
}
