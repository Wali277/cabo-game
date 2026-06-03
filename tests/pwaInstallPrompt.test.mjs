import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menuSource = readFileSync("cobo/src/ui/Menu.tsx", "utf8");
const manifest = JSON.parse(readFileSync("cobo/public/manifest.json", "utf8"));

assert.equal(manifest.display, "standalone", "PWA manifest should support standalone install");
assert.equal(manifest.start_url, "/", "PWA manifest should launch from the app root");
assert.ok(
  manifest.icons.some((icon) => icon.sizes === "192x192" && icon.purpose.includes("maskable")),
  "Android install should have a maskable 192px icon",
);

assert.match(
  menuSource,
  /beforeinstallprompt/,
  "Menu should listen for Android/Chromium beforeinstallprompt",
);
assert.match(
  menuSource,
  /\.prompt\(\)/,
  "Android install banner should trigger the browser install prompt",
);
assert.match(
  menuSource,
  /appinstalled/,
  "Menu should hide the install banner after app installation",
);

console.log("pwaInstallPrompt tests passed");
