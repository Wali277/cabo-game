import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";
import { EndScoreboard, buildScoreRows } from "./EndScoreboard";
import { FireworksLayer } from "./Particles";
import { useViewMode } from "../state/viewmode";

/**
 * GloriousVictory — two-beat cinematic when the local player wins the game.
 *
 *   beat 1  splash  (0   to 1.8s)  : golden radial glow expands behind a
 *                                    "Victory" wordmark that scales in
 *                                    from 0.35 with a slight rotation
 *                                    correct, fireworks burst, three
 *                                    confetti volleys fire
 *   beat 2  modal   (1.8s onward)  : leaderboard scoreboard + trophy +
 *                                    return-to-menu slide up from below
 */
export function GloriousVictory() {
  const mp = useStore((s) => s.mp);
  const elim = useStore((s) => s.elim);
  const humanId = useStore((s) => s.humanId);
  const backToMenu = useStore((s) => s.backToMenu);
  const game = useStore((s) => s.game);
  const reduced = useReducedMotion() ?? false;
  const mobile = useViewMode() === "mobile";
  // End-of-game sequencing inputs (see deferForReward below).
  const mode = useStore((s) => s.mode);
  const account = useStore((s) => s.account);
  const spGameKey = useStore((s) => s.spGameKey);
  const rewardResolvedKey = useStore((s) => s.rewardResolvedKey);

  // Mode-agnostic GV — `elim` is mirrored from MP / computed locally in SP.
  const victorId = elim.gloriosVictory;
  const reason = elim.gloriosVictoryReason;

  // End-of-game SEQUENCING (see GameLostOverlay for the full rationale): in
  // SINGLE-PLAYER, defer the winner's cinematic + scoreboard until this match's
  // XP "experience" has played and been dismissed. The human winning IS the SP
  // grant condition (gloriosVictory === humanId), so this mirrors useSpXpGrant.
  // Computed synchronously → the deferral holds from the first render (the
  // victory splash never half-plays then re-mounts). MP/guests/training: no
  // change.
  const deferForReward =
    mode === "sp" &&
    !!account &&
    !!spGameKey &&
    victorId === humanId &&
    rewardResolvedKey !== spGameKey;
  const show = !!victorId && victorId === humanId && !deferForReward;

  const [stage, setStage] = useState<"splash" | "modal">("splash");
  useEffect(() => {
    if (!show) { setStage("splash"); return; }
    if (reduced) { setStage("modal"); return; }
    const t = setTimeout(() => setStage("modal"), 1800);
    return () => clearTimeout(t);
  }, [show, reduced]);

  // Win SFX + confetti volleys, fire when splash begins
  useEffect(() => {
    if (!show || victorId !== humanId) return;
    Audio.playSfx("win");
    if (reduced) return;
    // Lighter, fewer confetti volleys on mobile (canvas-confetti is rAF-driven
    // and 3×130 particles stutters on phones). Desktop keeps the full burst.
    const fire = (delay: number) => setTimeout(() => {
      confetti({
        particleCount: mobile ? 70 : 130,
        spread: 85,
        startVelocity: 38,
        origin: { y: 0.55 },
        colors: ["#ffd86b", "#a87bff", "#67e0a3", "#ff5b6e", "#7aa8ff"],
      });
    }, delay);
    const t1 = fire(0);
    const t2 = fire(550);
    const t3 = mobile ? null : fire(1100);
    return () => { clearTimeout(t1); clearTimeout(t2); if (t3) clearTimeout(t3); };
  }, [show, victorId, humanId, reduced, mobile]);

  if (!show) return null;

  const scoreRows = buildScoreRows(game, mp?.members ?? null);
  // mainRoundsCount = boundary between R-rounds and F-rounds. The SD record
  // is kept (with active: false) after GV via SD, so this stays accessible.
  const mainRoundsCount = elim.suddenDeath?.mainRoundsCount ?? null;

  let tiebreakerMsg: string | null = null;
  if (reason === "more_wins") {
    const opponentNames = scoreRows
      .filter((r) => r.id !== victorId)
      .map((r) => r.name)
      .join(", ");
    tiebreakerMsg = opponentNames
      ? `Won by winning more rounds than ${opponentNames}`
      : "Won by winning more rounds";
  } else if (reason === "final_round") {
    tiebreakerMsg = "Won by winning the final round";
  } else if (reason === "sudden_death") {
    tiebreakerMsg = "Won the sudden-death final";
  }

  return (
    <AnimatePresence>
      <motion.div
        className="overlay glory-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ zIndex: 400 }}
      >
        {/* Fireworks ride the whole overlay lifetime — splash + modal */}
        <FireworksLayer count={6} />

        <AnimatePresence mode="wait">
          {stage === "splash" ? (
            <motion.div
              key="glory-splash"
              className="glory-splash-wrap"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.12, transition: { duration: 0.45, ease: [0.16, 0.7, 0.32, 1] } }}
            >
              {/* Expanding golden halo behind the wordmark */}
              <motion.div
                className="glory-splash-halo"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1.4, opacity: [0, 0.85, 0.55] }}
                transition={{ duration: 1.4, ease: [0.16, 0.7, 0.32, 1] }}
              />
              <motion.div
                className="glory-splash-title"
                initial={{ scale: 0.35, rotate: -6, opacity: 0, y: 12 }}
                animate={{ scale: 1, rotate: -3, opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 280, damping: 14, delay: 0.2 }}
              >
                Victory
              </motion.div>
              <motion.div
                className="glory-splash-sub"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.9, type: "spring", stiffness: 220, damping: 22 }}
              >
                You outlasted them all
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="glory-modal"
              className="modal glory-modal"
              initial={{ scale: 0.85, y: 60, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-burst">🏆</div>
              <h2>Glorious Victory!</h2>
              <p className="glory-subtitle">
                You outlasted everyone and achieved perfect glory!
              </p>
              {tiebreakerMsg && (
                <p className="glory-tiebreaker">{tiebreakerMsg}</p>
              )}

              <EndScoreboard
                rows={scoreRows}
                winnerId={victorId}
                humanId={humanId}
                variant="victory"
                mainRoundsCount={mainRoundsCount}
              />

              <button
                className="btn primary big"
                onClick={backToMenu}
                style={{ marginTop: "20px" }}
              >
                Return to menu
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
