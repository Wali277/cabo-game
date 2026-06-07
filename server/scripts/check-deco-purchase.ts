/**
 * check-deco-purchase.ts — verify the new premium "deco" skin is purchasable
 * against the RUNNING server (confirms the catalog includes it). Mirrors the
 * purchase path the Styles store uses. Throwaway account; cleaned up.
 *
 *   node --env-file-if-exists=.env --import tsx scripts/check-deco-purchase.ts
 */
import { admin, anonAuth } from "../src/auth/supabaseClients.js";

const PORT = Number(process.env.PORT) || 8787;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = `deco-test-${Date.now()}@example.com`;
const PW = "TestPass123";

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = "") => {
  if (ok) { pass++; console.log(`  PASS  ${n}${d ? `  — ${d}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}${d ? `  — ${d}` : ""}`); }
};

async function main() {
  console.log(`\n=== Deco purchase E2E (${BASE}) ===\n`);
  const db = admin();
  const { data: created } = await db.auth.admin.createUser({ email: EMAIL, password: PW, email_confirm: true });
  const userId = created!.user!.id;
  await db.from("profiles").insert({ id: userId, username: "dc" + String(Date.now()).slice(-12), tokens: 5 });

  const { data: signIn } = await anonAuth().auth.signInWithPassword({ email: EMAIL, password: PW });
  const token = signIn?.session?.access_token;
  check("setup: throwaway with 5 tokens + session", !!token);

  const res = await fetch(`${BASE}/account/purchase`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind: "skin", id: "deco" }),
  });
  const json: any = await res.json().catch(() => null);
  check("server recognises 'deco' (NOT 'item isn't available')", json?.code !== "invalid", `status ${res.status} code ${json?.code}`);
  check("deco purchase ok", json?.ok === true);
  check("deco now in unlocked_skins", Array.isArray(json?.profile?.unlocked_skins) && json.profile.unlocked_skins.includes("deco"));
  check("charged 2 tokens (5 → 3)", json?.profile?.tokens === 3, `tokens=${json?.profile?.tokens}`);

  await db.auth.admin.deleteUser(userId);
  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
