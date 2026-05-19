import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Audio } from "../audio/sounds";
import {
  type TableTheme,
  THEME_LABELS,
  setTheme,
  useTheme,
} from "../state/theme";

/**
 * Floating theme picker that lives **above the chat button** in the in-game UI.
 *
 * Visual stack (right edge, bottom→top):
 *   - bottom: 18px  → audio FAB     (AudioControls)
 *   - bottom: 96px  → chat FAB      (ChatPanel)
 *   - bottom: 174px → theme FAB     (this component)
 *
 * Each button is a 52px circle with a 26px gap to the next, matching the
 * spacing already used by the audio + chat FABs. The popover anchors above the
 * button and shows live gradient previews driven by the same CSS that paints
 * the actual table background — so the swatches always look exactly like the
 * theme they apply.
 */

const THEMES: TableTheme[] = ["emerald", "velvet", "crimson", "aurora", "cosmic"];

export function ThemePicker() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(t: TableTheme) {
    Audio.playSfx("click");
    setTheme(t);
    // Keep the popover open for a beat so the user sees the new selection
    // ring snap to the chosen swatch — they can close at their own pace.
  }

  return (
    <div className="theme-picker" ref={rootRef}>
      <AnimatePresence>
        {open && (
          <motion.div
            key="popover"
            className="theme-popover"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="theme-popover-title">Table theme</div>
            <div className="theme-popover-grid">
              {THEMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`theme-swatch ${theme === t ? "selected" : ""}`}
                  onClick={() => pick(t)}
                  aria-pressed={theme === t}
                  aria-label={`Set table theme to ${THEME_LABELS[t]}`}
                >
                  <span
                    className="theme-swatch-preview"
                    data-theme={t}
                    aria-hidden="true"
                  />
                  <span className="theme-swatch-label">{THEME_LABELS[t]}</span>
                  {theme === t && (
                    <span className="theme-swatch-check" aria-hidden="true">✓</span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        className={`theme-fab ${open ? "open" : ""}`}
        onClick={() => {
          Audio.playSfx("click");
          setOpen((v) => !v);
        }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        aria-label={open ? "Close theme picker" : "Open theme picker"}
        aria-expanded={open}
      >
        <span className="theme-fab-icon" aria-hidden="true">🎨</span>
      </motion.button>
    </div>
  );
}
