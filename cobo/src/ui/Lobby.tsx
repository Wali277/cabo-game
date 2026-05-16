import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useStore } from "../state/store";
import {
  createRoom as createRoomMp,
  joinRoom as joinRoomMp,
  sendReady,
} from "../state/mp";

interface Props {
  initialCode?: string;
}

export function Lobby({ initialCode }: Props) {
  const mp = useStore((s) => s.mp);
  const [mode, setMode] = useState<"choose" | "join">(
    initialCode ? "join" : "choose",
  );
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode?.toUpperCase() ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const backToMenu = useStore((s) => s.backToMenu);
  const leaveRoomToLobby = useStore((s) => s.leaveRoomToLobby);

  // Tick every 500ms while a ready countdown is running so the timer updates.
  useEffect(() => {
    if (!mp?.readyStartedAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [mp?.readyStartedAt]);

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
    const url = `${window.location.origin}/room/${mp.code}`;
    const iReady = mp.readyVotes.includes(mp.viewerId);
    const opponentReadyId = mp.readyVotes.find((id) => id !== mp.viewerId);
    const opponentReadyName = opponentReadyId
      ? mp.members.find((m) => m.id === opponentReadyId)?.name ?? "Opponent"
      : null;
    const enoughPlayers = mp.members.length >= 2;
    const readySecondsLeft = mp.readyStartedAt
      ? Math.max(0, Math.ceil((10_000 - (now - mp.readyStartedAt)) / 1000))
      : null;

    function copyCode() {
      navigator.clipboard?.writeText(mp!.code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    }
    function copyUrl() {
      navigator.clipboard?.writeText(url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 1500);
    }
    async function handleReady() {
      setBusy(true);
      await sendReady();
      setBusy(false);
    }

    return (
      <div className="lobby">
        <motion.h1
          className="title small"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          ROOM
        </motion.h1>

        <div className="room-info-row">
          {/* Game code panel */}
          <div className="menu-card room-code-card">
            <div className="menu-label">Game code</div>
            <div className="big-room-code">{mp.code}</div>
            <button className="btn primary" onClick={copyCode}>
              {codeCopied ? "✓ Copied" : "Copy code"}
            </button>
            <div className="menu-label" style={{ marginTop: 6 }}>Or share link</div>
            <div className="share-row">
              <input className="share-url" readOnly value={url} onFocus={(e) => e.target.select()} />
              <button className="btn" onClick={copyUrl}>
                {urlCopied ? "✓" : "Copy"}
              </button>
            </div>
          </div>

          {/* Players panel */}
          <div className="menu-card room-players-card">
            <div className="menu-label">Players ({mp.members.length}/4)</div>
            <div className="members">
              {mp.members.map((m) => (
                <div key={m.id} className={`member ${m.connected ? "" : "offline"}`}>
                  <span className="mname">{m.name}</span>
                  {m.isHost && <span className="badge host">HOST</span>}
                  {mp.readyVotes.includes(m.id) && <span className="badge ready">READY</span>}
                  {!m.connected && <span className="badge off">offline</span>}
                </div>
              ))}
              {Array.from({ length: Math.max(0, 4 - mp.members.length) }).map((_, i) => (
                <div key={`empty${i}`} className="member empty">waiting…</div>
              ))}
            </div>

            {/* Ready-up section */}
            {enoughPlayers && (
              <div className="ready-section">
                {!iReady ? (
                  <>
                    {opponentReadyName && readySecondsLeft !== null && (
                      <div className="ready-notice">
                        {opponentReadyName} is ready!
                        <span className="ready-timer"> Starting in {readySecondsLeft}s…</span>
                      </div>
                    )}
                    <button
                      className={`btn primary big${opponentReadyName ? " ready-pulse" : ""}`}
                      disabled={busy}
                      onClick={handleReady}
                    >
                      {opponentReadyName ? "Start game now!" : "Ready to start"}
                    </button>
                  </>
                ) : (
                  <div className="ready-waiting">
                    {opponentReadyName
                      ? "Starting…"
                      : readySecondsLeft !== null
                      ? `Game starts in ${readySecondsLeft}s — waiting for other player`
                      : "Waiting for other player…"}
                  </div>
                )}
              </div>
            )}
            {!enoughPlayers && (
              <div className="hint">Need at least 2 players to start</div>
            )}

            <div className="room-nav-row">
              <button className="btn" onClick={leaveRoomToLobby}>← Back to rooms</button>
              <button className="btn ghost" onClick={backToMenu}>Main menu</button>
            </div>
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
            <button className="btn primary big" disabled={busy} onClick={doCreate}>
              {busy ? "Creating…" : "Create room"}
            </button>
            <button className="btn big" onClick={() => setMode("join")}>
              Join room
            </button>
          </div>
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
