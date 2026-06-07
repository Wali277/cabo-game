-- =============================================================================
-- LUMO — COMBINED SETUP SQL (paste ALL of this into the Supabase SQL Editor)
-- Runs migrations 0001–0005 in order. Safe to re-run.
-- If 0001–0004 are already applied, you can paste just 0005_recolor_settings.sql.
-- =============================================================================

-- =============================================================================
-- 0001_accounts.sql
-- Lumo — accounts & progression schema
-- -----------------------------------------------------------------------------
-- This migration creates the entire database layer for the Lumo accounts /
-- progression system:
--
--   * public.profiles   — 1:1 with auth.users; the single source of truth for a
--                         player's XP, level, tokens and cosmetic unlocks.
--   * public.xp_grants  — append-only ledger that makes XP grants idempotent and
--                         auditable (one row per finished game).
--   * public.xp_to_level(int)        — pure helper: total XP -> (level, progress).
--   * public.grant_xp(...)           — the ONLY supported write path; awards XP,
--                                      recomputes level, grants milestone tokens.
--
-- SECURITY MODEL (read this before touching the policies):
--   The browser/client uses the *anon* / *authenticated* role. Those roles get
--   SELECT-ONLY access to a player's OWN profile (and own ledger rows) via RLS.
--   They CANNOT insert/update/delete anything. Every mutation flows through the
--   trusted game server, which connects with the *service_role* key. service_role
--   bypasses RLS entirely, so progression can only ever change server-side.
--
--   grant_xp() is additionally SECURITY DEFINER with a locked search_path, and is
--   EXECUTE-able by service_role only. The client literally has no granted path
--   to mutate XP, tokens, or unlocks.
--
-- This migration assumes a fresh database but is written to be safely
-- re-runnable where Postgres allows it (IF NOT EXISTS / OR REPLACE / idempotent
-- GRANT/REVOKE). Re-creating the tables themselves would require a DROP and is
-- intentionally NOT idempotent (we do not want to silently wipe player data).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
-- citext: case-insensitive text. We use it for usernames so that "Wali",
-- "wali" and "WALI" collide on the UNIQUE index (no two players can register
-- visually-identical names that differ only in case).
create extension if not exists citext;


