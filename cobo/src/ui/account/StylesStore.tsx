import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../../state/store";
import {
  skinCatalog,
  wallpaperCatalog,
  type CosmeticItem,
  type CosmeticKind,
} from "../../state/cosmetics";
import {
  purchaseCosmetic,
  equipCosmetic,
  setCardColors,
  type Profile,
} from "../../state/auth";
import { Audio } from "../../audio/sounds";
import { CardView } from "../Card";
import { CUSTOM_SKIN_DEFAULTS, type CardSkin } from "../../state/cardskin";
import type { Card } from "../../engine/types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * STYLES STORE (Phase 6 — token shop, client side)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Rendered inside the profile modal's "Styles" tab. Spend tokens to UNLOCK card
 * skins + table wallpapers, then EQUIP your favourites. Two responsive grids
 * (skins, wallpapers); each item shows an ACCURATE preview (the real card face /
 * the real theme background — same renderers the in-game picker uses) and one
 * state-driven control:
 *
 *   - Equipped              → non-interactive "Equipped ✓" badge.
 *   - Owned, not equipped   → "Equip" → equipCosmetic.
 *   - Locked, affordable    → "Buy 🪙{price}" → purchaseCosmetic (auto-equips).
 *   - Locked, unaffordable  → disabled "🪙{price}" + "Need N more" hint.
 *
 * Server-authoritative: the client only ever sends `{ kind, id }`. After a
 * success the server returns the FULL profile (folded via `setAccount`), so the
 * grid re-renders from the new `tokens` / `unlocked_*` / `active_*`. The
 * cosmetics bridge re-applies the equipped style to the live game automatically.
 *
 * In-flight + error state is keyed PER ITEM (`${kind}:${id}`) so two items never
 * share one spinner / message.
 */

// Two preview cards — a red Ace (back) + black King (front) — exactly like the
// in-game picker, so the store preview matches the real thing tile-for-tile.
const PREVIEW_BACK: Card = { id: "store_back", rank: "A", suit: "H" };
const PREVIEW_FRONT: Card = { id: "store_front", rank: "K", suit: "S" };

// Six evenly-spaced angles (degrees) for the unlock sparkle burst — each sparkle
// flies out from the tile centre along its angle. Fixed array so the burst is
// deterministic (no per-render randomness) and the React keys stay stable.
const UNLOCK_SPARK_ANGLES = [30, 90, 150, 210, 270, 330] as const;
const UNLOCK_SPARK_RADIUS = 34; // px each sparkle travels outward

type PendingMap = Record<string, boolean>;
type ErrorMap = Record<string, string | undefined>;
/** Per-item one-shot flag that fires the "unlock" celebration after a buy. */
type UnlockMap = Record<string, boolean>;

function itemKey(kind: CosmeticKind, id: string): string {
  return `${kind}:${id}`;
}

