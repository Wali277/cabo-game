import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";

/**
 * Two-button cluster near the discard pile. The wording "Snap rival" and
 * "Snap self" maps directly to the per-round budget (one each) so the UI
 * disables the right button independently when used. Phase-agnostic.
 *
 * Visible during play (turn_start / turn_drawn / pending_action / action
 * phases). Hidden during setup_peek and round_over.
 *
 * Rules tooltip shows on hover (pre-education) AND while armed (confirmation).
 */
export function SnapControls() {
  const game = useStore((s) => s.game);
  const humanId = useStore((s) => s.humanId);
  const targeting = useStore((s) => s.targeting);
  const beginSnapOther = useStore((s) => s.beginSnapOther);
  const beginSnapSelf = useStore((s) => s.beginSnapSelf);
  const cancelSnap = useStore((s) => s.cancelSnap);

  const [hoveringOther, setHoveringOther] = useState(false);
  const [hoveringSelf, setHoveringSelf] = useState(false);

  if (!game) return null;
  if (game.phase === "setup_peek" || game.phase === "round_over") return null;
  const me = game.players.find((p) => p.id === humanId);
  if (!me) return null;
  if (game.discard.length === 0) return null;

  const otherUsed = me.snapsUsed.other;
  const selfUsed = me.snapsUsed.self;
  const armingOther = targeting === "snap_other_target";
  const armingSelf = targeting === "snap_self_target";

  function clickOther() {
    Audio.playSfx("click");
    if (armingOther) cancelSnap();
    else beginSnapOther();
  }
  function clickSelf() {
    Audio.playSfx("click");
    if (armingSelf) cancelSnap();
    else beginSnapSelf();
  }

  // Show "other" rules when hovering the button (and it's still usable) OR while armed.
  // Show "self" rules similarly. Both can't show simultaneously — "other" wins.
  const showOther = armingOther || (hoveringOther && !otherUsed);
  const showSelf  = armingSelf  || (hoveringSelf  && !selfUsed);
  const armingKind: "other" | "self" | null = showOther ? "other" : showSelf ? "self" : null;

  return (
    <div className="snap-controls">
      <div className="snap-buttons">
        {/* Rules tooltip — absolutely positioned directly above the button row */}
        <AnimatePresence>
          {armingKind && (
            <motion.div
              key={`rules-${armingKind}`}
              className={`snap-rules snap-rules-${armingKind}`}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="snap-rules-title">
                {armingKind === "other" ? "Snap a rival" : "Snap yourself"}
              </div>
              <div className="snap-rules-prompt">
                {armingKind === "other"
                  ? "Tap a rival's face-down card you believe matches the rank on top of the discard pile."
                  : "Tap one of your own face-down cards you believe matches the rank on top of the discard pile."}
              </div>
              <ul className="snap-rules-list">
                <li>
                  <span className="snap-rules-pip ok">✓</span>
                  <span>
                    <strong>Correct:</strong> the card hits the discard and a fresh card replaces it.
                  </span>
                </li>
                <li>
                  <span className="snap-rules-pip bad">✕</span>
                  <span>
                    <strong>Wrong:</strong> you draw a penalty card into your hand and your score rises.
                  </span>
                </li>
                <li>
                  <span className="snap-rules-pip">◷</span>
                  <span>
                    <strong>One shot each round</strong> — one snap on a rival, one on yourself.
                  </span>
                </li>
              </ul>
              <span className="snap-rules-tail" />
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          className={`snap-btn snap-btn-other${armingOther ? " is-arming" : ""}`}
          onClick={clickOther}
          disabled={otherUsed && !armingOther}
          whileHover={{ scale: otherUsed ? 1 : 1.04 }}
          whileTap={{ scale: 0.96 }}
          onMouseEnter={() => setHoveringOther(true)}
          onMouseLeave={() => setHoveringOther(false)}
        >
          <span className="snap-btn-icon" aria-hidden>⚡</span>
          <span className="snap-btn-label">
            {armingOther ? "Cancel" : "Snap rival"}
          </span>
        </motion.button>
        <motion.button
          className={`snap-btn snap-btn-self${armingSelf ? " is-arming" : ""}`}
          onClick={clickSelf}
          disabled={selfUsed && !armingSelf}
          whileHover={{ scale: selfUsed ? 1 : 1.04 }}
          whileTap={{ scale: 0.96 }}
          onMouseEnter={() => setHoveringSelf(true)}
          onMouseLeave={() => setHoveringSelf(false)}
        >
          <span className="snap-btn-icon" aria-hidden>✋</span>
          <span className="snap-btn-label">
            {armingSelf ? "Cancel" : "Snap self"}
          </span>
        </motion.button>
      </div>
    </div>
  );
}
