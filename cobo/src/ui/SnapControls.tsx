import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";

/**
 * Two-button cluster near the discard pile. Cinematic-first flow:
 * one click COMMITS the snap (no second confirm). The engine immediately
 * flips snapPhase to armed_* and emits a snap_armed_* event, which
 * SnapCinematic uses to show the big "SNAP!" overlay. Then the snapper
 * picks a card and the engine resolves.
 *
 * Locked states:
 *  - Snap rival: locked when snapsUsed.other === true → "Already used this round".
 *  - Snap self:  locked when snapsUsed.self  === true → "Already used this round".
 *
 * Visible during play (turn_start / turn_drawn / pending_action / action
 * phases). Hidden during setup_peek and round_over.
 *
 * While snapPhase !== 'idle' both buttons are disabled so a player can't
 * spam the second snap mid-resolution.
 */
export function SnapControls() {
  const game = useStore((s) => s.game);
  const humanId = useStore((s) => s.humanId);
  const beginSnapOther = useStore((s) => s.beginSnapOther);
  const beginSnapSelf = useStore((s) => s.beginSnapSelf);

  const [hoveringOther, setHoveringOther] = useState(false);
  const [hoveringSelf, setHoveringSelf] = useState(false);

  if (!game) return null;
  if (game.phase === "setup_peek" || game.phase === "round_over") return null;
  const me = game.players.find((p) => p.id === humanId);
  if (!me) return null;
  if (game.discard.length === 0) return null;

  const snapPhase = game.snapPhase;
  const snapBusy = snapPhase !== "idle";
  const iAmSnapping = snapBusy && game.snappingPlayerId === humanId;

  const otherUsed = me.snapsUsed.other;
  const selfUsed = me.snapsUsed.self;

  // Reason a button is locked, used to render the tooltip + disable.
  const otherLockReason: string | null = otherUsed ? "Already used this round" : null;
  const selfLockReason: string | null = selfUsed ? "Already used this round" : null;

  const otherDisabled = snapBusy || !!otherLockReason;
  const selfDisabled = snapBusy || !!selfLockReason;

  // Highlight the button we're mid-snap with (so the player has visual
  // feedback that their press committed).
  const isArmingOther = iAmSnapping && snapPhase === "armed_other";
  const isArmingSelf = iAmSnapping && snapPhase === "armed_self";

  function clickOther() {
    if (otherDisabled) return;
    Audio.playSfx("click");
    beginSnapOther();
  }
  function clickSelf() {
    if (selfDisabled) return;
    Audio.playSfx("click");
    beginSnapSelf();
  }

  // Tooltip visibility — show rules / lock-reason on hover, regardless of
  // disable state. Disabled buttons still need their hover state so the
  // locked-reason tooltip can surface.
  const showOther = hoveringOther && !snapBusy;
  const showSelf = hoveringSelf && !snapBusy;
  const armingKind: "other" | "self" | null = showOther ? "other" : showSelf ? "self" : null;

  // Tooltip body: either the lock-reason (concise) or the full rules card.
  const otherTooltip = otherLockReason
    ? { locked: true as const, text: otherLockReason }
    : { locked: false as const, text: null };
  const selfTooltip = selfLockReason
    ? { locked: true as const, text: selfLockReason }
    : { locked: false as const, text: null };

  return (
    <div className="snap-controls">
      <div className="snap-buttons">
        <AnimatePresence>
          {armingKind && (
            <motion.div
              key={`rules-${armingKind}`}
              className={`snap-rules snap-rules-${armingKind}${
                (armingKind === "other" ? otherTooltip.locked : selfTooltip.locked) ? " snap-rules-locked" : ""
              }`}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              {(armingKind === "other" ? otherTooltip.locked : selfTooltip.locked) ? (
                // Locked variant — show the spec-exact reason text only.
                <div className="snap-rules-prompt snap-rules-locked-text">
                  {armingKind === "other" ? otherTooltip.text : selfTooltip.text}
                </div>
              ) : (
                <>
                  <div className="snap-rules-title">
                    {armingKind === "other" ? "Snap a rival" : "Snap yourself"}
                  </div>
                  <div className="snap-rules-prompt">
                    {armingKind === "other"
                      ? "Tap a rival's card that matches the discard top."
                      : "Tap one of your cards that matches the discard top."}
                  </div>
                  <div className="snap-rules-prompt snap-rules-hint">
                    Wrong = +1 penalty card · one each per round
                  </div>
                </>
              )}
              <span className="snap-rules-tail" />
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          className={`snap-btn snap-btn-other${isArmingOther ? " is-arming" : ""}`}
          onClick={clickOther}
          disabled={otherDisabled}
          aria-disabled={otherDisabled}
          title={otherLockReason ?? undefined}
          whileHover={{ scale: otherDisabled ? 1 : 1.04 }}
          whileTap={{ scale: 0.96 }}
          onMouseEnter={() => setHoveringOther(true)}
          onMouseLeave={() => setHoveringOther(false)}
        >
          <span className="snap-btn-icon" aria-hidden>⚡</span>
          <span className="snap-btn-label">Snap rival</span>
        </motion.button>
        <motion.button
          className={`snap-btn snap-btn-self${isArmingSelf ? " is-arming" : ""}`}
          onClick={clickSelf}
          disabled={selfDisabled}
          aria-disabled={selfDisabled}
          title={selfLockReason ?? undefined}
          whileHover={{ scale: selfDisabled ? 1 : 1.04 }}
          whileTap={{ scale: 0.96 }}
          onMouseEnter={() => setHoveringSelf(true)}
          onMouseLeave={() => setHoveringSelf(false)}
        >
          <span className="snap-btn-icon" aria-hidden>✋</span>
          <span className="snap-btn-label">Snap self</span>
        </motion.button>
      </div>
    </div>
  );
}
