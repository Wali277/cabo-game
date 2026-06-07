import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../../state/store";
import type { Profile } from "../../state/auth";
import {
  changePassword,
  confirmEmailChange,
  deleteAccount,
  getCurrentEmail,
  redeemCode,
  requestEmailChange,
} from "../../state/auth";
import {
  xpToLevel,
  levelsUntilNextToken,
} from "../../state/progression";
import { Audio } from "../../audio/sounds";
import { CodeInput } from "../auth/CodeInput";
import { validateEmail, validatePassword } from "../auth/authValidation";
import { PasswordInput } from "../PasswordInput";
import { StylesStore } from "./StylesStore";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * ACCOUNTS LAYER (Phase 3 — profile menu shell)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The large profile modal (Account · Styles · Settings). Structure + motion
 * mirror `HelpReference.tsx` (overlay, spring-in card, ✕ close, left tab nav,
 * animated tab content, click-outside + Escape to close, role="dialog").
 *
 * Controlled by the store's `profilePanelOpen`. Self-gates: renders nothing
 * unless the panel is open AND an account is present, so App.tsx can mount it
 * globally without screen guards.
 *
 *   - Account  (FULL)  — username + level, a large XP bar with the raw
 *                        {into}/{forNext} label, the token count, and a marker
 *                        line about the next token / the level-10 unlock.
 *   - Styles   (FULL)  — the Phase 6 token store: buy + equip card skins and
 *                        table wallpapers (see `StylesStore.tsx`).
 *   - Settings (FULL)  — "Log out" plus the Phase 7 account-management forms:
 *                        change password, change email (multi-step code flow),
 *                        and a gated delete-account danger zone.
 *
 * Display-only progress math comes from `progression.ts` (mirrors the
 * server-authoritative SQL). Nothing here writes XP/tokens.
 */

