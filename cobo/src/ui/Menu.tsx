import { motion } from "framer-motion";
import { useState } from "react";
import { useStore } from "../state/store";
import { Tutorial } from "./Tutorial";
import { Audio } from "../audio/sounds";

export function Menu() {
  const init = useStore((s) => s.init);
  const trainInit = useStore((s) => s.trainInit);
  const [bots, setBots] = useState(1);
  const [showTutorial, setShowTutorial] = useState(false);

  return (
    <div className="menu">
      <motion.h1
        className="title"
        initial={{ scale: 0.4, rotate: -10, opacity: 0 }}
        animate={{ scale: 1, rotate: -6, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 14 }}
      >
        CABO!
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
        <button className="btn primary big" onClick={() => { Audio.playSfx("click"); init(bots); }}>
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
        <div className="divider"><span>dev</span></div>
        <button
          className="btn training-btn"
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
