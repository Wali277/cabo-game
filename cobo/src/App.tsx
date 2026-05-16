import { useEffect, useState } from "react";
import "./App.css";
import { useStore } from "./state/store";
import { Menu } from "./ui/Menu";
import { Table } from "./ui/Table";
import { Lobby } from "./ui/Lobby";
import { CoinToss } from "./ui/CoinToss";
import { AudioControls } from "./ui/AudioControls";
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

  if (!hydrated) return null;
  return (
    <>
      {screen === "menu" && <Menu />}
      {screen === "lobby" && <Lobby initialCode={initialRoom ?? undefined} />}
      {screen === "coin_toss" && <CoinToss />}
      {screen === "game" && <Table />}
      <AudioControls />
    </>
  );
}

export default App;
