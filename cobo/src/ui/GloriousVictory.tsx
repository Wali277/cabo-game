import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import confetti from "canvas-confetti";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";
import { EndScoreboard, buildScoreRows } from "./EndScoreboard";
import { FireworksLayer } from "./Particles";

export function GloriousVictory() {
  const mp = useStore((s) => s.mp);
  const humanId = useStore((s) => s.humanId);
  const backToMenu = useStore((s) => s.backToMenu);
  const mode = useStore((s) => s.mode);
  const game = useStore((s) => s.game);

  const victorId = mp?.gloriosVictory ?? null;
  const reason = mp?.gloriosVictoryReason ?? null;
  // Only the actual winner sees the Glorious Victory screen.
  // Losers (including tiebreaker losers) see GameLostOverlay instead.
  const show = mode === "mp" && !!victorId && victorId === humanId;

  // Fire confetti + win sound only for the winner
  useEffect(() => {
    if (!show || victorId !== humanId) return;
    Audio.playSfx("win");
    const fire = () => {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.5 },
        colors: ["#ffd86b", "#a87bff", "#67e0a3", "#ff5b6e", "#7aa8ff"],
      });
    };
    fire();
    const t1 = setTimeout(fire, 600);
    const t2 = setTimeout(fire, 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [show, victorId, humanId]);

  if (!show) return null;

  const scoreRows = buildScoreRows(game, mp?.members ?? null);

  // Tiebreaker message — only shows when the win came from a tiebreaker, not
  // from being the genuine last-one-standing survivor.
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
  }

  return (
    <AnimatePresence>
      <motion.div
        className="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ zIndex: 400 }}
      >
        {/* Continuous fireworks behind the modal — auto-recycles bursts */}
        <FireworksLayer count={6} />

        <motion.div
          className="modal glory-modal"
          initial={{ scale: 0.6, y: 20, rotate: -4 }}
          animate={{ scale: 1, y: 0, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
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
