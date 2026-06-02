import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const appSource = readFileSync("cobo/src/App.tsx", "utf8");
const cssSource = readFileSync("cobo/src/App.css", "utf8");

assert.equal(appSource.includes("DebugLog"), false, "App should not import or render DebugLog");
assert.equal(
  existsSync("cobo/src/ui/DebugLog.tsx"),
  false,
  "DebugLog component file should be removed",
);

for (const selector of [
  ".debug-toggle",
  ".debug-badge",
  ".debug-panel",
  ".debug-header",
  ".debug-list",
  ".debug-entry",
]) {
  assert.equal(cssSource.includes(selector), false, `${selector} styles should be removed`);
}
