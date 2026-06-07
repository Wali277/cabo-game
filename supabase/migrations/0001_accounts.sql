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
  'Nullable JSON of shape { "body": "#RRGGBB", "border": "#RRGGBB" }; missing fields default to CUSTOM_SKIN_DEFAULTS; null = use skin defaults.';


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
