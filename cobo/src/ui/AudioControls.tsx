import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Audio } from "../audio/sounds";

/**
 * Bottom-right audio controls widget.
 *  Collapsed: a small floating circular button with a speaker icon.
 *  Expanded: a panel with two sliders (music + SFX) and per-channel mute toggles.
 *  Music starts on first interaction (browsers require a user gesture for AudioContext).
 */
export function AudioControls() {
  const [expanded, setExpanded] = useState(false);
  const [, force] = useState(0);
  const settings = Audio.getSettings();
  const panelRef = useRef<HTMLDivElement>(null);

  // Subscribe to audio engine changes so the UI mirrors saved state
  useEffect(() => {
    const unsub = Audio.subscribe(() => force((n) => n + 1));
    return () => { unsub(); };
  }, []);

  // Start music on first interaction (a real click, not just hover)
  useEffect(() => {
    const ensure = () => {
      Audio.ensure();
      Audio.startMusic();
      window.removeEventListener("pointerdown", ensure);
    };
    window.addEventListener("pointerdown", ensure);
    return () => window.removeEventListener("pointerdown", ensure);
  }, []);

  // Click outside to collapse
  useEffect(() => {
    if (!expanded) return;
    const onDown = (e: PointerEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    // Defer so the click that opened the panel doesn't immediately close it
    const t = setTimeout(() => window.addEventListener("pointerdown", onDown), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [expanded]);

  const overallIcon = settings.musicMuted && settings.sfxMuted
    ? "🔇"
    : settings.musicMuted || settings.sfxMuted
    ? "🔉"
    : "🔊";

  return (
    <div className="audio-controls" ref={panelRef}>
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="audio-panel"
            initial={{ opacity: 0, y: 12, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
          >
            <div className="audio-row">
              <button
                className="audio-mute-btn"
                aria-label="Toggle music"
                onClick={() => Audio.setMusicMuted(!settings.musicMuted)}
              >
                {settings.musicMuted ? "🔕" : "🎵"}
              </button>
              <div className="audio-slider-wrap">
                <div className="audio-label">Music</div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={settings.musicVol}
                  onChange={(e) => Audio.setMusicVol(parseFloat(e.target.value))}
                  className="audio-slider"
                  disabled={settings.musicMuted}
                />
              </div>
            </div>

            <div className="audio-row">
              <button
                className="audio-mute-btn"
                aria-label="Toggle sound effects"
                onClick={() => Audio.setSfxMuted(!settings.sfxMuted)}
              >
                {settings.sfxMuted ? "🔕" : "🎚"}
              </button>
              <div className="audio-slider-wrap">
                <div className="audio-label">Effects</div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={settings.sfxVol}
                  onChange={(e) => {
                    Audio.setSfxVol(parseFloat(e.target.value));
                    Audio.playSfx("click");
                  }}
                  className="audio-slider"
                  disabled={settings.sfxMuted}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        className="audio-fab"
        onClick={() => {
          Audio.ensure();
          Audio.startMusic();
          setExpanded((v) => !v);
        }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        aria-label="Audio settings"
      >
        {overallIcon}
      </motion.button>
    </div>
  );
}
