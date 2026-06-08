/**
 * Phone-landscape "rotate your device" cover.
 *
 * Lumo is portrait-only on PHONES (tablets are NOT locked). When a phone is
 * held in landscape this overlay covers the game (the game stays MOUNTED
 * underneath — it is a fixed full-screen cover, not an unmount) and asks the
 * player to rotate back to portrait.
 *
 * It self-gates entirely on `useDeviceClass()`: it returns null unless the
 * device is a genuine phone in landscape, so it can NEVER appear on a tablet or
 * desktop. Styling lives in App.css under the clearly-commented isolated
 * `.rotate-lock-overlay` block at the end of the file.
 */
import { useDeviceClass } from "../state/deviceClass";

export function RotateLockOverlay() {
  const { device, orientation } = useDeviceClass();
  if (device !== "phone" || orientation !== "landscape") return null;

  return (
    <div
      className="rotate-lock-overlay"
      role="alert"
      aria-live="assertive"
      aria-label="Rotate your device"
    >
      <div className="rotate-lock-inner">
        <div className="rotate-lock-glyph" aria-hidden="true">
          <div className="rotate-lock-phone" />
          <div className="rotate-lock-arrow" />
        </div>
        <h2 className="rotate-lock-title">Rotate your device</h2>
        <p className="rotate-lock-sub">Lumo plays best in portrait</p>
      </div>
    </div>
  );
}
