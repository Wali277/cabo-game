import { AnimatePresence, motion } from "framer-motion";
import { useState, type ReactNode } from "react";

/**
 * In-game reference "notepad" — opened from the Help (?) button. A tabbed
 * quick-reference: pick a compartment (Basics / Action cards / Snap / Scoring /
 * Evolved) and read just what you need. Close with the ✕ at the TOP-LEFT.
 *
 * Content is variant-agnostic (covers both Classic and Lumo Evolved) so it's
 * correct whether opened from the menu or mid-game. All score-impacting rules
 * live under "Scoring & total". Values mirror the engine (cobo/src/engine):
 * J=11, Q=12, K=13 (0 in Evolved), Joker=0, Dragon=20; snap bonus −5.
 */

interface Props {
  onClose: () => void;
}

type SectionId = "basics" | "actions" | "snap" | "scoring" | "evolved";

interface Section {
  id: SectionId;
  label: string;
  icon: string;
  render: () => ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "basics",
    label: "The basics",
    icon: "🎯",
    render: () => (
      <>
        <p>
          Lumo is a memory game. When a round ends you score the cards still in
          your hand — <strong>lowest total wins</strong>, so keep your hand small.
        </p>
        <ul className="help-ref-list">
          <li>
            You're dealt <strong>4 cards</strong> face-down (<strong>5</strong> in
            Lumo Evolved). Peek any <strong>2</strong> at the start — then they
            flip back.
          </li>
          <li>
            On your turn: <strong>draw</strong> the deck top, <strong>take</strong>{" "}
            the discard top, or <strong>call LUMO!</strong>
          </li>
          <li>
            After drawing: <strong>swap</strong> it into a slot (the old card goes
            to the discard) or <strong>discard</strong> it. A card taken from the
            discard pile must be swapped.
          </li>
          <li>
            <strong>Calling LUMO</strong> ends the round — everyone else takes one
            last turn, then all hands are revealed.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "actions",
    label: "Action cards",
    icon: "✨",
    render: () => (
      <>
        <p>
          <strong>Discarding</strong> a drawn action card triggers its power.{" "}
          <em>Swapping it into your hand does not.</em>
        </p>
        <div className="help-ref-cols">
          <div>
            <div className="help-ref-subhead">Classic</div>
            <ul className="help-ref-list">
              <li><strong>7 · 8</strong> — peek one of your own cards</li>
              <li><strong>9 · 10</strong> — spy one opponent card</li>
              <li><strong>J · Q</strong> — blind-swap one of yours with an opponent's</li>
              <li><strong>K</strong> — peek any card, then optionally swap it with yours</li>
            </ul>
          </div>
          <div>
            <div className="help-ref-subhead">Lumo Evolved 🐉</div>
            <ul className="help-ref-list">
              <li><strong>7 · 8</strong> — peek your own OR spy an opponent</li>
              <li><strong>9 · 10</strong> — peek your own AND spy an opponent</li>
              <li><strong>J · Q</strong> — blind swap</li>
              <li><strong>K</strong> — no power (and worth 0)</li>
            </ul>
          </div>
        </div>
      </>
    ),
  },
  {
    id: "snap",
    label: "Snap",
    icon: "⚡",
    render: () => (
      <>
        <p>
          Out of turn, if a card's rank matches the{" "}
          <strong>top of the discard</strong>, you can Snap it.
        </p>
        <ul className="help-ref-list">
          <li>
            <strong>Snap a rival</strong> — tap their card. Correct → it's
            discarded and they draw a fresh one. Wrong → you take a penalty card.
          </li>
          <li>
            <strong>Snap yourself</strong> — tap your own card. Correct → that slot
            empties and your hand shrinks. Wrong → penalty card.
          </li>
          <li>One rival-snap and one self-snap <strong>per round</strong>.</li>
        </ul>
      </>
    ),
  },
  {
    id: "scoring",
    label: "Scoring & total",
    icon: "🧮",
    render: () => (
      <>
        <div className="help-ref-subhead">Card values</div>
        <p className="help-ref-values">
          A = 1 · 2–10 = face · J = 11 · Q = 12 · K = 13 · Joker = 0
          <br />
          <span className="help-ref-muted">Lowest total wins each round.</span>
        </p>
        <div className="help-ref-subhead">What changes your total</div>
        <ul className="help-ref-list help-ref-score">
          <li>
            <span className="help-ref-tag good">−</span>
            <span>
              <strong>Lumo bonus.</strong> Call Lumo, <strong>win</strong> the
              round, <strong>and</strong> finish <strong>≤ 7</strong> → that round
              scores 0 <em>and</em> your hand value is subtracted from your total.{" "}
              <span className="help-ref-muted">All three are required.</span>
            </span>
          </li>
          <li>
            <span className="help-ref-tag bad">+5</span>
            <span>
              <strong>Lumo penalty.</strong> Call Lumo but don't win the round.
            </span>
          </li>
          <li>
            <span className="help-ref-tag good">−10</span>
            <span>
              <strong>Snap bonus.</strong> Land a correct rival-snap{" "}
              <strong>and</strong> a correct self-snap in the same round.
            </span>
          </li>
          <li>
            <span className="help-ref-tag bust">60</span>
            <span>
              <strong>Bust (multiplayer).</strong> A cumulative total over 60
              eliminates you. Last player standing wins.
            </span>
          </li>
        </ul>

        <div className="help-ref-rule" role="separator" />

        <div className="help-ref-subhead evolved">🐉 Lumo Evolved only</div>
        <p className="help-ref-values">
          <span className="help-ref-muted">
            Value changes: K = 0 · Dragon = 20 (if still held at round end).
          </span>
        </p>
        <ul className="help-ref-list help-ref-score">
          <li>
            <span className="help-ref-tag bad">+20</span>
            <span>
              <strong>Kamikaze.</strong> Finish a round with a hand of exactly{" "}
              <strong>0</strong> → every <em>other</em> player takes +20.
            </span>
          </li>
          <li>
            <span className="help-ref-tag good">0</span>
            <span>
              <strong>Carré.</strong> Hold <strong>four of a kind</strong> → those
              four cards count as 0.
            </span>
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "evolved",
    label: "Lumo Evolved",
    icon: "🐉",
    render: () => (
      <>
        <p>A bolder variant — 5 cards each, and the King is a harmless 0.</p>
        <ul className="help-ref-list">
          <li>
            <strong>🐉 Dragon</strong> — drawn from the deck, transform it into any
            rank to use that power. It's never dealt at setup. Still holding it at
            round end? It's worth <strong>20</strong>.
          </li>
          <li>
            <strong>💥 Kamikaze</strong> — finish a round with a hand of exactly{" "}
            <strong>0</strong> → every other player takes <strong>+20</strong>.
          </li>
          <li>
            <strong>🃏 Carré</strong> — hold <strong>four of a kind</strong> →
            those four cards count as 0.
          </li>
        </ul>
      </>
    ),
  },
];

