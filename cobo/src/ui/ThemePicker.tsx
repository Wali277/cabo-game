import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Audio } from "../audio/sounds";
import { useStore } from "../state/store";
import {
  type TableTheme,
  THEME_LABELS,
  setTheme,
  useTheme,
} from "../state/theme";
import {
  type CardSkin,
  SKIN_LABELS,
  setCardSkin,
  useCardSkin,
} from "../state/cardskin";
import { CardView } from "./Card";
import type { Card } from "../engine/types";

/**
 * Customize FAB: a unified picker that lets the player change BOTH the table
 * wallpaper (background gradient) AND the playing-card skin. A segmented
 * control at the top of the popover toggles between the two tabs.
 *
 * Open/close state lives in the store (`themeOpen`) so the 3-way FAB mutex
 * with chat/audio works:  opening this closes the others; opening either of
 * them closes this. See store.ts `setThemeOpen` / `setChatOpen` / `setAudioOpen`.
 *
 * Visual stack on the right edge (bottom → top):
 *   - bottom: 18px   → audio FAB    (AudioControls — always shown)
 *   - bottom: 96px   → chat FAB     (multiplayer only)
 *   - bottom: 174px  → THIS FAB     (MP placement)
 *
 * In single-player ChatPanel returns null, so this FAB drops down into the
 * empty chat slot via the `.sp` class (see App.css).
 */

const THEMES: TableTheme[] = [
  "emerald",
  "ocean",
  "crimson",
  "northern",
  "cosmic",
  "aquarium",
];

const SKINS: CardSkin[] = [
  "classic",
  "royal",
  "neon",
  "handdrawn",
  "minimalist",
  "mclaren_papaya",
  "mclaren_senna",
];

type Tab = "wallpaper" | "card";

export function ThemePicker() {
  const theme = useTheme();
  const skin = useCardSkin();
  const mode = useStore((s) => s.mode);
  const mp = useStore((s) => s.mp);
  const open = useStore((s) => s.themeOpen);
  const setOpen = useStore((s) => s.setThemeOpen);
  const chatHidden = mode !== "mp" || !mp;
  const [tab, setTab] = useState<Tab>("wallpaper");
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
  }, [open, setOpen]);

  function pickTheme(t: TableTheme) {
    Audio.playSfx("click");
    setTheme(t);
  }
  function pickSkin(s: CardSkin) {
    Audio.playSfx("click");
    setCardSkin(s);
  }

  // Preview cards used in the skin tab. Each tile renders a tiny CardView with
  // skinOverride so the user sees the actual style they're about to apply.
  // We use rank "A" (Aces) so the front shows a clean glyph, and the suit
  // mixes red+black so the user can spot the suit-color treatment.
  const previewCards: Card[] = [
    { id: "p_a", rank: "A", suit: "H" }, // red
    { id: "p_b", rank: "K", suit: "S" }, // black
  ];

  return (
    <div className={`theme-picker${chatHidden ? " sp" : ""}${open ? " open" : ""}`} ref={rootRef}>
      <AnimatePresence>
        {open && (
          <motion.div
            key="popover"
            className="theme-popover customize-popover"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {/* ── Tab strip ───────────────────────────────────────────── */}
            <div className="customize-tabs" role="tablist" aria-label="Customize">
              <button
                role="tab"
                aria-selected={tab === "wallpaper"}
                className={`customize-tab ${tab === "wallpaper" ? "active" : ""}`}
                onClick={() => { Audio.playSfx("click"); setTab("wallpaper"); }}
              >
                <span className="customize-tab-icon" aria-hidden="true">🖼</span>
                Wallpaper
              </button>
              <button
                role="tab"
                aria-selected={tab === "card"}
                className={`customize-tab ${tab === "card" ? "active" : ""}`}
                onClick={() => { Audio.playSfx("click"); setTab("card"); }}
              >
                <span className="customize-tab-icon" aria-hidden="true">🂠</span>
                Card
              </button>
              <motion.div
                className="customize-tab-indicator"
                animate={{ x: tab === "wallpaper" ? 0 : "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            </div>

            {/* ── Wallpaper tab ───────────────────────────────────────── */}
            {tab === "wallpaper" && (
              <motion.div
                key="tab-wallpaper"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.18 }}
                className="theme-popover-grid"
              >
                {THEMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`theme-swatch ${theme === t ? "selected" : ""}`}
                    onClick={() => pickTheme(t)}
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
              </motion.div>
            )}

            {/* ── Card tab ────────────────────────────────────────────── */}
            {tab === "card" && (
              <motion.div
                key="tab-card"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.18 }}
                className="skin-grid"
              >
                {SKINS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`skin-tile ${skin === s ? "selected" : ""} skin-tile-${s}`}
                    onClick={() => pickSkin(s)}
                    aria-pressed={skin === s}
                    aria-label={`Set card skin to ${SKIN_LABELS[s]}`}
                  >
                    <div className="skin-tile-preview">
                      <div className="skin-tile-card skin-tile-card-back">
                        <CardView
                          card={previewCards[0]}
                          faceUp={false}
                          size="sm"
                          skinOverride={s}
                        />
                      </div>
                      <div className="skin-tile-card skin-tile-card-front">
                        <CardView
                          card={previewCards[1]}
                          faceUp={true}
                          size="sm"
                          skinOverride={s}
                        />
                      </div>
                    </div>
                    <div className="skin-tile-label">{SKIN_LABELS[s]}</div>
                    {skin === s && (
                      <span className="skin-tile-check" aria-hidden="true">✓</span>
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        className={`theme-fab ${open ? "open" : ""}`}
        onClick={() => {
          Audio.playSfx("click");
          setOpen(!open);
        }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        aria-label={open ? "Close customize" : "Open customize"}
        aria-expanded={open}
      >
        <span className="theme-fab-icon" aria-hidden="true">🎨</span>
      </motion.button>
    </div>
  );
}
