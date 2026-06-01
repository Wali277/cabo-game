import { useEffect, useRef, useState } from "react"; // useState kept for hydrated
import "./App.css";
import { useStore } from "./state/store";
import { Menu } from "./ui/Menu";
import { BotPicker } from "./ui/BotPicker";
import { Table } from "./ui/Table";
import { Lobby } from "./ui/Lobby";
import { CoinToss } from "./ui/CoinToss";
import { StrawDraw } from "./ui/StrawDraw";
import { AudioControls } from "./ui/AudioControls";
import { HelpButton } from "./ui/HelpButton";
import { ChatPanel } from "./ui/ChatPanel";
import { ThemePicker } from "./ui/ThemePicker";
import { EliminatedOverlay } from "./ui/EliminatedOverlay";
import { SnapControls } from "./ui/SnapControls";
import { SnapCinematic } from "./ui/SnapCinematic";
import { SnapBonusOverlay } from "./ui/SnapBonusOverlay";
import { DragonRankPicker } from "./ui/DragonRankPicker";
import { DragonActivateCinematic } from "./ui/DragonActivateCinematic";
import { BUSTED_ROOM_KEY } from "./ui/BustedOverlay";
import { getSocket } from "./state/mp";
import { useViewMode, isStandalone } from "./state/viewmode";

function getRoomFromPath(): string | null {
  const m = window.location.pathname.match(/\/room\/([A-Za-z0-9]{4,8})/);
  return m ? m[1].toUpperCase() : null;
}

function App() {
  const screen = useStore((s) => s.screen);
  const enterLobby = useStore((s) => s.enterLobby);
  // NOTE: do NOT memoize the room code here. leaveRoom() clears the URL to "/"
  // so re-reading getRoomFromPath() on each Lobby mount gives the correct value
  // (null after a game ends, real code only on a fresh direct-link visit).
  const [hydrated, setHydrated] = useState(false);

  // Phone-mode toggle (set via the button in the main menu). Adds a single
  // `mobile-mode` class to <body> that drives every layout override in App.css.
  const viewMode = useViewMode();
  useEffect(() => {
    document.body.classList.toggle("mobile-mode", viewMode === "mobile");
    return () => { document.body.classList.remove("mobile-mode"); };
  }, [viewMode]);

  // Installed-PWA flag → CSS reclaims the status-bar safe area and uses the
  // extra space. Standalone never changes within a session, so set it once.
  useEffect(() => {
    document.body.classList.toggle("standalone", isStandalone());
  }, []);

  const prevScreenRef = useRef(screen);
  const firstRender = useRef(true);

  useEffect(() => {
    const room = getRoomFromPath();
    if (room) {
      // Check if this player was previously busted/eliminated from this room.
      // If yes, show the elimination screen immediately — don't enter the lobby.
      try {
        const raw = localStorage.getItem(BUSTED_ROOM_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as { code: string };
          if (saved.code === room) {
            useStore.setState({ eliminatedFromRoom: true });
            setHydrated(true);
            return;
          }
        }
      } catch { /* ignore malformed data */ }

      // Normal path: open the socket (auto-rejoins via stored session if any)
      // and navigate to the lobby/room screen.
      getSocket();
      enterLobby();
    }
    setHydrated(true);
  }, [enterLobby]);

  // ── Browser history sync ──────────────────────────────────────────────────
  // The app uses Zustand state for navigation, not a router, so the browser
  // has no history by default. We push exactly ONE entry when leaving the menu
  // and replace it when returning, giving the back button one meaningful step.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      history.replaceState({ cabScreen: screen }, "");
      prevScreenRef.current = screen;
      return;
    }

    const prev = prevScreenRef.current;
    prevScreenRef.current = screen;

    if (screen === "menu") {
      // Back at menu (via UI button or browser back) — replace so there's
      // nothing left to go "forward" to.
      history.replaceState({ cabScreen: "menu" }, "");
    } else if (prev === "menu") {
      // Leaving menu for a new session — push one entry so back works.
      history.pushState({ cabScreen: screen }, "");
    }
    // Internal transitions (lobby → coin_toss → game) intentionally share
    // the same single history entry; no extra push.
  }, [screen]);

  // ── Browser back / forward handler ────────────────────────────────────────
  useEffect(() => {
    function handlePopState() {
      const { screen: s, game, backToMenu } = useStore.getState();

      // Mirror the "← Menu" button: ask for confirmation mid-game
      if (s === "game" && game?.phase !== "round_over") {
        const ok = window.confirm("Leave the game and return to the main menu?");
        if (!ok) {
          // User cancelled — re-push so the browser history entry is restored
          history.pushState({ cabScreen: s }, "");
          return;
        }
      }

      backToMenu();
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  if (!hydrated) return null;
  return (
    <>
      {screen === "menu" && <Menu />}
      {screen === "botPicker" && <BotPicker />}
      {screen === "lobby" && <Lobby initialCode={getRoomFromPath() ?? undefined} />}
      {screen === "coin_toss" && <CoinToss />}
      {screen === "straw_draw" && <StrawDraw />}
      {screen === "game" && <Table />}
      {screen === "game" && <SnapControls />}
      {screen === "game" && <SnapCinematic />}
      {screen === "game" && <SnapBonusOverlay />}
      {screen === "game" && <DragonRankPicker />}
      {screen === "game" && <DragonActivateCinematic />}
      <HelpButton />
      <AudioControls />
      <ChatPanel />
      {/* Theme picker is in-game only — it changes the table background,
          which doesn't exist on the menu or lobby. */}
      {screen === "game" && <ThemePicker />}
      <EliminatedOverlay />
    </>
  );
}

export default App;
