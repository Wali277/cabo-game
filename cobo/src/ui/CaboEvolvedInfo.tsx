import { motion, AnimatePresence } from "framer-motion";
import { Audio } from "../audio/sounds";

/**
 * CaboEvolvedInfo — the "how to play" modal for the Cabo Evolved variant,
 * opened from the ℹ️ button beside the game-mode selector on the bot picker.
 * Pure presentational: visibility is controlled by the parent via `open`.
 */
interface Props {
  open: boolean;
  onClose: () => void;
}

interface RuleRow {
  badge: string;
  title: string;
  body: string;
  tone?: "kamikaze" | "carre";
}

const ACTION_RULES: RuleRow[] = [
  { badge: "7 · 8", title: "Peek OR Spy", body: "Choose one: peek at one of YOUR own cards, or spy one of a rival's." },
  { badge: "9 · 10", title: "Peek AND Spy", body: "Do both — peek one of your own cards, then spy one of a rival's." },
  { badge: "J · Q", title: "Blind Swap", body: "Trade one of your cards with a rival's, sight unseen." },
  { badge: "K", title: "No power", body: "The King loses its ability — it's simply worth 0." },
];

const SPECIAL_RULES: RuleRow[] = [
  {
    badge: "💥",
    title: "Kamikaze",
    tone: "kamikaze",
    body: "Finish a round with a hand totalling exactly 0 and you win the round — every other player is hit with +20 points.",
  },
  {
    badge: "♦",
    title: "Carré",
    tone: "carre",
    body: "Hold four of a kind (of a non-zero rank) and those four cards count as 0 — pure points protection. You still only WIN the round if your full hand is genuinely the lowest.",
  },
];

export function CaboEvolvedInfo({ open, onClose }: Props) {
  function close() {
    Audio.playSfx("click");
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay evolved-info-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ zIndex: 360 }}
          onClick={close}
        >
          <motion.div
            className="evolved-info-modal"
            initial={{ scale: 0.9, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="How to play Cabo Evolved"
          >
            <button className="evolved-info-close" onClick={close} aria-label="Close">
              ✕
            </button>

            <div className="evolved-info-head">
              <div className="evolved-info-kicker">How to play</div>
              <h2 className="evolved-info-title">Cabo Evolved</h2>
              <p className="evolved-info-sub">
                The classic game with a bolder ruleset. Lowest score still wins —
                but the cards bite harder and two special outcomes can swing a round.
              </p>
            </div>

            <div className="evolved-info-body">
              <section className="evolved-info-section">
                <h3 className="evolved-info-h3">The basics</h3>
                <ul className="evolved-info-list">
                  <li><span className="evolved-info-dot" />You're dealt <strong>5 cards</strong> (classic deals 4). Peek at any 2 to start.</li>
                  <li><span className="evolved-info-dot" />Card values: <strong>A = 1</strong>, 2–10 face value, <strong>J = 11</strong>, <strong>Q = 12</strong>, <strong>K = 0</strong>, <strong>Joker = 0</strong>.</li>
                  <li><span className="evolved-info-dot" />On your turn, draw from the deck or take the discard, then keep or use it.</li>
                </ul>
              </section>

              <section className="evolved-info-section">
                <h3 className="evolved-info-h3">Action cards (when discarded from a draw)</h3>
                <div className="evolved-info-rules">
                  {ACTION_RULES.map((r) => (
                    <div key={r.badge} className="evolved-info-rule">
                      <span className="evolved-info-badge">{r.badge}</span>
                      <div className="evolved-info-rule-text">
                        <div className="evolved-info-rule-title">{r.title}</div>
                        <div className="evolved-info-rule-body">{r.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="evolved-info-section">
                <h3 className="evolved-info-h3">The Dragon</h3>
                <div className="evolved-info-rules">
                  <div className="evolved-info-rule">
                    <span className="evolved-info-badge">🐉</span>
                    <div className="evolved-info-rule-text">
                      <div className="evolved-info-rule-title">Must transform</div>
                      <div className="evolved-info-rule-body">Draw one of the 2 Dragons and you must Activate it — turn it into any card (A–K or Joker), a free extra card. Action cards still fire.</div>
                    </div>
                  </div>
                  <div className="evolved-info-rule special carre">
                    <span className="evolved-info-badge">+20</span>
                    <div className="evolved-info-rule-text">
                      <div className="evolved-info-rule-title">Or it bites</div>
                      <div className="evolved-info-rule-body">Still holding it face-down at round end? +20 points — and that overrides Carré.</div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="evolved-info-section">
                <h3 className="evolved-info-h3">Special outcomes</h3>
                <div className="evolved-info-rules">
                  {SPECIAL_RULES.map((r) => (
                    <div key={r.badge} className={`evolved-info-rule special ${r.tone ?? ""}`}>
                      <span className="evolved-info-badge">{r.badge}</span>
                      <div className="evolved-info-rule-text">
                        <div className="evolved-info-rule-title">{r.title}</div>
                        <div className="evolved-info-rule-body">{r.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="evolved-info-section">
                <h3 className="evolved-info-h3">Snap & Cabo</h3>
                <ul className="evolved-info-list">
                  <li><span className="evolved-info-dot" /><strong>Snap</strong> (unchanged): slap a face-down card you think matches the discard top — once on a rival, once on yourself, per round. Wrong snap = a penalty card.</li>
                  <li><span className="evolved-info-dot" /><strong>Call Cabo</strong> to lock the round: everyone else gets one final turn, then all hands reveal. Lowest total wins — the caller wins ties.</li>
                </ul>
              </section>
            </div>

            <button className="btn primary big evolved-info-got-it" onClick={close}>
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
