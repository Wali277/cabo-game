import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "../state/store";

const ACTION_LABEL: Record<string, { text: string; emoji: string; color: string }> = {
  "7": { text: "PEEK OWN", emoji: "👁", color: "#67e0a3" },
  "8": { text: "PEEK OWN", emoji: "👁", color: "#67e0a3" },
  "9": { text: "SPY", emoji: "🔍", color: "#7aa8ff" },
  "10": { text: "SPY", emoji: "🔍", color: "#7aa8ff" },
  J: { text: "BLIND SWAP", emoji: "🔀", color: "#ff8ec0" },
  Q: { text: "BLIND SWAP", emoji: "🔀", color: "#ff8ec0" },
  K: { text: "PEEK & SWAP", emoji: "👑", color: "#ffd86b" },
};

export function ActionBanner() {
  const game = useStore((s) => s.game);
  const src = game?.pendingActionSource;
  const label = src ? ACTION_LABEL[src.rank] : null;
  return (
    <AnimatePresence>
      {label && src && (
        <motion.div
          key={src.id}
          className="action-banner"
          initial={{ scale: 0.3, opacity: 0, rotate: -12, y: 20 }}
          animate={{ scale: 1, opacity: 1, rotate: -6, y: 0 }}
          exit={{ scale: 1.4, opacity: 0, y: -10 }}
          transition={{ type: "spring", stiffness: 200, damping: 14 }}
          style={{ background: label.color }}
        >
          <span className="action-emoji">{label.emoji}</span>
          <span className="action-text">{label.text}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
