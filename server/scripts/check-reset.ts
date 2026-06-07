/**
 * check-reset.ts — END-TO-END live test of the password-reset flow against the
 * REAL running HTTP endpoints (/auth/forgot-password + /auth/reset-password).
 *
 * We can't read the inbox, but we own AUTH_CODE_SECRET, so after the endpoint
 * issues a code we read the stored HMAC from email_codes and brute-force the
 * 6-digit preimage (~1M HMACs, <1s) — exactly the code the user would receive.
 *
 * Run (server must be running on PORT): from server/:
 *   node --env-file-if-exists=.env --import tsx scripts/check-reset.ts
 *
 * Creates + DELETES a throwaway auth user. No profile is touched (no trigger).
 */
import { admin } from "../src/auth/supabaseClients.js";
import { hashCode } from "../src/auth/codes.js";

const PORT = Number(process.env.PORT) || 8787;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = `reset-test-${Date.now()}@example.com`;
const PW1 = "TestPass123";
const PW2 = "NewPass456";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}${detail ? `  — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

async function post(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await r.json();
  } catch {
    /* ignore */
  }
  return { status: r.status, json };
}

/** Recover the plaintext 6-digit code from its stored HMAC (we own the secret). */
function bruteForce(targetHash: string): string | null {
  for (let n = 0; n < 1_000_000; n++) {
    const c = String(n).padStart(6, "0");
    if (hashCode(c) === targetHash) return c;
  }
  return null;
}

async function latestResetHash(email: string): Promise<string | null> {
  const db = admin();
  const { data, error } = await db
    .from("email_codes")
    .select("code_hash, created_at, consumed_at, attempts")
    .eq("email", email)
    .eq("purpose", "reset")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`latestResetHash: ${error.message}`);
  return data?.[0]?.code_hash ?? null;
}

async function signIn(email: string, password: string): Promise<boolean> {
  // Use admin to mint a session check via the anon sign-in path the app uses.
  const { anonAuth } = await import("../src/auth/supabaseClients.js");
  const { data, error } = await anonAuth().auth.signInWithPassword({ email, password });
  return !error && !!data?.user;
}

async function main() {
  console.log(`\n=== Password-reset E2E (${BASE}) — throwaway ${EMAIL} ===\n`);
  const db = admin();

  // 0. Create a confirmed throwaway user.
  const { data: created, error: cErr } = await db.auth.admin.createUser({
    email: EMAIL,
    password: PW1,
    email_confirm: true,
  });
  if (cErr || !created?.user) {
    console.error("setup failed: could not create user:", cErr?.message);
    process.exit(1);
  }
  const userId = created.user.id;
  check("setup: throwaway user created + confirmed", true, userId);

  // email_codes.user_id → profiles(id), so a real account always has a profile.
  // Create the minimal profile (only `username` lacks a default). Deleting the
  // auth user cascades both profile and codes (ON DELETE CASCADE).
  const username = "rt" + String(Date.now()).slice(-12);
  const { error: pErr } = await db.from("profiles").insert({ id: userId, username });
  if (pErr) {
    console.error("setup failed: could not create profile:", pErr.message);
    await db.auth.admin.deleteUser(userId);
    process.exit(1);
  }
  check("setup: profile row created", true, username);

  // 1. Baseline: original password works.
  check("baseline login with original password", await signIn(EMAIL, PW1));

  // 2. forgot-password (real endpoint) → generic ok.
  const fp = await post("/auth/forgot-password", { identifier: EMAIL });
  check("POST /forgot-password → {ok:true}", fp.json?.ok === true, `status ${fp.status}`);

  // 3. Recover the issued code from its stored HMAC.
  const hash = await latestResetHash(EMAIL);
  check("a reset code was issued + stored (hashed)", !!hash);
  const code = hash ? bruteForce(hash) : null;
  check("recovered the 6-digit code from its HMAC", !!code, code ? `code=${code}` : "");
  if (!code) {
    await db.auth.admin.deleteUser(userId);
    console.log("\nCannot continue without the code.");
    process.exit(1);
  }

  // 4. Wrong code is rejected (same issuance; attempt is counted, not consumed).
  const wrong = code === "000000" ? "111111" : "000000";
  const rWrong = await post("/auth/reset-password", {
    identifier: EMAIL,
    code: wrong,
    newPassword: PW2,
  });
  check(
    "reset with WRONG code → ok:false + attemptsLeft",
    rWrong.json?.ok === false && typeof rWrong.json?.attemptsLeft === "number",
    `attemptsLeft=${rWrong.json?.attemptsLeft}`,
  );
  check("password unchanged after wrong code (old still works)", await signIn(EMAIL, PW1));

  // 5. Weak new password is rejected BEFORE any account work (400, field).
  const rWeak = await post("/auth/reset-password", {
    identifier: EMAIL,
    code,
    newPassword: "short",
  });
  check(
    "reset with weak password → 400 field:newPassword",
    rWeak.status === 400 && rWeak.json?.ok === false && rWeak.json?.field === "newPassword",
    `status ${rWeak.status}`,
  );

  // 6. Correct code → password actually changes.
  const rOk = await post("/auth/reset-password", {
    identifier: EMAIL,
    code,
    newPassword: PW2,
  });
  check("reset with CORRECT code → {ok:true}", rOk.json?.ok === true, `status ${rOk.status}`);
  check("NEW password now works", await signIn(EMAIL, PW2));
  check("OLD password now rejected", !(await signIn(EMAIL, PW1)));

  // 7. Reusing the consumed code fails (no second reset).
  const rReuse = await post("/auth/reset-password", {
    identifier: EMAIL,
    code,
    newPassword: "AnotherPass789",
  });
  check("consumed code cannot be reused → ok:false", rReuse.json?.ok === false);
  check("password still PW2 after reuse attempt", await signIn(EMAIL, PW2));

  // 8. Enumeration: unknown identifier still returns generic ok (no leak).
  const fpUnknown = await post("/auth/forgot-password", {
    identifier: `definitely-not-real-${Date.now()}@nowhere.test`,
  });
  check("forgot-password for unknown account → generic {ok:true}", fpUnknown.json?.ok === true);

  // 9. Cleanup.
  const { error: dErr } = await db.auth.admin.deleteUser(userId);
  check("cleanup: throwaway user deleted", !dErr, dErr?.message ?? "");
  const { data: gone } = await db.auth.admin.getUserById(userId);
  check("cleanup: user no longer exists", !gone?.user);

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("UNEXPECTED ERROR:", e);
  process.exit(1);
});
