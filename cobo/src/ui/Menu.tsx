import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useStore } from "../state/store";
import { Tutorial } from "./Tutorial";
import { Audio } from "../audio/sounds";
import { MenuWallpaper } from "./MenuWallpaper";
import { useViewMode, setViewMode } from "../state/viewmode";

/** Small iOS "Share" glyph (box with an up arrow) for the install banner. */
function ShareGlyph() {
  return (
    <svg width="17" height="20" viewBox="0 0 17 20" fill="none" aria-hidden="true">
      <path d="M8.5 1.2 V12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M5.2 4.3 L8.5 1 L11.8 4.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 7.5 H3.2 A2 2 0 0 0 1.2 9.5 V16.6 A2 2 0 0 0 3.2 18.6 H13.8 A2 2 0 0 0 15.8 16.6 V9.5 A2 2 0 0 0 13.8 7.5 H12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Whether to show the "Add to Home Screen" recommendation: iOS Safari that
 *  isn't already running as an installed PWA, and the user hasn't dismissed it.
 *  `?a2hs=1` forces it on in any browser for local preview testing. */
function shouldOfferInstall(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("a2hs") === "1") return true;
  try {
    if (localStorage.getItem("cabo:a2hs-dismissed") === "1") return false;
  } catch { /* private mode — fall through */ }
  const ua = navigator.userAgent || "";
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ masquerades as macOS, so also treat touch-capable "Macs" as iOS.
    (navigator.platform === "MacIntel" && (navigator as { maxTouchPoints?: number }).maxTouchPoints! > 1);
  const isStandalone =
    (navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  return isIOS && !isStandalone;
}

export function Menu() {
  const trainInit = useStore((s) => s.trainInit);
  const setScreen = useStore((s) => s.setScreen);
  const setPendingNumBots = useStore((s) => s.setPendingNumBots);
  const viewMode = useViewMode();
  const [bots, setBots] = useState(1);
  const [showTutorial, setShowTutorial] = useState(false);
  // Training Chamber: clicking the button reveals a Classic / Cabo Evolved choice.
  const [trainOpen, setTrainOpen] = useState(false);

  // Master sound toggle (mutes/unmutes both music + SFX together). Kept in sync
  // with the in-game audio controls via Audio.subscribe so the icon is correct
  // no matter where the user last changed it.
  const [muted, setMuted] = useState(() => {
    const s = Audio.getSettings();
    return s.musicMuted && s.sfxMuted;
  });
  useEffect(() => {
    const unsub = Audio.subscribe(() => {
      const s = Audio.getSettings();
      setMuted(s.musicMuted && s.sfxMuted);
    });
    return () => { unsub(); };
  }, []);
  const toggleMute = () => {
    Audio.ensure();
    const next = !muted;
    Audio.setMusicMuted(next);
    Audio.setSfxMuted(next);
    setMuted(next);
    if (!next) Audio.playSfx("click"); // little chirp so unmuting is audible
  };

  const [showInstall, setShowInstall] = useState(shouldOfferInstall);

  return (
    <div className="menu menu-refresh">
      <MenuWallpaper />
      <button
        className={`menu-sound-toggle${muted ? " is-muted" : ""}`}
        onClick={toggleMute}
        aria-label={muted ? "Unmute game sound" : "Mute game sound"}
        title={muted ? "Sound off — tap to unmute" : "Sound on — tap to mute"}
      >
        {muted ? "🔇" : "🔊"}
      </button>
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
        {!trainOpen ? (
          <button
            className="btn ghost-light"
            onClick={() => { Audio.playSfx("click"); setTrainOpen(true); }}
          >
            🧪 Training Chamber
          </button>
        ) : (
          <div className="train-choice">
            <span className="train-choice-label">Train which mode?</span>
            <div className="train-choice-row">
              <button className="btn ghost-light" onClick={() => trainInit("classic")}>
                ♣ Classic
              </button>
              <button className="btn ghost-light" onClick={() => trainInit("evolved")}>
                🐉 Cabo Evolved
              </button>
            </div>
            <button className="train-choice-cancel" onClick={() => setTrainOpen(false)}>
              ← cancel
            </button>
          </div>
        )}
        <div className="hint">
          Multiplayer creates a room with a shareable URL. Up to 4 players.
        </div>
      </motion.div>

      {showInstall && (
        <motion.div
          className="a2hs-banner"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.55, type: "spring", stiffness: 220, damping: 24 }}
        >
          <span className="a2hs-icon" aria-hidden="true"><ShareGlyph /></span>
          <div className="a2hs-text">
            <strong>Add CABO to your Home Screen</strong>
            <span>Tap Share, then “Add to Home Screen” for full-screen play.</span>
          </div>
          <button
            className="a2hs-dismiss"
            onClick={() => {
              try { localStorage.setItem("cabo:a2hs-dismissed", "1"); } catch { /* ignore */ }
              setShowInstall(false);
            }}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </motion.div>
      )}

      {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}
    </div>
  );
}
