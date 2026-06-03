import assert from "node:assert/strict";
import {
  actionSwapAnimationHoldMs,
  cardLayoutTransition,
  shouldSuppressCssTransformTransition,
} from "../cobo/src/ui/cardMotion";

assert.equal(actionSwapAnimationHoldMs("blind_swap", "desktop"), 1250);
assert.equal(actionSwapAnimationHoldMs("peek_and_swap", "desktop"), 1250);
assert.equal(actionSwapAnimationHoldMs("blind_swap", "mobile"), 500);
assert.equal(actionSwapAnimationHoldMs("swap_hand", "desktop"), 850);

const desktopBlindSwap = cardLayoutTransition({
  kind: "blind_swap",
  reduced: false,
  viewMode: "desktop",
});

assert.equal(desktopBlindSwap.type, "tween");
assert.equal(desktopBlindSwap.duration, 1.2);
assert.equal(shouldSuppressCssTransformTransition("blind_swap", "desktop"), true);
assert.equal(shouldSuppressCssTransformTransition("peek_and_swap", "desktop"), true);

const mobileBlindSwap = cardLayoutTransition({
  kind: "blind_swap",
  reduced: false,
  viewMode: "mobile",
});

assert.equal(mobileBlindSwap.type, "tween");
assert.equal(mobileBlindSwap.duration, 0.45);
assert.equal(shouldSuppressCssTransformTransition("blind_swap", "mobile"), false);

const desktopHandSwap = cardLayoutTransition({
  kind: "swap_hand",
  reduced: false,
  viewMode: "desktop",
});

assert.equal(desktopHandSwap.type, "spring");
assert.equal(desktopHandSwap.stiffness, 230);
assert.equal(desktopHandSwap.damping, 30);
assert.equal(desktopHandSwap.mass, 0.85);
assert.equal(shouldSuppressCssTransformTransition("swap_hand", "desktop"), true);
assert.equal(shouldSuppressCssTransformTransition("swap_hand", "mobile"), false);

const mobileHandSwap = cardLayoutTransition({
  kind: "swap_hand",
  reduced: false,
  viewMode: "mobile",
});

assert.equal(mobileHandSwap.type, "tween");
assert.equal(mobileHandSwap.duration, 0.4);

console.log("cardMotion tests passed");
