import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";

type OutcomeBeat =
  | { kind: "kamikaze"; name: string }
  | { kind: "carre"; name: string; rank: string };

/**
 * EvolvedOutcomeCinematic — dedicated round-end splashes for the two Cabo
 * Evolved special outcomes, driven by `game.roundOutcome` (set in endRound):
 *
 *   • Kamikaze — a player finished on EXACTLY 0; every other player takes +20.
 *                Explosive crimson/orange stamp.
 *   • Carré    — a four-of-a-kind protected a player's points (those four
 *                count as 0). Regal purple/gold stamp.
 *
 * Plays one dramatic ~2s beat per outcome (Kamikaze first, then Carré), keyed
 * once per round, then dismisses to reveal the round-end scoreboard beneath.
 * Evolved-only by construction: roundOutcome is always null in classic.
 */
export function EvolvedOutcomeCinematic() {
  const game = useStore((s) => s.game);
  const reduced = useReducedMotion() ?? false;

  const shownForRound = useRef<number | null>(null);
  const [beats, setBeats] = useState<OutcomeBeat[]>([]);
  const [index, setIndex] = useState(0);

  const inRoundOver = !!game && game.phase === "round_over";
  const outcome = inRoundOver ? game!.roundOutcome : null;
  const roundNumber = game?.roundNumber ?? -1;

  // Build the beat queue once per round when a Kamikaze/Carré outcome lands.
  useEffect(() => {
    if (!inRoundOver) {
      // Leaving round_over (next round / new game): clear the queue AND the
      // "shown" key so the next round_over re-triggers — keying on roundNumber
      // alone would suppress it after a play-again resets the count to 1.
      shownForRound.current = null;
      if (beats.length) setBeats([]);
      if (index) setIndex(0);
      return;
    }
    if (!outcome) return;
    if (shownForRound.current === roundNumber) return;
    const nameOf = (id: string) =>
      game!.players.find((p) => p.id === id)?.name ?? "A player";
    const next: OutcomeBeat[] = [
      ...outcome.kamikaze.map((id) => ({ kind: "kamikaze" as const, name: nameOf(id) })),
      ...outcome.carre.map((c) => ({
        kind: "carre" as const,
        name: nameOf(c.playerId),
        rank: String(c.rank),
      })),
    ];
    if (next.length === 0) return;
    shownForRound.current = roundNumber;
    setBeats(next);
    setIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inRoundOver, outcome, roundNumber]);

  const current = index < beats.length ? beats[index] : null;

  // SFX + auto-advance per beat (each beat plays its full duration).
  useEffect(() => {
    if (!current) return;
    Audio.playSfx(current.kind === "kamikaze" ? "cabo" : "snap_correct");
    const t = setTimeout(() => setIndex((i) => i + 1), reduced ? 600 : 2100);
    return () => clearTimeout(t);
  }, [current, reduced]);

  if (!current) return null;
  const isKam = current.kind === "kamikaze";

  return (
    <AnimatePresence>
      <motion.div
        key={`evo-beat-${index}`}
        className={`overlay evolved-outcome-overlay ${isKam ? "is-kamikaze" : "is-carre"}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ zIndex: 320 }}
      >
        <div className="evolved-outcome-wrap">
          {!reduced && (
            <motion.div
              className="evolved-outcome-halo"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1.5, opacity: [0, 0.9, 0.5] }}
              transition={{ duration: 1.2, ease: [0.16, 0.7, 0.32, 1] }}
            />
          )}
          <motion.div
            className="evolved-outcome-kicker"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.3 }}
          >
            {isKam ? "💥 Lumo Evolved" : "♦ Lumo Evolved"}
          </motion.div>
          <motion.div
            className="evolved-outcome-title"
            initial={{ scale: 0.35, rotate: isKam ? -10 : -4, opacity: 0, y: 18 }}
            animate={{ scale: 1, rotate: isKam ? -4 : -2, opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 13, delay: 0.12 }}
          >
            {isKam ? "Kamikaze!" : "Carré!"}
          </motion.div>
          <motion.div
            className="evolved-outcome-sub"
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 220, damping: 22 }}
          >
            {isKam
              ? `${current.name} hit zero — everyone else +20`
              : `${current.name} — four ${current.rank}s count as zero`}
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
