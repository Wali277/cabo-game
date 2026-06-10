// =============================================================================
// check-engine-sync.ts — drift guard for ALL hand-duplicated engine files.
//   npm --prefix server run check:engine-sync
//
// The rules engine is intentionally duplicated by hand:
//   cobo/src/engine/*    — drives SINGLE-PLAYER in the browser
//   server/src/engine/*  — drives MULTIPLAYER authoritatively
// The two copies MUST stay byte-identical or SP and MP silently resolve games
// differently. check-bust.ts already guards bustResolve.ts; this guards the
// WHOLE set, byte-comparing every shared engine file and naming exactly which
// file drifted (plus the first differing line) so the fix is obvious.
// Exits non-zero on any mismatch so it gates test:rules, the build, and CI.
// =============================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ENGINE_FILES = ["game.ts", "types.ts", "deck.ts", "bustResolve.ts"];

let pass = 0, fail = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ""}`); }
}

/** Read a file as raw bytes; null if missing/unreadable (reported as a failure). */
function tryRead(url: URL): Buffer | null {
  try { return readFileSync(fileURLToPath(url)); } catch { return null; }
}

/** 1-based line number of the first byte where the two buffers differ. */
function firstDiffLine(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  let line = 1;
  for (let j = 0; j < i; j++) if (a[j] === 0x0a) line++;
  return line;
}

console.log("— engine drift guard: cobo/src/engine vs server/src/engine must be byte-identical —");
for (const file of ENGINE_FILES) {
  const clientUrl = new URL(`../../cobo/src/engine/${file}`, import.meta.url);
  const serverUrl = new URL(`../src/engine/${file}`, import.meta.url);
  const client = tryRead(clientUrl);
  const server = tryRead(serverUrl);

  if (!client || !server) {
    ok(`engine/${file}`, false,
      `missing: ${[!client && "cobo/src/engine/" + file, !server && "server/src/engine/" + file].filter(Boolean).join(", ")}`);
    continue;
  }
  if (client.equals(server)) {
    ok(`engine/${file} (${client.length} bytes)`, true);
  } else {
    ok(`engine/${file}`, false,
      `DIVERGED — cobo copy is ${client.length} bytes, server copy is ${server.length} bytes; ` +
      `first difference at line ${firstDiffLine(client, server)}. ` +
      `Re-sync cobo/src/engine/${file} and server/src/engine/${file} (they are hand-duplicated copies).`);
  }
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
