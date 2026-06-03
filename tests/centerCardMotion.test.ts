import assert from "node:assert/strict";
import {
  centerCardArrivalTransition,
  discardCardTrajectory,
  drawnCardTrajectory,
} from "../cobo/src/ui/centerCardMotion";

const mobileDrawDeck = drawnCardTrajectory("draw_deck", "mobile");
assert.deepEqual(mobileDrawDeck.initial, {
  x: -58,
  y: -8,
  opacity: 0,
  scale: 0.96,
  rotate: -3,
});
assert.deepEqual(mobileDrawDeck.animate.x, [-58, -29, 0]);
assert.deepEqual(mobileDrawDeck.animate.y, [-8, -26, 0]);

const mobileDrawDiscard = drawnCardTrajectory("draw_discard", "mobile");
assert.deepEqual(mobileDrawDiscard.initial, {
  x: 58,
  y: -8,
  opacity: 0,
  scale: 0.96,
  rotate: 3,
});
assert.deepEqual(mobileDrawDiscard.animate.x, [58, 29, 0]);

const mobileDiscardDrawn = discardCardTrajectory("discard_drawn", "mobile");
assert.deepEqual(mobileDiscardDrawn.initial, {
  x: -58,
  y: -6,
  opacity: 0,
  scale: 0.98,
  rotate: -3,
});
assert.deepEqual(mobileDiscardDrawn.animate.x, [-58, -29, 0]);
assert.deepEqual(mobileDiscardDrawn.animate.y, [-6, -24, 0]);

const mobileCenterTransition = centerCardArrivalTransition({
  reduced: false,
  viewMode: "mobile",
  isSwapDiscard: false,
});
assert.equal(mobileCenterTransition.type, "tween");
assert.equal(mobileCenterTransition.duration, 0.42);
assert.deepEqual(mobileCenterTransition.ease, [0.16, 1, 0.3, 1]);

const mobileSwapDiscardTransition = centerCardArrivalTransition({
  reduced: false,
  viewMode: "mobile",
  isSwapDiscard: true,
});
assert.equal(mobileSwapDiscardTransition.duration, 0.54);

const desktopTransition = centerCardArrivalTransition({
  reduced: false,
  viewMode: "desktop",
  isSwapDiscard: false,
});
assert.equal(desktopTransition.type, "spring");
assert.equal(desktopTransition.stiffness, 115);

console.log("centerCardMotion tests passed");
