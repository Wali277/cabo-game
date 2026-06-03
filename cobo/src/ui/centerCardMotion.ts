import type { AnimationEvent } from "../engine/types";
import type { ViewMode } from "../state/viewmode";

type CenterAnimationKind = AnimationEvent["kind"] | null | undefined;

export type CenterCardTrajectory = {
  initial: { x: number; y: number; opacity: number; scale: number; rotate: number };
  animate: { x: number[]; y: number[]; opacity: number; scale: number; rotate: number };
};

const MOBILE_GLIDE_EASE = [0.16, 1, 0.3, 1] as const;
const CARD_SPRING = { type: "spring" as const, stiffness: 115, damping: 22, mass: 1.25 };
const SWAP_CARD_SPRING = { type: "spring" as const, stiffness: 87, damping: 20, mass: 1.25 };

function withArc(
  start: { x: number; y: number; rotate: number; scale: number },
  lift: number,
): CenterCardTrajectory {
  const midX = start.x / 2;
  const peakY = Math.min(start.y, 0) - lift;
  return {
    initial: { ...start, opacity: 0 },
    animate: {
      x: [start.x, midX, 0],
      y: [start.y, peakY, 0],
      opacity: 1,
      scale: 1,
      rotate: 0,
    },
  };
}

export function drawnCardTrajectory(
  kind: CenterAnimationKind,
  viewMode: ViewMode,
): CenterCardTrajectory {
  if (viewMode === "mobile") {
    if (kind === "draw_discard") {
      return withArc({ x: 58, y: -8, rotate: 3, scale: 0.96 }, 18);
    }
    return withArc({ x: -58, y: -8, rotate: -3, scale: 0.96 }, 18);
  }

  if (kind === "draw_discard") {
    return withArc({ x: 110, y: -28, rotate: 8, scale: 0.85 }, 30);
  }
  return withArc({ x: -90, y: -50, rotate: -6, scale: 0.85 }, 35);
}

export function discardCardTrajectory(
  kind: CenterAnimationKind,
  viewMode: ViewMode,
): CenterCardTrajectory {
  if (viewMode === "mobile") {
    switch (kind) {
      case "discard_drawn":
        return withArc({ x: -58, y: -6, rotate: -3, scale: 0.98 }, 18);
      case "swap_hand":
      case "snap_correct":
        return withArc({ x: 0, y: 72, rotate: 3, scale: 0.98 }, 28);
      case "blind_swap":
        return withArc({ x: 0, y: 62, rotate: 2, scale: 0.98 }, 24);
      case "peek_and_swap":
        return withArc({ x: 0, y: 62, rotate: -2, scale: 0.98 }, 24);
      default:
        return {
          initial: { x: 0, y: 0, opacity: 0, scale: 0.92, rotate: 0 },
          animate: { x: [0, 0, 0], y: [0, 0, 0], opacity: 1, scale: 1, rotate: 0 },
        };
    }
  }

  switch (kind) {
    case "discard_drawn":
      return withArc({ x: -100, y: -30, rotate: -10, scale: 0.85 }, 30);
    case "swap_hand":
    case "snap_correct":
      return withArc({ x: 0, y: 110, rotate: 6, scale: 0.85 }, 50);
    case "blind_swap":
      return withArc({ x: 0, y: 85, rotate: 4, scale: 0.85 }, 40);
    case "peek_and_swap":
      return withArc({ x: 0, y: 85, rotate: -4, scale: 0.85 }, 40);
    default:
      return {
        initial: { x: 0, y: 0, opacity: 0, scale: 0.7, rotate: 0 },
        animate: { x: [0, 0, 0], y: [0, 0, 0], opacity: 1, scale: 1, rotate: 0 },
      };
  }
}

export function centerCardArrivalTransition({
  reduced,
  viewMode,
  isSwapDiscard,
}: {
  reduced: boolean;
  viewMode: ViewMode;
  isSwapDiscard: boolean;
}) {
  if (reduced) return { duration: 0.15 };

  if (viewMode === "mobile") {
    return {
      type: "tween" as const,
      duration: isSwapDiscard ? 0.54 : 0.42,
      ease: MOBILE_GLIDE_EASE,
    };
  }

  return isSwapDiscard ? SWAP_CARD_SPRING : CARD_SPRING;
}