type TabId = "account" | "styles" | "settings";

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: "account", label: "Account", icon: "🏅" },
  { id: "styles", label: "Styles", icon: "🎨" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

export function ProfilePanel() {
  const open = useStore((s) => s.profilePanelOpen);
  const account = useStore((s) => s.account);
  const setProfilePanelOpen = useStore((s) => s.setProfilePanelOpen);
  const logoutAccount = useStore((s) => s.logoutAccount);
  const [active, setActive] = useState<TabId>("account");
  const panelRef = useRef<HTMLDivElement>(null);
  // The element focused before the modal opened. Focus is restored to it AFTER
  // the exit animation finishes (AnimatePresence onExitComplete), not the instant
  // `open` flips false — otherwise focus jumps to the background mid-fade.
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion() ?? false;

  // ── Smooth, distortion-free tab-switch HEIGHT animation ────────────────────
  // We animate the numeric height of a "viewport" wrapper between each tab's
  // natural height. Numeric height reflows the box (no transform/scale), so the
  // card grid + forms inside stay crisp. NB: no Framer `layout` prop — that was
  // the reverted, scale-distorting approach.
  const vpRef = useRef<HTMLDivElement>(null);          // the height-animated viewport
  const measureRef = useRef<HTMLDivElement>(null);     // wraps content at natural height
  const [contentH, setContentH] = useState<number | null>(null); // null until first measured
  const [vpScroll, setVpScroll] = useState(false);     // overflow-y:auto only once settled+tall
  const [animateHeight, setAnimateHeight] = useState(false); // suppress the first (open) height set
  const measuredOnceRef = useRef(false);               // first measurement = open (no height anim)
  const pendingScrollRef = useRef(false);
  const lastTargetRef = useRef<number | null>(null);   // last target height (sub-px churn guard)

  const close = () => setProfilePanelOpen(false);

  // Modal a11y (review H1): while open we (1) move focus into the panel, (2)
  // trap Tab inside it, (3) close on Escape, and (4) restore focus to whatever
  // was focused before (the account tab / token counter) on close. Only wired
  // while open + visible so it never swallows keys elsewhere.
  useEffect(() => {
    if (!open || !account) return;
    prevFocusRef.current = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] => {
      const panel = panelRef.current;
      if (!panel) return [];
      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
    };

    // Focus the first control (the ✕ close button) once the panel has mounted.
    const raf = requestAnimationFrame(() => {
      const f = focusables();
      (f[0] ?? panelRef.current)?.focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setProfilePanelOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (f.length === 0) {
        e.preventDefault();
        return;
      }
      const first = f[0];
      const last = f[f.length - 1];
      const el = document.activeElement as HTMLElement | null;
      const inside = !!panelRef.current?.contains(el);
      if (e.shiftKey && (el === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (el === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      // NB: focus restoration is deferred to the panel's exit (onExitComplete),
      // so it doesn't jump to the background while the modal is still fading out.
    };
  }, [open, account, setProfilePanelOpen]);

  // The panel renders INSIDE a persistent AnimatePresence (the component is
  // always mounted by App.tsx), so both the open AND the close animate. A
  // null/short-circuit here would unmount AnimatePresence and kill the exit.
  const profile = account?.profile ?? null;

  // Open/close animation mirrors HelpReference.tsx EXACTLY (the help "?" modal):
  // the same spring-in scale + the same keyed content fade, so the two modals
  // feel identical. Reduced-motion collapses to a plain opacity fade.
  const panelInitial = reduced ? { opacity: 0 } : { scale: 0.86, y: 24, opacity: 0 };
  const panelAnimate = reduced ? { opacity: 1 } : { scale: 1, y: 0, opacity: 1 };
  const panelExit = reduced ? { opacity: 0 } : { scale: 0.9, opacity: 0 };
  const panelTransition = reduced
    ? { duration: 0.15 }
    : { type: "spring" as const, stiffness: 240, damping: 24 };
  const contentInitial = reduced ? { opacity: 0 } : { opacity: 0, x: 8 };
  const contentAnimate = reduced ? { opacity: 1 } : { opacity: 1, x: 0 };
  const contentTransition = { duration: reduced ? 0.12 : 0.2 };

  // Measure the content's natural height (clamped to the viewport cap) and drive
  // the height tween toward it. Reads refs at CALL time (inside the layout effect
  // / ResizeObserver), so it never reads refs during render. Called on tab switch
  // AND whenever the content actually grows/shrinks within a tab (see the
  // ResizeObserver below: danger zone expand, email steps, inline errors, resize).
  const remeasure = useCallback(() => {
    const m = measureRef.current;
    const vp = vpRef.current;
    if (!m || !vp) return;
    const natural = m.scrollHeight;                       // full content height (unclipped)
    const capRaw = parseFloat(getComputedStyle(vp).maxHeight); // resolves the CSS calc() to px
    const cap = Number.isFinite(capRaw) ? capRaw : Infinity;
    const target = Math.min(natural, cap);
    // Guard against sub-pixel / scrollbar-reflow churn that could oscillate the
    // observer ⇄ setState loop. Ignore deltas under 1px (no real content change).
    if (lastTargetRef.current !== null && Math.abs(target - lastTargetRef.current) < 1) return;
    lastTargetRef.current = target;
    // The FIRST measurement is the open: snap to height (no anim). Every later
    // run (tab switch or intra-tab growth) enables the height tween. The refs are
    // only touched here (at call time), never read during render.
    if (measuredOnceRef.current) setAnimateHeight(true);
    else measuredOnceRef.current = true;
    setContentH(target);
    setVpScroll(false);                                  // hide overflow DURING the animation
    pendingScrollRef.current = natural > target + 0.5;   // will enable scroll after it settles
  }, []);

  // Re-measure on tab switch + buy/equip profile changes, pre-paint (no flicker).
  useLayoutEffect(() => {
    remeasure();
  }, [active, profile, remeasure]);

  // Re-measure on ANY intra-tab content-height change (danger zone expand, email
  // multi-step flow, inline error/notice text, window resize). `measureRef` wraps
  // the NATURAL-height content — it does NOT change size while the vp's height
  // tweens (the vp clips it), so the observer fires on real content changes only,
  // not on the height animation itself (no observer storm during the tween).
  useEffect(() => {
    if (!open) return;
    const m = measureRef.current;
    if (!m || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => remeasure());
    ro.observe(m);
    return () => ro.disconnect();
  }, [open, remeasure]);

  return (
    <AnimatePresence onExitComplete={() => prevFocusRef.current?.focus?.()}>
      {open && profile && (
        <motion.div
          className="overlay profile-overlay"
          key="profile-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            className="profile-panel"
            ref={panelRef}
            tabIndex={-1}
            initial={panelInitial}
            animate={panelAnimate}
            exit={panelExit}
            transition={panelTransition}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Your profile"
          >
            <button
              className="profile-close"
              onClick={close}
              aria-label="Close profile"
            >
              ✕
            </button>
            <div className="profile-head">
              <span className="profile-head-avatar" aria-hidden="true">
                👤
              </span>
              <span className="profile-head-text">
                <span className="profile-head-name" title={profile.username}>
                  {profile.username}
                </span>
                <span className="profile-head-sub">Your profile</span>
              </span>
            </div>
            <div className="profile-body">
              <nav className="profile-tabs" aria-label="Profile sections">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    className={`profile-tab${t.id === active ? " active" : ""}`}
                    onClick={() => {
                      Audio.playSfx("click");
                      setActive(t.id);
                    }}
                    aria-current={t.id === active}
                  >
                    <span className="profile-tab-icon" aria-hidden="true">
                      {t.icon}
                    </span>
                    <span className="profile-tab-label">{t.label}</span>
                  </button>
                ))}
              </nav>
              {/* Height-animated viewport. The measured wrapper sizes to the
                  current tab's natural height; this viewport tweens its numeric
                  height between tabs (a reflow, NOT a scale transform, so content
                  stays crisp). The keyed pane inside still fades on tab change
                  (same approach as HelpReference's content). */}
              <motion.div
                ref={vpRef}
                className="profile-content-vp"
                style={{
                  height: contentH == null ? "auto" : undefined, // first render only; then animate owns it
                  overflowY: vpScroll ? "auto" : "hidden",
                }}
                initial={false}
                animate={contentH == null ? undefined : { height: contentH }}
                transition={
                  animateHeight && !reduced
                    ? { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
                    : { duration: 0 }
                }
                onAnimationComplete={() => setVpScroll(pendingScrollRef.current)}
              >
                <div ref={measureRef} className="profile-content-measure">
                  <motion.div
                    key={active}
                    className="profile-content"
                    initial={contentInitial}
                    animate={contentAnimate}
                    transition={contentTransition}
                  >
                    {active === "account" && <AccountTab profile={profile} />}
                    {active === "styles" && <StylesTab />}
                    {active === "settings" && (
                      <SettingsTab
                        profile={profile}
                        onLogout={() => {
                          Audio.playSfx("click");
                          void logoutAccount();
                          setProfilePanelOpen(false);
                        }}
                      />
                    )}
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Account tab (the core deliverable) ───────────────────────────────────────
function AccountTab({ profile }: { profile: Profile }) {
  const { level, xpIntoLevel, xpForNext } = xpToLevel(profile.total_xp);
  const pct = xpForNext > 0 ? Math.min(100, (xpIntoLevel / xpForNext) * 100) : 0;

  // Token marker copy. Below level 10 the spend mechanic isn't unlocked yet, so
  // we frame it as "tokens unlock at level 10"; from 10 on we count down to the
  // next milestone.
  const tokenMarker =
    level < 10
      ? `Tokens unlock at level 10 — ${10 - level} ${
          10 - level === 1 ? "level" : "levels"
        } to go`
      : `${levelsUntilNextToken(level)} ${
          levelsUntilNextToken(level) === 1 ? "level" : "levels"
        } until your next token`;

  return (
    <div className="profile-account">
      <div className="profile-account-top">
        <div className="profile-level-badge" aria-hidden="true">
          <span className="profile-level-badge-num">{level}</span>
          <span className="profile-level-badge-label">LVL</span>
        </div>
        <div className="profile-account-id">
          <span className="profile-account-name" title={profile.username}>
            {profile.username}
          </span>
          <span className="profile-account-level">Level {level}</span>
        </div>
      </div>

      <div className="profile-xp-block">
        <div className="profile-xp-row">
          <span className="profile-xp-caption">XP progress</span>
          <span className="profile-xp-value">
            {xpIntoLevel.toLocaleString()} / {xpForNext.toLocaleString()} XP
          </span>
        </div>
        <div
          className="profile-xp-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={xpForNext}
          aria-valuenow={xpIntoLevel}
          aria-label="XP progress to next level"
        >
          <motion.div
            className="profile-xp-fill"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 22 }}
          />
        </div>
      </div>

      <div className="profile-stats">
        <div className="profile-stat">
          <span className="profile-stat-icon" aria-hidden="true">
            🪙
          </span>
          <span className="profile-stat-value">{profile.tokens}</span>
          <span className="profile-stat-label">
            {profile.tokens === 1 ? "token" : "tokens"}
          </span>
        </div>
      </div>

      <p className="profile-token-marker">{tokenMarker}</p>
    </div>
  );
}

// ── Styles tab (Phase 6 — the token store) ───────────────────────────────────
function StylesTab() {
  return <StylesStore />;
}

// ── Settings tab (Phase 7 — change password / email / delete) ─────────────────
// Three working sections plus the existing Log out button. Each section owns its
// own in-flight + error state; all writes go through the server-authoritative
// auth helpers (the client only sends what the contract specifies).
function SettingsTab({
  profile,
  onLogout,
}: {
  profile: Profile;
  onLogout: () => void;
}) {
  return (
    <div className="profile-settings">
      <button className="btn primary profile-logout-btn" onClick={onLogout}>
        Log out
      </button>

      <RedeemCodeSection />
      <ChangePasswordSection />
      <ChangeEmailSection />
      <DeleteAccountSection profile={profile} />
    </div>
  );
}

// ── Redeem a code ───────────────────────────────────────────────────────────
// Enter a code → server validates against its catalog + credits the reward
// (currently tokens), once per account. Server-authoritative: the client only
// sends the string; the returned profile is folded into the store so the token
// balance (Account tab + the store header) updates live.
function RedeemCodeSection() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || code.trim().length === 0) return;
    setBusy(true);
    setErr(null);
    setDone(null);
    Audio.playSfx("click");
    const res = await redeemCode(code.trim());
    setBusy(false);

    // The DEV-BOOST dev code flips on developer mode (re-enables the in-game
    // Theme/skin override FAB for quick testing). Server stays authoritative on
    // the actual reward — and on whether the code works at all (it's gated to
    // non-prod), so in production neither branch below fires. We also flip it on
    // "already_redeemed" so a fresh browser still re-enters dev mode.
    if (
      code.trim().toUpperCase() === "DEV-BOOST" &&
      (res.ok || res.code === "already_redeemed")
    ) {
      useStore.getState().setDevMode(true);
    }

    if (res.ok) {
      Audio.playSfx("win");
      const n = res.reward?.tokens ?? 0;
      const xp = res.reward?.xp ?? 0;
      const parts: string[] = [];
      if (n > 0) parts.push(`+${n} ${n === 1 ? "token" : "tokens"} 🪙`);
      if (xp > 0) parts.push(`+${xp.toLocaleString()} XP ✨`);
      setDone(parts.length ? `Redeemed! ${parts.join("  ")}` : "Redeemed! 🎉");
      setCode("");
      return;
    }
    if (res.code === "already_redeemed") {
      setErr("You've already redeemed this code.");
      return;
    }
    if (res.code === "invalid") {
      setErr("That code isn't valid.");
      return;
    }
    if (res.code === "rate_limited") {
      setErr("Too many tries — please wait a bit and try again.");
      return;
    }
    setErr(res.error ?? "Couldn't redeem that code. Try again.");
  }

  return (
    <SettingsSection icon="🎁" title="Redeem a code">
      <form className="settings-form" onSubmit={submit}>
        <SettingsField label="Code" htmlFor="settings-redeem-code" error={err}>
          <input
            id="settings-redeem-code"
            className="input"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={code}
            disabled={busy}
            onChange={(e) => {
              setCode(e.target.value);
              if (err) setErr(null);
              if (done) setDone(null);
            }}
            placeholder="Enter a code"
            aria-invalid={!!err}
            aria-describedby={err ? "settings-redeem-code-err" : undefined}
          />
        </SettingsField>

        {done && (
          <div className="auth-notice" role="alert">
            {done}
          </div>
        )}

        <button
          className="btn primary settings-submit"
          type="submit"
          disabled={busy || code.trim().length === 0}
        >
          {busy ? (
            <span className="settings-busy">
              <SettingsSpinner />
              Redeeming…
            </span>
          ) : (
            "Redeem"
          )}
        </button>
      </form>
    </SettingsSection>
  );
}

/** Tiny in-flight spinner. Mirrors StylesStore's `Spinner`: framer drives the
 *  rotation so reduced-motion just shows a static ring (no CSS keyframes). */
function SettingsSpinner() {
  const reduced = useReducedMotion() ?? false;
  return (
    <motion.span
      className="store-spinner"
      aria-hidden="true"
      animate={reduced ? {} : { rotate: 360 }}
      transition={
        reduced ? {} : { repeat: Infinity, ease: "linear", duration: 0.7 }
      }
    />
  );
}

/** A titled settings section card (icon + heading + the form/content inside). */
function SettingsSection({
  icon,
  title,
  danger,
  children,
}: {
  icon: string;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`settings-section${danger ? " danger" : ""}`}>
      <h3 className="settings-section-title">
        <span className="settings-section-icon" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Labelled field for the settings forms (mirrors auth's `Field`, scoped to the
 *  settings section styling). `error` renders an inline `role="alert"`. */
function SettingsField({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-field">
      <label className="menu-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error && (
        <div className="auth-field-error" id={`${htmlFor}-err`} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

// ── Change password ───────────────────────────────────────────────────────────
// STRICT: requires the current password. The new password is validated with the
// shared `validatePassword` before submit; the server re-validates + re-checks
// the current password and is authoritative.
function ChangePasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentErr, setCurrentErr] = useState<string | null>(null);
  const [nextErr, setNextErr] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setCurrentErr(null);
    setNextErr(null);
    setFormErr(null);
    setDone(false);

    if (!current) {
      setCurrentErr("Enter your current password.");
      return;
    }
    const vErr = validatePassword(next);
    if (vErr) {
      setNextErr(vErr);
      return;
    }
    if (next === current) {
      setNextErr("Choose a password different from your current one.");
      return;
    }

    setBusy(true);
    Audio.playSfx("click");
    const res = await changePassword(current, next);
    setBusy(false);

    if (res.ok) {
      Audio.playSfx("action_trigger");
      setCurrent("");
      setNext("");
      setDone(true);
      return;
    }
    if (res.code === "wrong_password") {
      setCurrentErr("Your current password is incorrect.");
      return;
    }
    if (res.field === "newPassword") {
      setNextErr(res.error ?? "That password isn't allowed.");
      return;
    }
    setFormErr(res.error ?? "Couldn't change your password. Try again.");
  }

  return (
    <SettingsSection icon="🔑" title="Change password">
      <form className="settings-form" onSubmit={submit}>
        <SettingsField
          label="Current password"
          htmlFor="settings-current-pw"
          error={currentErr}
        >
          <PasswordInput
            id="settings-current-pw"
            className="input"
            autoComplete="current-password"
            value={current}
            disabled={busy}
            onChange={(e) => {
              setCurrent(e.target.value);
              if (currentErr) setCurrentErr(null);
              if (done) setDone(false);
            }}
            placeholder="••••••••"
            aria-invalid={!!currentErr}
            aria-describedby={currentErr ? "settings-current-pw-err" : undefined}
          />
        </SettingsField>

        <SettingsField
          label="New password"
          htmlFor="settings-new-pw"
          error={nextErr}
        >
          <PasswordInput
            id="settings-new-pw"
            className="input"
            autoComplete="new-password"
            value={next}
            disabled={busy}
            onChange={(e) => {
              setNext(e.target.value);
              if (nextErr) setNextErr(null);
              if (done) setDone(false);
            }}
            placeholder="At least 8 characters"
            aria-invalid={!!nextErr}
            aria-describedby={nextErr ? "settings-new-pw-err" : undefined}
          />
        </SettingsField>

        {formErr && (
          <div className="error" role="alert">
            {formErr}
          </div>
        )}
        {done && (
          <div className="auth-notice" role="alert">
            Password updated.
          </div>
        )}

        <button
          className="btn primary settings-submit"
          type="submit"
          disabled={busy || !current || !next}
        >
          {busy ? (
            <span className="settings-busy">
              <SettingsSpinner />
              Updating…
            </span>
          ) : (
            "Update password"
          )}
        </button>
      </form>
    </SettingsSection>
  );
}

// ── Change email ──────────────────────────────────────────────────────────────
// Multi-step: (1) show current email + enter the new address → requestEmailChange,
// (2) enter the 6-digit code mailed to the new address → confirmEmailChange. The
// account email isn't changed until step 2 succeeds. Allows cancel + re-request.
type EmailStep = "view" | "request" | "confirm";

function ChangeEmailSection() {
  const [step, setStep] = useState<EmailStep>("view");
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  // The pending new address (held between the request + confirm steps for the
  // display + the resend).
  const [newEmail, setNewEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const submittingRef = useRef(false);

  // Load the current account email (from the Supabase session, not the profile).
  useEffect(() => {
    let alive = true;
    void getCurrentEmail().then((e) => {
      if (alive) setCurrentEmail(e);
    });
    return () => {
      alive = false;
    };
  }, []);

  function resetToView() {
    setStep("view");
    setNewEmail("");
    setPendingEmail("");
    setCode("");
    setFieldErr(null);
    setFormErr(null);
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFieldErr(null);
    setFormErr(null);
    setDone(false);

    const trimmed = newEmail.trim();
    const vErr = validateEmail(trimmed);
    if (vErr) {
      setFieldErr(vErr);
      return;
    }
    if (currentEmail && trimmed.toLowerCase() === currentEmail.toLowerCase()) {
      setFieldErr("That's already your email.");
      return;
    }

    setBusy(true);
    Audio.playSfx("click");
    const res = await requestEmailChange(trimmed);
    setBusy(false);

    if (res.ok) {
      Audio.playSfx("action_trigger");
      setPendingEmail(trimmed);
      setCode("");
      setStep("confirm");
      return;
    }
    if (res.code === "taken") {
      setFieldErr("That email is already in use.");
      return;
    }
    if (res.code === "invalid") {
      setFieldErr("Enter a valid email address.");
      return;
    }
    if (res.code === "rate_limited") {
      setFormErr("Too many requests — please wait a bit and try again.");
      return;
    }
    setFormErr(res.error ?? "Couldn't start the email change. Try again.");
  }

  async function confirm(value: string) {
    if (submittingRef.current) return;
    if (value.length !== 6) {
      setFormErr("Enter the 6-digit code.");
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    setFormErr(null);
    Audio.playSfx("click");
    const res = await confirmEmailChange(value);
    submittingRef.current = false;
    setBusy(false);

    if (res.ok) {
      Audio.playSfx("win");
      // Re-render from the source of truth: the email the server confirmed (the
      // profile was already folded into the store by confirmEmailChange).
      setCurrentEmail(res.email ?? pendingEmail);
      setDone(true);
      resetToView();
      return;
    }
    if (res.code === "taken") {
      setFormErr("That email is already in use.");
      setStep("request");
      return;
    }
    if (res.code === "invalid_code") {
      const left =
        typeof res.attemptsLeft === "number"
          ? ` ${res.attemptsLeft} attempt${res.attemptsLeft === 1 ? "" : "s"} left.`
          : "";
      setFormErr("That code is invalid or expired." + left);
      setCode("");
      return;
    }
    setFormErr(res.error ?? "Couldn't confirm the code. Try again.");
    setCode("");
  }

  return (
    <SettingsSection icon="✉️" title="Email">
      <p className="settings-current-email">
        Current email:{" "}
        <strong>{currentEmail ?? "—"}</strong>
      </p>
      {done && step === "view" && (
        <div className="auth-notice" role="alert">
          Email updated.
        </div>
      )}

      {step === "view" && (
        <button
          type="button"
          className="btn settings-submit"
          onClick={() => {
            Audio.playSfx("click");
            setDone(false);
            setStep("request");
          }}
        >
          Change email
        </button>
      )}

      {step === "request" && (
        <form className="settings-form" onSubmit={requestCode}>
          <SettingsField
            label="New email"
            htmlFor="settings-new-email"
            error={fieldErr}
          >
            <input
              id="settings-new-email"
              className="input"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={newEmail}
              disabled={busy}
              onChange={(e) => {
                setNewEmail(e.target.value);
                if (fieldErr) setFieldErr(null);
              }}
              placeholder="you@example.com"
              aria-invalid={!!fieldErr}
              aria-describedby={fieldErr ? "settings-new-email-err" : undefined}
            />
          </SettingsField>

          {formErr && (
            <div className="error" role="alert">
              {formErr}
            </div>
          )}

          <div className="settings-actions">
            <button
              className="btn primary settings-submit"
              type="submit"
              disabled={busy || newEmail.trim().length === 0}
            >
              {busy ? (
                <span className="settings-busy">
                  <SettingsSpinner />
                  Sending…
                </span>
              ) : (
                "Send code"
              )}
            </button>
            <button
              type="button"
              className="auth-link"
              disabled={busy}
              onClick={() => {
                Audio.playSfx("click");
                resetToView();
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {step === "confirm" && (
        <div className="settings-form">
          <p className="auth-muted settings-confirm-intro">
            We sent a 6-digit code to <strong>{pendingEmail}</strong>. Enter it
            to confirm the change.
          </p>
          <CodeInput
            value={code}
            onChange={(v) => {
              setCode(v);
              if (formErr) setFormErr(null);
            }}
            onComplete={confirm}
            disabled={busy}
            autoFocus
            ariaLabel="Email change confirmation code"
          />

          {formErr && (
            <div className="error" role="alert">
              {formErr}
            </div>
          )}

          <div className="settings-actions">
            <button
              className="btn primary settings-submit"
              type="button"
              disabled={busy || code.length !== 6}
              onClick={() => void confirm(code)}
            >
              {busy ? (
                <span className="settings-busy">
                  <SettingsSpinner />
                  Confirming…
                </span>
              ) : (
                "Confirm email"
              )}
            </button>
            <button
              type="button"
              className="auth-link"
              disabled={busy}
              onClick={() => {
                Audio.playSfx("click");
                setCode("");
                setFormErr(null);
                setStep("request");
              }}
            >
              Use a different email
            </button>
            <button
              type="button"
              className="auth-link"
              disabled={busy}
              onClick={() => {
                Audio.playSfx("click");
                resetToView();
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}

// ── Delete account (DANGER) ────────────────────────────────────────────────────
// Gated hard: the confirm button stays disabled until the typed username EXACTLY
// matches the profile's AND a password is entered. A final confirm sends the
// password; on success we log out + route to the menu + close the panel.
function DeleteAccountSection({ profile }: { profile: Profile }) {
  const logoutAccount = useStore((s) => s.logoutAccount);
  const setScreen = useStore((s) => s.setScreen);
  const setProfilePanelOpen = useStore((s) => s.setProfilePanelOpen);

  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const usernameMatches = username === profile.username;
  const canDelete = usernameMatches && password.length > 0 && !busy;

  function reset() {
    setOpen(false);
    setUsername("");
    setPassword("");
    setErr(null);
  }

  async function doDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!canDelete) return;
    setBusy(true);
    setErr(null);
    Audio.playSfx("click");
    const res = await deleteAccount(password);

    if (res.ok) {
      // Tear down the local session, leave the (now-orphaned) panel, return to
      // the menu. No setBusy(false) — the component unmounts on logout.
      await logoutAccount();
      setScreen("menu");
      setProfilePanelOpen(false);
      return;
    }
    setBusy(false);
    if (res.code === "wrong_password") {
      setErr("Your password is incorrect.");
      return;
    }
    setErr(res.error ?? "Couldn't delete your account. Try again.");
  }

  return (
    <SettingsSection icon="🗑️" title="Delete account" danger>
      <p className="settings-danger-copy">
        This permanently deletes your account, XP, tokens, and cosmetics. This
        can't be undone.
      </p>

      {!open ? (
        <button
          type="button"
          className="btn settings-danger-trigger"
          onClick={() => {
            Audio.playSfx("click");
            setOpen(true);
          }}
        >
          Delete my account
        </button>
      ) : (
        <form className="settings-form" onSubmit={doDelete}>
          <SettingsField
            label={`Type your username (${profile.username}) to confirm`}
            htmlFor="settings-delete-username"
          >
            <input
              id="settings-delete-username"
              className="input"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              disabled={busy}
              onChange={(e) => {
                setUsername(e.target.value);
                if (err) setErr(null);
              }}
              placeholder={profile.username}
            />
          </SettingsField>

          <SettingsField
            label="Your password"
            htmlFor="settings-delete-pw"
          >
            <PasswordInput
              id="settings-delete-pw"
              className="input"
              autoComplete="current-password"
              value={password}
              disabled={busy}
              onChange={(e) => {
                setPassword(e.target.value);
                if (err) setErr(null);
              }}
              placeholder="••••••••"
              aria-invalid={!!err}
              aria-describedby={err ? "settings-delete-err" : undefined}
            />
          </SettingsField>

          {err && (
            <div className="error" id="settings-delete-err" role="alert">
              {err}
            </div>
          )}

          <div className="settings-actions">
            <button
              className="btn settings-danger-confirm"
              type="submit"
              disabled={!canDelete}
            >
              {busy ? (
                <span className="settings-busy">
                  <SettingsSpinner />
                  Deleting…
                </span>
              ) : (
                "Permanently delete"
              )}
            </button>
            <button
              type="button"
              className="auth-link"
              disabled={busy}
              onClick={() => {
                Audio.playSfx("click");
                reset();
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </SettingsSection>
  );
}
