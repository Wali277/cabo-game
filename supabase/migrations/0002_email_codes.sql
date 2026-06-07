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
