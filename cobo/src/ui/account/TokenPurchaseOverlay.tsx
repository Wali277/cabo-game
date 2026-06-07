import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import confetti from "canvas-confetti";
import { useStore } from "../../state/store";
import { Audio } from "../../audio/sounds";
import { useViewMode } from "../../state/viewmode";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * ACCOUNTS LAYER — token-purchase celebration ("you got N tokens" + Claim)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Self-gates on the store's `tokenGrant` (null → renders nothing), so App.tsx
 * mounts it globally — exactly like {@link XpRewardOverlay}. It's fired by the
 * store's `checkTokenGrant()` when the signed-in balance RISES (e.g. after a
 * Ko-fi purchase), detected by `useTokenGrantWatch`.
 *
 * The tokens are ALREADY in the balance (credited server-side by the webhook),
 * so "Claim" is purely the satisfying acknowledgement — it just dismisses. Like
 * the XP overlay, it also closes on tap-anywhere, the ✕, or Escape.
 *
 * The card "falls" in from above (initial y:-40 → 0) to read as a dropping
 * reward chest/box, with a spinning coin, a gold burst, a shine sweep, and
 * confetti. All flourishes respect `useReducedMotion()` + `body.mobile-mode`.
 */
export function TokenPurchaseOverlay() {
  const grant = useStore((s) => s.tokenGrant);
  const setTokenGrant = useStore((s) => s.setTokenGrant);
  // Defence-in-depth: only signed-in accounts can buy/receive tokens, so a guest
  // must never see this (mirrors XpRewardOverlay's `account` gate).
  const account = useStore((s) => s.account);

  // Keep the last non-null grant through AnimatePresence's exit so the card
  // doesn't blank out as it animates away when `tokenGrant` clears.
  const [shown, setShown] = useState<typeof grant>(grant);
  useEffect(() => {
    if (grant) setShown(grant);
  }, [grant]);

  const open = !!grant && !!account;
  const data = shown;
  const dismiss = () => setTokenGrant(null);

  return (
    <AnimatePresence>
      {open && data && (
        <motion.div
          className="overlay token-grant-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25, ease: "easeIn" } }}
          onClick={dismiss}
          role="dialog"
          aria-modal="true"
          aria-label="Tokens received"
        >
          <TokenGrantCard key={data.amount} amount={data.amount} onDismiss={dismiss} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TokenGrantCard({
  amount,
  onDismiss,
}: {
  amount: number;
  onDismiss: () => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const mobile = useViewMode() === "mobile";
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus for a11y, Escape to close, and a celebratory chime on mount.
  useEffect(() => {
    const raf = requestAnimationFrame(() => panelRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    Audio.playSfx("win");
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [onDismiss]);

  // Gold confetti volleys (skipped under reduced motion; fewer on mobile).
  useEffect(() => {
    if (reduced) return;
    const fire = (delay: number) =>
      setTimeout(() => {
        confetti({
          particleCount: mobile ? 60 : 110,
          spread: 90,
          startVelocity: 40,
          origin: { y: 0.45 },
          colors: ["#f0d89c", "#caa85a", "#ffd86b", "#9c7d3e", "#fff3cf"],
        });
      }, delay);
    const t1 = fire(120);
    const t2 = fire(560);
    const t3 = mobile ? null : fire(1020);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (t3) clearTimeout(t3);
    };
  }, [reduced, mobile]);

  const plural = amount === 1 ? "" : "s";

  return (
    <motion.div
      className="token-grant-card"
      ref={panelRef}
      tabIndex={-1}
      // "Falls" in from above → settles with a spring (the dropping menu box).
      initial={reduced ? { opacity: 0 } : { scale: 0.82, y: -44, opacity: 0 }}
      animate={reduced ? { opacity: 1 } : { scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 240, damping: 18 }}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="token-grant-close" onClick={onDismiss} aria-label="Dismiss">
        ✕
      </button>

      {/* The real a11y surface. */}
      <p className="sr-only" role="status" aria-live="polite">
        You received {amount} Lumo token{plural}. They've been added to your balance.
      </p>

      <span className="token-grant-kicker" aria-hidden="true">
        Purchase complete
      </span>

      <div className="token-grant-coin" aria-hidden="true">
        {!reduced && <span className="token-grant-burst" />}
        <motion.span
          className="token-grant-coin-face"
          initial={reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
          animate={reduced ? { opacity: 1 } : { scale: 1, opacity: 1 }}
          transition={reduced ? { duration: 0.2 } : { type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
        >
          <motion.span
            className="token-grant-coin-spin"
            animate={reduced ? {} : { rotateY: [0, 360, 720] }}
            transition={{ duration: 1.6, ease: "easeOut", delay: 0.2 }}
          >
            🪙
          </motion.span>
          {!reduced && <span className="token-grant-coin-shine" />}
        </motion.span>
      </div>

      <div className="token-grant-amount" aria-hidden="true">
        +{amount.toLocaleString()}
        <span className="token-grant-amount-unit"> token{plural}</span>
      </div>
      <h2 className="token-grant-title" aria-hidden="true">
        You got Lumo Tokens!
      </h2>
      <p className="token-grant-sub" aria-hidden="true">
        Added to your balance — spend them on skins &amp; wallpapers.
      </p>

      <button className="btn primary token-grant-claim" onClick={onDismiss}>
        Claim
      </button>
    </motion.div>
  );
}
