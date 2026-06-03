import assert from "node:assert/strict";
import {
  consumeSwapHandSource,
  recordSwapHandSource,
  swapHandDiscardAnimate,
  swapHandDiscardTrajectory,
  swapHandDiscardTransition,
} from "../cobo/src/ui/swapHandMotion";

const trajectory = swapHandDiscardTrajectory();

assert.deepEqual(trajectory.initial, {
  x: -340,
  y: 260,
  opacity: 1,
  scale: 1.26,
  rotate: 0,
});
assert.deepEqual(trajectory.animate.x, [-340, 0]);
assert.deepEqual(trajectory.animate.y, [260, 0]);
assert.equal(trajectory.animate.opacity, 1);
assert.equal(trajectory.animate.scale, 1);
assert.equal(trajectory.animate.rotate, 0);

const detailedAnimate = swapHandDiscardAnimate({ x: 4, y: -6 }, -8);

assert.deepEqual(detailedAnimate.x, [-340, 4]);
assert.deepEqual(detailedAnimate.y, [260, -6]);
assert.deepEqual(detailedAnimate.scale, [1.26, 1]);
assert.deepEqual(detailedAnimate.rotate, [0, -8]);

const mobileTrajectory = swapHandDiscardTrajectory(null, "mobile");
assert.equal(mobileTrajectory.initial.scale, 1.08);
assert.equal(mobileTrajectory.animate.scale, 1);

const mobileDetailedAnimate = swapHandDiscardAnimate(
  { x: 4, y: -6 },
  -8,
  null,
  "mobile",
);
assert.deepEqual(mobileDetailedAnimate.scale, [1.08, 1]);

recordSwapHandSource(
  "old-card",
  { left: 100, top: 300, width: 110, height: 160 },
  { left: 500, top: 150, width: 140, height: 170 },
);
assert.deepEqual(consumeSwapHandSource("old-card"), { x: -415, y: 145 });
assert.equal(consumeSwapHandSource("old-card"), null);

const transition = swapHandDiscardTransition(false);

assert.equal(transition.duration, 0.7);
assert.deepEqual(transition.times, [0, 1]);

const mobileTransition = swapHandDiscardTransition(false, "mobile");
assert.equal(mobileTransition.duration, 0.54);
assert.deepEqual(mobileTransition.ease, [0.16, 1, 0.3, 1]);
assert.deepEqual(mobileTransition.times, [0, 1]);

const reducedTransition = swapHandDiscardTransition(true);
assert.equal(reducedTransition.duration, 0.15);

console.log("swapHandMotion tests passed");
