-- =============================================================================
-- 0006_level_rewards_redeem.sql
-- Lumo — level-reward cosmetics + redeem-code system.
-- -----------------------------------------------------------------------------
-- Two additions, both server-authoritative (service_role only), idempotent:
--
--   1. LEVEL-REWARD SKIN — the "custom" (Recolor) card skin is no longer free.
--      It is UNLOCKED as a reward for reaching LEVEL 2. public.grant_xp is
--      extended so that, when a grant takes an account to level >= 2, 'custom'
--      is appended to unlocked_skins (atomic with the XP/level/token update). A
--      one-time backfill grants it to any account already at level >= 2.
--
--   2. REDEEM CODES — public.code_redemptions (one row per account+code, UNIQUE
--      so a code can be redeemed at most once per account) + public.redeem_code,
--      which atomically records the redemption and credits the SERVER-supplied
--      token amount. The server owns the catalog + amounts (server/src/auth/
--      redeemCodes.ts); the client only submits a code string. Mirrors the
--      grant_xp / purchase_cosmetic security posture exactly.
--
-- Re-runnable: CREATE OR REPLACE, idempotent type/table creation, idempotent
-- GRANT/REVOKE. The backfill is guarded so re-running never duplicates 'custom'.
-- =============================================================================


-- =============================================================================
-- PART 1 — grant_xp: unlock the "custom" skin at level 2.
-- -----------------------------------------------------------------------------
-- Identical to the 0001 definition EXCEPT the final persist now also appends
-- 'custom' to unlocked_skins once the (new) level is >= 2. The return shape
-- (public.grant_xp_result) is unchanged, so this is a safe in-place replace.
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
  select * into v_profile
    from public.profiles
    where id = p_user
    for update;

  if not found then
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
  v_new_high  := v_profile.highest_token_milestone_rewarded;
  v_milestone := 10;
  while v_milestone <= v_calc.level loop
    if v_milestone > v_profile.highest_token_milestone_rewarded then
      if v_milestone = 10 then
        v_tokens_earned := v_tokens_earned + 1;
      elsif v_milestone = 20 then
        v_tokens_earned := v_tokens_earned + 2;
      else
        v_tokens_earned := v_tokens_earned + 1;
      end if;
      v_new_high := v_milestone;   -- largest crossed so far
    end if;
    v_milestone := v_milestone + 10;
  end loop;

  -- --- 5. Persist + return --------------------------------------------------
  -- LEVEL-REWARD: reaching level >= 2 unlocks the 'custom' (Recolor) skin. The
  -- CASE references the OLD column value (pre-update), so it appends exactly
  -- once and is a no-op if already present (idempotent across replays / backfill).
  update public.profiles
     set total_xp                         = v_new_total,
         level                            = v_calc.level,
         tokens                           = tokens + v_tokens_earned,
         highest_token_milestone_rewarded = v_new_high,
         unlocked_skins                   = case
           when v_calc.level >= 2 and not ('custom' = any(unlocked_skins))
             then array_append(unlocked_skins, 'custom')
           else unlocked_skins
         end
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
  'SECURITY DEFINER, service_role-only. Idempotently grants XP for (p_user, p_game_key); recomputes level; awards level-milestone tokens (10=>+1, 20=>+2, every +10 thereafter =>+1); and unlocks the level-reward skin ''custom'' on reaching level 2. Returns public.grant_xp_result. Replays are no-ops.';


-- -----------------------------------------------------------------------------
-- Backfill: grant 'custom' to any account ALREADY at level >= 2. Guarded so it
-- never duplicates the id. (No-op on a fresh DB where everyone is level 1.)
-- -----------------------------------------------------------------------------
update public.profiles
   set unlocked_skins = array_append(unlocked_skins, 'custom')
 where level >= 2
   and not ('custom' = any(unlocked_skins));


-- -----------------------------------------------------------------------------
-- Hardening: tokens can NEVER go negative. Defense-in-depth that mirrors the
-- xp_grants.amount >= 0 CHECK in 0001 — the server already guards every spend
-- path (purchase_cosmetic checks the balance; redeem_code only adds), but the DB
-- enforces the invariant independently of any current/future server code.
-- Idempotent (drop-if-exists then add). Validates existing rows on add; all
-- current balances are >= 0, so this is safe.
-- -----------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_tokens_nonneg;
alter table public.profiles add  constraint profiles_tokens_nonneg check (tokens >= 0);


-- =============================================================================
-- PART 2 — redeem codes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table: public.code_redemptions
-- One row per (account, code). The UNIQUE (user_id, code) makes a code
-- redeemable AT MOST ONCE per account (atomic anti-farming guard). SECRETS-grade
-- lockdown identical to email_codes: service_role only, no client access.
-- -----------------------------------------------------------------------------
create table if not exists public.code_redemptions (
  id          bigint      generated always as identity primary key,

  -- Owning account. ON DELETE CASCADE: deleting the profile (and thus the auth
  -- user) tears down its redemption history automatically.
  user_id     uuid        not null
                          references public.profiles (id) on delete cascade,

  -- The CANONICAL (normalized, upper-cased) code that was redeemed. The server
  -- normalizes user input before calling redeem_code, so 'lumo-test' and
  -- 'LUMO-TEST' collide on the same row.
  code        text        not null,

  redeemed_at timestamptz not null default now(),

  -- At most once per account per code.
  unique (user_id, code)
);

