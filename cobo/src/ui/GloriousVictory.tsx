import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import confetti from "canvas-confetti";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";

export function GloriousVictory() {
  const mp = useStore((s) => s.mp);
  const humanId = useStore((s) => s.humanId);
  const backToMenu = useStore((s) => s.backToMenu);
  const mode = useStore((s) => s.mode);
  const game = useStore((s) => s.game);

  const victorId = mp?.gloriosVictory ?? null;
  // Don't show GV for players who are themselves busted — they see BustedOverlay.
  const localPlayerEliminated =
    (mp?.bustedThisRound.includes(humanId) ?? false) ||
    (mp?.kickedIds.includes(humanId) ?? false);
  const show = mode === "mp" && !!victorId && !localPlayerEliminated;

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

  const victorName =
    game?.players.find((p) => p.id === victorId)?.name ??
    mp?.members.find((m) => m.id === victorId)?.name ??
    "Someone";
  const isMe = victorId === humanId;

  return (
    <AnimatePresence>
      <motion.div
        className="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ zIndex: 400 }}
      >
        <motion.div
          className="modal glory-modal"
          initial={{ scale: 0.6, y: 20, rotate: -4 }}
          animate={{ scale: 1, y: 0, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
        >
          <div className="modal-burst">🏆</div>
          <h2>Glorious Victory!</h2>
          <p className="glory-subtitle">
            {isMe
              ? "You outlasted everyone — last one standing!"
              : `${victorName} outlasted everyone!`}
          </p>
          <p style={{ fontSize: "14px", opacity: 0.7, marginBottom: "20px" }}>
            All other players were eliminated.
          </p>
          <button className="btn primary big" onClick={backToMenu}>
            Return to Menu
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
