/**
 * ────────────────────────────────────────────────────────────────────────────
 * ACCOUNTS LAYER (Phase 3 — XP / LEVEL / TOKEN DISPLAY MATH)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Pure, client-side helpers that turn a profile's lifetime `total_xp` + `level`
 * into the numbers the UI needs (progress bars, "levels until next token", …).
 *
 * ⚠️ THE SERVER IS AUTHORITATIVE. These functions MIRROR the SQL in
 * `supabase/migrations/0001_accounts.sql`:
 *   - `public.xp_to_level(total)` — the level/rollover algorithm (mirrored by
 *     {@link xpToLevel} below; same bands, same loop).
 *   - `public.grant_xp(...)`      — the ONLY write path; awards XP + tokens.
 * Nothing here ever WRITES or grants anything — it is display/prediction only.
 * The stored `profile.level`/`profile.tokens` always win; we recompute from
 * `total_xp` purely so the UI can show *progress within* the current level
 * without a round-trip. If the bands below ever drift from the migration the
 * bar will look wrong, so KEEP THIS IN SYNC with the SQL (and the README table
 * in `supabase/README.md`).
 *
 * Level cost (cost to advance FROM level L) — identical to the migration:
 *   L <= 9        -> 1500
 *   10 <= L <= 19 -> 2500
 *   L >= 20       -> 3000
 *
 * Token milestones (for copy only; the server grants them):
 *   level 10 -> +1 token, level 20 -> +2 tokens, every multiple of 10 >= 30 ->
 *   +1 token. The token-spend MECHANIC (the styles store) unlocks at level 10.
 */

/** XP cost to advance FROM the given (1-based) level to the next. Mirrors the
 *  `cost` branch inside the SQL `xp_to_level` loop. */
function levelCost(level: number): number {
  if (level <= 9) return 1500;
  if (level <= 19) return 2500;
  return 3000;
}

export interface LevelProgress {
  /** 1-based level for the supplied lifetime XP. */
  level: number;
  /** XP accumulated since reaching `level` (the rollover into the current bar). */
  xpIntoLevel: number;
  /** XP cost to advance FROM the current level to the next (the bar's full width). */
  xpForNext: number;
}

/**
 * Map lifetime XP → (level, xpIntoLevel, xpForNext). A faithful port of the
 * SQL `public.xp_to_level`: start at level 1, repeatedly subtract the current
 * level's cost while the remainder covers it, then report what's left.
 *
 * Guards NaN / negative / non-finite input down to 0 XP (level 1) so a missing
 * or malformed `total_xp` never throws or loops — matching the SQL's
 * `greatest(coalesce(total,0),0)`.
 */
export function xpToLevel(totalXp: number): LevelProgress {
  let remaining =
    Number.isFinite(totalXp) && totalXp > 0 ? Math.floor(totalXp) : 0;
  let level = 1;
  let cost = levelCost(level);

  while (remaining >= cost) {
    remaining -= cost;
    level += 1;
    cost = levelCost(level);
  }

  return { level, xpIntoLevel: remaining, xpForNext: cost };
}

/**
 * The NEXT level that pays out a token, given the current level. Tokens land at
 * 10, 20, 30, … so the next milestone above `level` is the next multiple of 10
 * strictly greater than it. `(floor(level/10)+1)*10` → 10 for levels 0–9, 20
 * for 10–19, and so on. Guards bad input to level 0 (→ 10).
 */
export function nextTokenMilestone(level: number): number {
  const safe = Number.isFinite(level) && level > 0 ? Math.floor(level) : 0;
  return (Math.floor(safe / 10) + 1) * 10;
}

/** How many levels remain until the next token milestone (always >= 1). */
export function levelsUntilNextToken(level: number): number {
  const safe = Number.isFinite(level) && level > 0 ? Math.floor(level) : 0;
  return nextTokenMilestone(safe) - safe;
}
