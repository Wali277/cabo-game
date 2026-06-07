import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
} from "framer-motion";
import confetti from "canvas-confetti";
import { useStore, type RewardPayload } from "../../state/store";
import { xpToLevel } from "../../state/progression";
import { Audio } from "../../audio/sounds";
import { useViewMode } from "../../state/viewmode";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * ACCOUNTS LAYER (Phase 4 — XP reward celebration)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The end-of-game reward overlay. Self-gates on the store's `xpReward` (null →
 * renders nothing), so App.tsx mounts it globally. It shows "+{gained} XP" and
 * animates an XP bar FROM the pre-grant fill TO the post-grant fill, matching
 * the `.profile-xp-*` bar visual language (teal→coral gradient, rounded track).
 *
 * The amount is SERVER-AUTHORITATIVE — we render `reward.gained` / the new
 * totals verbatim and only RECOMPUTE the old/new bar geometry locally (via
 * `xpToLevel`) so the fill animates. We never assert an amount.
 *
 * Old vs new geometry:
 *   oldTotal = total_xp - gained   (lifetime XP before this grant)
 *   old      = xpToLevel(oldTotal) (level + into/forNext before — INTERMEDIATE
 *              geometry only, used to start the sweep at the pre-grant fill)
 *   neu      = the server-authoritative FINAL resting state, taken VERBATIM from
 *              the payload's new_level / xp_into_level / xp_for_next (NOT
 *              recomputed via xpToLevel — that would risk drift if the client
 *              bands ever diverge from the SQL). The final bar % + the badge
 *              sub-label both read from these payload numbers.
 *
 * Animation phases (a tiny state machine so it reads clearly and stays ~2-3s):
 *   - No level-up: "fill" — one sweep from old% → new% in the SAME level.
 *   - Level-up:    "fillToTop" (old% → 100% of the old level) → "levelUp"
 *                  (flourish + the badge ticks to new_level, bar snaps to 0) →
 *                  "fill" (0% → new% in the new level). Multi-level jumps skip
 *                  intermediate full sweeps and settle on the final new% so the
 *                  whole thing stays short + honest about the end state.
 *   - Reduced motion: jump straight to the final new% + final level, no sweeps.
 *
 * Dismiss: tap anywhere, the ✕, the Continue button, or the auto-dismiss timer
 * — all call setXpReward(null). z-index sits ABOVE the game-over overlays
 * (Busted z300 / Glory z400) so the reward reads AFTER the result.
 */

// Bar sweep timings (seconds). Tuned so a level-up (fillToTop + hold + fill)
// totals well under ~3s while still reading as a deliberate fill.
const FILL_DUR = 1.0;
const FILL_TO_TOP_DUR = 0.7;
const LEVELUP_HOLD = 0.85;
// Auto-dismiss after the animation has comfortably finished.
const AUTO_DISMISS_MS = 6500;
// Major celebrations (a token milestone, or the Level-2 Custom-skin unlock) run
// the full cinematic, so they hold a little longer before auto-dismissing.
const AUTO_DISMISS_MAJOR_MS = 9000;

const EASE: Transition["ease"] = [0.16, 0.7, 0.32, 1];

/**
 * A "MAJOR" reward level-up — the kind that gets the massive cinematic:
 *   - it granted a TOKEN (the level 10 / 20 / 30 … milestones), OR
 *   - it crossed into LEVEL 2, which unlocks the Custom (Recolor) skin.
 * Every other level-up gets the lighter flourish; a plain XP gain just fills.
 */
function isMajorReward(r: RewardPayload): boolean {
  return r.tokens_earned > 0 || (r.old_level < 2 && r.new_level >= 2);
}

type Phase = "fillToTop" | "levelUp" | "fill" | "done";

function pct(into: number, forNext: number): number {
  if (!(forNext > 0)) return 0;
  return Math.max(0, Math.min(100, (into / forNext) * 100));
}

