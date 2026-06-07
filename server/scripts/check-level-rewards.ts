/**
 * check-level-rewards.ts — verify the LEVEL-2 "custom" skin unlock baked into
 * grant_xp by migration 0006. REQUIRES 0006 applied.
 *
 * Run from server/:
 *   node --env-file-if-exists=.env --import tsx scripts/check-level-rewards.ts
 *
 * Uses a throwaway profile and calls the grant_xp RPC directly (the same path
 * /account/grant-game uses). Asserts:
 *   - a grant that stays at level 1 does NOT unlock 'custom'
 *   - a grant that reaches level 2 (>=1500 XP) DOES unlock 'custom'
 *   - replaying the same game_key is a no-op (no duplicate 'custom')
 *   - 'custom' starts NOT in the default unlocked_skins
 */
import { admin } from "../src/auth/supabaseClients.js";

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? `  — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  — ${detail}` : ""}`); }
}

async function skinsOf(db: ReturnType<typeof admin>, userId: string): Promise<string[]> {
  const { data } = await db.from("profiles").select("unlocked_skins, level").eq("id", userId).limit(1);
  return data?.[0]?.unlocked_skins ?? [];
}
async function levelOf(db: ReturnType<typeof admin>, userId: string): Promise<number> {
  const { data } = await db.from("profiles").select("level").eq("id", userId).limit(1);
  return data?.[0]?.level ?? 0;
}

async function main() {
  console.log(`\n=== Level-2 'custom' unlock (grant_xp / 0006) ===\n`);
  const db = admin();
  const stamp = String(Date.now());
  const email = `levelreward-${stamp}@example.com`;

  const { data: created, error: cErr } = await db.auth.admin.createUser({
    email, password: "TestPass123", email_confirm: true,
  });
  if (cErr || !created?.user) { console.error("setup: createUser failed:", cErr?.message); process.exit(1); }
  const userId = created.user.id;
  const { error: pErr } = await db.from("profiles").insert({ id: userId, username: "lr" + stamp.slice(-12) });
  if (pErr) { console.error("setup: profile insert failed:", pErr.message); await db.auth.admin.deleteUser(userId); process.exit(1); }

  check("default unlocked_skins excludes 'custom'", !(await skinsOf(db, userId)).includes("custom"), JSON.stringify(await skinsOf(db, userId)));

  // 1. Grant 100 XP — still level 1 → no 'custom'.
  const k1 = `lr-stay-${stamp}`;
  const { error: e1 } = await db.rpc("grant_xp", { p_user: userId, p_game_key: k1, p_amount: 100, p_source: "sp" });
  check("grant 100 XP RPC ok", !e1, e1?.message ?? "");
  check("still level 1 after +100", (await levelOf(db, userId)) === 1);
  check("level 1 → 'custom' NOT unlocked", !(await skinsOf(db, userId)).includes("custom"));

  // 2. Grant 1500 more XP — crosses into level 2 → 'custom' unlocked.
  const k2 = `lr-levelup-${stamp}`;
  const { error: e2 } = await db.rpc("grant_xp", { p_user: userId, p_game_key: k2, p_amount: 1500, p_source: "sp" });
  check("grant 1500 XP RPC ok", !e2, e2?.message ?? "");
  check("reached level >= 2", (await levelOf(db, userId)) >= 2, `level=${await levelOf(db, userId)}`);
  check("level 2 → 'custom' unlocked", (await skinsOf(db, userId)).includes("custom"));

  // 3. Replay the same key → no-op, no duplicate 'custom'.
  await db.rpc("grant_xp", { p_user: userId, p_game_key: k2, p_amount: 1500, p_source: "sp" });
  const skins = await skinsOf(db, userId);
  check("replay is a no-op (single 'custom')", skins.filter((s) => s === "custom").length === 1, JSON.stringify(skins));

  const { error: dErr } = await db.auth.admin.deleteUser(userId);
  check("cleanup: user deleted", !dErr, dErr?.message ?? "");

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("UNEXPECTED ERROR:", e); process.exit(1); });
