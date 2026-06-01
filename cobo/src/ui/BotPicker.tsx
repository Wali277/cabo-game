import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { useViewMode } from "../state/viewmode";
import { Audio } from "../audio/sounds";
import { MenuWallpaper } from "./MenuWallpaper";
import { CaboEvolvedInfo } from "./CaboEvolvedInfo";
import { BOT_PROFILES, type BotDifficulty } from "../ai/bots";
import type { GameVariant } from "../engine/types";

/**
 * Bot difficulty picker — second screen of the single-player flow. The user
 * has already chosen the number of opponents on the menu; here they pick the
 * character / difficulty. All bots in the resulting match share the chosen
 * profile.
 *
 * Hover handling: framer-motion's onHoverStart fires when an element appears
 * UNDER an already-stationary cursor (not just on mouse movement). With the
 * staggered entrance animation, that meant the centre card (Marcy) often
 * pulled the hover focus the moment it animated in — the user would land on
 * this screen and Marcy would glow without them moving the mouse, then Bob's
 * dim-state animation would re-fire mid-entrance and leave him stuck at
 * opacity 0 until the user actually hovered him.
 *
 * Fix: hover handling is GATED on a single parent-level `groupReady` flag
 * that flips true only after the staggered entrance fully completes
 * (~0.6s after mount). Until then every card animates to its "normal"
 * resting state regardless of cursor position; mouse-enter events are
 * accepted and `hoveredId` only takes effect once the group is ready.
 */

interface BotCardProps {
  id: BotDifficulty;
  index: number;
  hoveredId: BotDifficulty | null;
  groupReady: boolean;
  onHover: (id: BotDifficulty | null) => void;
  onPick: () => void;
}

function BotCard({
  id,
  index,
  hoveredId,
  groupReady,
  onHover,
  onPick,
}: BotCardProps) {
  const bot = BOT_PROFILES[id];
  const Portrait = bot.Portrait;
  // Phones get a smaller portrait so the card stays compact; the SVG is
  // viewBox-scaled, so a smaller size renders crisply (no cropping). The
  // CSS .bot-card-portrait circle is sized to match under body.mobile-mode.
  const portraitSize = useViewMode() === "mobile" ? 64 : 140;

  // Hover/dim effects only apply once the whole group has settled, so the
  // user never sees a card highlighted before they actually moved the mouse.
  const isHovered = groupReady && hoveredId === id;
  const isDimmed = groupReady && hoveredId !== null && hoveredId !== id;

  return (
    <motion.button
      className={`bot-card diff-${bot.difficultyClass}`}
      onClick={onPick}
      onHoverStart={() => {
        // Ignore the synthetic hover fired by framer-motion when the
        // card appears under a stationary cursor during entrance.
        if (!groupReady) return;
        onHover(id);
      }}
      onHoverEnd={() => {
        if (!groupReady) return;
        onHover(null);
      }}
      whileTap={{ scale: 0.97 }}
      initial={{ opacity: 0, y: 30 }}
      animate={{
        opacity: isDimmed ? 0.55 : 1,
        y: isHovered ? -8 : 0,
        scale: isHovered ? 1.03 : isDimmed ? 0.96 : 1,
      }}
      transition={
        groupReady
          ? { type: "spring", stiffness: 600, damping: 30, mass: 0.6 }
          : { delay: 0.32 + index * 0.08, type: "spring", stiffness: 220, damping: 22 }
      }
      style={{ borderColor: bot.accent }}
    >
      <span className={`bot-card-difficulty diff-${bot.difficultyClass}`}>
        {bot.difficultyLabel}
      </span>
      <div className="bot-card-portrait">
        <Portrait size={portraitSize} />
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
  const variant = useStore((s) => s.pendingVariant);
  const setVariant = useStore((s) => s.setPendingVariant);
  const [hoveredId, setHoveredId] = useState<BotDifficulty | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  // groupReady flips true once the staggered entrance has had time to
  // finish for every card. We use a single timer (not onAnimationComplete
  // per card) because per-card completion was being re-fired by every
  // subsequent hover change, which made the unlock moment unreliable.
  // The longest entrance is the third card at delay 0.32 + 2*0.08 = 0.48s
  // plus its spring settle (~0.5s) = ~1s. A 950ms timer is a beat after
  // visual settle.
  const [groupReady, setGroupReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setGroupReady(true), 950);
    return () => window.clearTimeout(id);
  }, []);

  function pick(id: BotDifficulty) {
    Audio.playSfx("click");
    init(numBots, id, variant);
  }

  function chooseVariant(v: GameVariant) {
    Audio.playSfx("click");
    setVariant(v);
  }

  const orderedIds: BotDifficulty[] = ["billy", "marcy", "bob"];

  return (
    <>
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
        className="mode-select"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
      >
        <span className="mode-select-label">Game mode</span>
        <div className="mode-select-options" role="radiogroup" aria-label="Game mode">
          <button
            role="radio"
            aria-checked={variant === "classic"}
            className={`mode-option ${variant === "classic" ? "active" : ""}`}
            onClick={() => chooseVariant("classic")}
          >
            Classic
          </button>
          <button
            role="radio"
            aria-checked={variant === "evolved"}
            className={`mode-option evolved ${variant === "evolved" ? "active" : ""}`}
            onClick={() => chooseVariant("evolved")}
          >
            Cabo Evolved
          </button>
          <button
            className="mode-info-btn"
            onClick={() => { Audio.playSfx("click"); setInfoOpen(true); }}
            aria-label="How Cabo Evolved works"
            title="How Cabo Evolved works"
          >
            &#9432;
          </button>
        </div>
      </motion.div>

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
            groupReady={groupReady}
            onHover={setHoveredId}
            onPick={() => pick(id)}
          />
        ))}
      </motion.div>
    </div>
    <CaboEvolvedInfo open={infoOpen} onClose={() => setInfoOpen(false)} />
    </>
  );
}
