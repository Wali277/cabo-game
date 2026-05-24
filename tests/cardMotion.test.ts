import assert from "node:assert/strict";
import {
  actionSwapAnimationHoldMs,
  cardLayoutTransition,
  shouldSuppressCssTransformTransition,
} from "../cobo/src/ui/cardMotion";

assert.equal(actionSwapAnimationHoldMs("blind_swap", "desktop"), 1250);
assert.equal(actionSwapAnimationHoldMs("peek_and_swap", "desktop"), 1250);
assert.equal(actionSwapAnimationHoldMs("blind_swap", "mobile"), 500);
assert.equal(actionSwapAnimationHoldMs("swap_hand", "desktop"), 500);

const desktopBlindSwap = cardLayoutTransition({
  kind: "blind_swap",
  reduced: false,
  viewMode: "desktop",
});

assert.equal(desktopBlindSwap.type, "tween");
assert.equal(desktopBlindSwap.duration, 1.04);
assert.equal(shouldSuppressCssTransformTransition("blind_swap", "desktop"), true);

const mobileBlindSwap = cardLayoutTransition({
  kind: "blind_swap",
  reduced: false,
  viewMode: "mobile",
});

assert.equal(mobileBlindSwap.type, "spring");
assert.equal(shouldSuppressCssTransformTransition("blind_swap", "mobile"), false);

console.log("cardMotion tests passed");
