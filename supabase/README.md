# Lumo — Supabase database layer

This directory contains the **database layer only** for the Lumo accounts /
progression system. It is pure SQL + config; nothing here has been run against a
live database. Apply it with the Supabase CLI (`supabase db reset` / `supabase
db push`) once you have a project.

```
supabase/
├── config.toml                  # minimal project config (auth = email + 6-digit code)
├── seed.sql                     # empty placeholder (no seed users)
├── README.md                    # this file
└── migrations/
    └── 0001_accounts.sql        # full schema: tables, functions, RLS, grants
```

---

## Objects created by `0001_accounts.sql`

### Extension
- **`citext`** — case-insensitive text, used for `profiles.username` so that
  names differing only in case (`Wali` / `wali`) collide on the UNIQUE index.

### Table `public.profiles` (1:1 with `auth.users`)
The single **source of truth** for a player's progression and cosmetic unlocks.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | `references auth.users(id) on delete cascade` |
| `username` | `citext` | `NOT NULL UNIQUE`; CHECK `^[a-zA-Z0-9_]{3,20}$` |
| `total_xp` | `int` | **source of truth**; default `0` |
| `level` | `int` | cached, recomputed from `total_xp` each grant; default `1` |
| `tokens` | `int` | soft currency; default `0` |
| `highest_token_milestone_rewarded` | `int` | watermark; prevents double-paying milestones; default `0` |
| `unlocked_skins` | `text[]` | default `{classic}` |
| `unlocked_wallpapers` | `text[]` | default `{emerald,crimson}` |
| `active_skin` | `text` | default `classic` |
| `active_wallpaper` | `text` | default `emerald` |
| `custom_card_colors` | `jsonb` | nullable; `{ "body": "#RRGGBB", "border": "#RRGGBB" }` |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()`; auto-touched by trigger |

> **Naming note:** the spec refers to the crimson wallpaper as `royal_crimson`,
> but the client's stored id is **`crimson`** (it is *labelled* "Royal Crimson"
> in the UI via `theme.ts`). We store the real client id, so the default is
> `{emerald,crimson}`. Likewise `classic` and `emerald` are confirmed real
> client ids (`cardskin.ts` / `theme.ts`).

A `BEFORE UPDATE` trigger (`trg_profiles_updated_at` → `public.set_updated_at()`)
forces `updated_at = now()` on every update.

### Table `public.xp_grants` (idempotency ledger + audit)
| Column | Type | Notes |
| --- | --- | --- |
| `id` | `bigint` | `generated always as identity` PK |
| `user_id` | `uuid` | `references public.profiles(id) on delete cascade` |
| `game_key` | `text` | idempotency key |
| `source` | `text` | CHECK `in ('sp','mp')` |
| `amount` | `int` | |
| `created_at` | `timestamptz` | default `now()` |

- `UNIQUE (user_id, game_key)` — the dedupe constraint that makes `grant_xp`
  safe to retry. A replayed grant collides here and becomes a no-op.
- Index `xp_grants_user_created_idx (user_id, created_at desc)` for history reads.

### Function `public.xp_to_level(total int) → (level, xp_into_level, xp_for_next)`
`IMMUTABLE`, `search_path = ''`. Pure mapping from lifetime XP to level +
in-level progress. See **rules** below.

### Function `public.grant_xp(p_user uuid, p_game_key text, p_amount int, p_source text) → public.grant_xp_result`
`SECURITY DEFINER`, `search_path = ''`, **EXECUTE granted to `service_role`
only**. The single supported write path for progression.

**Return type — `public.grant_xp_result`** (named composite):

| Field | Meaning |
| --- | --- |
| `total_xp` | new lifetime XP (unchanged on replay) |
| `level` | new cached level |
| `tokens` | new token balance |
| `xp_into_level` | progress within the new level |
| `xp_for_next` | cost to advance from the new level |
| `leveled_up` | `new_level > old_level` |
| `tokens_earned` | tokens granted by **this** call (`0` on replay / no milestone) |
| `old_level` | level before this call |
| `new_level` | level after this call (== `level`) |

---

## Security model (read this)

- **Clients are read-only.** The browser/desktop client uses the `anon` /
  `authenticated` role. RLS gives those roles **SELECT-only** access:
  - `profiles`: a user may read **only their own row** (`auth.uid() = id`).
    There is **no** insert/update/delete policy for `authenticated`, so the
    client cannot write **any** column.
  - `xp_grants`: a user may read **only their own** ledger rows
    (`auth.uid() = user_id`). No write policy.
- **All profile writes go through the trusted server** using the
  **`service_role`** key. `service_role` bypasses RLS entirely, so progression
  can only ever change server-side.
- **Defense in depth:** `INSERT/UPDATE/DELETE` are explicitly `REVOKE`d from
  `anon` and `authenticated` on both tables (so there is no client write path
  even if a policy were added by accident). `RLS` is additionally set to
  `FORCE` on both tables.
- **`grant_xp`** is `SECURITY DEFINER` with a locked `search_path`, `EXECUTE`
  revoked from `public/anon/authenticated` and granted to `service_role` only.
  `xp_to_level` is a harmless pure helper and is callable by everyone (handy for
  client-side UI math).

The server is expected to:
1. Authenticate the user / own the `service_role` key (never expose it client-side).
2. Validate `username` (same regex as the DB CHECK) on profile creation.
3. Call `grant_xp(...)` exactly once per finished game with a stable `game_key`;
   retries are safe because of the idempotency ledger.

---

## Progression rules (exact)

### `xp_to_level` — level cost & rollover
Cost to advance **from** level `L` to `L+1`:

| Level `L` | Cost |
| --- | --- |
| `L <= 9` | `1500` |
| `10 <= L <= 19` | `2500` |
| `L >= 20` | `3000` |

Algorithm: start `level = 1`, `remaining = total`. While `remaining >= cost(level)`,
subtract the cost and increment the level. Stop when `remaining < cost(level)`;
return `level`, `xp_into_level = remaining`, `xp_for_next = cost(level)`.

Cumulative XP required to **reach** each level (handy reference):

| Level | Cum XP | | Level | Cum XP |
| --- | --- | --- | --- | --- |
| 1 | 0 | | 11 | 16,000 |
| 2 | 1,500 | | 12 | 18,500 |
| 3 | 3,000 | | 13 | 21,000 |
| 4 | 4,500 | | … | … |
| 5 | 6,000 | | 19 | 36,000 |
| 6 | 7,500 | | 20 | 38,500 |
| 7 | 9,000 | | 21 | 41,500 |
| 8 | 10,500 | | 22 | 44,500 |
| 9 | 12,000 | | … | … |
| 10 | 13,500 | | | |

### Token milestones
Milestones are levels **10, 20, 30, 40, …** (10, then every `+10`). When a grant
raises the level, every milestone `M` with
`highest_token_milestone_rewarded < M <= new_level` is paid, and the watermark is
raised to the largest such `M`.

| Milestone `M` | Tokens awarded |
| --- | --- |
| `10` | `1` |
| `20` | `2` |
| `M >= 30`, `M % 10 == 0` | `1` |

Because awards are gated on the `highest_token_milestone_rewarded` watermark and
the whole `grant_xp` runs under a `FOR UPDATE` row lock + the unique ledger key,
a milestone can never be paid twice (replays, concurrent grants, or big jumps).

---

## Worked examples (self-verified math)

> These were verified against a reference implementation of the exact algorithm
> above. They have **not** been executed against a live database.

**`xp_to_level` outputs**

| `total_xp` | `level` | `xp_into_level` | `xp_for_next` |
| --- | --- | --- | --- |
| `0` | `1` | `0` | `1500` |
| `1500` | `2` | `0` | `1500` |
| `13500` (= 9 × 1500) | `10` | `0` | `2500` |
| `41500` | `21` | `0` | `3000` |

**Crossing into level 10 grants exactly 1 token.**
Start: `total_xp = 12000` (level 9, watermark 0). Grant `+1500` → `total_xp =
13500` → level 10. Milestone 10 is crossed → `tokens_earned = 1`,
`highest_token_milestone_rewarded = 10`, `leveled_up = true`
(`old_level = 9`, `new_level = 10`).

**A single grant that jumps level 9 → level 21 awards +3 tokens.**
Start: `total_xp = 12000` (level 9, watermark 0). Grant **`+29500`** →
`total_xp = 41500` → level 21. Milestones crossed: `10 (+1)` and `20 (+2)` →
`tokens_earned = 3`, `highest_token_milestone_rewarded = 20`, `leveled_up = true`
(`old_level = 9`, `new_level = 21`). (Milestone 30 is **not** reached: level 21 < 30.)

**Replaying the same `(user, game_key)` is a no-op.**
A second `grant_xp` with the same `game_key` collides on `xp_grants`'
`UNIQUE (user_id, game_key)`; nothing is inserted, so the function returns the
**current** state with `tokens_earned = 0`, `leveled_up = false`, and `total_xp`
unchanged. No `total_xp`, `tokens`, or `level` value moves.

---

## Assumptions & deviations
- **`royal_crimson` → `crimson`:** stored the existing client id, per the spec's
  own note. (Confirmed against `cobo/src/state/theme.ts`.)
- **`grant_xp` return shape:** implemented as a named composite type
  (`public.grant_xp_result`) rather than `jsonb` for a stable, typed contract;
  the server can read fields directly or serialise to JSON as needed.
- **`xp_to_level`** is written in `plpgsql` with `OUT` params (returns a single
  record). It is `IMMUTABLE` and guards against `NULL`/negative input
  (`greatest(coalesce(total,0),0)`).
- **Idempotent re-run:** the migration uses `IF NOT EXISTS` / `OR REPLACE` and a
  guarded `CREATE TYPE`, so re-running it does not error. Re-creating the tables
  themselves is intentionally **not** idempotent (no `DROP TABLE`) to avoid ever
  wiping player data; assume a fresh DB for the table DDL.
- Nothing in this directory has been executed, deployed, or tested against a
  live Supabase/Postgres instance.
