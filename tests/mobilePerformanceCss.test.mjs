import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("cobo/src/App.css", "utf8");

function ruleFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `Missing CSS rule for ${selector}`);
  return match[1];
}

const mobileSidebar = ruleFor("body.mobile-mode .right-sidebar");
assert.match(
  mobileSidebar,
  /visibility:\s*hidden/,
  "Closed mobile scores drawer should not stay paintable offscreen",
);
assert.match(
  mobileSidebar,
  /pointer-events:\s*none/,
  "Closed mobile scores drawer should not intercept input",
);
assert.doesNotMatch(
  mobileSidebar,
  /backdrop-filter:\s*blur/i,
  "Mobile scores drawer should not use backdrop blur",
);

const mobileSidebarOpen = ruleFor("body.mobile-mode .right-sidebar.open");
assert.match(
  mobileSidebarOpen,
  /visibility:\s*visible/,
  "Open mobile scores drawer must become visible again",
);
assert.match(
  mobileSidebarOpen,
  /pointer-events:\s*auto/,
  "Open mobile scores drawer must be interactive",
);

const mobileHighlight = ruleFor("body.mobile-mode .card-wrap.hl::after");
assert.match(
  mobileHighlight,
  /animation:\s*none/,
  "Mobile selectable-card highlight should be static, not an infinite box-shadow animation",
);

const mobileLayoutGlide = ruleFor("body.mobile-mode .card-wrap.layout-glide");
assert.match(
  mobileLayoutGlide,
  /transition:\s*filter\s+0\.25s\s+ease\s*!important/,
  "Mobile layout glides should let Framer own transform without CSS transition interference",
);

console.log("mobilePerformanceCss tests passed");
