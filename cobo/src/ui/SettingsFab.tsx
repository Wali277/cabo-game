import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";

/**
 * Combined Settings FAB (bottom-right, desktop). Replaces the old separate Help
 * and Sound FABs: tap the gear and the Sound + Help buttons glide upward as a
 * tiny speed-dial; tap again (or click away / Esc) and they roll back. Part of
 * the one-at-a-time FAB mutex (chat / audio / theme) via the store, so opening
 * any other popover collapses this and vice-versa.
 *
 * Phones don't show this — the same Sound/Help actions live in the in-game
 * top-bar ⋯ menu and the main menu's top-right sound toggle (CSS hides it).
 *
 *   Sound → opens the audio panel (AudioControls; sliders + per-channel mute).
 *   Help  → opens the rules reference overlay (HelpReference, via helpOpen).
 */
export function SettingsFab() {
  const open = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const setAudioOpen = useStore((s) => s.setAudioOpen);
  const setReportBugOpen = useStore((s) => s.setReportBugOpen);
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);

  // Mirror the audio engine so the Sound icon matches the real mute state no
  // matter where it was last changed.
  useEffect(() => {
    const unsub = Audio.subscribe(() => force((n) => n + 1));
    return () => { unsub(); };
  }, []);

  // Close on outside click + Escape. The pointerdown listener is deferred a
  // tick so the click that opened the popover doesn't immediately close it.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSettingsOpen(false);
    }
    const t = setTimeout(() => window.addEventListener("pointerdown", onDown), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setSettingsOpen]);

  const settings = Audio.getSettings();
  const soundIcon =
    settings.musicMuted && settings.sfxMuted
      ? "🔇"
      : settings.musicMuted || settings.sfxMuted
      ? "🔉"
      : "🔊";

  function openSound() {
    Audio.ensure();
    Audio.startMusic();
    setAudioOpen(true); // mutex closes this popover
  }
  function openHelp() {
    Audio.playSfx("click");
    setSettingsOpen(false);
    setHelpOpen(true);
  }
  function openReportBug() {
    Audio.playSfx("click");
    setSettingsOpen(false);
    setReportBugOpen(true);
  }

  // Top → bottom in the column: Report Bug (farthest from the gear), then Help,
  // then Sound (nearest). They glide up with a small stagger when the gear is
  // tapped.
  const items = [
    { key: "report", icon: "🐛", label: "Report a bug", onClick: openReportBug, cls: "settings-pop-report" },
    { key: "help", icon: "?", label: "Help", onClick: openHelp, cls: "settings-pop-help" },
    { key: "sound", icon: soundIcon, label: "Sound", onClick: openSound, cls: "settings-pop-sound" },
  ];

  return (
    <div className="settings-fab-wrap" ref={rootRef}>
      <AnimatePresence>
        {open && (
          <motion.div
            key="settings-pop"
            className="settings-pop"
            initial="hidden"
            animate="shown"
            exit="hidden"
            variants={{
              shown: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
              hidden: { transition: { staggerChildren: 0.04, staggerDirection: -1 } },
            }}
          >
            {items.map((it) => (
              <motion.button
                key={it.key}
                type="button"
                className={`settings-pop-btn ${it.cls}`}
                variants={{
                  hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.8 },
                  shown: { opacity: 1, y: 0, scale: 1 },
                }}
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={it.onClick}
                aria-label={it.label}
                title={it.label}
              >
                <span aria-hidden="true">{it.icon}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        className={`settings-fab ${open ? "open" : ""}`}
        onClick={() => {
          Audio.playSfx("click");
          setSettingsOpen(!open);
        }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        aria-label={open ? "Close settings" : "Open settings"}
        aria-expanded={open}
      >
        <span className="settings-fab-icon" aria-hidden="true">⚙️</span>
      </motion.button>
    </div>
  );
}
