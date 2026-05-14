import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "../state/store";

export function ActionLog() {
  const game = useStore((s) => s.game!);
  const compact = game.players.length >= 4;
  // Newest first, capped to keep the panel manageable
  const entries = [...game.log].reverse().slice(0, compact ? 8 : 14);

  return (
    <div className={`action-log ${compact ? "compact" : ""}`}>
      <div className="log-title">Game log</div>
      <div className="log-rows">
        <AnimatePresence initial={false}>
          {entries.map((line, i) => (
            <motion.div
              key={`${game.log.length - i}-${line}`}
              className="log-row"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: i === 0 ? 1 : 0.85 - i * 0.05 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
            >
              {line}
            </motion.div>
          ))}
        </AnimatePresence>
        {entries.length === 0 && (
          <div className="log-empty">No moves yet.</div>
        )}
      </div>
    </div>
  );
}
