import { motion } from "framer-motion";
import { useState } from "react";
import { useStore } from "../state/store";
import { Tutorial } from "./Tutorial";
import { Audio } from "../audio/sounds";
import { MenuWallpaper } from "./MenuWallpaper";
import { useViewMode, setViewMode } from "../state/viewmode";

export function Menu() {
  const trainInit = useStore((s) => s.trainInit);
  const setScreen = useStore((s) => s.setScreen);
  const setPendingNumBots = useStore((s) => s.setPendingNumBots);
  const viewMode = useViewMode();
  const [bots, setBots] = useState(1);
  const [showTutorial, setShowTutorial] = useState(false);

  return (
    <div className="menu menu-refresh">
      <MenuWallpaper />
      <motion.h1
        className="title"
        initial={{ scale: 0.4, rotate: -10, opacity: 0 }}
        animate={{ scale: 1, rotate: -6, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 14 }}
      >
        {/* `.title-text` holds the multi-layer text-shadow stack so the
            heavy embossed look is on a child span rather than on the
            motion.h1 itself (rotation + the shadow stack compose
            cleanly when they're on different elements). */}
        <span className="title-text">CABO!</span>
      </motion.h1>
      <motion.p
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="subtitle"
      >
        The cheeky memory card game
      </motion.p>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="menu-card"
      >
        <div className="menu-section">
          <div className="menu-label">Opponents</div>
          <div className="bot-picker">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                className={`pick ${bots === n ? "active" : ""}`}
                onClick={() => setBots(n)}
              >
                {n} bot{n > 1 ? "s" : ""}
              </button>
            ))}
          </div>
        </div>
        <button
          className="btn primary big"
          onClick={() => {
            Audio.playSfx("click");
            setPendingNumBots(bots);
            setScreen("botPicker");
          }}
        >
          Play vs bots
        </button>
        <div className="divider"><span>or</span></div>
        <button
          className="btn big"
          onClick={() => useStore.getState().enterLobby()}
        >
          🃏 Play with friends
        </button>
        <button
          className="btn ghost-light"
          onClick={() => setShowTutorial(true)}
        >
          ? How to play
        </button>
        <button
          className="btn ghost-light viewmode-toggle"
          onClick={() => {
            Audio.playSfx("click");
            setViewMode(viewMode === "mobile" ? "desktop" : "mobile");
          }}
          aria-label={
            viewMode === "mobile"
              ? "Switch to desktop layout"
              : "Switch to phone layout"
          }
        >
          {viewMode === "mobile"
            ? "🖥️  Switch to desktop layout"
            : "📱 Switch to phone layout"}
        </button>
        <div className="divider"><span>dev</span></div>
        <button
          className="btn ghost-light"
          onClick={() => trainInit()}
        >
          🧪 Training Chamber
        </button>
        <div className="hint">
          Multiplayer creates a room with a shareable URL. Up to 4 players.
        </div>
      </motion.div>

      {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}
    </div>
  );
}
