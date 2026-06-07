/**
 * Accounts layer (Phase 1 — auth only).
 *
 * Shared presentational scaffolding for the three auth screens (Login, Signup,
 * Forgot password) so they look identical and reuse the menu's design language
 * (`<MenuWallpaper/>`, the LUMO title, `.menu-card`, framer entrance springs).
 *
 * Pure constants + validators live in `./authValidation` (a non-JSX module) so
 * Fast Refresh treats this file as components-only.
 */
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { MenuWallpaper } from "../MenuWallpaper";

/**
 * AuthShell — the common chrome for every auth screen: cosmic wallpaper, the
 * embossed LUMO title, an optional subtitle, and a spring-entrance `.menu-card`
 * wrapping the screen's fields. Children render inside the card.
 */
export function AuthShell({
  subtitle,
  children,
}: {
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="menu menu-refresh auth-screen">
      <MenuWallpaper />
      <motion.h1
        className="title"
        initial={{ scale: 0.4, rotate: -10, opacity: 0 }}
        animate={{ scale: 1, rotate: -6, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 14 }}
      >
        <span className="title-text">LUMO!</span>
      </motion.h1>
      {subtitle && (
        <motion.p
          className="subtitle"
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {subtitle}
        </motion.p>
      )}
      <motion.div
        className="menu-card auth-card"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.35 }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/** A labelled text field matching the menu's `.menu-label` + `.input` pattern,
 *  with an optional inline field error shown beneath.
 *
 *  Pass `htmlFor` matching the control's `id` so the `<label>` is programmatically
 *  associated (clicking the label focuses the input; screen readers announce the
 *  name). The inline error is given `id={`${htmlFor}-err`}` + `role="alert"` so
 *  the matching `aria-describedby` on the input announces it. */
export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="auth-field">
      <label className="menu-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error && (
        <div
          className="auth-field-error"
          id={htmlFor ? `${htmlFor}-err` : undefined}
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  );
}
