import { useLayoutEffect, useRef, useState } from "react";

/**
 * Desktop board "fit to viewport at 100% zoom".
 *
 * The in-game card board (.table-grid) has fixed-size card rows. On short
 * laptop/MacBook viewports the top + bottom rows overflow the viewport height
 * and — because .table-root is `overflow: hidden` — the human's hand gets
 * clipped off the bottom (the reported "almost unplayable" bug). There is no
 * per-dimension CSS scale to lean on (card sizes are JS-driven inline styles),
 * so we apply ONE uniform `transform: scale()` to the whole grid instead.
 *
 * The live scale is published via `getFitScale()` so screen-space measured
 * animation offsets (see swapHandMotion.recordSwapHandSource) can be converted
 * back into the grid's local coordinate space before they're replayed INSIDE
 * the scaled container — otherwise they'd be scaled twice. Everything here is
 * a no-op (scale stays 1) on mobile and on desktops tall enough to fit the
 * board natively.
 */

// Live downscale factor of the in-game board. 1 = no scaling.
let currentFitScale = 1;
export function getFitScale(): number {
  return currentFitScale;
}

const MIN_SCALE = 0.55; // sanity floor — never shrink the board into oblivion
const BOTTOM_PAD = 12; // breathing room below the human hand (px)

/**
 * Returns a `ref` to attach to the element being fitted (.table-grid) and the
 * current `scale` to apply as `transform: scale(scale)` with
 * `transform-origin: top center`. Re-measures on mount, window resize, the
 * element's / its parent's resize, and whenever `deps` change.
 */
export function useFitToViewport(
  enabled: boolean,
  deps: ReadonlyArray<unknown>,
) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!enabled) {
      // Mobile keeps its own dvh/flex layout and Table doesn't apply this
      // scale there, so we only neutralise the value read by swapHandMotion.
      // (Leaving `scale` state as-is avoids a setState-in-effect lint hit; it's
      // reapplied by measure() the instant desktop re-enables.)
      currentFitScale = 1;
      return;
    }

    const measure = () => {
      const node = ref.current;
      if (!node) return;
      // transform-origin is "top center", so the top edge is the scale pivot
      // and node's top stays put across scale changes → stable to measure.
      const top = node.getBoundingClientRect().top;
      const availH = window.innerHeight - top - BOTTOM_PAD;
      const naturalH = node.scrollHeight; // CSS transforms don't affect this
      const availW = node.clientWidth;
      const naturalW = node.scrollWidth; // ...nor this
      if (naturalH <= 0 || naturalW <= 0) return;
      const raw = Math.min(1, availH / naturalH, availW / naturalW);
      // Snap "basically fits" up to exactly 1 so large monitors apply NO
      // transform at all (pixel-identical to before this change) — the small
      // bottom pad is absorbed without scaling. Otherwise round to 3 decimals.
      const next = raw >= 0.99 ? 1 : Math.round(raw * 1000) / 1000;
      const clamped = Math.max(MIN_SCALE, next);
      currentFitScale = clamped;
      setScale(clamped);
    };

    // Synchronous first measure (before paint) avoids a 1-frame unscaled flash.
    measure();

    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", schedule);
    // Border-box is transform-immune, so applying the scale never re-triggers
    // the observer — no feedback loop. NOTE: .table-grid is size-capped, so
    // these observers catch BOX-size changes (window/parent resize, the right
    // sidebar showing/hiding across breakpoints) — not content that overflows
    // a fixed box. Content-driven height changes are covered by the `deps`
    // array; desktop card/row heights are otherwise constant.
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return { ref, scale };
}
