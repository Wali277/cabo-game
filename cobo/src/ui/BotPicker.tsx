import { motion } from "framer-motion";
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
export function BotPicker() {
  const init = useStore((s) => s.init);
  const numBots = useStore((s) => s.pendingNumBots);
  const setScreen = useStore((s) => s.setScreen);

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
        {orderedIds.map((id, i) => {
          const bot = BOT_PROFILES[id];
          const Portrait = bot.Portrait;
          return (
            <motion.button
              key={id}
              className={`bot-card diff-${bot.difficultyClass}`}
              onClick={() => pick(id)}
              whileHover={{ y: -6, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32 + i * 0.08, type: "spring", stiffness: 220, damping: 22 }}
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
        })}
      </motion.div>
    </div>
  );
}