-- =============================================================================
-- Table: public.profiles
-- One row per authenticated user. Created/maintained exclusively by the trusted
-- server (service_role). The client may only SELECT its own row.
-- =============================================================================
create table if not exists public.profiles (
  -- Primary key IS the auth user id. ON DELETE CASCADE means deleting the auth
  -- user (e.g. account deletion) tears down the profile automatically.
  id                                uuid        primary key
                                                references auth.users (id)
                                                on delete cascade,

  -- Case-insensitive, globally-unique handle. The CHECK below mirrors the
  -- server-side validation (defense in depth — the server validates first).
  username                          citext      not null unique,

  -- Lifetime XP. THIS is the source of truth; `level` is a cache derived from it
  -- via public.xp_to_level(). Never decreases in normal play.
  total_xp                          bigint      not null default 0,

  -- Cached level, recomputed from total_xp on every XP grant. Stored so reads
  -- (leaderboards, profile cards) don't have to call xp_to_level() every time.
  level                             int         not null default 1,

  -- Soft currency. Earned via level milestones (see grant_xp / xp_to_level docs)
  -- and spent on cosmetics. Only ever changed by the server.
  tokens                            int         not null default 0,

  -- The highest level-milestone we have ALREADY paid tokens for. Guarantees that
  -- re-processing or out-of-order grants can never double-pay a milestone: we
  -- only ever award milestones strictly greater than this watermark, then raise
  -- it. Starts at 0 (no milestone reached yet; first milestone is level 10).
  highest_token_milestone_rewarded  int         not null default 0,

  -- Cosmetic unlock inventories. Defaults match the IDs the client ships with
  -- for brand-new players:
  --   * 'classic' is the always-available default card skin.
  --   * 'emerald' (Emerald Felt) and 'crimson' (labelled "Royal Crimson" in the
  --     UI, but the client's stored id is 'crimson') are the starter wallpapers.
  unlocked_skins                    text[]      not null default '{classic}',
  unlocked_wallpapers               text[]      not null default '{emerald,crimson}',

  -- Currently-equipped cosmetics (must be a member of the matching unlocked_*
  -- array; the server enforces that invariant on write).
  active_skin                       text        not null default 'classic',
  active_wallpaper                  text        not null default 'emerald',

  -- Optional custom card colours. Nullable = "use the skin's defaults".
  -- Expected shape: { "body": "#RRGGBB", "border": "#RRGGBB" }.
  custom_card_colors                jsonb,

  created_at                        timestamptz not null default now(),
  updated_at                        timestamptz not null default now(),

  -- Username format guard. 3–20 chars, letters/digits/underscore only.
  -- citext does not change which characters are allowed, only comparison
  -- case-sensitivity, so this regex behaves as written. Defense-in-depth: the
  -- trusted server validates the same rule before ever calling the DB.
  constraint profiles_username_format
    check (username ~ '^[a-zA-Z0-9_]{3,20}$')
);

comment on table  public.profiles is
  'One row per auth.users user. Source of truth for progression and cosmetic unlocks. Client has SELECT-only RLS on its own row; all writes go through the server (service_role).';
comment on column public.profiles.total_xp is
  'Lifetime XP. Source of truth; `level` is derived/cached from this via public.xp_to_level().';
comment on column public.profiles.level is
  'Cached level, recomputed from total_xp on every grant.';
comment on column public.profiles.highest_token_milestone_rewarded is
  'Watermark of the highest level-milestone already paid in tokens. Prevents double-granting; only milestones > this value are ever awarded.';
comment on column public.profiles.unlocked_wallpapers is
  'Wallpaper ids. Note: the wallpaper the spec calls "royal_crimson" is stored under the existing client id "crimson".';
comment on column public.profiles.custom_card_colors is
  'Nullable JSON of shape { "body": "#RRGGBB", "border": "#RRGGBB" }; null = use skin defaults.';


-- -----------------------------------------------------------------------------
-- updated_at auto-touch trigger
-- BEFORE UPDATE: stamp updated_at = now() on every change so callers never have
-- to remember to set it (and can't forge an older timestamp).
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
-- Lock search_path so the function body can't be hijacked by a malicious
-- temp object shadowing an unqualified name.
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger fn: forces updated_at = now() on every row update.';

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();


-- =============================================================================
-- Table: public.xp_grants
-- Append-only idempotency ledger + audit trail. One row per finished game.
-- The UNIQUE (user_id, game_key) is what makes grant_xp() safe to retry: a
-- replayed grant collides on the index and becomes a no-op.
-- =============================================================================
create table if not exists public.xp_grants (
  id          bigint      generated always as identity primary key,

  user_id     uuid        not null
                          references public.profiles (id) on delete cascade,

  -- Caller-supplied dedupe key, unique per user. Typically a game/match id.
  game_key    text        not null,

  -- Which mode produced the XP. 'sp' = single-player vs bots, 'mp' = online.
  source      text        not null check (source in ('sp', 'mp')),

  amount      int         not null,

  created_at  timestamptz not null default now(),

  -- The dedupe constraint. Re-granting the same (user, game) does nothing.
  constraint xp_grants_user_game_unique unique (user_id, game_key),

  -- Defense-in-depth (review M1): only the trusted server calls grant_xp, but a
  -- non-negative guard guarantees a bad/negative amount can never REGRESS a
  -- player's total_xp or level.
  constraint xp_grants_amount_nonneg check (amount >= 0)
);

comment on table  public.xp_grants is
  'Append-only ledger of XP awards. UNIQUE(user_id, game_key) makes grant_xp idempotent (replays are no-ops). Service-role write only; user may SELECT own rows.';
comment on column public.xp_grants.game_key is
  'Caller-supplied idempotency key, unique per user (typically the match/game id).';
comment on column public.xp_grants.source is
  'Origin of the grant: ''sp'' (single-player vs bots) or ''mp'' (online multiplayer).';

-- Index to make "show me my grant history (newest first)" cheap. The UNIQUE
-- constraint already covers (user_id, game_key) lookups.
create index if not exists xp_grants_user_created_idx
  on public.xp_grants (user_id, created_at desc);


-- =============================================================================
-- Function: public.xp_to_level(total int)
-- Pure, IMMUTABLE mapping from lifetime XP to level + progress within that level.
--
-- Returns (level, xp_into_level, xp_for_next):
--   level         — 1-based level for `total` XP.
--   xp_into_level — XP accumulated since reaching `level` (the rollover).
--   xp_for_next   — XP cost to advance FROM the current level to the next.
--
-- Per-level cost (cost to leave level L):
--   L <= 9  -> 1500
--   L <= 19 -> 2500
--   else    -> 3000
--
-- Algorithm (rollover): start level=1, remaining=total; repeatedly subtract the
-- current level's cost while remaining >= cost, incrementing level. Stop when
-- remaining < cost; return level, remaining (xp_into_level) and cost (xp_for_next).
--
-- IMMUTABLE: output depends only on the input. search_path locked to '' and all
-- references are built-in, so there's nothing to hijack.
-- =============================================================================
create or replace function public.xp_to_level(
  total bigint,
  out level int,
  out xp_into_level int,
  out xp_for_next int
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  remaining bigint := greatest(coalesce(total, 0), 0);  -- guard nulls / negatives
  cost      int;
begin
  level := 1;

  loop
    -- Cost to advance FROM the current level.
    if level <= 9 then
      cost := 1500;
    elsif level <= 19 then
      cost := 2500;
    else
      cost := 3000;
    end if;

    if remaining >= cost then
      remaining := remaining - cost;
      level := level + 1;
      -- continue looping
    else
      exit;
    end if;
  end loop;

  xp_into_level := remaining;   -- leftover XP inside the current level
  xp_for_next   := cost;        -- cost to reach the next level
end;
$$;

comment on function public.xp_to_level(bigint) is
  'IMMUTABLE. Maps lifetime XP -> (level, xp_into_level, xp_for_next). Level cost: <=9 =>1500, <=19 =>2500, else 3000.';


-- =============================================================================
-- Return type: public.grant_xp_result
-- A named composite so callers (the server) get a stable, documented shape.
-- =============================================================================
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'grant_xp_result'
      and n.nspname = 'public'
  ) then
    create type public.grant_xp_result as (
      total_xp      bigint, -- new lifetime XP (== old if this was a replay)
      level         int,   -- new (cached) level
      tokens        int,   -- new token balance
      xp_into_level int,   -- progress within the new level
      xp_for_next   int,   -- cost to advance from the new level
      leveled_up    boolean, -- new_level > old_level
      tokens_earned int,   -- tokens granted by THIS call (0 on replay / no milestone)
      old_level     int,   -- level before this call
      new_level     int    -- level after this call (== `level`)
    );
  end if;
end;
$$;

comment on type public.grant_xp_result is
  'Return shape of public.grant_xp(). On an idempotent replay, totals equal the current state and leveled_up=false, tokens_earned=0.';


-- =============================================================================
-- Function: public.grant_xp(p_user, p_game_key, p_amount, p_source)
-- The single supported write path for progression.
--
-- SECURITY DEFINER so it can write profiles/xp_grants regardless of the caller's
-- table privileges — but it is EXECUTE-granted to service_role ONLY (see the
-- GRANT/REVOKE block below), so only the trusted server can invoke it.
--
-- Flow:
--   1. Idempotent insert into the ledger. ON CONFLICT DO NOTHING; if nothing was
--      inserted, this (user, game_key) was already processed -> return the
--      current profile state as a no-op (tokens_earned=0, leveled_up=false).
--   2. Lock the profile row FOR UPDATE (serialize concurrent grants for a user).
--   3. Recompute level from new_total via xp_to_level().
--   4. Award level-milestone tokens for every milestone in
--      (highest_token_milestone_rewarded, new_level]:
--        reward(10)=1, reward(20)=2, reward(M>=30, M%10==0)=1.
--      Raise the watermark to the largest milestone crossed.
--   5. Persist and return the new state.
--
-- search_path is locked to '' and every object is fully-qualified.
-- =============================================================================
create or replace function public.grant_xp(
  p_user     uuid,
  p_game_key text,
  p_amount   int,
  p_source   text
)
returns public.grant_xp_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- ROW_COUNT from GET DIAGNOSTICS is an integer count (bigint); 0 => the
  -- ON CONFLICT DO NOTHING insert was a duplicate, >=1 => a row was inserted.
  v_rows_inserted   bigint;
  v_profile         public.profiles%rowtype;
  v_old_level       int;
  v_new_total       bigint;
  v_calc            record;        -- (level, xp_into_level, xp_for_next)
  v_tokens_earned   int := 0;
  v_new_high        int;
  v_milestone       int;
  v_result          public.grant_xp_result;
begin
  -- --- 1. Idempotency -------------------------------------------------------
  -- Try to record this grant. If the (user, game_key) pair already exists the
  -- insert affects zero rows and we treat the whole call as a no-op replay.
  insert into public.xp_grants (user_id, game_key, source, amount)
  values (p_user, p_game_key, p_source, p_amount)
  on conflict (user_id, game_key) do nothing;

  get diagnostics v_rows_inserted = row_count;   -- 1 = inserted, 0 = duplicate

  if v_rows_inserted = 0 then
    -- Already processed. Return the CURRENT state unchanged.
    select * into v_profile from public.profiles where id = p_user;
    if not found then
      raise exception
        'grant_xp: profile % not found (duplicate grant for game_key=%)',
        p_user, p_game_key
        using errcode = 'no_data_found';
    end if;

    select c.level, c.xp_into_level, c.xp_for_next
      into v_calc
      from public.xp_to_level(v_profile.total_xp) as c;

    v_result := (
      v_profile.total_xp,
      v_profile.level,
      v_profile.tokens,
      v_calc.xp_into_level,
      v_calc.xp_for_next,
      false,                 -- leveled_up
      0,                     -- tokens_earned
      v_profile.level,       -- old_level
      v_profile.level        -- new_level
    )::public.grant_xp_result;
    return v_result;
  end if;

  -- --- 2. Lock the profile --------------------------------------------------
  -- FOR UPDATE serializes concurrent grants for the same user so the
  -- read-modify-write below is race-free.
  select * into v_profile
    from public.profiles
    where id = p_user
    for update;

  if not found then
    -- We just inserted a ledger row for a user with no profile. Abort so the
    -- transaction (including that ledger insert) rolls back atomically.
    raise exception 'grant_xp: profile % does not exist', p_user
      using errcode = 'foreign_key_violation';
  end if;

  -- --- 3. Recompute level ---------------------------------------------------
  v_old_level := v_profile.level;
  v_new_total := v_profile.total_xp + p_amount;

  select c.level, c.xp_into_level, c.xp_for_next
    into v_calc
    from public.xp_to_level(v_new_total) as c;

  -- --- 4. Token milestones --------------------------------------------------
  -- Milestones are levels 10, 20, 30, 40, ... Award every milestone strictly
  -- above the stored watermark and at/below the new level, then raise the
  -- watermark to the largest one crossed.
  v_new_high  := v_profile.highest_token_milestone_rewarded;
  v_milestone := 10;
  while v_milestone <= v_calc.level loop
    if v_milestone > v_profile.highest_token_milestone_rewarded then
      -- reward(M): 10 -> 1, 20 -> 2, every other multiple of 10 (>=30) -> 1.
      if v_milestone = 10 then
        v_tokens_earned := v_tokens_earned + 1;
      elsif v_milestone = 20 then
        v_tokens_earned := v_tokens_earned + 2;
      else
        -- v_milestone is a multiple of 10 and >= 30 by construction.
        v_tokens_earned := v_tokens_earned + 1;
      end if;
      v_new_high := v_milestone;   -- largest crossed so far
    end if;
    v_milestone := v_milestone + 10;
  end loop;

  -- --- 5. Persist + return --------------------------------------------------
  update public.profiles
     set total_xp                         = v_new_total,
         level                            = v_calc.level,
         tokens                           = tokens + v_tokens_earned,
         highest_token_milestone_rewarded = v_new_high
         -- updated_at handled by trg_profiles_updated_at
   where id = p_user
   returning * into v_profile;

  v_result := (
    v_profile.total_xp,
    v_profile.level,
    v_profile.tokens,
    v_calc.xp_into_level,
    v_calc.xp_for_next,
    (v_calc.level > v_old_level),   -- leveled_up
    v_tokens_earned,
    v_old_level,
    v_calc.level                    -- new_level
  )::public.grant_xp_result;

  return v_result;
end;
$$;

comment on function public.grant_xp(uuid, text, int, text) is
  'SECURITY DEFINER, service_role-only. Idempotently grants XP for (p_user, p_game_key); recomputes level; awards level-milestone tokens (10=>+1, 20=>+2, every +10 thereafter =>+1). Returns public.grant_xp_result. Replays are no-ops.';


-- =============================================================================
-- Row Level Security
-- =============================================================================

-- ---- profiles ----
alter table public.profiles enable row level security;
-- Force RLS even for the table owner, so a mis-scoped connection can't slip
-- past the policies. service_role BYPASSES RLS regardless of this setting.
alter table public.profiles force row level security;

-- The ONLY policy for the client: a logged-in user may read its own row.
-- There is deliberately NO insert/update/delete policy for authenticated, so
-- the client cannot write any column. All writes happen via the server
-- (service_role), which bypasses RLS.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- ---- xp_grants ----
alter table public.xp_grants enable row level security;
alter table public.xp_grants force row level security;

-- Optional convenience: let a user read their OWN grant history. No write
-- policy exists, so inserts/updates/deletes remain service-role only.
drop policy if exists xp_grants_select_own on public.xp_grants;
create policy xp_grants_select_own
  on public.xp_grants
  for select
  to authenticated
  using (auth.uid() = user_id);


-- =============================================================================
-- Hard privilege lockdown (belt-and-suspenders alongside RLS)
-- =============================================================================
-- RLS already blocks client writes, but we also strip the table-level
-- INSERT/UPDATE/DELETE grants from the anon & authenticated roles so there is
-- categorically no client write path even if a policy were added by mistake.
revoke insert, update, delete on public.profiles  from anon, authenticated;
revoke insert, update, delete on public.xp_grants from anon, authenticated;
-- Review H1 (belt-and-suspenders): some Supabase stack versions grant table
-- privileges to PUBLIC rather than to the anon/authenticated roles; revoking
-- only from those roles would then leave a PUBLIC write path. Revoke from PUBLIC
-- too so the client lockdown is total regardless of how the stack bootstrapped.
revoke insert, update, delete on public.profiles  from public;
revoke insert, update, delete on public.xp_grants from public;

-- Make sure the read paths the client DOES need are present (Supabase grants
-- these to anon/authenticated by default, but assert them explicitly so this
-- migration is self-contained). RLS still constrains WHICH rows are visible.
grant select on public.profiles  to authenticated;
grant select on public.xp_grants to authenticated;

-- grant_xp must be callable by the trusted server only. PUBLIC gets EXECUTE on
-- new functions by default, so revoke broadly and then grant just service_role.
revoke execute on function public.grant_xp(uuid, text, int, text)
  from public, anon, authenticated;
grant  execute on function public.grant_xp(uuid, text, int, text)
  to service_role;

-- xp_to_level is a harmless pure helper; the client may call it for UI math.
grant execute on function public.xp_to_level(bigint) to anon, authenticated, service_role;

-- =============================================================================
-- End of 0001_accounts.sql
-- =============================================================================


-- =============================================================================
-- 0002_email_codes.sql
-- Lumo — email verification / password-reset code store
-- -----------------------------------------------------------------------------
-- Sibling migration to 0001_accounts.sql. Adds the ONE table the trusted-server
-- auth layer needs in Phase 1:
--
--   * public.email_codes — short-lived 6-digit codes for email verification
--                          (purpose='signup') and password reset
--                          (purpose='reset'), stored HASHED, never plaintext.
--
-- SECURITY MODEL (read this before touching the policies — it is STRICTER than
-- the profiles/xp_grants model in 0001):
--   These rows are SECRETS. Unlike profiles (which clients may SELECT for their
--   own row), email_codes must NEVER be readable by the browser/desktop client.
--   A client that could read code_hash, attempts, or expiry could brute-force or
--   replay verification offline. Therefore:
--     * RLS is ENABLED *and* FORCED.
--     * There are NO policies for anon/authenticated (so neither role can read
--       or write any row — RLS with zero applicable policies denies everything).
--     * SELECT/INSERT/UPDATE/DELETE are REVOKEd from anon, authenticated, public.
--   The ONLY accessor is the trusted game server using the service_role key,
--   which bypasses RLS entirely. All code issuance and verification happen
--   server-side (see server/src/auth/codes.ts).
--
--   The plaintext 6-digit code is emailed to the user via Resend and is NEVER
--   stored or logged. We persist only code_hash = HMAC-SHA256(code) keyed by the
--   server-only AUTH_CODE_SECRET, so a database leak does not reveal live codes.
--
-- Like 0001, this migration is written to be safely re-runnable where Postgres
-- allows it (IF NOT EXISTS / idempotent GRANT/REVOKE). Re-creating the table is
-- intentionally NOT idempotent (no DROP TABLE) to avoid wiping in-flight codes.
-- =============================================================================


-- citext is already created by 0001_accounts.sql; this is a no-op guard so the
-- file is self-describing and order-independent if applied standalone.
create extension if not exists citext;


-- =============================================================================
-- Table: public.email_codes
-- One row per issued code. Newest unconsumed, non-expired row for a given
-- (email, purpose) is the "active" code. Older rows are left in place as an
-- audit trail / rate-limit accounting source and are simply ignored once
-- consumed or expired. (A periodic cleanup job MAY prune expired rows later;
-- not required for correctness.)
-- =============================================================================
create table if not exists public.email_codes (
  id          bigint      generated always as identity primary key,

  -- Owning user. ON DELETE CASCADE so deleting the profile (and thus the auth
  -- user) tears down any outstanding codes automatically.
  user_id     uuid        not null
                          references public.profiles (id) on delete cascade,

  -- The email the code was issued to. Stored (case-insensitively) so the server
  -- can look up a code by email BEFORE any session exists — e.g. during signup
  -- verification or password reset, when the user is not logged in. Mirrors the
  -- user's auth email at issue time.
  email       citext      not null,

  -- What this code authorises. 'signup' = confirm a new account's email,
  -- 'reset' = authorise a password reset. The CHECK keeps the column honest.
  purpose     text        not null check (purpose in ('signup', 'reset')),

  -- HMAC-SHA256(code) hex digest, keyed by the server-only AUTH_CODE_SECRET.
  -- NEVER the plaintext code. A timing-safe hash comparison is done server-side.
  code_hash   text        not null,

  -- Number of failed verify attempts against THIS code. Once it reaches the
  -- server's CODE_MAX_VERIFY_ATTEMPTS the code is locked and the user must
  -- request a fresh one. (Enforced in server code; stored here so the limit
  -- survives across requests.)
  attempts    int         not null default 0,

  -- Absolute expiry. A code with expires_at <= now() can never verify, even if
  -- unconsumed. Set by the server to issued-time + CODE_EXPIRY_MIN.
  expires_at  timestamptz not null,

  -- Stamped when the code is successfully used. NULL = still usable. A non-null
  -- consumed_at makes the code single-use: it can never verify again.
  consumed_at timestamptz,

  created_at  timestamptz not null default now()
);

comment on table  public.email_codes is
  'Short-lived HASHED 6-digit codes for email verification (signup) and password reset. SECRETS: service-role only, no client read/write. Plaintext code is emailed via Resend and never stored or logged.';
comment on column public.email_codes.email is
  'Email the code was issued to (citext). Lets the server look up a code before a session exists (signup verify / password reset).';
comment on column public.email_codes.purpose is
  'What the code authorises: ''signup'' (confirm new account email) or ''reset'' (authorise password reset).';
comment on column public.email_codes.code_hash is
  'HMAC-SHA256(code) hex keyed by server-only AUTH_CODE_SECRET. Never the plaintext code; compared timing-safe server-side.';
comment on column public.email_codes.attempts is
  'Failed verify attempts against this code. At CODE_MAX_VERIFY_ATTEMPTS the code is locked (server-enforced); user must request a new one.';
comment on column public.email_codes.expires_at is
  'Absolute expiry (issued-time + CODE_EXPIRY_MIN). A code at/after this instant can never verify.';
comment on column public.email_codes.consumed_at is
  'Set on successful use; makes the code single-use. NULL = still usable.';


-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
-- Primary access pattern for verifyCode(): fetch the NEWEST row for a given
-- (email, purpose). Composite + DESC created_at lets the server take the latest
-- code in one indexed lookup.
create index if not exists email_codes_email_purpose_idx
  on public.email_codes (email, purpose, created_at desc);

-- Rate-limit accounting for issueCode(): count this user's recent codes of a
-- purpose within the sliding window. (user_id, purpose, created_at desc) makes
-- "how many codes did this user request lately?" cheap.
create index if not exists email_codes_user_purpose_created_idx
  on public.email_codes (user_id, purpose, created_at desc);


-- =============================================================================
-- Row Level Security — DENY-ALL for clients
-- =============================================================================
-- Enable + FORCE RLS. With RLS enabled and NO policies defined, every row is
-- invisible/untouchable to anon & authenticated. service_role bypasses RLS, so
-- only the trusted server can read or write codes. FORCE additionally applies
-- RLS to the table owner so a mis-scoped owner connection can't slip past.
alter table public.email_codes enable row level security;
alter table public.email_codes force  row level security;

-- Deliberately NO policies here. (Contrast with 0001's profiles_select_own.)
-- Codes are secrets; clients get zero access. Do not add a policy without a
-- security review.


-- =============================================================================
-- Hard privilege lockdown (belt-and-suspenders alongside deny-all RLS)
-- =============================================================================
-- Strip ALL table DML from the client roles. Even though zero policies already
-- denies everything, we also revoke the grants so there is categorically no
-- client path even if a policy were added by mistake. SELECT is revoked too —
-- these rows must never be read client-side.
revoke select, insert, update, delete on public.email_codes from anon, authenticated;
-- Some Supabase stack versions grant table privileges to PUBLIC rather than to
-- anon/authenticated; revoke from PUBLIC too so the lockdown is total regardless
-- of how the stack bootstrapped. (Same H1 rationale as 0001.)
revoke select, insert, update, delete on public.email_codes from public;

-- NOTE: we intentionally do NOT `grant ... to service_role`. service_role
-- bypasses RLS and already has full table access in the Supabase stack; an
-- explicit grant is unnecessary and would only widen the surface.

-- =============================================================================
-- End of 0002_email_codes.sql
-- =============================================================================


-- =============================================================================
-- 0003_code_rpcs.sql
-- Lumo — atomic SECURITY DEFINER RPCs for email-code verify + issue
-- -----------------------------------------------------------------------------
-- Sibling migration to 0002_email_codes.sql. Moves the two race-prone steps of
-- the email-code flow OUT of the application (server/src/auth/codes.ts) and into
-- the database, so concurrent requests cannot bypass the attempt cap or the
-- per-window issuance cap:
--
--   * public.verify_code(...)  — atomic verify. Selects the active code FOR
--                                UPDATE so parallel guesses serialize on the row;
--                                the 5-attempt lockout can no longer be defeated
--                                by firing many guesses at once (review B2/H1).
--   * public.issue_code(...)   — atomic issue. Takes a per-(user,purpose)
--                                advisory transaction lock so the count-then-
--                                insert rate-limit window can't be over-issued by
--                                concurrent requests (review H1).
--
-- SECURITY MODEL (identical posture to grant_xp in 0001 and the email_codes
-- lockdown in 0002):
--   Both functions are SECURITY DEFINER with `search_path = ''` and every object
--   fully-qualified, so a malicious temp object can't hijack an unqualified name.
--   They read/write public.email_codes — which is service-role-only — so they are
--   EXECUTE-granted to service_role ONLY and REVOKEd from public/anon/authenticated.
--   The client has no granted path to verify or issue codes; only the trusted
--   server (service_role key) can call these.
--
--   NOTE on hash comparison: code_hash is an HMAC-SHA256 hex digest keyed by the
--   server-only AUTH_CODE_SECRET. Comparing two such digests with `=` is safe —
--   an attacker cannot forge the HMAC without the secret, so equality-timing
--   leaks nothing about the code (there is no secret-dependent string to probe).
--   The plaintext code is never passed to these functions, stored, or logged.
--
-- Like 0001/0002, this migration is safely re-runnable (CREATE OR REPLACE +
-- idempotent GRANT/REVOKE). It creates no tables.
-- =============================================================================


-- =============================================================================
-- Function: public.verify_code(p_email, p_purpose, p_code_hash, p_max_attempts)
-- Atomic verification of the active code for (p_email, p_purpose).
--
-- Selects the NEWEST unconsumed, non-expired code FOR UPDATE so concurrent
-- verifies of the same code serialize on that row — closing the read-modify-write
-- race that previously let parallel wrong guesses exceed the attempt cap.
--
-- Returns one row (status, user_id, attempts_left):
--   'no_code'  — no active code (never issued, already used, or expired).
--   'locked'   — attempts already >= p_max_attempts; user must request a new code.
--   'ok'       — hash matched; the code is consumed (single-use) and user_id set.
--   'mismatch' — wrong code; attempts incremented; attempts_left is what remains.
--
-- SECURITY DEFINER, search_path locked to '', service_role-only EXECUTE.
-- =============================================================================
create or replace function public.verify_code(
  p_email citext, p_purpose text, p_code_hash text, p_max_attempts int
) returns table(status text, user_id uuid, attempts_left int)
language plpgsql security definer set search_path = '' as $$
declare v public.email_codes%rowtype;
begin
  select * into v from public.email_codes
    where email = p_email and purpose = p_purpose
      and consumed_at is null and expires_at > now()
    order by created_at desc limit 1
    for update;                         -- serialize concurrent verifies on this row
  if not found then
    return query select 'no_code'::text, null::uuid, 0; return;
  end if;
  if v.attempts >= p_max_attempts then
    return query select 'locked'::text, null::uuid, 0; return;
  end if;
  if v.code_hash = p_code_hash then
    update public.email_codes set consumed_at = now() where id = v.id;
    return query select 'ok'::text, v.user_id, (p_max_attempts - v.attempts); return;
  else
    update public.email_codes set attempts = attempts + 1 where id = v.id;
    return query select 'mismatch'::text, null::uuid, greatest(0, p_max_attempts - (v.attempts + 1)); return;
  end if;
end $$;

comment on function public.verify_code(citext, text, text, int) is
  'SECURITY DEFINER, service_role-only. Atomically verifies the active (email,purpose) code: selects the newest live row FOR UPDATE (serializes concurrent guesses so the attempt cap holds), then returns status no_code/locked/ok/mismatch with user_id (on ok) and attempts_left. Consumes the code on success.';


-- =============================================================================
-- Function: public.issue_code(p_user, p_email, p_purpose, p_code_hash,
--                             p_expires_at, p_max, p_window_start)
-- Atomic issuance with a sliding-window rate limit.
--
-- Takes a per-(user,purpose) advisory TRANSACTION lock so the count-then-insert
-- below is serialized for that user+purpose — closing the over-issue race where
-- concurrent requests could each count < p_max and all insert. Counts this
-- user's rows of the same purpose created since p_window_start; if already at the
-- cap, returns false (rate-limited) without inserting. Otherwise inserts a hashed
-- row and returns true.
--
-- Returns: true  = issued (caller emails the plaintext code it generated),
--          false = rate-limited (caller maps to a generic throttle message).
--
-- SECURITY DEFINER, search_path locked to '', service_role-only EXECUTE.
-- =============================================================================
create or replace function public.issue_code(
  p_user uuid, p_email citext, p_purpose text, p_code_hash text,
  p_expires_at timestamptz, p_max int, p_window_start timestamptz
) returns boolean              -- true = issued, false = rate-limited
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_purpose, 0));
  select count(*) into v_count from public.email_codes
    where user_id = p_user and purpose = p_purpose and created_at >= p_window_start;
  if v_count >= p_max then return false; end if;
  insert into public.email_codes(user_id, email, purpose, code_hash, expires_at)
    values (p_user, p_email, p_purpose, p_code_hash, p_expires_at);
  return true;
end $$;

comment on function public.issue_code(uuid, citext, text, text, timestamptz, int, timestamptz) is
  'SECURITY DEFINER, service_role-only. Atomically issues an email code under a per-(user,purpose) advisory xact lock: counts rows since p_window_start and returns false if >= p_max (rate-limited, nothing inserted), else inserts the hashed row and returns true. Closes the count-then-insert over-issue race.';


-- =============================================================================
-- Hard privilege lockdown (same posture as grant_xp in 0001)
-- =============================================================================
-- Both functions read/write the secret email_codes table, so only the trusted
-- server (service_role) may call them. PUBLIC gets EXECUTE on new functions by
-- default, so revoke broadly first, then grant just service_role.
revoke execute on function public.verify_code(citext, text, text, int)
  from public, anon, authenticated;
grant  execute on function public.verify_code(citext, text, text, int)
  to service_role;

revoke execute on function public.issue_code(uuid, citext, text, text, timestamptz, int, timestamptz)
  from public, anon, authenticated;
grant  execute on function public.issue_code(uuid, citext, text, text, timestamptz, int, timestamptz)
  to service_role;

-- =============================================================================
-- End of 0003_code_rpcs.sql
-- =============================================================================


-- =============================================================================
-- 0004_cosmetics.sql
-- Lumo — Phase 6 "Styles store": atomic token-spend purchase + equip.
-- -----------------------------------------------------------------------------
-- Adds the ONLY supported write paths for cosmetics, both SECURITY DEFINER and
-- EXECUTE-able by service_role ONLY (the trusted Node server). The client has no
-- granted path to mutate tokens / unlocks / active cosmetics — exactly like
-- grant_xp in 0001. The SERVER owns prices; it passes the authoritative price to
-- purchase_cosmetic, so a tampered client cannot buy cheaper or for free.
--
--   * public.purchase_cosmetic(p_user, p_kind, p_id, p_price)
--       Atomically (profile row FOR UPDATE): reject if already owned, reject if
--       tokens < price, else deduct tokens and append the id to the matching
--       unlocked_* array. Returns the new (status, tokens, unlocked_*).
--   * public.equip_cosmetic(p_user, p_kind, p_id)
--       Set active_skin / active_wallpaper to p_id, but ONLY if the player owns
--       it (id is in the matching unlocked_* array). Returns (status, active_*).
--
-- Idempotency / races: the FOR UPDATE row lock serialises concurrent purchases
-- for a user, so a double-click / double-request can't double-spend — the second
-- call sees the item already owned and is a no-op.
--
-- Re-runnable (CREATE OR REPLACE + idempotent type creation + idempotent
-- GRANT/REVOKE). Creates no tables; reuses public.profiles from 0001.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Return composite types (named so the server gets a stable, documented shape).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'purchase_result' and n.nspname = 'public'
  ) then
    create type public.purchase_result as (
      status              text,    -- 'ok' | 'already_owned' | 'insufficient' | 'invalid'
      tokens              int,     -- new token balance
      unlocked_skins      text[],  -- new unlocked skin ids
      unlocked_wallpapers text[]   -- new unlocked wallpaper ids
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'equip_result' and n.nspname = 'public'
  ) then
    create type public.equip_result as (
      status           text,   -- 'ok' | 'not_owned' | 'invalid'
      active_skin      text,
      active_wallpaper text
    );
  end if;
