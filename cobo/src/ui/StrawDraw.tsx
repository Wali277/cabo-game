import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import { sendStrawPick } from "../state/mp";
import { Audio } from "../audio/sounds";

const CONTINUE_TIMER_MS = 10_000;

const STRAW_WINDOW_MS = 10_000;
const STRAW_STUB_H = 60;   // px — initial equal height before reveal
const STRAW_MIN_H  = 64;   // px — shortest straw after reveal
const STRAW_MAX_H  = 160;  // px — longest straw after reveal

export function StrawDraw() {
  const mp = useStore((s) => s.mp);
  const humanId = useStore((s) => s.humanId);
  const pendingGame = useStore((s) => s.pendingGame);
  const proceedFromStrawDraw = useStore((s) => s.proceedFromStrawDraw);

  const [now, setNow] = useState(Date.now());
  const sfxPlayed = useRef(false);

  useEffect(() => {
    if (!mp?.strawDraw?.startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [mp?.strawDraw?.startedAt]);

  const result = mp?.strawDraw?.result ?? null;
  useEffect(() => {
    if (result && !sfxPlayed.current) {
      sfxPlayed.current = true;
      Audio.playSfx("straw_reveal");
    }
  }, [result]);

  const [continueNow, setContinueNow] = useState(Date.now());
  const iReadyContinue = mp?.strawReadyVotes?.includes(humanId) ?? false;
  const continueStartedAt = mp?.strawReadyStartedAt ?? null;
  useEffect(() => {
    if (!continueStartedAt) return;
    const id = setInterval(() => setContinueNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [continueStartedAt]);
  const continueSecsLeft = continueStartedAt
    ? Math.max(0, Math.ceil((CONTINUE_TIMER_MS - (continueNow - continueStartedAt)) / 1000))
    : null;

  const myRank = useMemo(() => {
    if (!result || !humanId) return null;
    const idx = result.findIndex((id) => id === humanId);
    return idx >= 0 ? idx + 1 : null;
  }, [result, humanId]);

  const orderedResult = useMemo(() => {
    if (!result || !pendingGame) return null;
    return result.map((id) => pendingGame.players.find((p) => p.id === id)?.name ?? id);
  }, [result, pendingGame]);

  if (!mp?.strawDraw || !pendingGame) return null;
  const sd = mp.strawDraw;
  const total = sd.straws.length;
  const myStrawIdx = sd.straws.findIndex((s) => s.ownerId === humanId);
  const iPicked = myStrawIdx >= 0;
  const allPicked = sd.straws.every((s) => s.ownerId !== null);
  const revealed = !!sd.result;
  const secsLeft = sd.startedAt
    ? Math.max(0, Math.ceil((STRAW_WINDOW_MS - (now - sd.startedAt)) / 1000))
    : null;

  function nameOf(id: string | null): string | null {
    if (!id) return null;
    return pendingGame!.players.find((p) => p.id === id)?.name ?? id;
  }

  function handlePick(i: number) {
    if (iPicked || revealed || sd.straws[i].ownerId) return;
    Audio.playSfx("straw_pick");
    sendStrawPick(i);
  }

  function strawHeight(lengthVal: number): number {
    if (total <= 1) return STRAW_MAX_H;
    return STRAW_MIN_H + (lengthVal / (total - 1)) * (STRAW_MAX_H - STRAW_MIN_H);
  }

  function rankLabel(rank: number): string {
    if (rank === 1) return "1st";
    if (rank === 2) return "2nd";
    if (rank === 3) return "3rd";
    return `${rank}th`;
  }

  function myResultText(): string {
    if (!myRank) return "";
    if (myRank === 1) return `You go 1st!`;
    if (myRank === total) return `You go last.`;
    return `You go ${rankLabel(myRank)}.`;
  }

  const animDelay = (i: number) => (revealed ? i * 0.12 : 0);

  return (
    <div className="straw-draw-screen">
      <motion.div
        className="straw-draw-card"
        initial={{ y: 30, opacity: 0, scale: 0.94 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 18 }}
      >
        <h1 className="straw-draw-title">Draw of Straws</h1>

        <p className="straw-draw-sub">
          {revealed
            ? myResultText()
            : iPicked
            ? "Locked in — waiting for the others…"
            : sd.startedAt
            ? "Pick a straw before time runs out!"
            : "Pick a straw — first come, first served."}
        </p>

        {/* Countdown bar */}
        {sd.startedAt && !revealed && secsLeft !== null && (
          <div className="straw-timer-track">
            <motion.div
              className="straw-timer-bar"
              initial={{ width: "100%" }}
              animate={{ width: `${(secsLeft / 10) * 100}%` }}
              transition={{ duration: 0.2, ease: "linear" }}
              style={{ background: secsLeft <= 3 ? "#ff5b6e" : "#ffd86b" }}
            />
            <span className="straw-timer-label">{secsLeft}s</span>
          </div>
        )}

        {/* Straws */}
        <div className="straw-field">
          {sd.straws.map((s, i) => {
            const ownerName = nameOf(s.ownerId);
            const isMine = s.ownerId === humanId;
            const targetH = revealed ? strawHeight(s.length) : STRAW_STUB_H;
            const isLongest = revealed && s.length === total - 1;
            const isShortest = revealed && s.length === 0;

            // Rank: longest straw (length = total-1) = 1st place
            const rank = revealed ? total - s.length : null;

            return (
              <div key={i} className="straw-col">
                {/* Rank badge above each straw */}
                <div className="straw-badge-slot">
                  <AnimatePresence>
                    {revealed && rank !== null && (
                      <motion.div
                        className={`straw-badge ${isLongest ? "straw-badge-best" : isShortest ? "straw-badge-worst" : "straw-badge-mid"}`}
                        initial={{ opacity: 0, y: 8, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: animDelay(i) + 0.55, duration: 0.3, type: "spring" }}
                      >
                        {isLongest ? `${rankLabel(1)} 🏆` : isShortest ? rankLabel(total) : rankLabel(rank)}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Straw bar — grows upward via flex-end alignment */}
                <motion.button
                  className={[
                    "straw-stub",
                    s.ownerId ? "taken" : "",
                    isMine ? "mine" : "",
                    revealed ? "revealed" : "",
                  ].filter(Boolean).join(" ")}
                  disabled={!!s.ownerId || iPicked || revealed}
                  onClick={() => handlePick(i)}
                  style={{ height: STRAW_STUB_H }}
                  animate={{ height: targetH }}
                  transition={{
                    delay: animDelay(i),
                    duration: 0.6,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  whileHover={!s.ownerId && !iPicked && !revealed ? { y: -5, filter: "brightness(1.2)" } : {}}
                  whileTap={!s.ownerId && !iPicked && !revealed ? { scale: 0.96 } : {}}
                />

                {/* Name label */}
                <div className={`straw-name ${isMine ? "mine" : ""}`}>
                  {ownerName ?? <span className="straw-name-empty">?</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Waiting indicator before reveal */}
        {!revealed && allPicked && (
          <div className="straw-loading">Revealing…</div>
        )}

        {/* Result + continue */}
        <AnimatePresence>
          {revealed && orderedResult && (
            <motion.div
              className="straw-result"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: total * 0.12 + 0.4, duration: 0.4 }}
            >
              <div className="straw-result-title">Turn Order</div>
              <ol className="straw-result-list">
                {orderedResult.map((name, i) => (
                  <li key={i} className={result![i] === humanId ? "mine" : ""}>
                    <span className="straw-result-rank">#{i + 1}</span>
                    <span className="straw-result-name">{name}</span>
                  </li>
                ))}
              </ol>

              <motion.button
                className="straw-continue-btn"
                onClick={iReadyContinue ? undefined : proceedFromStrawDraw}
                disabled={iReadyContinue}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: total * 0.12 + 0.85, duration: 0.3 }}
                whileHover={iReadyContinue ? {} : { scale: 1.05 }}
                whileTap={iReadyContinue ? {} : { scale: 0.96 }}
              >
                {iReadyContinue
                  ? continueSecsLeft !== null
                    ? `Waiting… (${mp!.strawReadyVotes.length}/${mp!.members.length} ready, ${continueSecsLeft}s)`
                    : `Waiting for others… (${mp!.strawReadyVotes.length}/${mp!.members.length} ready)`
                  : "Continue →"}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
