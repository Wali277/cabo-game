/**
 * WallpaperPreviewHarness — DEV-ONLY table-wallpaper gallery.
 *
 * Renders the REAL themed background layer (`<div className="table-bg"
 * data-theme={current} />`) full-screen, plus a few sample cards centered on
 * top so the reviewer can judge "behind the cards" legibility. A fixed control
 * bar switches the current theme among ALL themes (Lagoon + Aurora Indigo are
 * emphasized as the two new Lumo live wallpapers), and a row of the real
 * `.theme-swatch-preview` chips shows the static swatch composition.
 *
 * Gated in `main.tsx` behind the `?walls` query param — no Supabase login
 * needed, no store interaction. Self-contained: local React state only.
 */
import { useState } from "react";
// The wallpaper (`.table-bg[data-theme=...]`) and swatch
// (`.theme-swatch-preview[data-theme=...]`) rules live in App.css, which is
// otherwise only pulled in by App.tsx. Import it directly so the harness shows
// the real themed layer without mounting the full app.
import "../../App.css";
import { CardView } from "../Card";
import { THEME_LABELS, type TableTheme } from "../../state/theme";
import type { Card } from "../../engine/types";

// Same order as the in-game picker (ThemePicker THEMES).
const ALL_THEMES: TableTheme[] = [
  "horizon",
  "emerald",
  "crimson",
  "ocean",
  "northern",
  "cosmic",
  "aquarium",
  "lagoon",
  "auroraindigo",
];

// The two NEW Lumo live wallpapers — emphasized in the control bar.
const NEW_THEMES = new Set<TableTheme>(["lagoon", "auroraindigo"]);

// A few representative cards to show "behind the cards" legibility.
const SAMPLE_CARDS: Array<{ card: Card; faceUp: boolean }> = [
  { card: { id: "w_back", rank: "A", suit: "S" }, faceUp: false },
  { card: { id: "w_red", rank: "7", suit: "H" }, faceUp: true },
  { card: { id: "w_blk", rank: "K", suit: "S" }, faceUp: true },
  { card: { id: "w_num", rank: "10", suit: "D" }, faceUp: true },
];

export function WallpaperPreviewHarness() {
  const [current, setCurrent] = useState<TableTheme>("lagoon");

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* The REAL themed layer — position:fixed; inset:0; z-index:-1. */}
      <div className="table-bg" data-theme={current} />

      {/* Sample cards centered to show readability over the wallpaper. */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          pointerEvents: "none",
        }}
      >
        {SAMPLE_CARDS.map((c) => (
          <CardView key={c.card.id} card={c.card} faceUp={c.faceUp} size="lg" />
        ))}
      </div>

      {/* Fixed control bar: theme switcher + swatch chips. */}
      <div
        style={{
          position: "fixed",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: "14px 18px",
          borderRadius: 14,
          background: "rgba(10,10,14,0.78)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.10)",
          maxWidth: "calc(100vw - 32px)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.34em",
            textTransform: "uppercase",
            color: "#8b8780",
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          Dev preview · ?walls
        </div>

        {/* Theme buttons. */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "center",
          }}
        >
          {ALL_THEMES.map((t) => {
            const active = current === t;
            const isNew = NEW_THEMES.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => setCurrent(t)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 9,
                  fontSize: 13,
                  fontWeight: isNew ? 700 : 500,
                  cursor: "pointer",
                  color: active ? "#0a0a0c" : "#e7e3da",
                  background: active
                    ? "#ffd86b"
                    : isNew
                    ? "rgba(99,102,241,0.22)"
                    : "rgba(255,255,255,0.07)",
                  border: isNew
                    ? "1px solid rgba(129,140,248,0.6)"
                    : "1px solid rgba(255,255,255,0.12)",
                }}
              >
                {THEME_LABELS[t]}
                {isNew ? "  · NEW" : ""}
              </button>
            );
          })}
        </div>

        {/* Real swatch chips for the two new wallpapers. */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", alignItems: "center" }}>
          {(["lagoon", "auroraindigo"] as TableTheme[]).map((t) => (
            <div key={t} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span className="theme-swatch-preview" data-theme={t} aria-hidden="true" />
              <span style={{ fontSize: 11, color: "#8b8780" }}>{THEME_LABELS[t]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
