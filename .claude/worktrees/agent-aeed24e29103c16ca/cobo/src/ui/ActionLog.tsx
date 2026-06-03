import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "../state/store";

export function ActionLog() {
  const game = useStore((s) => s.game!);
  const compact = game.players.length >= 4;
  const bottomRef = useRef<HTMLDivElement>(null);

  // Oldest first — take the most recent N entries in chronological order
  const limit = compact ? 8 : 14;
  const entries = game.log.slice(-limit);

  // Auto-scroll to the newest entry whenever the log grows
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [game.log.length]);

  return (
    <div className={`action-log ${compact ? "compact" : ""}`}>
      <div className="log-title">Game log</div>
      <div className="log-rows">
        <AnimatePresence initial={false}>
          {entries.map((line, i) => {
            const isNewest = i === entries.length - 1;
            return (
              <motion.div
                key={`${game.log.length - (entries.length - 1 - i)}-${line}`}
                className="log-row"
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: isNewest ? 1 : 0.85 - (entries.length - 1 - i) * 0.05 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
              >
                {line}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {entries.length === 0 && (
          <div className="log-empty">No moves yet.</div>
        )}
        {/* Anchor for auto-scroll */}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
