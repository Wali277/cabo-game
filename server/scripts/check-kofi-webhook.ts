// =============================================================================
// check-kofi-webhook.ts — pure-logic guard for the Ko-fi webhook.
//   npm --prefix server run check:kofi
//
// Tests the security-critical PURE helpers with NO server / DB / network:
//   * constantTimeEqual — token match / mismatch / different-length
//   * tokensFromAmount  — $1=1 floor, and NaN / negative / junk → 0
//   * isTokenGrantingEvent — only "Shop Order" (+ optional product-code scope)
//   * payload JSON parse — valid vs malformed
// =============================================================================
import {
  constantTimeEqual,
  tokensFromAmount,
  isTokenGrantingEvent,
} from "../src/webhooks/kofi.js";

let pass = 0,
  fail = 0;
function ok(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ok  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}${detail !== undefined ? "  " + JSON.stringify(detail) : ""}`);
  }
}

// --- constantTimeEqual --------------------------------------------------------
ok("token equal", constantTimeEqual("s3cret-token", "s3cret-token") === true);
ok("token mismatch (same length)", constantTimeEqual("s3cret-tokenA", "s3cret-tokenB") === false);
ok("token mismatch (different length)", constantTimeEqual("short", "muchlongertoken") === false);
ok("empty vs real → false", constantTimeEqual("", "s3cret") === false);

// --- tokensFromAmount ($1 = 1, floored) --------------------------------------
ok("amount 1.00 → 1", tokensFromAmount("1.00") === 1);
ok("amount 5 → 5", tokensFromAmount("5") === 5);
ok("amount 4.50 → 4 (floor)", tokensFromAmount("4.50") === 4);
ok("amount 10.99 → 10 (floor)", tokensFromAmount("10.99") === 10);
ok("amount 0.50 → 0 (sub-dollar)", tokensFromAmount("0.50") === 0);
ok("amount 0 → 0", tokensFromAmount("0") === 0);
ok("amount negative → 0", tokensFromAmount("-3") === 0);
ok("amount junk → 0", tokensFromAmount("abc") === 0);
ok("amount undefined → 0", tokensFromAmount(undefined) === 0);
ok("amount number 7 → 7", tokensFromAmount(7) === 7);

// --- isTokenGrantingEvent -----------------------------------------------------
ok(
  "Shop Order, no product scope → grants",
  isTokenGrantingEvent({ type: "Shop Order" }) === true,
);
ok(
  "Donation → never grants",
  isTokenGrantingEvent({ type: "Donation" }) === false,
);
ok(
  "Subscription → never grants",
  isTokenGrantingEvent({ type: "Subscription" }) === false,
);
ok(
  "Shop Order with matching product code → grants",
  isTokenGrantingEvent(
    { type: "Shop Order", shop_items: [{ direct_link_code: "tok123" }] },
    "tok123",
  ) === true,
);
ok(
  "Shop Order WITHOUT matching product code → no grant",
  isTokenGrantingEvent(
    { type: "Shop Order", shop_items: [{ direct_link_code: "other" }] },
    "tok123",
  ) === false,
);
ok(
  "Shop Order, product scope set but no shop_items → no grant",
  isTokenGrantingEvent({ type: "Shop Order", shop_items: null }, "tok123") === false,
);
ok(
  "Donation with matching product code (impossible mix) → no grant",
  isTokenGrantingEvent(
    { type: "Donation", shop_items: [{ direct_link_code: "tok123" }] },
    "tok123",
  ) === false,
);

// --- payload JSON parse -------------------------------------------------------
function tryParse(raw: string): boolean {
  try {
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}
ok("valid JSON parses", tryParse('{"verification_token":"x","amount":"5.00"}') === true);
ok("malformed JSON rejected", tryParse("not json {") === false);
ok("empty string rejected", tryParse("") === false);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
