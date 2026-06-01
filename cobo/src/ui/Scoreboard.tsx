import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { useStore } from "../state/store";
import { cardScore } from "../engine/game";
import { Audio } from "../audio/sounds";

// ────────────────────────────────────────────────────────────────────────────
// Number-roll helper
// ────────────────────────────────────────────────────────────────────────────

/**
 * RollingNumber — animates an integer from its previous value to the new
 * one with an ease-out-quart curve. Used for cumulative scores so the
 * scoreboard "ticks" up or down rather than snap-changing on a new round.
 *
 *   signed: prefix "+" for positive non-zero values (useful for the
 *           penalty / bonus columns).
 *   className: forwarded so callers can color positive vs negative.
 */
function RollingNumber({
  value,
  signed = false,
  duration = 700,
  className = "",
}: {
  value: number;
  signed?: boolean;
  duration?: number;
  className?: string;
}) {
  const prev = useRef(value);
  const [display, setDisplay] = useState(value);
  const animatingFrom = useRef<number>(value);
  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    animatingFrom.current = from;
    const startTime = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  const direction =
    display > animatingFrom.current ? "rolling-up"
    : display < animatingFrom.current ? "rolling-down"
    : "";
  return (
    <span className={`rolling-number ${direction} ${className}`.trim()}>
      {signed && display > 0 ? "+" : signed && display < 0 ? "" : ""}{display}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Scoreboard data helpers — read scores + caboBonus + caboPenalty arrays
// and compute the breakdown rows.
// ────────────────────────────────────────────────────────────────────────────

interface ScoreRow {
  id: string;
  name: string;
  /** Raw per-round contributions (hand value after Cabo bonus zeroing). */
  rounds: number[];
  /** Cumulative bonus magnitude — sum of cabo bonus AND snap bonus (both
   *  reduce the running total). Surfaced as one "Bonus" column in the
   *  scoreboard, with the round-cell ✦ marker firing if EITHER kind was
   *  earned that round. */
  bonusTotal: number;
  /** Cumulative cabo penalty (will be added to total). */
  penaltyTotal: number;
  /** Net running total: sum(rounds) + penaltyTotal - bonusTotal. */
  total: number;
  /** Per-round combined bonus values (cabo + snap), parallel to rounds. */
  perRoundBonus: number[];
  /** Per-round Cabo penalty values (parallel to rounds) — drives the "!" marker. */
  perRoundPenalty: number[];
  /** Per-round Kamikaze levy (+20), parallel to rounds — drives the 💥 marker.
   *  Included in penaltyTotal; pulled OUT of the round cell (it's folded into
   *  scores) so the cell shows the hand value and the +20 reads as a penalty. */
  perRoundKamikaze: number[];
}

function sum(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function buildRows(
  scores: Record<string, number[]>,
  caboBonus: Record<string, number[]>,
  caboPenalty: Record<string, number[]>,
  snapBonus: Record<string, number[]>,
  kamikaze: Record<string, number[]>,
  players: { id: string; name: string }[],
  exclude: Set<string>,
  /** Optional inclusive lower bound — slice each array to indices >= startIndex.
   *  Used during sudden death to render F-rounds only. */
  startIndex = 0,
): ScoreRow[] {
  const rows: ScoreRow[] = Object.entries(scores)
    .filter(([id]) => !exclude.has(id))
    .map(([id, arrRaw]) => {
      const arr = startIndex > 0 ? arrRaw.slice(startIndex) : arrRaw;
      const caboFull = caboBonus[id] ?? [];
      const penaltyFull = caboPenalty[id] ?? [];
      const snapFull = snapBonus[id] ?? [];
      const kamFull = kamikaze[id] ?? [];
      const cabo = startIndex > 0 ? caboFull.slice(startIndex) : caboFull;
      const penalty = startIndex > 0 ? penaltyFull.slice(startIndex) : penaltyFull;
      const snap = startIndex > 0 ? snapFull.slice(startIndex) : snapFull;
      const kam = startIndex > 0 ? kamFull.slice(startIndex) : kamFull;
      // The Kamikaze +20 is folded into `scores`; pull it back OUT of the round
      // cell (so the cell reads as the hand value) and surface it in the
      // Penalty column instead. The amounts cancel, so the total is unchanged.
      const rounds = arr.map((v, i) => v - (kam[i] ?? 0));
      const perRoundKamikaze = arr.map((_, i) => kam[i] ?? 0);
      // Per-round bonus is cabo + snap (both apply as negative adjustments).
      const perRoundBonus = arr.map((_, i) => (cabo[i] ?? 0) + (snap[i] ?? 0));
      const bonusTotal = sum(perRoundBonus);
      // Penalty column combines the Cabo penalty (+5) and the Kamikaze levy (+20).
      const penaltyTotal = sum(penalty) + sum(perRoundKamikaze);
      const total = sum(rounds) + penaltyTotal - bonusTotal;
      return {
        id,
        name: players.find((p) => p.id === id)?.name ?? id,
        rounds,
        bonusTotal,
        penaltyTotal,
        total,
        perRoundBonus,
        perRoundPenalty: penalty,
        perRoundKamikaze,
      };
    });
  rows.sort((a, b) => a.total - b.total); // lowest wins
  return rows;
}

// ────────────────────────────────────────────────────────────────────────────
// In-game floating scoreboard (always visible during play)
// ────────────────────────────────────────────────────────────────────────────

export function Scoreboard() {
  const game = useStore((s) => s.game!);
  const elim = useStore((s) => s.elim);
  // Mode-agnostic: elim mirrors MP / is computed for SP.
  // During sudden death, hide non-contestants and slice score arrays so only
  // F-rounds (≥ mainRoundsCount) appear.
  //
  // BUT: at the SD-TRIGGER round_over (the round that armed SD), the F-slice
  // is empty (no F-rounds played yet) — we still want the user to see the
  // R-rounds from the round that just ended. So gate the slice on whether
  // the SD has actually started (the new game post-playAgain has only the
  // contestants seated). At trigger time, game.players still has all 4.
  const sdArmed = !!elim.suddenDeath?.active;
  const sdContestants = sdArmed ? new Set(elim.suddenDeath!.contestants) : null;
  // SD has actually STARTED only once a fresh SD game is seated (just the
  // contestants). Guard the SD-TRIGGER round_over where everyone left busts
  // together: the roster then coincidentally equals the contestant set, but
  // no F-round has been played yet (contestant score arrays are still
  // mainRoundsCount long). Treating that as "started" would slice the score
  // arrays to empty and render a blank, all-zero "tie" board (the round-5 /
  // all-bust corruption that also broke MP bust display).
  const sdMainCount = elim.suddenDeath?.mainRoundsCount ?? 0;
  const sdTriggerRoundOver =
    game.phase === "round_over" &&
    !!sdContestants &&
    [...sdContestants].every((id) => (game.scores[id]?.length ?? 0) <= sdMainCount);
  const sdStarted =
    sdArmed && !!sdContestants &&
    game.players.every((p) => sdContestants.has(p.id)) &&
    game.players.length === sdContestants.size &&
    !sdTriggerRoundOver;
  const inSuddenDeath = sdStarted;
  const startIndex = inSuddenDeath ? elim.suddenDeath!.mainRoundsCount : 0;
  const exclude = new Set(elim.kickedIds);
  if (inSuddenDeath && sdContestants) {
    for (const id of Object.keys(game.scores)) {
      if (!sdContestants.has(id)) exclude.add(id);
    }
  }

  const rows = buildRows(
    game.scores,
    game.caboBonus ?? {},
    game.caboPenalty ?? {},
    game.snapBonus ?? {},
    game.kamikaze ?? {},
    game.players,
    exclude,
    startIndex,
  );

  const roundCount = Math.max(0, ...rows.map((r) => r.rounds.length));
  const lowestTotal = rows.length ? rows[0].total : 0;
  const isTopTie = rows.filter((r) => r.total === lowestTotal).length > 1;

  // Per-round minimum across PLAYERS for green highlighting.
  const roundMins: number[] = [];
  const roundLowestCounts: number[] = [];
  for (let i = 0; i < roundCount; i++) {
    const values = rows.map((r) => r.rounds[i]).filter((v): v is number => typeof v === "number");
    const min = values.length > 0 ? Math.min(...values) : Infinity;
    roundMins.push(min);
    roundLowestCounts.push(values.filter((v) => v === min).length);
  }

  // Columns: Player | R1..Rn | Bonus | Penalty | Total
  const gridCols = `minmax(72px, 1.1fr) repeat(${Math.max(1, roundCount)}, minmax(34px, 0.8fr)) minmax(46px, 0.9fr) minmax(50px, 0.9fr) minmax(54px, 1.1fr)`;

  const colPrefix = inSuddenDeath ? "FR" : "R";

  return (
    <div className="scoreboard">
      <div className="sb-title">
        <span className="sb-title-main">Scoreboard</span>
        <span className="sb-title-sub">
          {inSuddenDeath
            ? `Sudden Death · FR${Math.max(1, roundCount)}`
            : `Round ${game.roundNumber} · lowest wins`}
        </span>
      </div>
      <div className="sb-table">
        <div className="sb-thead" style={{ gridTemplateColumns: gridCols }}>
          <div className="sb-th sb-th-name">Player</div>
          {Array.from({ length: Math.max(1, roundCount) }).map((_, i) => (
            <div key={i} className={`sb-th sb-th-round${inSuddenDeath ? " sb-th-final" : ""}`}>
              {roundCount > 0 ? `${colPrefix}${i + 1}` : "—"}
            </div>
          ))}
          <div className="sb-th sb-th-bonus" title="Bonuses subtracted (Cabo bonus, Snap bonus)">Bonus</div>
          <div className="sb-th sb-th-penalty" title="Cabo penalty added">Penalty</div>
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
                  const hadBonus = (t.perRoundBonus[ri] ?? 0) > 0;
                  const hadPenalty = (t.perRoundPenalty[ri] ?? 0) > 0;
                  const hadKamikaze = (t.perRoundKamikaze[ri] ?? 0) > 0;
                  const cls = tiedAtLowest
                    ? " sb-td-round-tie"
                    : isLowest
                    ? " sb-td-round-win"
                    : "";
                  const finalCls = inSuddenDeath ? " sb-td-final" : "";
                  return (
                    <span key={ri} className={`sb-td sb-td-round${cls}${finalCls}`}>
                      {v !== undefined ? v : "—"}
                      {hadBonus && <span className="sb-cell-marker bonus" title="Cabo bonus">✦</span>}
                      {hadPenalty && <span className="sb-cell-marker penalty" title="Cabo penalty">!</span>}
                      {hadKamikaze && <span className="sb-cell-marker penalty" title="Kamikaze +20">💥</span>}
                    </span>
                  );
                })}
                <span className="sb-td sb-td-bonus">
                  {t.bonusTotal > 0 ? (
                    <RollingNumber value={-t.bonusTotal} className="bonus-num" />
                  ) : (
                    <span className="sb-zero">—</span>
                  )}
                </span>
                <span className="sb-td sb-td-penalty">
                  {t.penaltyTotal > 0 ? (
                    <RollingNumber value={t.penaltyTotal} signed className="penalty-num" />
                  ) : (
                    <span className="sb-zero">—</span>
                  )}
                </span>
                <span className="sb-td sb-td-total">
                  <RollingNumber value={t.total} className="total-num" />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Round-end cinematic (3-beat: title → tally → winner stamp → modal)
// ────────────────────────────────────────────────────────────────────────────

function useCountUp(target: number, durationMs: number, active: boolean, delayMs = 0): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) { setValue(0); return; }
    let raf = 0;
    const startAt = performance.now() + delayMs;
    const tick = (now: number) => {
      const elapsed = Math.max(0, now - startAt);
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, active, delayMs]);
  return value;
}