end;
$$;


-- =============================================================================
-- Function: public.purchase_cosmetic(p_user, p_kind, p_id, p_price)
-- The ONLY supported cosmetic-purchase path. service_role-only.
-- =============================================================================
create or replace function public.purchase_cosmetic(
  p_user  uuid,
  p_kind  text,
  p_id    text,
  p_price int
)
returns public.purchase_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_owned   boolean;
begin
  -- Guard inputs. Bad kind / negative price → invalid (no mutation).
  if p_kind not in ('skin', 'wallpaper') then
    return ('invalid', null, null, null)::public.purchase_result;
  end if;
  if p_price is null or p_price < 0 then
    return ('invalid', null, null, null)::public.purchase_result;
  end if;

  -- Lock the profile row so concurrent purchases serialise (no double-spend).
  select * into v_profile from public.profiles where id = p_user for update;
  if not found then
    raise exception 'purchase_cosmetic: profile % not found', p_user
      using errcode = 'no_data_found';
  end if;

  -- Already owned? → no-op (idempotent on a double request).
  if p_kind = 'skin' then
    v_owned := p_id = any(v_profile.unlocked_skins);
  else
    v_owned := p_id = any(v_profile.unlocked_wallpapers);
  end if;
  if v_owned then
    return ('already_owned', v_profile.tokens,
            v_profile.unlocked_skins, v_profile.unlocked_wallpapers
           )::public.purchase_result;
  end if;

  -- Can they afford it?
  if v_profile.tokens < p_price then
    return ('insufficient', v_profile.tokens,
            v_profile.unlocked_skins, v_profile.unlocked_wallpapers
           )::public.purchase_result;
  end if;

  -- Charge + grant. array_append is safe (we proved not-owned above, so no dup).
  if p_kind = 'skin' then
    update public.profiles
       set tokens         = tokens - p_price,
           unlocked_skins = array_append(unlocked_skins, p_id)
     where id = p_user
     returning * into v_profile;
  else
    update public.profiles
       set tokens              = tokens - p_price,
           unlocked_wallpapers = array_append(unlocked_wallpapers, p_id)
     where id = p_user
     returning * into v_profile;
  end if;

  return ('ok', v_profile.tokens,
          v_profile.unlocked_skins, v_profile.unlocked_wallpapers
         )::public.purchase_result;