/**
 * Outer shell: owns the store subscription, the backdrop, dismissal, and the
 * last-non-null `shown` reward so the card can animate AWAY after `xpReward`
 * clears. The actual celebration lives in {@link XpRewardCard}, which is keyed
 * by `total_xp` (unique per grant) so a SECOND reward arriving back-to-back
 * (realistic in MP) fully REMOUNTS the phase machine + geometry from its own
 * old%→new% rather than inheriting the previous reward's state for a frame.
 */
export function XpRewardOverlay() {
  const reward = useStore((s) => s.xpReward);
  const setXpReward = useStore((s) => s.setXpReward);
  // Guests can't earn XP/tokens, so they must never see this cinematic. The
  // grant paths already make this impossible (SP grant returns null without a
  // token; MP only emits xp:reward to linked members), but gating on `account`
  // here is the explicit, defence-in-depth separation: no account → no reward
  // overlay, full stop.
  const account = useStore((s) => s.account);

  // Keep the LAST non-null reward through the AnimatePresence exit so the card
  // doesn't blank out as it animates away when `xpReward` clears.
  const [shown, setShown] = useState<typeof reward>(reward);
  useEffect(() => {
    if (reward) setShown(reward);
  }, [reward]);

  const reduced = useReducedMotion() ?? false;
  const open = !!reward && !!account; // guests never see the reward cinematic
  const data = shown;
  const major = !!data && isMajorReward(data);
  const dismiss = () => setXpReward(null);

  return (
    <AnimatePresence>
      {open && data && (
        <motion.div
          className={`overlay xp-reward-overlay${major ? " major" : ""}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          // Snappy exit (vs Framer's slower default) so the experience clears
          // CLEANLY before the deferred scoreboard/victory overlay underneath
          // animates in — a baton-pass handoff rather than a muddy crossfade.
          exit={{ opacity: 0, transition: { duration: 0.25, ease: "easeIn" } }}
          onClick={dismiss}
          role="dialog"
          aria-modal="true"
          aria-label="Match reward"
        >
          {/* Massive-cinematic backdrop for MAJOR rewards (token milestone /
              Level-2 skin unlock): a full-screen golden bloom + slow light rays
              behind the card. They live at the OVERLAY level because the card
              clips its own content; confetti (its own top canvas) fires from the
              card itself. */}
          {major && !reduced && (
            <div className="xp-reward-screenfx" aria-hidden="true">
              <motion.div
                className="xp-reward-screen-glow"
                initial={{ opacity: 0, scale: 0.55 }}
                animate={{ opacity: [0, 0.9, 0.7], scale: 1 }}
                transition={{ duration: 1.3, ease: EASE }}
              />
              <div className="xp-reward-screen-rays" />
            </div>
          )}
          {/* Keyed by total_xp → a SECOND reward arriving back-to-back changes
              the key, so React unmounts the old card and mounts a fresh one that
              re-runs its phase machine/geom from the new reward's own old%→new%.
              No inner AnimatePresence: we want the new card to appear PROMPTLY
              (its own initial→animate enter still plays on mount), not wait
              behind the previous card's exit. The backdrop's opacity fade above
              covers the whole overlay's dismissal. */}
          <XpRewardCard
            key={data.total_xp}
            reward={data}
            open={open}
            onDismiss={dismiss}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * The celebration card + animated XP bar. Remounted per reward (keyed by the
 * parent), so its phase machine, `geom`, and timers re-arm from scratch for
 * each grant — including the auto-dismiss timer, which should restart when a
 * fresh reward replaces an in-flight one.
 */
function XpRewardCard({
  reward: data,
  open,
  onDismiss,
}: {
  reward: RewardPayload;
  open: boolean;
  onDismiss: () => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const mobile = useViewMode() === "mobile";
  const panelRef = useRef<HTMLDivElement>(null);

  // Reward tier. A token was earned → a milestone (level 10/20/30…); crossing
  // into level 2 → the Custom-skin unlock. Either makes this a MAJOR reward
  // (the big cinematic); both can be true on a huge single grant.
  const isTokenReward = data.tokens_earned > 0;
  const isSkinUnlock = data.old_level < 2 && data.new_level >= 2;
  const isMajor = isTokenReward || isSkinUnlock;

  // Pre/post geometry. The OLD (intermediate) state is recomputed locally from
  // (total_xp - gained) so the sweep can START at the pre-grant fill. The NEW
  // (final resting) state is taken VERBATIM from the server payload —
  // new_level / xp_into_level / xp_for_next — so the bar settles on exactly the
  // server's numbers even if the client bands ever drift from the SQL.
  const geom = useMemo(() => {
    if (!data) return null;
    const oldTotal = Math.max(0, data.total_xp - data.gained);
    const old = xpToLevel(oldTotal);
    const neu = {
      level: data.new_level,
      xpIntoLevel: Math.max(0, data.xp_into_level),
      xpForNext: data.xp_for_next,
    };
    const leveled = data.leveled_up || neu.level > old.level;
    return {
      old,
      neu,
      leveled,
      oldPct: pct(old.xpIntoLevel, old.xpForNext),
      newPct: pct(neu.xpIntoLevel, neu.xpForNext),
    };
  }, [data]);

  // Animation phase machine + the level number shown on the badge (ticks up on
  // the level-up beat). Initialised when a reward first opens.
  const [phase, setPhase] = useState<Phase>("fill");
  const [shownLevel, setShownLevel] = useState<number>(geom?.old.level ?? 1);
  const [barPct, setBarPct] = useState<number>(geom?.oldPct ?? 0);

  // Drive the sequence whenever a NEW reward opens.
  useEffect(() => {
    if (!open || !geom) return;

    setShownLevel(geom.old.level);

    if (reduced) {
      // No sweeps under reduced motion — settle on the final state immediately.
      // Boundary level-up (newPct === 0) rests FULL, mirroring the animated
      // path, so a level-up never ends on a drained bar.
      setBarPct(geom.leveled && geom.newPct === 0 ? 100 : geom.newPct);
      setShownLevel(geom.neu.level);
      setPhase("done");
      Audio.playSfx(geom.leveled ? "win" : "click");
      return;
    }

    if (geom.leveled) {
      setBarPct(geom.oldPct);
      setPhase("fillToTop");
    } else {
      setBarPct(geom.oldPct);
      setPhase("fill");
    }
    // Re-run only when a different reward instance opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data]);

  // Phase transitions for the level-up path (timed handoffs).
  useEffect(() => {
    if (reduced || !geom) return;
    if (phase === "fillToTop") {
      // After the bar reaches 100% of the old level, play the flourish.
      const t = setTimeout(() => {
        Audio.playSfx("win");
        setShownLevel(geom.neu.level);
        setPhase("levelUp");
      }, FILL_TO_TOP_DUR * 1000);
      return () => clearTimeout(t);
    }
    if (phase === "levelUp") {
      // Boundary level-up: the grant landed EXACTLY on a new level (xp_into_level
      // === 0 → newPct === 0). Don't run an empty fill that would drain the bar
      // after the celebration — hold it FULL (100% of the just-completed level)
      // and go straight to `done`. The badge/labels already show the new level
      // and "0 / xpForNext", so a full bar reads correctly.
      if (geom.newPct === 0) {
        const t = setTimeout(() => setPhase("done"), LEVELUP_HOLD * 1000);
        return () => clearTimeout(t);
      }
      // Normal level-up: snap to empty, hold the flourish, then fill the new level.
      setBarPct(0);
      const t = setTimeout(() => setPhase("fill"), LEVELUP_HOLD * 1000);
      return () => clearTimeout(t);
    }
    if (phase === "fill") {
      // Once the final fill sweep lands, mark "done" so the travelling sheen
      // stops (it only renders while phase !== "done") instead of looping for
      // the rest of the overlay's lifetime. The bar holds at its committed %.
      const t = setTimeout(() => setPhase("done"), FILL_DUR * 1000);
      return () => clearTimeout(t);
    }
  }, [phase, reduced, geom]);

  // Commit the target width once a fill phase is active (Framer tweens to it).
  // NOTE: in the boundary-level-up case (newPct === 0) we intentionally leave
  // barPct at 100% from fillToTop and skip straight to `done`, so no width is
  // committed here for `levelUp`/`done` — the bar stays full.
  useEffect(() => {
    if (reduced || !geom) return;
    if (phase === "fillToTop") setBarPct(100);
    else if (phase === "fill") setBarPct(geom.newPct);
  }, [phase, reduced, geom]);

  // Auto-dismiss + a11y focus + Escape to close. Re-arms per reward because the
  // card remounts on a new grant — a fresh reward restarts its own timer.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => panelRef.current?.focus());
    const timer = setTimeout(onDismiss, isMajor ? AUTO_DISMISS_MAJOR_MS : AUTO_DISMISS_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onDismiss, isMajor]);

  // Major-reward confetti volleys (token milestone / Level-2 skin unlock).
  // canvas-confetti paints its own full-screen top-layer canvas — the
  // screen-filling half of the "massive" cinematic. Fewer particles on mobile.
  useEffect(() => {
    if (!open || !isMajor || reduced) return;
    const fire = (delay: number) =>
      setTimeout(() => {
        confetti({
          particleCount: mobile ? 70 : 120,
          spread: 95,
          startVelocity: 42,
          origin: { y: 0.5 },
          colors: ["#ffd86b", "#ffcf33", "#a87bff", "#67e0a3", "#ff7a59", "#7aa8ff"],
        });
      }, delay);
    const t1 = fire(150);
    const t2 = fire(650);
    const t3 = mobile ? null : fire(1150);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (t3) clearTimeout(t3);
    };
  }, [open, isMajor, reduced, mobile]);

  if (!geom) return null;

  const dismiss = onDismiss;
  const showLevelFlash = !reduced && phase === "levelUp";
  const finalLeveled = geom.leveled;

  // Width transition: slower deliberate sweep on fillToTop/fill; the snap-to-0
  // at the start of a new level is instant (handled by setBarPct(0) with a 0s
  // tween here so it doesn't animate backwards).
  const barTransition: Transition =
    phase === "levelUp"
      ? { duration: 0 }
      : phase === "fillToTop"
      ? { duration: FILL_TO_TOP_DUR, ease: EASE }
      : { duration: FILL_DUR, ease: EASE };

  return (
    <motion.div
      className={`xp-reward-card${isMajor ? " major" : ""}`}
      ref={panelRef}
      tabIndex={-1}
      initial={{ scale: 0.82, y: 28, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
      onClick={(e) => e.stopPropagation()}
    >
            <button
              className="xp-reward-close"
              onClick={dismiss}
              aria-label="Dismiss reward"
            >
              ✕
            </button>

            {/* Live region announces the gain for screen readers. */}
            <p className="sr-only" role="status" aria-live="polite">
              You earned {data.gained} XP
              {finalLeveled
                ? `, and reached level ${geom.neu.level}`
                : ""}
              {data.tokens_earned > 0
                ? `, plus ${data.tokens_earned} token${
                    data.tokens_earned === 1 ? "" : "s"
                  }`
                : ""}
              {isSkinUnlock ? ", and unlocked the Custom card skin" : ""}
              .
            </p>

            <span className="xp-reward-kicker" aria-hidden="true">
              Match reward
            </span>

            <motion.div
              className="xp-reward-gain"
              aria-hidden="true"
              initial={{ scale: 0.5, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.15 }}
            >
              +{data.gained.toLocaleString()} XP
            </motion.div>

            {/* Level badge + label. The badge "pops" on the level-up beat. */}
            <div className="xp-reward-levelrow" aria-hidden="true">
              <motion.div
                className="xp-reward-badge"
                animate={
                  showLevelFlash
                    ? { scale: [1, 1.28, 1], rotate: [0, -4, 0] }
                    : { scale: 1, rotate: 0 }
                }
                transition={{ duration: 0.5, ease: EASE }}
              >
                <span className="xp-reward-badge-num">{shownLevel}</span>
                <span className="xp-reward-badge-label">LVL</span>
              </motion.div>
              <div className="xp-reward-levelmeta">
                <span className="xp-reward-levelname">Level {shownLevel}</span>
                <span className="xp-reward-levelsub">
                  {geom.neu.xpIntoLevel.toLocaleString()} /{" "}
                  {geom.neu.xpForNext.toLocaleString()} XP
                </span>
              </div>
            </div>

            {/* The animated bar — matches .profile-xp-track / -fill. Decorative:
                the aria-live status line above is the real a11y surface, so we
                deliberately DON'T expose role="progressbar" here. A static
                aria-valuenow would contradict the bar visibly sweeping. */}
            <div className="xp-reward-track" aria-hidden="true">
              <motion.div
                className="xp-reward-fill"
                initial={false}
                animate={{ width: `${barPct}%` }}
                transition={barTransition}
              />
              {/* Moving sheen rides the fill while it sweeps. */}
              {!reduced && phase !== "done" && (
                <motion.span
                  className="xp-reward-sheen"
                  aria-hidden="true"
                  initial={{ x: "-120%" }}
                  animate={{ x: "120%" }}
                  transition={{ duration: 1.1, ease: "linear", repeat: Infinity }}
                />
              )}
            </div>

            {/* Level-up flourish wordmark. */}
            <AnimatePresence>
              {showLevelFlash && (
                <motion.div
                  className="xp-reward-levelup"
                  aria-hidden="true"
                  initial={{ scale: 0.4, opacity: 0, y: 8 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 1.1, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 14 }}
                >
                  Level Up!
                </motion.div>
              )}
            </AnimatePresence>

            {/* MAJOR reward reveal — the star of the cinematic. A token milestone
                gets a spinning coin + amount; the Level-2 crossing announces the
                Custom skin. Both can appear together on a huge single grant. */}
            {isMajor && (
              <motion.div
                className="xp-reward-bigreward"
                aria-hidden="true"
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 14 }}
                animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                transition={
                  reduced
                    ? { duration: 0.2 }
                    : { delay: finalLeveled ? 1.5 : 0.5, type: "spring", stiffness: 240, damping: 18 }
                }
              >
                {isTokenReward && (
                  <div className="xp-reward-reward-row">
                    <motion.span
                      className="xp-reward-reward-icon coin"
                      animate={reduced ? {} : { rotateY: [0, 360, 720] }}
                      transition={{ duration: 1.5, ease: "easeOut", delay: finalLeveled ? 1.6 : 0.6 }}
                    >
                      🪙
                    </motion.span>
                    <div className="xp-reward-reward-text">
                      <span className="xp-reward-reward-amount">
                        +{data.tokens_earned} token{data.tokens_earned === 1 ? "" : "s"}
                      </span>
                      <span className="xp-reward-reward-sub">
                        Level {data.new_level} milestone reward!
                      </span>
                    </div>
                  </div>
                )}
                {isSkinUnlock && (
                  <div className="xp-reward-reward-row">
                    <motion.span
                      className="xp-reward-reward-icon skin"
                      animate={reduced ? {} : { rotate: [0, -12, 12, -6, 0], scale: [1, 1.18, 1] }}
                      transition={{ duration: 1.1, ease: "easeOut", delay: finalLeveled ? 1.7 : 0.7 }}
                    >
                      🎨
                    </motion.span>
                    <div className="xp-reward-reward-text">
                      <span className="xp-reward-reward-amount">Custom skin unlocked!</span>
                      <span className="xp-reward-reward-sub">
                        Recolour your cards in the Styles store.
                      </span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            <button className="btn primary xp-reward-continue" onClick={dismiss}>
              Continue
            </button>
    </motion.div>
  );
}