function CinematicPill({
  name, total, active, delayMs, isWinner, isHighlighted, bonus, penalty,
}: {
  name: string; total: number;
  active: boolean; delayMs: number;
  isWinner: boolean; isHighlighted: boolean;
  bonus: number; penalty: number;
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
      {(bonus > 0 || penalty > 0) && active && (
        <div className="cinematic-pill-mods">
          {bonus > 0 && <span className="cinematic-pill-bonus">−{bonus}</span>}
          {penalty > 0 && <span className="cinematic-pill-penalty">+{penalty}</span>}
        </div>
      )}
    </motion.div>
  );
}

type CinematicStage = "title" | "tally" | "winner" | "modal";

export function RoundEndOverlay() {
  const game = useStore((s) => s.game!);
  const mode = useStore((s) => s.mode);
  const mp = useStore((s) => s.mp);
  const elim = useStore((s) => s.elim);
  const humanId = useStore((s) => s.humanId);
  const playAgain = useStore((s) => s.playAgain);
  const backToMenu = useStore((s) => s.backToMenu);
  // During sudden death, hide non-contestants and slice scores to F-rounds.
  // Gate on "SD has actually started" (post-playAgain) so the SD-trigger
  // round_over still shows R-columns rather than an empty F-slice.
  const sdArmed = !!elim.suddenDeath?.active;
  const sdContestants = sdArmed ? new Set(elim.suddenDeath!.contestants) : null;
  // SD has actually STARTED only once a fresh SD game is seated (just the
  // contestants). Guard the SD-TRIGGER round_over where everyone left busts
  // together: the roster then coincidentally equals the contestant set, but
  // no F-round has been played yet (contestant score arrays are still
  // mainRoundsCount long). Treating that as "started" would slice the score
  // arrays to empty and render a blank, all-zero "tie" board (the round-5 /
  // all-bust corruption that also broke MP bust display).
  const sdMainCount = elim.suddenDeath?.mainRoundsCount ?? 0;
  const sdTriggerRoundOver =
    game.phase === "round_over" &&
    !!sdContestants &&
    [...sdContestants].every((id) => (game.scores[id]?.length ?? 0) <= sdMainCount);
  const sdStarted =
    sdArmed && !!sdContestants &&
    game.players.every((p) => sdContestants.has(p.id)) &&
    game.players.length === sdContestants.size &&
    !sdTriggerRoundOver;
  const inSuddenDeath = sdStarted;
  const startIndex = inSuddenDeath ? elim.suddenDeath!.mainRoundsCount : 0;
  const kickedSet = new Set(elim.kickedIds);
  if (inSuddenDeath && sdContestants) {
    for (const id of Object.keys(game.scores)) {
      if (!sdContestants.has(id)) kickedSet.add(id);
    }
  }
  const reduced = useReducedMotion() ?? false;

  const [stage, setStage] = useState<CinematicStage>("title");
  useEffect(() => {
    if (game.phase !== "round_over") { setStage("title"); return; }
    if (reduced) { setStage("modal"); return; }
    const t1 = setTimeout(() => setStage("tally"),  700);
    const t2 = setTimeout(() => setStage("winner"), 2000);
    const t3 = setTimeout(() => setStage("modal"),  3000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [game.phase, game.roundNumber, reduced]);

  const playedFor = useRef<number | null>(null);
  useEffect(() => {
    if (game.phase !== "round_over") return;
    if (elim.gloriosVictory) return;
    if (elim.bustedThisRound.includes(humanId)) return;
    if (playedFor.current === game.roundNumber) return;
    playedFor.current = game.roundNumber;
    // On an all-zero Kamikaze tie (Evolved) winnerId is null — skip win/lose.
    if (game.winnerId) Audio.playSfx(game.winnerId === humanId ? "win" : "lose");
  }, [game.phase, game.roundNumber, game.winnerId, humanId, elim.gloriosVictory, elim.bustedThisRound]);

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
  // Yield to GloriousVictory / BustedOverlay (mode-agnostic via elim).
  if (elim.gloriosVictory) return null;
  if (elim.bustedThisRound.includes(humanId)) return null;

  const allRows = buildRows(
    game.scores,
    game.caboBonus ?? {},
    game.caboPenalty ?? {},
    game.snapBonus ?? {},
    game.kamikaze ?? {},
    game.players,
    kickedSet,
    startIndex,
  );

  // For the cinematic pill row use HAND VALUES (this round), so the "X wins"
  // moment reads from the actual round outcome, not the cumulative ladder.
  const handSums = game.players
    .filter((p) => !kickedSet.has(p.id))
    .map((p) => {
      const handSum = p.hand.reduce((s, c) => s + (c ? cardScore(c, game.variant) : 0), 0);
      const roundIdx = (game.scores[p.id]?.length ?? 1) - 1;
      const roundBonus = (game.caboBonus[p.id] ?? [])[roundIdx] ?? 0;
      const roundPenalty = (game.caboPenalty[p.id] ?? [])[roundIdx] ?? 0;
      return { id: p.id, name: p.name, handSum, bonus: roundBonus, penalty: roundPenalty };
    });

  const lowestCum = allRows[0]?.total ?? 0;
  const tiedAtTop = allRows.filter((r) => r.total === lowestCum);
  const isTie = tiedAtTop.length > 1;
  const winner = !isTie ? allRows.find((t) => t.id === game.winnerId) ?? allRows[0] : null;

  const lowestHandSum = handSums.length ? Math.min(...handSums.map((r) => r.handSum)) : 0;
  const roundLeaders = handSums.filter((r) => r.handSum === lowestHandSum);
  const isRoundTie = roundLeaders.length > 1;
  const roundWinner = !isRoundTie
    ? handSums.find((r) => r.id === game.winnerId) ?? roundLeaders[0] ?? handSums[0]
    : null;

  const playAgainVotes = mp?.playAgainVotes ?? [];
  const iVoted = playAgainVotes.includes(humanId);
  const otherVoter = playAgainVotes.find((id) => id !== humanId);
  const otherVoterName = otherVoter
    ? game.players.find((p) => p.id === otherVoter)?.name ?? "Opponent"
    : null;

  const roundCount = Math.max(0, ...allRows.map((r) => r.rounds.length));
  // Columns: name | rounds… | bonus | penalty | total
  const modalGridCols = `minmax(100px, 1.3fr) repeat(${Math.max(1, roundCount)}, minmax(42px, 1fr)) minmax(46px, 0.9fr) minmax(50px, 0.9fr) minmax(56px, 1.1fr)`;

  const modalRoundMins: number[] = [];
  const modalLowestCounts: number[] = [];
  for (let i = 0; i < roundCount; i++) {
    const values = allRows.map((r) => r.rounds[i]).filter((v): v is number => typeof v === "number");
    const min = values.length > 0 ? Math.min(...values) : Infinity;
    modalRoundMins.push(min);
    modalLowestCounts.push(values.filter((v) => v === min).length);
  }

  // Resolve the displayed winner name from the authoritative game.winnerId
  // first — handSums excludes kicked players, so a winner-then-kicked edge
  // case (rare but possible across rounds in MP) would otherwise read the
  // wrong name from the handSums fallback. Falls back to handSums for cases
  // where game.winnerId is null (e.g. a tie on the cumulative ladder).
  const winnerName = isRoundTie
    ? ""
    : (game.winnerId
        ? (game.players.find((p) => p.id === game.winnerId)?.name ?? roundWinner?.name ?? "")
        : (roundWinner?.name ?? ""));

  // Cabo Evolved: explain the +20 levy beneath the buttons when a Kamikaze hit.
  const kamikazeNames = (game.roundOutcome?.kamikaze ?? [])
    .map((id) => game.players.find((p) => p.id === id)?.name ?? "A player");
  const kamikazeNote = kamikazeNames.length
    ? `💥 +20 added to everyone — ${kamikazeNames.join(" & ")} scored a Kamikaze (hand of 0)!`
    : null;

  return (
    <AnimatePresence>
      <motion.div
        className="overlay round-end-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={stage !== "modal" ? () => setStage("modal") : undefined}
        style={{ cursor: stage !== "modal" ? "pointer" : "default" }}
      >
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
                {isRoundTie
                  ? "It's a tie"
                  : inSuddenDeath
                  ? `Sudden Death · FR${Math.max(1, roundCount)}`
                  : "Round Over"}
              </motion.h1>

              <div className="cinematic-pills">
                {handSums.map((row, i) => (
                  <CinematicPill
                    key={row.id}
                    name={row.name}
                    total={row.handSum}
                    active={stage === "tally" || stage === "winner"}
                    delayMs={i * 140}
                    isWinner={!isRoundTie && roundWinner?.id === row.id}
                    isHighlighted={stage === "winner" && !isRoundTie && roundWinner?.id === row.id}
                    bonus={row.bonus}
                    penalty={row.penalty}
                  />
                ))}
              </div>

              {stage === "winner" && !isRoundTie && (
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
            {inSuddenDeath
              ? (isTie
                  ? `Sudden Death · FR${Math.max(1, roundCount)} · tied — play again`
                  : `Sudden Death · FR${Math.max(1, roundCount)}`)
              : isTie
              ? `Tied at ${lowestCum} pts · lowest wins`
              : "Leaderboard · lowest total wins"}
          </div>
          <div className="sb-table modal-sb">
            <div className="sb-thead" style={{ gridTemplateColumns: modalGridCols }}>
              <div className="sb-th sb-th-name">Player</div>
              {Array.from({ length: Math.max(1, roundCount) }).map((_, i) => (
                <div
                  key={i}
                  className={`sb-th sb-th-round${inSuddenDeath ? " sb-th-final" : ""}`}
                >
                  {roundCount > 0 ? `${inSuddenDeath ? "FR" : "R"}${i + 1}` : "—"}
                </div>
              ))}
              <div className="sb-th sb-th-bonus" title="Bonuses subtracted — Cabo bonus and Snap bonus combined.">Bonus</div>
              <div className="sb-th sb-th-penalty">Penalty</div>
              <div className="sb-th sb-th-total">Total</div>
            </div>
            <div className="sb-tbody">
              {allRows.map((t, i) => {
                const tiedHere = t.total === lowestCum;
                const crown = tiedHere ? (isTie ? "🤝" : "👑") : `#${i + 1}`;
                return (
                  <div
                    key={t.id}
                    className={`sb-trow ${tiedHere ? "lead" : ""} ${i === allRows.length - 1 && allRows.length > 1 && !tiedHere ? "worst" : ""}`}
                    style={{ gridTemplateColumns: modalGridCols }}
                  >
                    <span className="sb-td sb-td-name">
                      <span className="sb-rank">{crown}</span>
                      <span className="sb-pname">{t.name}</span>
                    </span>
                    {Array.from({ length: Math.max(1, roundCount) }).map((_, ri) => {
                      const v = t.rounds[ri];
                      const isLowest = v !== undefined && v === modalRoundMins[ri];
                      const tiedAtLowest = isLowest && modalLowestCounts[ri] > 1;
                      const hadBonus = (t.perRoundBonus[ri] ?? 0) > 0;
                      const hadPenalty = (t.perRoundPenalty[ri] ?? 0) > 0;
                      const hadKamikaze = (t.perRoundKamikaze[ri] ?? 0) > 0;
                      const cls = tiedAtLowest
                        ? " sb-td-round-tie"
                        : isLowest
                        ? " sb-td-round-win"
                        : "";
                      const finalCls = inSuddenDeath ? " sb-td-final" : "";
                      return (
                        <span key={ri} className={`sb-td sb-td-round${cls}${finalCls}`}>
                          {v !== undefined ? v : "—"}
                          {hadBonus && <span className="sb-cell-marker bonus" title="Cabo bonus">✦</span>}
                          {hadPenalty && <span className="sb-cell-marker penalty" title="Cabo penalty">!</span>}
                          {hadKamikaze && <span className="sb-cell-marker penalty" title="Kamikaze +20">💥</span>}
                        </span>
                      );
                    })}
                    <span className="sb-td sb-td-bonus">
                      {t.bonusTotal > 0 ? (
                        <RollingNumber value={-t.bonusTotal} className="bonus-num" />
                      ) : (
                        <span className="sb-zero">—</span>
                      )}
                    </span>
                    <span className="sb-td sb-td-penalty">
                      {t.penaltyTotal > 0 ? (
                        <RollingNumber value={t.penaltyTotal} signed className="penalty-num" />
                      ) : (
                        <span className="sb-zero">—</span>
                      )}
                    </span>
                    <span className="sb-td sb-td-total">
                      <RollingNumber value={t.total} className="total-num" />
                    </span>
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
          {kamikazeNote && (
            <div className="round-end-kamikaze-note">{kamikazeNote}</div>
          )}
        </motion.div>
        )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
