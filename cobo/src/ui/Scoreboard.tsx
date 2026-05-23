import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { useStore } from "../state/store";
import { cardScore } from "../engine/game";
import { Audio } from "../audio/sounds";

export function Scoreboard() {
  const game = useStore((s) => s.game!);
  const mp = useStore((s) => s.mp);
  const kickedSet = new Set(mp?.kickedIds ?? []);
  const rows = Object.entries(game.scores)
    .filter(([id]) => !kickedSet.has(id))
    .map(([id, arr]) => ({
      id,
      name: game.players.find((p) => p.id === id)?.name ?? id,
      total: arr.reduce((a, b) => a + b, 0),
      rounds: arr,
    }));
  rows.sort((a, b) => a.total - b.total); // lowest total = closest to winning

  // Each player's per-round column count (use the longest array)
  const roundCount = Math.max(0, ...rows.map((r) => r.rounds.length));
  const lowestTotal = rows.length ? rows[0].total : 0;
  const leaders = rows.filter((r) => r.total === lowestTotal).length;
  const isTopTie = leaders > 1;

  // Per-round minimum (= round winner) for green highlighting, plus the count
  // of players tied at that minimum. When more than one player ties at the
  // lowest, we render those cells in bright gray instead of green — green is
  // reserved for a SOLE round-winner.
  const roundMins: number[] = [];
  const roundLowestCounts: number[] = [];
  for (let i = 0; i < roundCount; i++) {
    const values = rows
      .map((r) => r.rounds[i])
      .filter((v): v is number => typeof v === "number");
    const min = values.length > 0 ? Math.min(...values) : Infinity;
    roundMins.push(min);
    roundLowestCounts.push(values.filter((v) => v === min).length);
  }

  const gridCols = `minmax(70px, 1.2fr) repeat(${Math.max(1, roundCount)}, minmax(22px, 1fr)) minmax(36px, 1.1fr)`;

  return (
    <div className="scoreboard">
      <div className="sb-title">Scoreboard · Round {game.roundNumber}</div>
      <div className="sb-table">
        <div className="sb-thead" style={{ gridTemplateColumns: gridCols }}>
          <div className="sb-th sb-th-name">Player</div>
          {Array.from({ length: Math.max(1, roundCount) }).map((_, i) => (
            <div key={i} className="sb-th sb-th-round">{roundCount > 0 ? `R${i + 1}` : "—"}</div>
          ))}
          <div className="sb-th sb-th-total">Total</div>
        </div>
        <div className="sb-tbody">
          {rows.map((t, i) => {
            const isLeader = t.total === lowestTotal;
            const crown = isLeader ? (isTopTie ? "🤝" : "👑") : `#${i + 1}`;
            return (
              <div
                key={t.id}
                className={`sb-trow ${isLeader ? "lead" : ""} ${i === rows.length - 1 && rows.length > 1 && !isLeader ? "worst" : ""}`}
                style={{ gridTemplateColumns: gridCols }}
              >
                <span className="sb-td sb-td-name">
                  <span className="sb-rank">{crown}</span>
                  <span className="sb-pname">{t.name}</span>
                </span>
                {Array.from({ length: Math.max(1, roundCount) }).map((_, ri) => {
                  const v = t.rounds[ri];
                  const isLowest = v !== undefined && v === roundMins[ri];
                  const tiedAtLowest = isLowest && roundLowestCounts[ri] > 1;
                  const cls = tiedAtLowest
                    ? " sb-td-round-tie"
                    : isLowest
                    ? " sb-td-round-win"
                    : "";
                  return (
                    <span key={ri} className={`sb-td sb-td-round${cls}`}>
                      {v !== undefined ? v : "—"}
                    </span>
                  );
                })}
                <span className="sb-td sb-td-total">{t.total}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * useCountUp — animates an integer from 0 to `target` over `durationMs`
 * using ease-out cubic. `active` gates whether the animation has begun
 * (so we hold at 0 during the title beat, then start once tally beat
 * fires). `delayMs` staggers different pills.
 */
function useCountUp(target: number, durationMs: number, active: boolean, delayMs = 0): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) { setValue(0); return; }
    let raf = 0;
    const startAt = performance.now() + delayMs;
    const tick = (now: number) => {
      const elapsed = Math.max(0, now - startAt);
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, active, delayMs]);
  return value;
}

/** Single player's pill in the cinematic tally row. */
function CinematicPill({
  name, total, active, delayMs, isWinner, isHighlighted,
}: {
  name: string; total: number;
  active: boolean; delayMs: number;
  isWinner: boolean; isHighlighted: boolean;
}) {
  const display = useCountUp(total, 700, active, delayMs);
  return (
    <motion.div
      className={`cinematic-pill${isWinner ? " winner" : ""}${isHighlighted ? " highlighted" : ""}`}
      initial={{ y: -40, opacity: 0, scale: 0.7 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 20, delay: delayMs / 1000 }}
    >
      <div className="cinematic-pill-name">{name}</div>
      <div className="cinematic-pill-points">{display}</div>
    </motion.div>
  );
}

type CinematicStage = "title" | "tally" | "winner" | "modal";

export function RoundEndOverlay() {
  const game = useStore((s) => s.game!);
  const mode = useStore((s) => s.mode);
  const mp = useStore((s) => s.mp);
  const humanId = useStore((s) => s.humanId);
  const playAgain = useStore((s) => s.playAgain);
  const backToMenu = useStore((s) => s.backToMenu);
  const kickedSet = new Set(mp?.kickedIds ?? []);
  const reduced = useReducedMotion() ?? false;

  // ── Cinematic stage machine. Drives a 3-beat opening before the
  //    existing scoreboard modal slides in:
  //      title  (0   to  0.7s)  → big "Round Over" headline, cards already
  //                                flipping face-up via the round_over phase
  //      tally  (0.7 to  2.0s)  → each player's hand value count-ups from 0
  //                                inside a pill row at the top of the overlay
  //      winner (2.0 to  3.0s)  → winner pill pulses, confetti bursts, a
  //                                "WINS THE ROUND" stamp slams in
  //      modal  (3.0s onward)   → existing leaderboard modal slides up
  //    Tap anywhere during cinematic to skip to the modal.
  //    Reduced-motion users go straight to modal.
  const [stage, setStage] = useState<CinematicStage>("title");
  useEffect(() => {
    if (game.phase !== "round_over") { setStage("title"); return; }
    if (reduced) { setStage("modal"); return; }
    const t1 = setTimeout(() => setStage("tally"),  700);
    const t2 = setTimeout(() => setStage("winner"), 2000);
    const t3 = setTimeout(() => setStage("modal"),  3000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [game.phase, game.roundNumber, reduced]);

  // Play the win/lose SFX once per round end. Keyed on roundNumber so a fresh
  // round triggers a fresh sound, and reconnecting mid-overlay still plays it.
  // Skip when GloriousVictory is about to take over (GV fires its own win SFX).
  const playedFor = useRef<number | null>(null);
  useEffect(() => {
    if (game.phase !== "round_over") return;
    if (mp?.gloriosVictory) return; // GloriousVictory fires the win SFX
    if (mode === "mp" && mp?.bustedThisRound.includes(humanId)) return;
    if (playedFor.current === game.roundNumber) return;
    playedFor.current = game.roundNumber;
    Audio.playSfx(game.winnerId === humanId ? "win" : "lose");
  }, [game.phase, game.roundNumber, game.winnerId, humanId, mp?.gloriosVictory]);

  // Confetti burst at the "winner" beat — only for a clean (non-tie) win.
  const confettiFiredFor = useRef<number | null>(null);
  useEffect(() => {
    if (stage !== "winner") return;
    if (game.phase !== "round_over") return;
    if (confettiFiredFor.current === game.roundNumber) return;
    confettiFiredFor.current = game.roundNumber;
    if (reduced) return;
    confetti({
      particleCount: 80,
      spread: 75,
      startVelocity: 32,
      origin: { y: 0.45 },
      colors: ["#ffd86b", "#a87bff", "#67e0a3", "#ff5b6e", "#7aa8ff"],
    });
  }, [stage, game.phase, game.roundNumber, reduced]);

  if (game.phase !== "round_over") return null;
  // GloriousVictory takes over when a winner is declared — hide this overlay.
  if (mode === "mp" && mp?.gloriosVictory) return null;
  // BustedOverlay takes over for the busted player — hide this overlay for them.
  if (mode === "mp" && mp?.bustedThisRound.includes(humanId)) return null;
  const rows = game.players
    .filter((p) => !kickedSet.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      handSum: p.hand.reduce((s, c) => s + cardScore(c), 0),
      pts: game.scores[p.id][game.scores[p.id].length - 1],
      cumulative: game.scores[p.id].reduce((a, b) => a + b, 0),
    }));
  // Rank by cumulative score ascending — Cabo: lowest wins
  rows.sort((a, b) => a.cumulative - b.cumulative);
  const lowestCum = rows[0].cumulative;
  const tiedAtTop = rows.filter((r) => r.cumulative === lowestCum);
  const isTie = tiedAtTop.length > 1;

  const winner = !isTie ? rows.find((t) => t.id === game.winnerId) ?? rows[0] : null;

  // Collective Play Again — only relevant in MP
  const playAgainVotes = mp?.playAgainVotes ?? [];
  const iVoted = playAgainVotes.includes(humanId);
  const otherVoter = playAgainVotes.find((id) => id !== humanId);
  const otherVoterName = otherVoter
    ? game.players.find((p) => p.id === otherVoter)?.name ?? "Opponent"
    : null;

  const roundCount = Math.max(0, ...rows.map((r) => game.scores[r.id]?.length ?? 0));
  const modalGridCols = `minmax(90px, 1.3fr) repeat(${Math.max(1, roundCount)}, minmax(28px, 1fr)) minmax(48px, 1.1fr)`;

  // Per-round minimum + tied-at-lowest count. Single lowest → green;
  // multi-way tie at lowest → bright gray for all tied cells.
  const modalRoundMins: number[] = [];
  const modalLowestCounts: number[] = [];
  for (let i = 0; i < roundCount; i++) {
    const values = rows
      .map((r) => game.scores[r.id]?.[i])
      .filter((v): v is number => typeof v === "number");
    const min = values.length > 0 ? Math.min(...values) : Infinity;
    modalRoundMins.push(min);
    modalLowestCounts.push(values.filter((v) => v === min).length);
  }

  // Sort for the cinematic pill row — same order as the modal so the
  // user's eye doesn't jump from one ordering to another between beats.
  const pillRows = rows;
  const winnerName = !isTie ? (winner?.name ?? "") : "";

  return (
    <AnimatePresence>
      <motion.div
        className="overlay round-end-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={stage !== "modal" ? () => setStage("modal") : undefined}
        style={{ cursor: stage !== "modal" ? "pointer" : "default" }}
      >
        {/* ── Beats 1–3: cinematic title + pill tally + winner stamp.
              AnimatePresence mode="wait" makes the cinematic FULLY exit
              before the modal mounts, so the two transitions don't
              overlap into a hasty cut. The cinematic exit fades + scales
              down slightly, the modal then rises from below. ── */}
        <AnimatePresence mode="wait">
          {stage !== "modal" && (
            <motion.div
              key="cinematic"
              className="round-cinematic"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{
                opacity: 0,
                scale: 0.92,
                y: -16,
                transition: { duration: 0.45, ease: [0.16, 0.7, 0.32, 1] },
              }}
            >
              <motion.h1
                className="cinematic-title"
                initial={{ scale: 0.55, y: -30, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 220, damping: 18, delay: 0.15 }}
              >
                {isTie ? "It's a tie" : "Round Over"}
              </motion.h1>

              <div className="cinematic-pills">
                {pillRows.map((row, i) => (
                  <CinematicPill
                    key={row.id}
                    name={row.name}
                    total={row.handSum}
                    active={stage === "tally" || stage === "winner"}
                    delayMs={i * 140}
                    isWinner={!isTie && winner?.id === row.id}
                    isHighlighted={stage === "winner" && !isTie && winner?.id === row.id}
                  />
                ))}
              </div>

              {stage === "winner" && !isTie && (
                <motion.div
                  className="cinematic-winner-stamp"
                  initial={{ scale: 0.4, rotate: -8, opacity: 0 }}
                  animate={{ scale: 1, rotate: -4, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 16 }}
                >
                  {winnerName} wins the round
                </motion.div>
              )}

              <div className="cinematic-skip-hint">tap to skip</div>
            </motion.div>
          )}

          {/* ── Beat 4: existing scoreboard modal, rises after the
                cinematic has finished its exit (mode="wait" sequences
                this). Spring entry feels deliberate, not hasty. ── */}
          {stage === "modal" && (
          <motion.div
            key="scoreboard-modal"
            className="modal"
            initial={{ scale: 0.9, y: 80, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 160, damping: 24, mass: 1.1 }}
            onClick={(e) => e.stopPropagation()}
          >
          <div className="modal-burst">{isTie ? "🤝" : "🎉"}</div>
          {isTie ? (
            <h2>It&apos;s a tie!</h2>
          ) : (
            <h2>{winner!.name} wins the round!</h2>
          )}
          <div className="modal-subtitle">
            {isTie
              ? `Tied at ${lowestCum} pts · lowest wins`
              : "Leaderboard · lowest total wins"}
          </div>
          <div className="sb-table modal-sb">
            <div className="sb-thead" style={{ gridTemplateColumns: modalGridCols }}>
              <div className="sb-th sb-th-name">Player</div>
              {Array.from({ length: Math.max(1, roundCount) }).map((_, i) => (
                <div key={i} className="sb-th sb-th-round">{roundCount > 0 ? `R${i + 1}` : "—"}</div>
              ))}
              <div className="sb-th sb-th-total">Total</div>
            </div>
            <div className="sb-tbody">
              {rows.map((t, i) => {
                const tiedHere = t.cumulative === lowestCum;
                const crown = tiedHere ? (isTie ? "🤝" : "👑") : `#${i + 1}`;
                return (
                  <div
                    key={t.id}
                    className={`sb-trow ${tiedHere ? "lead" : ""} ${i === rows.length - 1 && rows.length > 1 && !tiedHere ? "worst" : ""}`}
                    style={{ gridTemplateColumns: modalGridCols }}
                  >
                    <span className="sb-td sb-td-name">
                      <span className="sb-rank">{crown}</span>
                      <span className="sb-pname">{t.name}</span>
                    </span>
                    {Array.from({ length: Math.max(1, roundCount) }).map((_, ri) => {
                      const v = game.scores[t.id][ri];
                      const isLowest = v !== undefined && v === modalRoundMins[ri];
                      const tiedAtLowest = isLowest && modalLowestCounts[ri] > 1;
                      const cls = tiedAtLowest
                        ? " sb-td-round-tie"
                        : isLowest
                        ? " sb-td-round-win"
                        : "";
                      return (
                        <span key={ri} className={`sb-td sb-td-round${cls}`}>
                          {v !== undefined ? v : "—"}
                        </span>
                      );
                    })}
                    <span className="sb-td sb-td-total">{t.cumulative}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="row gap center">
            <button
              className={`btn primary big play-again-btn ${iVoted ? "voted" : ""} ${otherVoter && !iVoted ? "their-turn" : ""}`}
              onClick={playAgain}
              disabled={mode === "mp" && iVoted}
            >
              {mode === "mp" && iVoted
                ? "Waiting for other player…"
                : mode === "mp" && otherVoterName
                ? `${otherVoterName} ready · Continue`
                : "Continue"}
            </button>
            <button className="btn" onClick={backToMenu}>Return to main</button>
          </div>
        </motion.div>
        )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