export function HelpReference({ onClose }: Props) {
  const [active, setActive] = useState<SectionId>("basics");
  const section = SECTIONS.find((s) => s.id === active)!;

  return (
    <AnimatePresence>
      <motion.div
        className="overlay help-ref-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="help-ref"
          initial={{ scale: 0.86, y: 24, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 24 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Game reference notepad"
        >
          <button
            className="help-ref-close"
            onClick={onClose}
            aria-label="Close reference"
          >
            ✕
          </button>
          <div className="help-ref-head">
            <span className="help-ref-head-icon" aria-hidden>📒</span>
            <span className="help-ref-head-title">Notepad</span>
            <span className="help-ref-head-sub">Quick reference</span>
          </div>
          <div className="help-ref-body">
            <nav className="help-ref-tabs" aria-label="Reference sections">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  className={`help-ref-tab${s.id === active ? " active" : ""}`}
                  onClick={() => setActive(s.id)}
                  aria-current={s.id === active}
                >
                  <span className="help-ref-tab-icon" aria-hidden>{s.icon}</span>
                  <span className="help-ref-tab-label">{s.label}</span>
                </button>
              ))}
            </nav>
            <motion.div
              key={active}
              className="help-ref-content"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
            >
              <h3 className="help-ref-content-title">
                <span aria-hidden>{section.icon}</span> {section.label}
              </h3>
              {section.render()}
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