comment on table public.code_redemptions is
  'One row per (account, redeemed code). UNIQUE(user_id, code) enforces once-per-account redemption. service_role only; no client read/write (same posture as email_codes).';
comment on column public.code_redemptions.code is
  'Canonical (normalized, upper-cased) code string. The server normalizes input before redeem_code so case/spacing variants map to one row.';


-- -----------------------------------------------------------------------------
-- RLS — DENY-ALL for clients (mirror email_codes). service_role bypasses RLS.
-- -----------------------------------------------------------------------------
alter table public.code_redemptions enable row level security;
alter table public.code_redemptions force  row level security;
-- Deliberately NO policies: with RLS forced and zero policies, anon &
-- authenticated can neither read nor write any row.

revoke select, insert, update, delete on public.code_redemptions from anon, authenticated;
revoke select, insert, update, delete on public.code_redemptions from public;


-- -----------------------------------------------------------------------------
-- redeem_code can grant XP by calling grant_xp with source 'redeem' (e.g. a
-- developer/promo code). The xp_grants.source CHECK was `in ('sp','mp')`
-- (auto-named xp_grants_source_check) — widen it to allow 'redeem'. Idempotent.
-- -----------------------------------------------------------------------------
alter table public.xp_grants drop constraint if exists xp_grants_source_check;
alter table public.xp_grants add  constraint xp_grants_source_check
  check (source in ('sp', 'mp', 'redeem'));


-- -----------------------------------------------------------------------------
-- Return type for redeem_code (stable, documented shape).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'redeem_result' and n.nspname = 'public'
  ) then
    create type public.redeem_result as (
      status text,   -- 'ok' | 'already' | 'invalid'
      tokens int     -- new token balance ('ok'/'already'); null on 'invalid'
    );
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- Function: public.redeem_code(p_user, p_code, p_tokens)
-- Atomically record a redemption and credit the SERVER-supplied token amount.
--   * 'invalid'  — p_tokens missing/negative (defensive; the server never sends
--                  this for a real catalog entry).
--   * 'already'  — this account already redeemed p_code (UNIQUE conflict).
--   * 'ok'       — first redemption: tokens credited, returns the new balance.
-- The UNIQUE (user_id, code) constraint provides the once-per-account guarantee
-- even under concurrent requests (the second insert conflicts → 'already').
-- service_role only. The server passes the authoritative p_tokens.
-- -----------------------------------------------------------------------------
create or replace function public.redeem_code(
  p_user   uuid,
  p_code   text,
  p_tokens int,
  p_xp     int
)
returns public.redeem_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows    bigint;
  v_profile public.profiles%rowtype;
begin
  if p_tokens is null or p_tokens < 0 then
    return ('invalid', null)::public.redeem_result;
  end if;
  if p_xp is not null and p_xp < 0 then
    return ('invalid', null)::public.redeem_result;
  end if;

  -- Atomic once-per-account guard. A duplicate (user_id, code) inserts 0 rows.
  insert into public.code_redemptions (user_id, code)
  values (p_user, p_code)
  on conflict (user_id, code) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    -- Already redeemed by this account → no credit; return the current balance.
    select * into v_profile from public.profiles where id = p_user;
    if not found then
      return ('already', null)::public.redeem_result;
    end if;
    return ('already', v_profile.tokens)::public.redeem_result;
  end if;

  -- First redemption. Grant XP (if any) FIRST: grant_xp recomputes level, awards
  -- level-milestone tokens, AND unlocks level-reward skins ('custom' @ level 2) —
  -- all in THIS transaction. Its own (user, game_key) ledger ('redeem:'||p_code)
  -- makes it idempotent too (belt-and-suspenders alongside code_redemptions).
  -- NOTE: grant_xp takes a FOR UPDATE lock on this profile row that persists for
  -- the rest of THIS transaction, so the token UPDATE below is serialized behind
  -- it (no race between the two writes).
  if p_xp is not null and p_xp > 0 then
    perform public.grant_xp(p_user, 'redeem:' || p_code, p_xp, 'redeem');
  end if;

  -- Then credit the code's FLAT token reward (on top of any milestone tokens the
  -- XP grant may have awarded). The UPDATE row-locks the profile, so the
  -- read-modify-write is race-free against concurrent grants/redemptions.
  update public.profiles
     set tokens = tokens + p_tokens
   where id = p_user
   returning * into v_profile;

  if not found then
    -- No profile for this user → abort so the redemption insert rolls back too.
    raise exception 'redeem_code: profile % not found', p_user
      using errcode = 'foreign_key_violation';
  end if;

  return ('ok', v_profile.tokens)::public.redeem_result;
end;
$$;

comment on function public.redeem_code(uuid, text, int, int) is
  'SECURITY DEFINER, service_role-only. Atomically records a once-per-account code redemption (UNIQUE user_id+code), optionally grants p_xp via grant_xp (level-up + level-reward unlocks + milestone tokens), then credits the SERVER-supplied flat p_tokens. Returns status ok|already|invalid + new balance.';


-- =============================================================================
-- Hard privilege lockdown for redeem_code (same posture as grant_xp / cosmetics).
-- =============================================================================
revoke execute on function public.redeem_code(uuid, text, int, int)
  from public, anon, authenticated;
grant  execute on function public.redeem_code(uuid, text, int, int)
  to service_role;

-- =============================================================================
-- End of 0006_level_rewards_redeem.sql
-- =============================================================================
