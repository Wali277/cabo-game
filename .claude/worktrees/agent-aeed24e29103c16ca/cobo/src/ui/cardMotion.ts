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
  // Swap-hand is now a distance-adaptive spring (see cardLayoutTransition).
  // 850ms covers the longest path (drawn slot → bottom row) plus a small
  // settle margin; short side-player swaps consume the animation earlier
  // via the natural spring decay.
  if (viewMode === "desktop" && kind === "swap_hand") return 850;
  return viewMode === "desktop" && isActionSwapKind(kind) ? 1250 : 500;
}

export function shouldSuppressCssTransformTransition(
  kind: AnimationKind,
  viewMode: ViewMode,
): boolean {
  return viewMode === "desktop" && (isActionSwapKind(kind) || kind === "swap_hand");
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

  // Hand swap: distance-adaptive spring rather than a fixed-duration tween.
  // The drawn slot sits in the centre, so swap_hand for the human covers a
  // long vertical path (centre → bottom row) while a side-player bot only
  // travels a short hop into the rotated rail. A 1s tween made the short
  // hop drag through ease-out's slow tail and read as "clunky"; springs
  // scale duration with distance, so short paths finish in ~0.4s while
  // long paths still take ~0.7s. Damping is set just under critical so
  // the card never overshoots its slot.
  if (viewMode === "desktop" && isHandSwap) {
    return {
      type: "spring" as const,
      stiffness: 230,
      damping: 30,
      mass: 0.85,
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
