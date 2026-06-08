/**
 * Device-class + orientation model.
 *
 * This sits ABOVE the existing `viewmode.ts` ViewMode ("desktop" | "mobile")
 * resolution and classifies the physical device so the app can adapt by
 * orientation:
 *
 *   | device  | orientation | resolved ViewMode |
 *   |---------|-------------|-------------------|
 *   | phone   | portrait    | mobile            |
 *   | phone   | landscape   | mobile (+ rotate-lock overlay) |
 *   | tablet  | portrait    | mobile            |
 *   | tablet  | landscape   | desktop (+ tablet-landscape) |
 *   | desktop | either      | desktop           |
 *
 * Touch gate (the load-bearing rule): a device is only ever phone/tablet when
 * it is GENUINELY touch-first — `(pointer: coarse)` AND `(hover: none)`. A real
 * mouse desktop (fine pointer, or a touchscreen laptop that still reports
 * hover) is ALWAYS `desktop`, regardless of window size. This guarantees the
 * desktop experience is never reclassified by a narrow window.
 *
 * Phone vs tablet is split by the SHORTER viewport side so it is stable across
 * rotation: `Math.min(innerWidth, innerHeight) <= 600` → phone, else tablet.
 *
 * Everything here is SSR-safe (`typeof window === "undefined"` → desktop /
 * portrait), and `useDeviceClass()` re-resolves on resize, orientationchange,
 * and the `(orientation: portrait)` matchMedia `change` event with passive,
 * fully-cleaned-up listeners.
 */
import { useSyncExternalStore } from "react";

export type DeviceClass = "phone" | "tablet" | "desktop";
export type Orientation = "portrait" | "landscape";

/** Phones (shorter side) sit at/under this; above it is a tablet. */
const PHONE_MAX_SHORTER_SIDE = 600;

function mq(query: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/**
 * True only on a genuinely touch-first device: a coarse pointer that also
 * cannot hover. Mouse desktops (fine pointer) and touchscreen laptops (which
 * still report `(hover: hover)`) fail this and are treated as desktop.
 */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return mq("(pointer: coarse)") && mq("(hover: none)");
}

/**
 * Classify the current device. Non-touch → always "desktop". Touch devices are
 * split phone/tablet by the shorter (orientation-independent) viewport side.
 */
export function getDeviceClass(): DeviceClass {
  if (typeof window === "undefined") return "desktop";
  if (!isTouchDevice()) return "desktop";
  const shorter = Math.min(window.innerWidth, window.innerHeight);
  return shorter <= PHONE_MAX_SHORTER_SIDE ? "phone" : "tablet";
}

/** Current viewport orientation. SSR-safe (→ "portrait"). */
export function getOrientation(): Orientation {
  if (typeof window === "undefined") return "portrait";
  try {
    return window.matchMedia("(orientation: portrait)").matches
      ? "portrait"
      : "landscape";
  } catch {
    // Fallback when matchMedia is unavailable: compare dimensions.
    return window.innerHeight >= window.innerWidth ? "portrait" : "landscape";
  }
}

export interface DeviceState {
  device: DeviceClass;
  orientation: Orientation;
}

function resolveDeviceState(): DeviceState {
  return { device: getDeviceClass(), orientation: getOrientation() };
}

/* ── Shared module-level store ────────────────────────────────────────────────
 * Every `Card` (and other consumers) calls `useDeviceClass()`, so a full board
 * mounts O(cards) of this hook. To avoid O(cards) duplicate window/matchMedia
 * listeners we keep ONE module-level subscription, ref-counted: the listeners
 * are installed on the first subscriber and removed on the last unsubscribe.
 *
 * `getSnapshot` MUST return a STABLE reference — React's useSyncExternalStore
 * loops if the snapshot identity changes when the value hasn't. So we cache the
 * `{device,orientation}` object and only replace it when device or orientation
 * actually changes. The resolution logic itself (getDeviceClass/getOrientation)
 * is unchanged. */
const SERVER_STATE: DeviceState = { device: "desktop", orientation: "portrait" };

let cachedState: DeviceState =
  typeof window === "undefined" ? SERVER_STATE : resolveDeviceState();

const subscribers = new Set<() => void>();
let listenersInstalled = false;
let orientationMql: MediaQueryList | null = null;

function recompute(): void {
  const next = resolveDeviceState();
  if (
    next.device === cachedState.device &&
    next.orientation === cachedState.orientation
  ) {
    return; // value unchanged → keep the stable reference, notify nobody
  }
  cachedState = next; // new identity only when the value truly changes
  for (const cb of subscribers) cb();
}

function installListeners(): void {
  if (listenersInstalled || typeof window === "undefined") return;
  listenersInstalled = true;
  window.addEventListener("resize", recompute, { passive: true });
  window.addEventListener("orientationchange", recompute, { passive: true });
  try {
    orientationMql = window.matchMedia("(orientation: portrait)");
    orientationMql.addEventListener("change", recompute);
  } catch {
    /* matchMedia unavailable — resize/orientationchange still cover it */
  }
  // Re-sync in case the viewport differs from the initial guess.
  recompute();
}

function removeListeners(): void {
  if (!listenersInstalled || typeof window === "undefined") return;
  listenersInstalled = false;
  window.removeEventListener("resize", recompute);
  window.removeEventListener("orientationchange", recompute);
  try {
    orientationMql?.removeEventListener("change", recompute);
  } catch {
    /* ignore */
  }
  orientationMql = null;
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  if (subscribers.size === 1) installListeners();
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0) removeListeners();
  };
}

function getSnapshot(): DeviceState {
  return cachedState;
}

function getServerSnapshot(): DeviceState {
  return SERVER_STATE;
}

/**
 * Subscribe to the current device class + orientation. Backed by a SINGLE
 * shared module-level subscription (one set of window/matchMedia listeners for
 * the whole app, regardless of how many components call this). Re-resolves on
 * resize, orientationchange, and the `(orientation: portrait)` matchMedia change
 * event; the snapshot reference only changes when the resolved value changes.
 */
export function useDeviceClass(): DeviceState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
