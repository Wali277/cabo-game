import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";

/** Visual presentation of each action rank — label, emoji, accent color. */
const ACTION_INFO: Record<
  string,
  { text: string; emoji: string; color: string; sub: string }
> = {
  "7":  { text: "PEEK OWN",    emoji: "👁",  color: "#67e0a3", sub: "Look at one of your cards" },
  "8":  { text: "PEEK OWN",    emoji: "👁",  color: "#67e0a3", sub: "Look at one of your cards" },
  "9":  { text: "SPY",         emoji: "🔍", color: "#7aa8ff", sub: "Look at an opponent's card" },
  "10": { text: "SPY",         emoji: "🔍", color: "#7aa8ff", sub: "Look at an opponent's card" },
  J:    { text: "BLIND SWAP",  emoji: "🔀", color: "#ff8ec0", sub: "Swap a card with an opponent" },
  Q:    { text: "BLIND SWAP",  emoji: "🔀", color: "#ff8ec0", sub: "Swap a card with an opponent" },
  K:    { text: "PEEK & SWAP", emoji: "👑", color: "#ffd86b", sub: "See it, then choose to swap" },
};

/**
 * ActionCinematic — replaces the old floating ribbon banner with a full
 * cinematic intro that plays for ~1.5s when an action ability starts.
 *
 * Beats:
 *   0.00–0.40s : vignette darkens, title slams in from above with a spring
 *   0.40–1.20s : title + giant glyph hold center, accent color glows
 *   1.20–1.50s : everything fades + slides up, vignette lifts
 *
 * After the cinematic exits, the player makes their action choice on the
 * normal UI. Tap anywhere to skip. Reduced-motion users get a flat 250ms
 * crossfade — the title still shows, but no slam/glow.
 *
 * The component name is kept as `ActionBanner` so existing imports in
 * Table.tsx don't need to change.
 */
export function ActionBanner() {
  const game = useStore((s) => s.game);
  const reduced = useReducedMotion() ?? false;

  // Which action card is currently driving the cinematic. We freeze the
  // info on entry so the cinematic doesn't flicker if pendingActionSource
  // changes mid-exit (the engine clears it when the action resolves).
  const [shownInfo, setShownInfo] = useState<
    | (typeof ACTION_INFO)[keyof typeof ACTION_INFO] & { keyId: string }
    | null
  >(null);
  const lastSourceId = useRef<string | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect when an action phase begins. We treat the cinematic as a one-shot
  // intro tied to the action card's id — when a new action card enters
  // pendingActionSource we play the cinematic, then auto-dismiss after 1.5s.
  useEffect(() => {
    if (!game) return;
    const isActionPhase =
      game.phase === "action_peek_own" ||
      game.phase === "action_peek_other" ||
      game.phase === "action_blind_swap" ||
      game.phase === "action_peek_and_swap_pick" ||
      game.phase === "action_peek_and_swap_decide";

    const src = game.pendingActionSource;
    if (isActionPhase && src && src.id !== lastSourceId.current) {
      const info = ACTION_INFO[src.rank];
      if (info) {
        lastSourceId.current = src.id;
        setShownInfo({ ...info, keyId: src.id });
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        // Reduced motion: shorter on-screen time (still showing the label).
        const holdMs = reduced ? 350 : 800;
        dismissTimer.current = setTimeout(() => setShownInfo(null), holdMs);
      }
    } else if (!isActionPhase && shownInfo) {
      // Action resolved before the timer fired (rare) — clear immediately.
      setShownInfo(null);
      lastSourceId.current = null;
    }
    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    };
  }, [game?.phase, game?.pendingActionSource?.id, reduced]);

  // Reset the lastSourceId when the round ends, so the next round's first
  // action plays a fresh cinematic.
  useEffect(() => {
    if (game?.phase === "round_over" || game?.phase === "setup_peek") {
      lastSourceId.current = null;
    }
  }, [game?.phase]);

  // Tap-to-skip: clicking the vignette dismisses the cinematic early.
  const skip = () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setShownInfo(null);
  };

  return (
    <AnimatePresence>
      {shownInfo && (
        <motion.div
          key={shownInfo.keyId}
          className="action-cinematic"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2, ease: [0.16, 0.7, 0.32, 1] } }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          onClick={skip}
          style={{ ["--accent" as any]: shownInfo.color }}
        >
          {/* Vignette — radial darkening that focuses attention center-stage. */}
          <div className="action-cinematic-vignette" aria-hidden="true" />

          {/* Accent ring — soft colored bloom around the title, matches the
              action's theme color (peek=green, spy=blue, swap=pink, K=gold). */}
          <motion.div
            className="action-cinematic-bloom"
            aria-hidden="true"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.85 }}
            exit={{ scale: 1.1, opacity: 0, transition: { duration: 0.5 } }}
            transition={{ duration: 0.55, ease: [0.16, 0.7, 0.32, 1] }}
          />

          {/* Big glyph — sits above the title. Slam-in from above with a
              spring, then a subtle continuous pulse during the hold beat. */}
          <motion.div
            className="action-cinematic-glyph"
            initial={{ scale: 0.3, y: -120, rotate: -14, opacity: 0 }}
            animate={
              reduced
                ? { scale: 1, y: 0, rotate: 0, opacity: 1 }
                : {
                    scale: [0.3, 1.18, 1.0],
                    y: [-120, 0, 0],
                    rotate: [-14, 4, 0],
                    opacity: [0, 1, 1],
                  }
            }
            exit={{ scale: 0.85, y: -30, opacity: 0, transition: { duration: 0.5 } }}
            transition={
              reduced
                ? { duration: 0.25 }
                : { duration: 0.6, times: [0, 0.7, 1], ease: [0.16, 0.7, 0.32, 1] }
            }
          >
            {shownInfo.emoji}
          </motion.div>

          {/* Title — main label. Mirrors the glyph's motion but offset so
              they read as one composite reveal. */}
          <motion.h1
            className="action-cinematic-title"
            initial={{ scale: 0.55, y: 60, opacity: 0, letterSpacing: "0.4em" }}
            animate={{
              scale: 1,
              y: 0,
              opacity: 1,
              letterSpacing: "0.04em",
            }}
            exit={{ opacity: 0, y: -20, transition: { duration: 0.5 } }}
            transition={{ type: "spring", stiffness: 220, damping: 18, delay: 0.12 }}
          >
            {shownInfo.text}
          </motion.h1>

          {/* Subtitle — what this action does, for clarity on first encounter. */}
          <motion.div
            className="action-cinematic-sub"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            {shownInfo.sub}
          </motion.div>

          <div className="action-cinematic-skip-hint">tap to skip</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