end;
$$;

comment on function public.purchase_cosmetic(uuid, text, text, int) is
  'SECURITY DEFINER, service_role-only. Atomically buys a cosmetic: rejects already-owned / insufficient tokens, else deducts p_price and appends p_id to unlocked_skins/unlocked_wallpapers. The server passes the authoritative price.';


-- =============================================================================
-- Function: public.equip_cosmetic(p_user, p_kind, p_id)
-- Equip an OWNED cosmetic. service_role-only.
-- =============================================================================
create or replace function public.equip_cosmetic(
  p_user uuid,
  p_kind text,
  p_id   text
)
returns public.equip_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_owned   boolean;
begin
  if p_kind not in ('skin', 'wallpaper') then
    return ('invalid', null, null)::public.equip_result;
  end if;

  select * into v_profile from public.profiles where id = p_user for update;
  if not found then
    raise exception 'equip_cosmetic: profile % not found', p_user
      using errcode = 'no_data_found';
  end if;

  -- Can only equip what you own. The free defaults (classic / emerald / crimson)
  -- are in the unlocked_* arrays by the 0001 DB default, so this allows them too.
  if p_kind = 'skin' then
    v_owned := p_id = any(v_profile.unlocked_skins);
  else
    v_owned := p_id = any(v_profile.unlocked_wallpapers);
  end if;
  if not v_owned then
    return ('not_owned', v_profile.active_skin, v_profile.active_wallpaper)::public.equip_result;
  end if;

  if p_kind = 'skin' then
    update public.profiles set active_skin = p_id where id = p_user returning * into v_profile;
  else
    update public.profiles set active_wallpaper = p_id where id = p_user returning * into v_profile;
  end if;

  return ('ok', v_profile.active_skin, v_profile.active_wallpaper)::public.equip_result;
