import { motion } from "framer-motion";
import { useState, useRef } from "react";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";
import { MenuWallpaper } from "./MenuWallpaper";
import { BOT_PROFILES, type BotDifficulty } from "../ai/bots";

/**
 * Bot difficulty picker — second screen of the single-player flow. The user
 * has already chosen the number of opponents on the menu; here they pick the
 * character / difficulty. All bots in the resulting match share the chosen
 * profile.
 */

interface BotCardProps {
  id: BotDifficulty;
  index: number;
  hoveredId: BotDifficulty | null;
  onHover: (id: BotDifficulty | null) => void;
  onPick: () => void;
}

/** Single card — owns its own `ready` flag so it can switch from the staggered
 *  entrance spring to the fast hover spring only after the entrance finishes. */
function BotCard({ id, index, hoveredId, onHover, onPick }: BotCardProps) {
  const bot = BOT_PROFILES[id];
  const Portrait = bot.Portrait;

  // Once the entrance animation completes we unlock hover-driven animations.
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);

  const isHovered = hoveredId === id;
  const isDimmed = hoveredId !== null && !isHovered;

  return (
    <motion.button
      className={`bot-card diff-${bot.difficultyClass}`}
      onClick={onPick}
      onHoverStart={() => onHover(id)}
      onHoverEnd={() => onHover(null)}
      whileTap={{ scale: 0.97 }}
      initial={{ opacity: 0, y: 30 }}
      animate={{
        opacity: isDimmed ? 0.55 : 1,
        y: isHovered && ready ? -8 : 0,
        scale: isHovered && ready ? 1.03 : isDimmed ? 0.96 : 1,
      }}
      transition={
        ready
          ? { type: "spring", stiffness: 600, damping: 30, mass: 0.6 }
          : { delay: 0.32 + index * 0.08, type: "spring", stiffness: 220, damping: 22 }
      }
      onAnimationComplete={() => {
        if (!readyRef.current) {
          readyRef.current = true;
          setReady(true);
        }
      }}
      style={{ borderColor: bot.accent }}
    >
      <span className={`bot-card-difficulty diff-${bot.difficultyClass}`}>
        {bot.difficultyLabel}
      </span>
      <div className="bot-card-portrait">
        <Portrait size={140} />
      </div>
      <div className="bot-card-name" style={{ color: bot.accent }}>
        {bot.baseName}
      </div>
      <div className="bot-card-tag">{bot.tagline}</div>
      <div className="bot-card-desc">{bot.description}</div>
      <div className="bot-card-cta">Play →</div>
    </motion.button>
  );
}

export function BotPicker() {
  const init = useStore((s) => s.init);
  const numBots = useStore((s) => s.pendingNumBots);
  const setScreen = useStore((s) => s.setScreen);
  const [hoveredId, setHoveredId] = useState<BotDifficulty | null>(null);

  function pick(id: BotDifficulty) {
    Audio.playSfx("click");
    init(numBots, id);
  }

  const orderedIds: BotDifficulty[] = ["billy", "marcy", "bob"];

  return (
    <div className="menu bot-picker-screen">
      <MenuWallpaper />

      <button
        className="btn ghost-light bot-picker-back"
        onClick={() => {
          Audio.playSfx("click");
          setScreen("menu");
        }}
      >
        ← Back
      </button>

      <motion.h1
        className="title bot-picker-title"
        initial={{ scale: 0.6, rotate: -8, opacity: 0 }}
        animate={{ scale: 1, rotate: -4, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 14 }}
      >
        Pick your rival
      </motion.h1>
      <motion.p
        className="subtitle bot-picker-sub"
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.18 }}
      >
        {numBots === 1
          ? "You vs one of these three. All three are different fights."
          : `You vs ${numBots} of the same. Choose carefully.`}
      </motion.p>

      <motion.div
        className="bot-picker-grid"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, type: "spring", stiffness: 200, damping: 22 }}
      >
        {orderedIds.map((id, i) => (
          <BotCard
            key={id}
            id={id}
            index={i}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onPick={() => pick(id)}
          />
        ))}
      </motion.div>
    </div>
  );
}