export function StylesStore() {
  const account = useStore((s) => s.account);
  const profile = account?.profile ?? null;

  const [pending, setPending] = useState<PendingMap>({});
  const [errors, setErrors] = useState<ErrorMap>({});
  const [unlocked, setUnlocked] = useState<UnlockMap>({});

  // Per-item celebration timers, cleared on unmount so a fast buy → close-modal
  // can't fire setState on an unmounted component (timer leak).
  const timersRef = useRef<Record<string, number>>({});
  useEffect(
    () => () => {
      Object.values(timersRef.current).forEach((t) => window.clearTimeout(t));
      timersRef.current = {};
    },
    [],
  );

  // Account-gated tab: ProfilePanel only mounts when signed in, but guard anyway
  // so a transient null can't crash the render.
  if (!profile) return null;

  const tokens = profile.tokens;

  async function run(
    kind: CosmeticKind,
    id: string,
    action: "buy" | "equip",
  ) {
    const key = itemKey(kind, id);
    if (pending[key]) return;
    Audio.playSfx("click");
    setPending((p) => ({ ...p, [key]: true }));
    setErrors((e) => ({ ...e, [key]: undefined }));

    try {
      if (action === "equip") {
        const eq = await equipCosmetic(kind, id);
        if (!eq.ok) {
          setErrors((e) => ({ ...e, [key]: eq.error ?? "Something went wrong." }));
        }
        return;
      }

      // BUY is TWO required round-trips: /account/purchase only UNLOCKS, then we
      // equip. Each step's result is honoured so a partial failure (charged but
      // not equipped) surfaces instead of a false success + celebration.
      const bought = await purchaseCosmetic(kind, id);
      if (!bought.ok) {
        setErrors((e) => ({ ...e, [key]: bought.error ?? "Something went wrong." }));
        return;
      }
      // Purchase landed (tokens spent, item now owned). Auto-equip it — but do
      // NOT roll back the purchase if equip fails: the item IS owned, so surface
      // a gentle note and let the now-visible "Equip" button retry.
      const equipped = await equipCosmetic(kind, id);
      if (!equipped.ok) {
        setErrors((e) => ({ ...e, [key]: "Unlocked! Tap Equip to use it." }));
        return;
      }
      // Both steps succeeded → fire the one-shot unlock celebration + a
      // triumphant SFX (reusing the existing "win" chime from sounds.ts).
      Audio.playSfx("win");
      setUnlocked((u) => ({ ...u, [key]: true }));
      // Hold long enough for the full ring + sparkle burst + badge to play out
      // before the celebration state resets.
      const t = window.setTimeout(() => {
        setUnlocked((u) => ({ ...u, [key]: false }));
        delete timersRef.current[key];
      }, 1300);
      timersRef.current[key] = t;
    } finally {
      setPending((p) => ({ ...p, [key]: false }));
    }
  }

  return (
    <div className="styles-store">
      <StoreHeader tokens={tokens} />

      <StoreSection
        title="Card Skins"
        icon="🂠"
        items={skinCatalog}
        profile={profile}
        tokens={tokens}
        pending={pending}
        errors={errors}
        unlocked={unlocked}
        onBuy={(c) => void run(c.kind, c.id, "buy")}
        onEquip={(c) => void run(c.kind, c.id, "equip")}
      />

      <StoreSection
        title="Table Wallpapers"
        icon="🖼"
        items={wallpaperCatalog}
        profile={profile}
        tokens={tokens}
        pending={pending}
        errors={errors}
        unlocked={unlocked}
        onBuy={(c) => void run(c.kind, c.id, "buy")}
        onEquip={(c) => void run(c.kind, c.id, "equip")}
      />
    </div>
  );
}

// ── Token-balance header ──────────────────────────────────────────────────────
/** Ko-fi "Tokens" shop item — buying it auto-credits the account via the Ko-fi
 *  webhook. Direct link so players can top up right from the Styles store. */
const KOFI_TOKENS_URL = "https://ko-fi.com/s/bd28409878";