end;
$$;

comment on function public.equip_cosmetic(uuid, text, text) is
  'SECURITY DEFINER, service_role-only. Sets active_skin/active_wallpaper to p_id ONLY if the player owns it (id in unlocked_*); otherwise returns status not_owned.';


-- =============================================================================
-- Hard privilege lockdown (same posture as grant_xp in 0001).
-- =============================================================================
revoke execute on function public.purchase_cosmetic(uuid, text, text, int)
  from public, anon, authenticated;
grant  execute on function public.purchase_cosmetic(uuid, text, text, int)
  to service_role;

revoke execute on function public.equip_cosmetic(uuid, text, text)
  from public, anon, authenticated;
grant  execute on function public.equip_cosmetic(uuid, text, text)
  to service_role;

-- =============================================================================
-- End of 0004_cosmetics.sql
-- =============================================================================


-- =============================================================================
-- 0005_recolor_settings.sql
-- Lumo — Phase 7 "Recolor + Settings" DB changes.
-- -----------------------------------------------------------------------------
-- Two small, idempotent changes (no new tables):
--
--   1. RECOLOR — make the free "custom" card skin ownable by everyone. The
--      `custom_card_colors` jsonb column already exists (0001). We just add
--      'custom' to every profile's unlocked_skins (and the column default) so it
--      can be equipped through the normal equip path. Its tint comes from
--      custom_card_colors, saved via the trusted server (/account/card-colors).
--
--   2. SETTINGS (email change) — allow a third email-code purpose 'change_email'
--      so changing your account email can be re-verified with a 6-digit code to
--      the NEW address (same issue/verify RPCs as signup/reset).
--
-- Safe to re-run.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Recolor: everyone owns the free "custom" skin.
-- -----------------------------------------------------------------------------
-- New signups get it by default.
alter table public.profiles
  alter column unlocked_skins set default '{classic,custom}';

-- Backfill existing accounts (don't duplicate if somehow already present).
update public.profiles
   set unlocked_skins = array_append(unlocked_skins, 'custom')
 where not ('custom' = any(unlocked_skins));


-- -----------------------------------------------------------------------------
-- 2. Settings: add the 'change_email' code purpose.
-- -----------------------------------------------------------------------------
-- The 0002 CHECK was `purpose in ('signup','reset')` (auto-named
-- email_codes_purpose_check). Widen it to include 'change_email'.
alter table public.email_codes
  drop constraint if exists email_codes_purpose_check;
alter table public.email_codes
  add constraint email_codes_purpose_check
  check (purpose in ('signup', 'reset', 'change_email'));

-- =============================================================================
-- End of 0005_recolor_settings.sql
-- =============================================================================


