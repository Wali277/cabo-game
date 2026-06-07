/**
 * SkinPreviewHarness — DEV-ONLY card-skin gallery.
 *
 * Renders every selectable skin (BACK + a number face + a black face + a Joker)
 * at two sizes, on BOTH a dark and a light panel, using the REAL `CardView` with
 * `skinOverride`. Gated in `main.tsx` behind the `?skins` query param so the
 * normal app is untouched and no Supabase login is needed — a guest store is
 * enough because `skinOverride` bypasses the profile/custom-color path.
 *
 * The four NEW legendary skins (ivory / eclipse / vesica / orbit) are
 * highlighted so the design reviewer can eyeball legibility — notably that
 * Ivory (the light card) stays visible on the LIGHT panel.
 */
import { CardView } from "../Card";
import { SKIN_LABELS, type CardSkin } from "../../state/cardskin";
import type { Card } from "../../engine/types";

// Same order as the in-game picker (ThemePicker SKINS).
const PREVIEW_SKINS: CardSkin[] = [
  "classic",
  "royal",
  "neon",
  "deco",
  "ivory",
  "eclipse",
  "vesica",
  "orbit",
];

// The four new legendary skins — highlighted in the gallery.
const NEW_SKINS = new Set<CardSkin>(["ivory", "eclipse", "vesica", "orbit"]);

// Representative faces: a red number, a black face card, and a Joker.
const NUMBER_FACE: Card = { id: "prev_num", rank: "7", suit: "H" };
const BLACK_FACE: Card = { id: "prev_blk", rank: "K", suit: "S" };
const JOKER_FACE: Card = { id: "prev_jok", rank: "Joker", suit: "S" };

type PanelTone = "dark" | "light";

function SkinRow({ skin, tone }: { skin: CardSkin; tone: PanelTone }) {
  const isNew = NEW_SKINS.has(skin);
  const labelColor = tone === "dark" ? "#e7e3da" : "#1a1a1f";
  const subColor = tone === "dark" ? "#8b8780" : "#6a6760";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 28,
        padding: "18px 22px",
        borderRadius: 14,
        border: isNew
          ? "1px solid rgba(201,162,39,0.55)"
          : tone === "dark"
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid rgba(0,0,0,0.10)",
        background: isNew
          ? tone === "dark"
            ? "rgba(201,162,39,0.06)"
            : "rgba(201,162,39,0.10)"
          : "transparent",
      }}
    >
      <div style={{ width: 150, flex: "none" }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: labelColor, letterSpacing: "0.01em" }}>
          {SKIN_LABELS[skin]}
        </div>
        <div style={{ fontSize: 11.5, color: subColor, marginTop: 3, fontFamily: "monospace" }}>
          {skin}
          {isNew ? "  · NEW" : ""}
        </div>
      </div>

      {/* md row */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <CardView card={null} faceUp={false} size="md" skinOverride={skin} />
        <CardView card={NUMBER_FACE} faceUp size="md" skinOverride={skin} />
        <CardView card={BLACK_FACE} faceUp size="md" skinOverride={skin} />
        <CardView card={JOKER_FACE} faceUp size="md" skinOverride={skin} />
      </div>

      {/* lg row */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <CardView card={null} faceUp={false} size="lg" skinOverride={skin} />
        <CardView card={NUMBER_FACE} faceUp size="lg" skinOverride={skin} />
        <CardView card={BLACK_FACE} faceUp size="lg" skinOverride={skin} />
        <CardView card={JOKER_FACE} faceUp size="lg" skinOverride={skin} />
      </div>
    </div>
  );
}

function Panel({ tone }: { tone: PanelTone }) {
  return (
    <section
      style={{
        background:
          tone === "dark"
            ? "radial-gradient(120% 90% at 50% -10%, #15151a 0%, #0a0a0c 60%)"
            : "radial-gradient(120% 90% at 50% -10%, #f4f1ea 0%, #d9d4c8 70%, #c9c3b4 100%)",
        borderRadius: 18,
        padding: "28px 26px",
        marginBottom: 36,
      }}
    >
      <h2
        style={{
          margin: "0 0 6px",
          fontSize: 13,
          letterSpacing: "0.34em",
          textTransform: "uppercase",
          fontWeight: 700,
          color: tone === "dark" ? "#c39a3f" : "#8a6c1f",
        }}
      >
        {tone === "dark" ? "Dark wallpaper" : "Light wallpaper"}
      </h2>
      <p
        style={{
          margin: "0 0 20px",
          fontSize: 12.5,
          color: tone === "dark" ? "#8b8780" : "#6a6760",
        }}
      >
        Back · number face (7♥) · black face (K♠) · Joker — at md and lg.
        {tone === "light" ? "  Ivory must stay visible here." : ""}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {PREVIEW_SKINS.map((s) => (
          <SkinRow key={s} skin={s} tone={tone} />
        ))}
      </div>
    </section>
  );
}

export function SkinPreviewHarness() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#08080a",
        color: "#e7e3da",
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        padding: "48px 40px 96px",
      }}
    >
      <header style={{ maxWidth: 1280, margin: "0 auto 40px" }}>
        <p
          style={{
            fontSize: 11,
            letterSpacing: "0.42em",
            textTransform: "uppercase",
            color: "#5a5751",
            margin: "0 0 14px",
            fontWeight: 600,
          }}
        >
          Dev preview · ?skins
        </p>
        <h1 style={{ fontSize: 34, fontWeight: 300, margin: "0 0 10px" }}>
          Card skins — in-game render
        </h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "#8b8780", maxWidth: 680, margin: 0 }}>
          The four new legendary skins (Ivory, Eclipse, Vesica, Orbit) are
          highlighted. Each row uses the real CardView at md and lg, on a dark and
          a light panel, so legibility (and Ivory's edge-shadow on light grounds)
          can be confirmed at game scale.
        </p>
      </header>

      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <Panel tone="dark" />
        <Panel tone="light" />
      </div>
    </div>
  );
}
