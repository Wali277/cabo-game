type Trajectory = {
  initial: { x: number; y: number; opacity: number; scale: number; rotate: number };
  animate: { x: number[]; y: number[]; opacity: number; scale: number; rotate: number };
};

type RectLike = Pick<DOMRect, "left" | "top" | "width" | "height">;
type Offset = { x: number; y: number };

const SWAP_HAND_DISCARD_EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];
const DEFAULT_HAND_SOURCE: Offset = { x: -340, y: 260 };
const swapHandSourceOffsets = new Map<string, Offset>();

function centerOf(rect: RectLike): Offset {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

export function recordSwapHandSource(
  cardId: string,
  sourceRect: RectLike,
  targetRect: RectLike | null | undefined,
) {
  if (!targetRect) return;

  const source = centerOf(sourceRect);
  const target = centerOf(targetRect);
  swapHandSourceOffsets.set(cardId, {
    x: source.x - target.x,
    y: source.y - target.y,
  });
}

export function consumeSwapHandSource(cardId: string): Offset | null {
  const offset = swapHandSourceOffsets.get(cardId) ?? null;
  swapHandSourceOffsets.delete(cardId);
  return offset;
}

function sourceOffset(offset?: Offset | null): Offset {
  return offset ?? DEFAULT_HAND_SOURCE;
}

export function swapHandDiscardTrajectory(offset?: Offset | null): Trajectory {
  const source = sourceOffset(offset);

  return {
    initial: { x: source.x, y: source.y, opacity: 1, scale: 1.26, rotate: 0 },
    animate: {
      x: [source.x, 0],
      y: [source.y, 0],
      opacity: 1,
      scale: 1,
      rotate: 0,
    },
  };
}

export function swapHandDiscardAnimate(
  topOffset: { x: number; y: number },
  topRotation: number,
  offset?: Offset | null,
) {
  const source = sourceOffset(offset);

  return {
    x: [source.x, topOffset.x],
    y: [source.y, topOffset.y],
    opacity: 1,
    scale: [1.26, 1],
    rotate: [0, topRotation],
  };
}

export function swapHandDiscardTransition(reduced: boolean) {
  if (reduced) return { duration: 0.15, ease: "easeOut" as const };

  return {
    duration: 0.7,
    ease: SWAP_HAND_DISCARD_EASE,
    times: [0, 1],
  };
}
