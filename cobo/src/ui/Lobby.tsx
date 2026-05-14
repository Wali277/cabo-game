import { motion } from "framer-motion";
import { useState } from "react";
import { useStore } from "../state/store";
import {
  createRoom as createRoomMp,
  joinRoom as joinRoomMp,
  startGame as startGameMp,
} from "../state/mp";

interface Props {
  initialCode?: string;
}

export function Lobby({ initialCode }: Props) {
  const mp = useStore((s) => s.mp);
  const [mode, setMode] = useState<"choose" | "create" | "join">(
    initialCode ? "join" : "choose",
  );
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode?.toUpperCase() ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const backToMenu = useStore((s) => s.backToMenu);
  const leaveRoomToLobby = useStore((s) => s.leaveRoomToLobby);

  async function doCreate() {
    if (!name.trim()) {
      setErr("Enter your name first");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await createRoomMp(name.trim());
      if (!r.ok) setErr(r.error ?? "Failed to create room");
      else history.replaceState(null, "", `/room/${r.code}`);
    } catch (e: any) {
      setErr(e?.message ?? "Connection failed");
    } finally {
      setBusy(false);
    }
  }

  async function doJoin() {
    if (!name.trim()) {
      setErr("Enter your name first");
      return;
    }
    if (code.length < 4) {
      setErr("Room code must be 4 characters");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await joinRoomMp(code.toUpperCase(), name.trim());
      if (!r.ok) setErr(r.error ?? "Failed to join room");
      else history.replaceState(null, "", `/room/${code.toUpperCase()}`);
    } catch (e: any) {
      setErr(e?.message ?? "Connection failed");
    } finally {
      setBusy(false);
    }
  }

  // In-room view (we've created or joined)
  if (mp) {
    const isHost = mp.hostId === mp.viewerId;
    const url = `${window.location.origin}/room/${mp.code}`;
    return (
      <div className="lobby">
        <motion.h1
          className="title small"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          ROOM <span className="room-code">{mp.code}</span>
        </motion.h1>
        <p className="subtitle">Share this link with friends to join:</p>
        <div className="share-row">
          <input className="share-url" readOnly value={url} onFocus={(e) => e.target.select()} />
          <button
            className="btn"
            onClick={() => navigator.clipboard?.writeText(url)}
          >
            Copy
          </button>
        </div>

        <div className="menu-card">
          <div className="menu-label">Players ({mp.members.length}/4)</div>
          <div className="members">
            {mp.members.map((m) => (
              <div key={m.id} className={`member ${m.connected ? "" : "offline"}`}>
                <span className="mname">{m.name}</span>
                {m.isHost && <span className="badge host">HOST</span>}
                {!m.connected && <span className="badge off">offline</span>}
              </div>
            ))}
            {Array.from({ length: Math.max(0, 4 - mp.members.length) }).map((_, i) => (
              <div key={`empty${i}`} className="member empty">
                waiting…
              </div>
            ))}
          </div>
          {isHost ? (
            <button
              className="btn primary big"
              disabled={mp.members.length < 2 || busy}
              onClick={async () => {
                setBusy(true);
                await startGameMp();
                setBusy(false);
              }}
            >
              {mp.members.length < 2 ? "Need at least 2 players" : "Start game"}
            </button>
          ) : (
            <div className="hint">Waiting for host to start…</div>
          )}
          <div className="room-nav-row">
            <button className="btn" onClick={leaveRoomToLobby}>← Back to rooms</button>
            <button className="btn ghost" onClick={backToMenu}>Main menu</button>
          </div>
        </div>
      </div>
    );
  }

  // Not in a room yet
  return (
    <div className="lobby">
      <motion.h1
        className="title"
        initial={{ scale: 0.4, rotate: -10, opacity: 0 }}
        animate={{ scale: 1, rotate: -6, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 14 }}
      >
        CABO!
      </motion.h1>
      <p className="subtitle">Play with friends</p>

      <motion.div
        className="menu-card"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <label className="menu-label">Your name</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Alex"
          maxLength={16}
        />

        {mode === "choose" && (
          <div className="row gap">
            <button className="btn primary big" onClick={() => setMode("create")}>
              Create room
            </button>
            <button className="btn big" onClick={() => setMode("join")}>
              Join room
            </button>
          </div>
        )}

        {mode === "create" && (
          <>
            <button className="btn primary big" disabled={busy} onClick={doCreate}>
              {busy ? "Creating…" : "Create the room"}
            </button>
            <button className="btn" onClick={() => setMode("choose")}>Back</button>
          </>
        )}

        {mode === "join" && (
          <>
            <label className="menu-label">Room code</label>
            <input
              className="input mono"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="ABCD"
              maxLength={4}
            />
            <button className="btn primary big" disabled={busy} onClick={doJoin}>
              {busy ? "Joining…" : "Join"}
            </button>
            <button className="btn" onClick={() => setMode("choose")}>Back</button>
          </>
        )}

        {err && <div className="error">{err}</div>}
        <button className="btn ghost" onClick={backToMenu}>← Back to menu</button>
      </motion.div>
    </div>
  );
}
