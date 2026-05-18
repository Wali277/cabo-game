import { useEffect, useRef, useState } from "react";
import "./App.css";
import { useStore } from "./state/store";
import { Menu } from "./ui/Menu";
import { Table } from "./ui/Table";
import { Lobby } from "./ui/Lobby";
import { CoinToss } from "./ui/CoinToss";
import { StrawDraw } from "./ui/StrawDraw";
import { AudioControls } from "./ui/AudioControls";
import { ChatPanel } from "./ui/ChatPanel";
import { EliminatedOverlay } from "./ui/EliminatedOverlay";
import { getSocket } from "./state/mp";

function getRoomFromPath(): string | null {
  const m = window.location.pathname.match(/\/room\/([A-Za-z0-9]{4,8})/);
  return m ? m[1].toUpperCase() : null;
}

function App() {
  const screen = useStore((s) => s.screen);
  const enterLobby = useStore((s) => s.enterLobby);
  const [initialRoom] = useState<string | null>(() => getRoomFromPath());
  const [hydrated, setHydrated] = useState(false);

  const prevScreenRef = useRef(screen);
  const firstRender = useRef(true);

  useEffect(() => {
    const room = getRoomFromPath();
    if (room) {
      // A room code in the URL means the player followed a share link or is
      // refreshing mid-game. Open the socket (which auto-rejoins via the stored
      // session if one exists) and navigate to the lobby/room screen.
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
      {screen === "lobby" && <Lobby initialCode={initialRoom ?? undefined} />}
      {screen === "coin_toss" && <CoinToss />}
      {screen === "straw_draw" && <StrawDraw />}
      {screen === "game" && <Table />}
      <AudioControls />
      <ChatPanel />
      <EliminatedOverlay />
    </>
  );
}

export default App;
