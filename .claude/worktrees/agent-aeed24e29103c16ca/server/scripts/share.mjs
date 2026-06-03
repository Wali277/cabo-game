#!/usr/bin/env node
// Build the client, start the all-in-one server, open a public tunnel.
// Usage: npm run share

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import localtunnel from "localtunnel";
import net from "node:net";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, "..");
const COBO_DIR = path.resolve(SERVER_DIR, "..", "cobo");
const DIST_DIR = path.join(COBO_DIR, "dist");

const PORT = Number(process.env.PORT) || 8787;
const SUBDOMAIN = process.env.LT_SUBDOMAIN || undefined; // optional pretty subdomain

function log(...args) {
  console.log("[share]", ...args);
}

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...opts });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    child.on("error", reject);
  });
}

async function waitForPort(port, host = "127.0.0.1", timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((res) => {
      const s = net.connect({ port, host });
      s.once("connect", () => { s.end(); res(true); });
      s.once("error", () => { res(false); });
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server didn't start on :${port} in ${timeoutMs}ms`);
}

async function main() {
  log("Step 1/3 — building client…");
  await run("npm", ["run", "build"], { cwd: COBO_DIR });

  if (!existsSync(path.join(DIST_DIR, "index.html"))) {
    throw new Error(`Build did not produce ${DIST_DIR}/index.html`);
  }

  log("Step 2/3 — starting server on :" + PORT + " (serving built client)…");
  const server = spawn("npm", ["run", "start"], {
    cwd: SERVER_DIR,
    stdio: "inherit",
    env: { ...process.env, PORT: String(PORT) },
  });
  let stopped = false;
  server.on("close", (code) => {
    if (!stopped) {
      console.error(`[share] server exited unexpectedly (code ${code})`);
      process.exit(code ?? 1);
    }
  });

  await waitForPort(PORT);

  log("Step 3/3 — opening public tunnel…");
  let tunnel;
  try {
    tunnel = await localtunnel({ port: PORT, subdomain: SUBDOMAIN });
  } catch (err) {
    console.error("[share] failed to start localtunnel:", err.message);
    console.error("[share] you can still play on this LAN at http://<your-ip>:" + PORT);
    return;
  }

  console.log("\n" + "=".repeat(60));
  console.log("  🌐 Public URL (share with friends):");
  console.log("       " + tunnel.url);
  console.log("");
  console.log("  📱 Open this on your phone or send to friends.");
  console.log("  ℹ️  First-time visitors may see a localtunnel intro page");
  console.log("     — they can click \"Click to Continue\" once.");
  console.log("");
  console.log("  Stop the server with Ctrl+C");
  console.log("=".repeat(60) + "\n");

  const cleanup = () => {
    stopped = true;
    log("shutting down…");
    try { tunnel.close(); } catch {}
    try { server.kill("SIGTERM"); } catch {}
    setTimeout(() => process.exit(0), 300);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  tunnel.on("close", () => {
    log("tunnel closed");
    cleanup();
  });
  tunnel.on("error", (err) => {
    console.error("[share] tunnel error:", err.message);
  });
}

main().catch((err) => {
  console.error("[share] fatal:", err.message || err);
  process.exit(1);
});
