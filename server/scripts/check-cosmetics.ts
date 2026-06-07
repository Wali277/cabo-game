// =============================================================================
// check-cosmetics.ts — parity guard for the Phase 6 cosmetics catalog.
//   npm --prefix server run check:cosmetics
//
// The store has TWO catalogs that must agree: the SERVER-authoritative one
// (server/src/auth/cosmetics.ts — owns price/free, charged on purchase) and the
// CLIENT display mirror (cobo/src/state/cosmetics.ts — renders prices + grid).
// If they drift, the store would show an item/price the server rejects (or a
// "buyable" item the server charges differently). This asserts they match on
// (kind, id, price, free) and that `evolved` is excluded from both.
// =============================================================================
import { COSMETICS } from "../src/auth/cosmetics.js";
import { cosmeticsCatalog } from "../../cobo/src/state/cosmetics.ts";

let pass = 0, fail = 0;
function ok(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}${detail !== undefined ? "  " + JSON.stringify(detail) : ""}`); }
}

const k = (c: { kind: string; id: string }) => `${c.kind}:${c.id}`;

// 1. Same set of items (kind+id) on both sides.
const serverKeys = COSMETICS.map(k).sort();
const clientKeys = cosmeticsCatalog.map(k).sort();
ok("same item set (kind+id)", JSON.stringify(serverKeys) === JSON.stringify(clientKeys), {
  serverOnly: serverKeys.filter((x) => !clientKeys.includes(x)),
  clientOnly: clientKeys.filter((x) => !serverKeys.includes(x)),
});

// 2. Every server item has a client entry with identical price + free + levelUnlock.
for (const s of COSMETICS) {
  const c = cosmeticsCatalog.find((x) => x.kind === s.kind && x.id === s.id);
  ok(`${k(s)} price ${s.price}`, !!c && c.price === s.price, { server: s.price, client: c?.price });
  ok(`${k(s)} free ${s.free}`, !!c && c.free === s.free, { server: s.free, client: c?.free });
  ok(
    `${k(s)} levelUnlock ${s.levelUnlock ?? "—"}`,
    !!c && (c.levelUnlock ?? null) === (s.levelUnlock ?? null),
    { server: s.levelUnlock ?? null, client: c?.levelUnlock ?? null },
  );
}

// 3. evolved is excluded from BOTH catalogs (mode-forced, never purchasable).
ok("no 'evolved' in server catalog", !COSMETICS.some((c) => c.id === "evolved"));
ok("no 'evolved' in client catalog", !cosmeticsCatalog.some((c) => c.id === "evolved"));

// 4. Expected counts: 2 free defaults (classic skin + horizon wallpaper), 1
//    LEVEL-REWARD ('custom' @ level 2), 15 buyable. 'custom' is neither free
//    nor buyable.
const freeItems = COSMETICS.filter((c) => c.free);
const levelRewards = COSMETICS.filter((c) => !c.free && c.levelUnlock != null);
const buyable = COSMETICS.filter((c) => !c.free && c.levelUnlock == null);
ok("2 free defaults (classic + horizon)", freeItems.length === 2, freeItems.map((c) => c.id));
ok("1 level-reward item", levelRewards.length === 1, levelRewards.map((c) => c.id));
ok("15 buyable items", buyable.length === 15, buyable.map((c) => c.id));
ok(
  "'custom' is a level-2 reward skin (not free, not buyable)",
  COSMETICS.some(
    (c) => c.kind === "skin" && c.id === "custom" && !c.free && c.levelUnlock === 2,
  ),
);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
