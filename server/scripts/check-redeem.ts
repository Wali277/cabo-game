/**
 * check-redeem.ts — END-TO-END test of the redeem-code flow against the REAL
 * running /account/redeem HTTP endpoint. REQUIRES migration 0006 applied
 * (code_redemptions + redeem_code RPC).
 *
 * Run (server must be running on PORT) from server/:
 *   node --env-file-if-exists=.env --import tsx scripts/check-redeem.ts
 *
 * Creates + DELETES a throwaway confirmed account (with a profile). Asserts:
 *   - invalid code → {ok:false, code:'invalid'} (no credit)
 *   - LUMO-TEST    → {ok:true, reward.tokens=1}, balance +1
 *   - LUMO-TEST 2x → {ok:false, code:'already_redeemed'} (once per account)
 *   - 'lumo-test'  → already_redeemed (case-insensitive canonicalization)
 *   - unauth (no token) → 401
 */
import { admin, anonAuth } from "../src/auth/supabaseClients.js";

const PORT = Number(process.env.PORT) || 8787;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = `redeem-test-${Date.now()}@example.com`;
const PW = "TestPass123";

let pass = 0,
  fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? `  — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  — ${detail}` : ""}`); }
}

async function redeem(token: string | null, code: string) {
  const res = await fetch(`${BASE}/account/redeem`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ code }),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

async function tokensOf(userId: string): Promise<number | null> {
  const { data } = await admin().from("profiles").select("tokens").eq("id", userId).limit(1);
  return data?.[0]?.tokens ?? null;
}

async function main() {
  console.log(`\n=== Redeem-code E2E (${BASE}) — throwaway ${EMAIL} ===\n`);
  const db = admin();

  const { data: created, error: cErr } = await db.auth.admin.createUser({
    email: EMAIL, password: PW, email_confirm: true,
  });
  if (cErr || !created?.user) { console.error("setup: createUser failed:", cErr?.message); process.exit(1); }
  const userId = created.user.id;
  const username = "rd" + String(Date.now()).slice(-12);
  const { error: pErr } = await db.from("profiles").insert({ id: userId, username });
  if (pErr) { console.error("setup: profile insert failed:", pErr.message); await db.auth.admin.deleteUser(userId); process.exit(1); }
  check("setup: throwaway user + profile", true, `${username} (${userId})`);

  const { data: signIn, error: sErr } = await anonAuth().auth.signInWithPassword({ email: EMAIL, password: PW });
  const token = signIn?.session?.access_token ?? null;
  check("setup: got a session token", !!token && !sErr);

  const startTokens = (await tokensOf(userId)) ?? 0;

  // 1. Unauthenticated → 401.
  const unauth = await redeem(null, "LUMO-TEST");
  check("no token → 401", unauth.status === 401);

  // 2. Invalid code → {ok:false, code:'invalid'}, no credit.
  const bad = await redeem(token, "NOPE-NOT-REAL");
  check("invalid code → code:invalid", bad.json?.ok === false && bad.json?.code === "invalid");
  check("invalid code did not credit tokens", (await tokensOf(userId)) === startTokens);

  // 3. Valid LUMO-TEST → +1 token.
  const good = await redeem(token, "LUMO-TEST");
  check("LUMO-TEST → ok:true", good.json?.ok === true, `status ${good.status}`);
  check("reward.tokens === 1", good.json?.reward?.tokens === 1);
  check("returned profile balance is +1", good.json?.profile?.tokens === startTokens + 1);
  check("DB balance is +1", (await tokensOf(userId)) === startTokens + 1);

  // 4. Second redemption → already_redeemed, no extra credit.
  const again = await redeem(token, "LUMO-TEST");
  check("second LUMO-TEST → already_redeemed", again.json?.ok === false && again.json?.code === "already_redeemed");
  check("no double credit", (await tokensOf(userId)) === startTokens + 1);

  // 5. Case-insensitive canonicalization → same code → already_redeemed.
  const lower = await redeem(token, "  lumo-test ");
  check("'lumo-test' canonicalizes → already_redeemed", lower.json?.ok === false && lower.json?.code === "already_redeemed");
  check("still no double credit", (await tokensOf(userId)) === startTokens + 1);

  // 6. DEV-BOOST: the XP path → level 2 (unlocks 'custom') + 10 flat tokens, once.
  const dev = await redeem(token, "DEV-BOOST");
  check("DEV-BOOST → ok:true", dev.json?.ok === true, `status ${dev.status}`);
  check("DEV-BOOST reward.xp === 1500", dev.json?.reward?.xp === 1500);
  check("DEV-BOOST reward.tokens === 10", dev.json?.reward?.tokens === 10);
  const { data: prof } = await db
    .from("profiles")
    .select("level, unlocked_skins, tokens")
    .eq("id", userId)
    .limit(1);
  const pr: any = prof?.[0];
  check("DEV-BOOST → level >= 2", (pr?.level ?? 0) >= 2, `level=${pr?.level}`);
  check("DEV-BOOST → 'custom' unlocked", (pr?.unlocked_skins ?? []).includes("custom"));
  check("DEV-BOOST → +10 tokens (on top of LUMO-TEST's +1)", pr?.tokens === startTokens + 1 + 10);
  const devAgain = await redeem(token, "DEV-BOOST");
  check("DEV-BOOST second time → already_redeemed", devAgain.json?.ok === false && devAgain.json?.code === "already_redeemed");

  // Cleanup.
  const { error: dErr } = await db.auth.admin.deleteUser(userId);
  check("cleanup: user deleted (cascades profile + redemptions)", !dErr, dErr?.message ?? "");

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("UNEXPECTED ERROR:", e); process.exit(1); });
