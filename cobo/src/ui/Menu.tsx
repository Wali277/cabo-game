import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";
import { MenuWallpaper } from "./MenuWallpaper";
import { useViewMode, setViewMode } from "../state/viewmode";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

/** Which platform's manual "Add to Home Screen" copy to show. */
type InstallPlatform = "ios" | "android";

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

/** Android "more" menu glyph (3 vertical dots) for the install banner. */
function MenuDotsGlyph() {
  return (
    <svg width="6" height="20" viewBox="0 0 6 20" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="3" r="2.3" />
      <circle cx="3" cy="10" r="2.3" />
      <circle cx="3" cy="17" r="2.3" />
    </svg>
  );
}

function installDismissed(): boolean {
  try {
    return localStorage.getItem("cabo:a2hs-dismissed") === "1";
  } catch { /* private mode — fall through */ }
  return false;
}

function markInstallDismissed(): void {
  try { localStorage.setItem("cabo:a2hs-dismissed", "1"); } catch { /* ignore */ }
}

function isStandaloneDisplay(): boolean {
  return (
    (navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

/** Phone test: a coarse (touch) PRIMARY pointer. Desktop Chromium browsers
 *  (mouse = fine pointer) fire `beforeinstallprompt` too, but the "Add to Home
 *  Screen" banner is meaningless on a PC — so we only surface it on phones. */
function isPhoneDevice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

/** Which manual "Add to Home Screen" instructions to offer, or null to not show
 *  the banner. iOS Safari AND Android Chrome both lack our one-tap install
 *  (there is no service worker, so `beforeinstallprompt` never fires on Android),
 *  so BOTH get a manual banner + tutorial. `?a2hs=ios|android|1` forces it on in
 *  any browser for local preview. */
function detectInstallPlatform(): InstallPlatform | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const forced = params.get("a2hs");
  if (forced === "ios") return "ios";
  if (forced === "android") return "android";
  if (installDismissed()) return null;
  if (isStandaloneDisplay()) return null;
  const ua = navigator.userAgent || "";
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ masquerades as macOS, so also treat touch-capable "Macs" as iOS.
    (navigator.platform === "MacIntel" && (navigator as { maxTouchPoints?: number }).maxTouchPoints! > 1);
  if (isIOS) return "ios";
  if (/android/i.test(ua)) return "android";
  if (forced === "1") return "ios"; // legacy ?a2hs=1 → default to the iOS copy
  return null;
}

export function Menu() {
  const trainInit = useStore((s) => s.trainInit);
  const setScreen = useStore((s) => s.setScreen);
  const setPendingNumBots = useStore((s) => s.setPendingNumBots);
  const viewMode = useViewMode();
  const [bots, setBots] = useState(1);
  // "How to play" opens the same centered reference notepad as the in-game
  // Help (?) button (rendered app-root by <HelpButton/>), via this store flag.
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  // Training Chamber: clicking the button reveals a Classic / Lumo Evolved choice.
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

  const [installPlatform, setInstallPlatform] = useState<InstallPlatform | null>(
    detectInstallPlatform,
  );
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  // Show the banner when we have a platform to instruct OR a native prompt.
  const showInstall = installPlatform !== null || installPrompt !== null;

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Phones only — never pop our install banner on desktop Chromium, which
      // also fires this event but where "Add to Home Screen" makes no sense.
      if (installDismissed() || isStandaloneDisplay() || !isPhoneDevice()) return;
      // A native prompt is available (Android Chrome WITH a service worker):
      // upgrade the banner to a one-tap Install button. Default the platform to
      // "android" so the manual copy is right if the prompt is ever lost.
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallPlatform((p) => p ?? "android");
    };
    const onAppInstalled = () => {
      markInstallDismissed();
      setInstallPrompt(null);
      setInstallPlatform(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const dismissInstall = () => {
    markInstallDismissed();
    setInstallPrompt(null);
    setInstallPlatform(null);
  };

  const promptInstall = async () => {
    if (!installPrompt) return;
    Audio.playSfx("click");
    const promptEvent = installPrompt;
    setInstallPrompt(null);
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } finally {
      markInstallDismissed();
      setInstallPlatform(null);
    }
  };

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
        <span className="title-text">LUMO!</span>
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
          onClick={() => { Audio.playSfx("click"); setHelpOpen(true); }}
        >
          ? How to play
        </button>
        {/* Accounts entry moved out of the menu card (Phase 3): the sign-in
            invite / profile pill now lives in the fixed bottom-left
            <AccountMenuTab/>, with the full Account · Styles · Settings panel
            in <ProfilePanel/> (both mounted from App.tsx). */}
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
                🐉 Lumo Evolved
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
          <span className="a2hs-icon" aria-hidden="true">
            {installPlatform === "android" ? <MenuDotsGlyph /> : <ShareGlyph />}
          </span>
          <div className="a2hs-text">
            <strong>{installPrompt ? "Install LUMO" : "Add LUMO to Home Screen"}</strong>
            <span>
              {installPrompt
                ? "Tap Install for full-screen play from your phone."
                : installPlatform === "android"
                ? "Tap the ⋮ menu, then “Add to Home screen”."
                : "Tap Share, then “Add to Home Screen”."}
            </span>
          </div>
          {installPrompt && (
            <button className="a2hs-install" onClick={promptInstall}>
              Install
            </button>
          )}
          <button
            className="a2hs-dismiss"
            onClick={dismissInstall}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </motion.div>
      )}

    </div>
  );
}
