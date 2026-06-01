import { motion } from "framer-motion";
import { useState } from "react";
import { useStore } from "../state/store";
import { MenuWallpaper } from "./MenuWallpaper";
import {
  createRoom as createRoomMp,
  joinRoom as joinRoomMp,
  sendReady,
  sendUnready,
  setVariantMp,
} from "../state/mp";
import { CaboEvolvedInfo } from "./CaboEvolvedInfo";

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
  const [infoOpen, setInfoOpen] = useState(false);
  const [variantBusy, setVariantBusy] = useState(false);
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
    const url = `${window.location.origin}/room/${mp.code}`;
    const iReady = mp.readyVotes.includes(mp.viewerId);
    // The server waits on every CONNECTED player (a dropped player can't click,
    // so they don't block the start). Mirror that here: count connected members
    // only, so "X/N ready" matches when the game actually begins.
    const connectedMembers = mp.members.filter((m) => m.connected);
    const readyCount = connectedMembers.filter((m) => mp.readyVotes.includes(m.id)).length;
    const enoughPlayers = connectedMembers.length >= 2;
    const isHost = mp.hostId === mp.viewerId;

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
    async function handleUnready() {
      setBusy(true);
      await sendUnready();
      setBusy(false);
    }
    async function chooseVariant(v: "classic" | "evolved") {
      if (!isHost || mp!.variant === v || variantBusy) return;
      setVariantBusy(true);
      await setVariantMp(v);
      setVariantBusy(false);
    }

    return (
      <>
      <div className="lobby menu-refresh">
        <MenuWallpaper />
        <motion.h1
          className="title small"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <span className="title-text">ROOM</span>
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

            {/* Game mode — the host chooses; everyone else sees it read-only. */}
            <div className="mode-select" style={{ margin: "10px 0 4px" }}>
              <span className="mode-select-label">Game mode</span>
              <div
                className="mode-select-options"
                role={isHost ? "radiogroup" : "group"}
                aria-label="Game mode"
              >
                {isHost ? (
                  <>
                    <button
                      role="radio"
                      aria-checked={mp.variant === "classic"}
                      className={`mode-option ${mp.variant === "classic" ? "active" : ""}`}
                      disabled={variantBusy}
                      onClick={() => chooseVariant("classic")}
                    >
                      Classic
                    </button>
                    <button
                      role="radio"
                      aria-checked={mp.variant === "evolved"}
                      className={`mode-option evolved ${mp.variant === "evolved" ? "active" : ""}`}
                      disabled={variantBusy}
                      onClick={() => chooseVariant("evolved")}
                    >
                      Cabo Evolved
                    </button>
                  </>
                ) : (
                  <span
                    className={`mode-option active ${mp.variant === "evolved" ? "evolved" : ""}`}
                  >
                    {mp.variant === "evolved" ? "Cabo Evolved" : "Classic"}
                  </span>
                )}
                <button
                  className="mode-info-btn"
                  onClick={() => setInfoOpen(true)}
                  aria-label="How Cabo Evolved works"
                  title="How Cabo Evolved works"
                >
                  &#9432;
                </button>
              </div>
              {!isHost && <div className="hint">Mode is set by the host</div>}
            </div>

            {/* Ready-up: every player must click Ready before the coin toss /
                straw draw begins. Anyone can Cancel to withdraw — no timer, so
                nobody is rushed. The game starts the moment everyone is ready. */}
            {enoughPlayers && (
              <div className="ready-section">
                <div className="ready-count">
                  {readyCount}/{connectedMembers.length} players ready
                </div>
                {!iReady ? (
                  <button
                    className="btn primary big"
                    disabled={busy}
                    onClick={handleReady}
                  >
                    Ready to start
                  </button>
                ) : (
                  <>
                    <div className="ready-waiting">
                      You're ready — waiting for everyone else…
                    </div>
                    <button
                      className="btn ghost"
                      disabled={busy}
                      onClick={handleUnready}
                    >
                      Cancel — I'm not ready
                    </button>
                  </>
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
      <CaboEvolvedInfo open={infoOpen} onClose={() => setInfoOpen(false)} />
      </>
    );
  }

  // Not in a room yet
  return (
    <div className="lobby menu-refresh">
      <MenuWallpaper />
      <motion.h1
        className="title"
        initial={{ scale: 0.4, rotate: -10, opacity: 0 }}
        animate={{ scale: 1, rotate: -6, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 14 }}
      >
        <span className="title-text">CABO!</span>
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
