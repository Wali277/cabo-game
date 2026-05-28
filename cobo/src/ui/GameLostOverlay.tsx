import { useEffect, useLayoutEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";
import { EndScoreboard, buildScoreRows } from "./EndScoreboard";

/**
 * Shown to the loser(s) when the game is fully over (gloriosVictory is set)
 * and they are not the winner. Replaces BustedOverlay for game-ending eliminations.
 *
 * Distinct from BustedOverlay (mid-game bust, game continues with others)
 * and GloriousVictory (the winner's screen).
 */
export function GameLostOverlay() {
  const mp = useStore((s) => s.mp);
  const elim = useStore((s) => s.elim);
  const humanId = useStore((s) => s.humanId);
  const game = useStore((s) => s.game);
  const backToMenu = useStore((s) => s.backToMenu);

  // Mode-agnostic: elim is mirrored from MP / computed locally in SP.
  const gloriosVictory = elim.gloriosVictory;
  const reason = elim.gloriosVictoryReason;

  // Show when: game is over AND I am not the winner AND I was eliminated.
  const iAmEliminated =
    elim.bustedThisRound.includes(humanId) ||
    elim.kickedIds.includes(humanId);

  // If we're being eliminated by a bust THIS round, the BustedOverlay splash
  // plays first (1.4s). Delay our render so the splash isn't interrupted.
  // If we were already kicked from a previous round (no fresh splash to play),
  // appear immediately.
  //
  // useLayoutEffect (not useEffect) so the splashSettled=false update lands
  // synchronously before the next paint — otherwise GameLostOverlay flashes
  // for one frame before the bust splash, which the user perceives as the
  // cinematic being skipped.
  const reduced = useReducedMotion() ?? false;
  const justBusted = elim.bustedThisRound.includes(humanId);
  const [splashSettled, setSplashSettled] = useState(!justBusted);
  useLayoutEffect(() => {
    if (!justBusted || reduced) { setSplashSettled(true); return; }
    setSplashSettled(false);
    const t = setTimeout(() => setSplashSettled(true), 1400);
    return () => clearTimeout(t);
  }, [justBusted, reduced]);

  const show =
    !!gloriosVictory &&
    gloriosVictory !== humanId &&
    iAmEliminated &&
    splashSettled;

  // Play lose SFX once when the overlay appears.
  useEffect(() => {
    if (show) Audio.playSfx("lose");
  }, [show]);

  if (!show) return null;

  // Look up the winner's name from the current game or the room member list.
  const victorName =
    game?.players.find((p) => p.id === gloriosVictory)?.name ??
    mp?.members.find((m) => m.id === gloriosVictory)?.name ??
    "Your opponent";

  // Build the "how they won" subtitle — varies by reason so it's clear to
  // the loser why the winner won (especially in tiebreaker cases).
  let howWonMsg: string;
  switch (reason) {
    case "more_wins":
      howWonMsg = "Won by winning more rounds";
      break;
    case "final_round":
      howWonMsg = "Won by winning the final round (tied on wins)";
      break;
    case "sudden_death":
      howWonMsg = "Won in sudden-death overtime";
      break;
    case "survivor":
    default:
      howWonMsg = "Won by being the last one standing";
      break;
  }

  const scoreRows = buildScoreRows(game, mp?.members ?? null);
  // mainRoundsCount = boundary between R-rounds and F-rounds for the end
  // scoreboard. The SD record is kept (with active:false) after GV via SD.
  const mainRoundsCount = elim.suddenDeath?.mainRoundsCount ?? null;

  return (
    <AnimatePresence>
      <motion.div
        className="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ zIndex: 350 }}
      >
        <motion.div
          className="modal busted-modal game-lost-modal"
          initial={{ scale: 0.6, y: 20, rotate: -4 }}
          animate={{ scale: 1, y: 0, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
        >
          <div className="modal-burst">🏁</div>
          <h2>{victorName} Won!</h2>
          <p className="game-lost-howwon">{howWonMsg}</p>
          <p className="game-lost-busted">You busted</p>

          <EndScoreboard
            rows={scoreRows}
            winnerId={gloriosVictory}
            humanId={humanId}
            variant="lost"
            mainRoundsCount={mainRoundsCount}
          />

          <button
            className="btn primary big"
            onClick={backToMenu}
            style={{ marginTop: "20px" }}
          >
            Return to Menu
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