function StoreHeader({ tokens }: { tokens: number }) {
  return (
    <div className="styles-store-head">
      <div className="styles-store-head-row">
        <div className="styles-store-balance">
          <span className="styles-store-balance-coin" aria-hidden="true">
            🪙
          </span>
          <span className="styles-store-balance-value">{tokens}</span>
          <span className="styles-store-balance-label">
            {tokens === 1 ? "token" : "tokens"}
          </span>
        </div>
        <a
          className="styles-store-buy"
          href={KOFI_TOKENS_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Buy more tokens on Ko-fi (opens in a new tab)"
          onClick={() => Audio.playSfx("click")}
        >
          {/* Ko-fi coffee-cup mark (inherits the button's white text colour). */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 3.2c.7.6.7 1.4 0 2 .7.6.7 1.4 0 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M13 3.2c.7.6.7 1.4 0 2 .7.6.7 1.4 0 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M4 10h12v3.2A4.8 4.8 0 0 1 11.2 18H8.8A4.8 4.8 0 0 1 4 13.2V10Z" fill="currentColor" />
            <path d="M16 10.8h1.4a2.6 2.6 0 0 1 0 5.2H15.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none" />
            <path d="M4.4 20h11.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span>Buy tokens</span>
        </a>
      </div>
      <p className="styles-store-intro">
        Spend tokens to unlock skins &amp; wallpapers, then equip your favourites.
      </p>
    </div>
  );
}

// ── A titled section (skins / wallpapers) ─────────────────────────────────────
function StoreSection({
  title,
  icon,
  items,
  profile,
  tokens,
  pending,
  errors,
  unlocked,
  onBuy,
  onEquip,
}: {
  title: string;
  icon: string;
  items: ReadonlyArray<CosmeticItem>;
  profile: Profile;
  tokens: number;
  pending: PendingMap;
  errors: ErrorMap;
  unlocked: UnlockMap;
  onBuy: (c: CosmeticItem) => void;
  onEquip: (c: CosmeticItem) => void;
}) {
  return (
    <section className="styles-store-section">
      <h3 className="styles-store-section-title">
        <span className="styles-store-section-icon" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h3>
      <div className="styles-store-grid">
        {items.map((c) => {
          const key = itemKey(c.kind, c.id);
          // The FREE "Custom" recolor skin gets a SPECIAL tile: a live-tinted
          // preview + two colour pickers + the shared Equip control. Everything
          // else uses the standard preview + Buy/Equip control.
          if (c.kind === "skin" && c.id === "custom") {
            return (
              <CustomSkinItem
                key={key}
                item={c}
                profile={profile}
                equipPending={!!pending[key]}
                equipError={errors[key]}
                onEquip={() => onEquip(c)}
              />
            );
          }
          return (
            <StoreItem
              key={key}
              item={c}
              profile={profile}
              tokens={tokens}
              pending={!!pending[key]}
              error={errors[key]}
              justUnlocked={!!unlocked[key]}
              onBuy={() => onBuy(c)}
              onEquip={() => onEquip(c)}
            />
          );
        })}
      </div>
    </section>
  );
}

type ItemState = "equipped" | "owned" | "affordable" | "locked";

function deriveState(
  item: CosmeticItem,
  profile: Profile,
  tokens: number,
): ItemState {
  const active =
    item.kind === "skin" ? profile.active_skin : profile.active_wallpaper;
  if (active === item.id) return "equipped";

  const owned =
    item.free ||
    (item.kind === "skin"
      ? profile.unlocked_skins
      : profile.unlocked_wallpapers
    )?.includes(item.id);
  if (owned) return "owned";

  return tokens >= item.price ? "affordable" : "locked";
}

// ── The FREE "Custom" recolor tile (special: pickers + live preview) ──────────

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** Pull one well-formed `#RRGGBB` field out of the loose `custom_card_colors`
 *  map, falling back to the shared default. The `<input type="color">` value
 *  MUST always be a valid 6-digit hex or the control silently snaps to #000000. */
function colorField(
  colors: Profile["custom_card_colors"],
  key: "body" | "border",
  fallback: string,
): string {
  const v = colors?.[key];
  return typeof v === "string" && HEX6.test(v) ? v.toLowerCase() : fallback;
}

/**
 * The "Custom" skin tile. Unlike a normal store item this is owned-by-default
 * (free) and never bought — instead it offers TWO colour pickers (Body + Border)
 * that tint the skin live, plus the shared Equip/Equipped control.
 *
 * Source of truth is the server: the pickers seed from `profile.custom_card_colors`
 * and each change DEBOUNCES a `setCardColors` POST (~350ms) so dragging the
 * native picker doesn't spam the server. On success the store folds in the
 * returned profile, so the inline preview (and, when 'custom' is equipped, the
 * live game) repaint from the authoritative colours. A local `draft` keeps the
 * swatch snappy between the change and the round-trip.
 */
function CustomSkinItem({
  item,
  profile,
  equipPending,
  equipError,
  onEquip,
}: {
  item: CosmeticItem;
  profile: Profile;
  equipPending: boolean;
  equipError?: string;
  onEquip: () => void;
}) {
  const reduced = useReducedMotion() ?? false;
  // Ownership is SERVER truth: 'custom' is a LEVEL-2 REWARD, so it's owned only
  // once grant_xp has added it to unlocked_skins. Until then the tile is LOCKED
  // (no pickers, no equip) with a "reach level N" hint.
  const equipped = profile.active_skin === item.id;
  const owned =
    equipped || (profile.unlocked_skins?.includes(item.id) ?? false);
  const lockLevel = item.levelUnlock ?? 2;

  // The profile's saved colours are the source of truth; `draft` mirrors them
  // for instant swatch feedback while a save is in flight. When the saved value
  // changes (server clamp, another tab) we re-seed the draft DURING RENDER via
  // React's "adjusting state on prop change" pattern — comparing against the
  // last-seen saved key — so the pickers track the authoritative profile without
  // a setState-in-effect cascade.
  const savedBody = colorField(profile.custom_card_colors, "body", CUSTOM_SKIN_DEFAULTS.body);
  const savedBorder = colorField(profile.custom_card_colors, "border", CUSTOM_SKIN_DEFAULTS.border);
  const savedKey = `${savedBody}|${savedBorder}`;
  const [draft, setDraft] = useState({ body: savedBody, border: savedBorder });
  const [seenSavedKey, setSeenSavedKey] = useState(savedKey);
  if (seenSavedKey !== savedKey) {
    setSeenSavedKey(savedKey);
    setDraft({ body: savedBody, border: savedBorder });
  }

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  // Single debounce timer + a "latest values" ref so rapid drags collapse into
  // one trailing POST with the final colours. Cleared on unmount to avoid a
  // setState-after-unmount when the modal closes mid-drag.
  const timerRef = useRef<number | null>(null);
  const latestRef = useRef({ body: savedBody, border: savedBorder });
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  function scheduleSave(next: { body: string; border: string }) {
    latestRef.current = next;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const { body, border } = latestRef.current;
      setSaving(true);
      setSaveError(undefined);
      void setCardColors(body, border).then((r) => {
        setSaving(false);
        if (!r.ok) setSaveError(r.error ?? "Couldn't save colours.");
      });
    }, 350);
  }

  function onPick(which: "body" | "border", value: string) {
    const next = { ...draft, [which]: value };
    setDraft(next);
    scheduleSave(next);
  }

  // LOCKED: not yet owned (account below the unlock level). Show the preview
  // behind a lock with a "reach level N" hint — no colour pickers, no equip.
  if (!owned) {
    return (
      <motion.div
        className="store-item store-item-custom store-item-locked is-locked"
        initial={false}
        animate={{ scale: 1 }}
      >
        <div className="store-item-preview">
          <SkinPreview skin="custom" />
          <span className="store-item-lock" aria-hidden="true">
            🔒
          </span>
        </div>

        <div className="store-item-label">{item.label}</div>

        <div className="store-item-locked-control">
          <button
            type="button"
            className="store-item-btn locked"
            disabled
            aria-label={`${item.label} unlocks as a reward at level ${lockLevel}`}
          >
            <span aria-hidden="true">🔒 Level {lockLevel}</span>
          </button>
          <span className="store-item-need">
            Reach level {lockLevel} to unlock
          </span>
        </div>
      </motion.div>
    );
  }

  // OWNED (the level reward has been earned): live-tinted preview + the two
  // colour pickers + the shared Equip/Equipped control.
  return (
    <motion.div
      className={`store-item store-item-custom ${
        equipped ? "store-item-equipped" : "store-item-owned"
      }`}
      initial={false}
      animate={{ scale: 1 }}
    >
      <div className="store-item-preview">
        {/* Live preview: CardView with skinOverride="custom" reads the profile's
            saved tint, so equipping isn't required to see it. */}
        <SkinPreview skin="custom" />
      </div>

      <div className="store-item-label">{item.label}</div>

      {/* Two colour pickers — body (card face + LUMO pill) and border (frame +
          back background + LUMO text). The suits keep the default red/black. */}
      <div className="store-custom-pickers">
        <label className="store-custom-picker">
          <span className="store-custom-picker-label">Body</span>
          <input
            type="color"
            className="store-custom-swatch"
            value={draft.body}
            onChange={(e) => onPick("body", e.target.value)}
            aria-label="Card body color"
          />
        </label>
        <label className="store-custom-picker">
          <span className="store-custom-picker-label">Border</span>
          <input
            type="color"
            className="store-custom-swatch"
            value={draft.border}
            onChange={(e) => onPick("border", e.target.value)}
            aria-label="Card border color"
          />
        </label>
      </div>

      {/* Tiny in-flight hint while a save is mid-air. */}
      <div className="store-custom-status" aria-live="polite">
        {saving ? (
          <span className="store-custom-saving">
            <Spinner /> Saving…
          </span>
        ) : null}
      </div>

      {/* Equip / Equipped — reuses the shared equip path. */}
      {equipped ? (
        <span className="store-item-badge equipped" aria-label="Equipped">
          Equipped <span aria-hidden="true">✓</span>
        </span>
      ) : (
        <button
          type="button"
          className="store-item-btn equip"
          onClick={onEquip}
          disabled={equipPending}
        >
          {equipPending ? <Spinner /> : "Equip"}
        </button>
      )}

      <AnimatePresence>
        {(saveError || equipError) && (
          <motion.p
            className="store-item-error"
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={reduced ? { duration: 0 } : { duration: 0.18 }}
          >
            {saveError || equipError}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── A single store item (preview + state-driven control) ──────────────────────
function StoreItem({
  item,
  profile,
  tokens,
  pending,
  error,
  justUnlocked,
  onBuy,
  onEquip,
}: {
  item: CosmeticItem;
  profile: Profile;
  tokens: number;
  pending: boolean;
  error?: string;
  justUnlocked: boolean;
  onBuy: () => void;
  onEquip: () => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const state = deriveState(item, profile, tokens);
  const locked = state === "affordable" || state === "locked";

  return (
    <motion.div
      className={`store-item store-item-${state}${locked ? " is-locked" : ""}`}
      initial={false}
      animate={
        justUnlocked && !reduced
          ? { scale: [1, 1.08, 1] }
          : { scale: 1 }
      }
      transition={
        justUnlocked && !reduced
          ? { duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }
          : { duration: 0.3, ease: "easeOut" }
      }
    >
      <div className="store-item-preview">
        {item.kind === "skin" ? (
          <SkinPreview skin={item.id as CardSkin} />
        ) : (
          <WallpaperPreview themeId={item.id} />
        )}
        {/* Lock veil on items the player can't equip yet. */}
        {locked && (
          <span className="store-item-lock" aria-hidden="true">
            🔒
          </span>
        )}
        {/* Unlock celebration — a tasteful, self-contained on-tile burst on a
            successful buy. Full effect (glow ring + radiating sparkles + the
            "Unlocked!" badge) when motion is allowed; just the badge as a plain
            fade when the user prefers reduced motion. */}
        <AnimatePresence>
          {justUnlocked && !reduced && (
            <>
              {/* Glow ring — expands + fades over the preview. */}
              <motion.span
                key="ring"
                className="store-item-unlock-ring"
                initial={{ opacity: 0.9, scale: 0.7 }}
                animate={{ opacity: 0, scale: 1.25 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                aria-hidden="true"
              />
              {/* Sparkle burst — six small sparkles radiating outward. */}
              {UNLOCK_SPARK_ANGLES.map((deg, i) => {
                const rad = (deg * Math.PI) / 180;
                const x = Math.cos(rad) * UNLOCK_SPARK_RADIUS;
                const y = Math.sin(rad) * UNLOCK_SPARK_RADIUS;
                return (
                  <motion.span
                    key={`spark-${deg}`}
                    className="store-item-unlock-spark"
                    initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                    animate={{ opacity: [0, 1, 0], scale: [0, 1, 0.4], x, y }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: 0.7,
                      ease: "easeOut",
                      delay: i * 0.025,
                    }}
                    aria-hidden="true"
                  >
                    ✦
                  </motion.span>
                );
              })}
            </>
          )}
          {justUnlocked && (
            // The "Unlocked!" badge plays in BOTH modes — a spring pop when
            // motion is allowed, a plain fade under reduced motion.
            <motion.span
              key="badge"
              className="store-item-unlock-badge"
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0 }}
              animate={
                reduced
                  ? { opacity: [0, 1, 1, 0] }
                  : { opacity: [0, 1, 1, 0], scale: [0, 1, 1, 0.9] }
              }
              exit={{ opacity: 0 }}
              transition={
                reduced
                  ? { duration: 1.2, times: [0, 0.15, 0.75, 1] }
                  : {
                      duration: 1.2,
                      times: [0, 0.18, 0.75, 1],
                      ease: [0.34, 1.56, 0.64, 1],
                    }
              }
              aria-hidden="true"
            >
              🎉 Unlocked!
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="store-item-label">{item.label}</div>

      <StoreItemControl
        state={state}
        item={item}
        tokens={tokens}
        pending={pending}
        onBuy={onBuy}
        onEquip={onEquip}
      />

      <AnimatePresence>
        {error && (
          <motion.p
            className="store-item-error"
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── The state-driven single control ───────────────────────────────────────────
function StoreItemControl({
  state,
  item,
  tokens,
  pending,
  onBuy,
  onEquip,
}: {
  state: ItemState;
  item: CosmeticItem;
  tokens: number;
  pending: boolean;
  onBuy: () => void;
  onEquip: () => void;
}) {
  if (state === "equipped") {
    return (
      <span className="store-item-badge equipped" aria-label="Equipped">
        Equipped <span aria-hidden="true">✓</span>
      </span>
    );
  }

  if (state === "owned") {
    return (
      <button
        type="button"
        className="store-item-btn equip"
        onClick={onEquip}
        disabled={pending}
      >
        {pending ? <Spinner /> : "Equip"}
      </button>
    );
  }

  if (state === "affordable") {
    return (
      <button
        type="button"
        className="store-item-btn buy"
        onClick={onBuy}
        disabled={pending}
        aria-label={`Buy ${item.label} for ${item.price} ${item.price === 1 ? "token" : "tokens"}`}
      >
        {pending ? (
          <Spinner />
        ) : (
          <>
            Buy <span className="store-item-price" aria-hidden="true">🪙{item.price}</span>
          </>
        )}
      </button>
    );
  }

  // Locked + unaffordable.
  const need = item.price - tokens;
  return (
    <div className="store-item-locked-control">
      <button
        type="button"
        className="store-item-btn locked"
        disabled
        aria-label={`${item.label} costs ${item.price} ${item.price === 1 ? "token" : "tokens"} — you need ${need} more`}
      >
        <span className="store-item-price" aria-hidden="true">🪙{item.price}</span>
      </button>
      <span className="store-item-need">Need {need} more</span>
    </div>
  );
}

// ── Previews (reuse the in-game picker's renderers) ───────────────────────────

/** Card-skin preview: the real card face + back in this skin, fanned like the
 *  in-game picker tile (back rotated left, front rotated right). */
function SkinPreview({ skin }: { skin: CardSkin }) {
  return (
    <div className="store-skin-preview">
      <div className="store-skin-card store-skin-card-back">
        <CardView card={PREVIEW_BACK} faceUp={false} size="sm" skinOverride={skin} />
      </div>
      <div className="store-skin-card store-skin-card-front">
        <CardView card={PREVIEW_FRONT} faceUp size="sm" skinOverride={skin} />
      </div>
    </div>
  );
}

/** Wallpaper preview: the real theme background swatch via `data-theme` — the
 *  exact gradient stack the in-game table paints (see `.theme-swatch-preview`
 *  in App.css). */
function WallpaperPreview({ themeId }: { themeId: string }) {
  return (
    <span
      className="store-wallpaper-preview theme-swatch-preview"
      data-theme={themeId}
      aria-hidden="true"
    />
  );
}

// ── Tiny inline spinner (in-flight) ───────────────────────────────────────────
function Spinner() {
  const reduced = useReducedMotion() ?? false;
  return (
    <motion.span
      className="store-spinner"
      aria-hidden="true"
      animate={reduced ? {} : { rotate: 360 }}
      transition={
        reduced
          ? {}
          : { repeat: Infinity, ease: "linear", duration: 0.7 }
      }
    />
  );
}
