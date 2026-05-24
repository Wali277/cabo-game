import type { AnimationEvent } from "../engine/types";
import type { ViewMode } from "../state/viewmode";

type AnimationKind = AnimationEvent["kind"] | null | undefined;

const ACTION_SWAP_KINDS = new Set<AnimationEvent["kind"]>([
  "blind_swap",
  "peek_and_swap",
]);

export function isActionSwapKind(kind: AnimationKind): boolean {
  return !!kind && ACTION_SWAP_KINDS.has(kind);
}

export function actionSwapAnimationHoldMs(
  kind: AnimationKind,
  viewMode: ViewMode,
): number {
  return viewMode === "desktop" && isActionSwapKind(kind) ? 1250 : 500;
}

export function shouldSuppressCssTransformTransition(
  kind: AnimationKind,
  viewMode: ViewMode,
): boolean {
  return viewMode === "desktop" && isActionSwapKind(kind);
}

export function cardLayoutTransition({
  kind,
  reduced,
  viewMode,
}: {
  kind: AnimationKind;
  reduced: boolean;
  viewMode: ViewMode;
}) {
  const isActionCardSwap = isActionSwapKind(kind);
  const isHandSwap = kind === "swap_hand";

  if (reduced) return { duration: 0.15, ease: "easeOut" as const };

  if (viewMode === "desktop" && isActionCardSwap) {
    return {
      type: "tween" as const,
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1] as const,
    };
  }

  // Hand swap: smooth tween so the card glides in crisply rather than
  // settling slowly via an over-damped spring.
  if (viewMode === "desktop" && isHandSwap) {
    return {
      type: "tween" as const,
      duration: 0.69,
      ease: [0.22, 1, 0.36, 1] as const,
    };
  }

  if (viewMode === "mobile") {
    return {
      type: "spring" as const,
      stiffness: isActionCardSwap ? 75 : isHandSwap ? 130 : 140,
      damping: 26,
      mass: 1.1,
    };
  }

  return {
    type: "spring" as const,
    stiffness: 105,
    damping: 22,
    mass: 1.3,
  };
}
