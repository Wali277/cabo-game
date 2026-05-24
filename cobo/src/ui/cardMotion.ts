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
      duration: 1.04,
      ease: [0.22, 1, 0.36, 1] as const,
    };
  }

  if (viewMode === "mobile") {
    return {
      type: "spring" as const,
      stiffness: isActionCardSwap ? 75 : isHandSwap ? 105 : 140,
      damping: 28,
      mass: 1.3,
    };
  }

  return {
    type: "spring" as const,
    stiffness: isHandSwap ? 68 : 105,
    damping: isHandSwap ? 24 : 22,
    mass: isHandSwap ? 1.55 : 1.3,
  };
}
