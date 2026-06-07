-- =============================================================================
-- 0009_kofi_donations.sql
-- Lumo — Ko-fi "buy tokens" webhook → server-authoritative token credit.
-- -----------------------------------------------------------------------------
-- Mirrors the redeem_code (0006) security posture EXACTLY: SECURITY DEFINER,
-- service_role-only, idempotent. The trusted Node webhook
-- (server/src/webhooks/kofi.ts) verifies Ko-fi's signature, resolves the buyer's
-- account (email, else the username in the order note), computes tokens ($1 = 1),
-- and calls credit_donation. This RPC is GENERIC: it records one row per Ko-fi
-- transaction (UNIQUE kofi_transaction_id = the idempotency anchor) and, when a
-- matched account + positive token amount is supplied, credits those tokens.
--
--   * 'credited'  — matched account, tokens added, returns the new balance.
--   * 'unmatched' — no account resolved (recorded, NOT lost; tokens = 0).
--   * 'duplicate' — this transaction was already processed (no re-credit).
--   * 'invalid'   — missing transaction id (defensive).
--
-- Plain donations never reach this RPC — the webhook only calls it for token
-- shop-orders. Re-runnable (create-if-not-exists table + type, create-or-replace
-- function, idempotent grant/revoke). Reuses public.profiles from 0001.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Table: public.kofi_donations
-- One row per processed Ko-fi transaction. UNIQUE(kofi_transaction_id) makes the
-- whole credit path idempotent against Ko-fi retries / replays. user_id is
-- nullable (unmatched purchases are recorded for manual follow-up); ON DELETE
-- SET NULL keeps the audit row if the account is later deleted. SECRETS-grade
-- lockdown identical to code_redemptions: service_role only, no client access.
-- -----------------------------------------------------------------------------
create table if not exists public.kofi_donations (
  id                  bigint      generated always as identity primary key,
  kofi_transaction_id text        not null unique,
  user_id             uuid        references public.profiles (id) on delete set null,
  email               text,
  from_name           text,
  message             text,
  amount              numeric(12,2),
  currency            text,
  tokens              int         not null default 0,
  status              text        not null,   -- 'credited' | 'unmatched'
  created_at          timestamptz not null default now()
);

comment on table public.kofi_donations is
  'One row per processed Ko-fi webhook transaction. UNIQUE(kofi_transaction_id) is the idempotency anchor (no double-credit on Ko-fi retries). status credited|unmatched; user_id null for unmatched purchases (recorded for manual follow-up). service_role only (same posture as code_redemptions).';


-- -----------------------------------------------------------------------------
-- RLS — DENY-ALL for clients (mirror code_redemptions). service_role bypasses RLS.
-- -----------------------------------------------------------------------------
alter table public.kofi_donations enable row level security;
alter table public.kofi_donations force  row level security;
-- Deliberately NO policies: with RLS forced and zero policies, anon &
-- authenticated can neither read nor write any row.
revoke select, insert, update, delete on public.kofi_donations from anon, authenticated;
revoke select, insert, update, delete on public.kofi_donations from public;


-- -----------------------------------------------------------------------------
-- Return type for credit_donation (stable, documented shape).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'credit_donation_result' and n.nspname = 'public'
  ) then
    create type public.credit_donation_result as (
      status text,   -- 'credited' | 'unmatched' | 'duplicate' | 'invalid'
      tokens int     -- new balance on 'credited'; null otherwise
    );
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- Function: public.credit_donation(...)
-- The ONLY supported donation-credit path. service_role-only.
-- -----------------------------------------------------------------------------
create or replace function public.credit_donation(
  p_txn_id   text,
  p_user     uuid,
  p_tokens   int,
  p_amount   numeric,
  p_currency text,
  p_email    text,
  p_from     text,
  p_message  text
)
returns public.credit_donation_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows    bigint;
  v_tokens  int;
  v_status  text;
  v_profile public.profiles%rowtype;
begin
  if p_txn_id is null or p_txn_id = '' then
    return ('invalid', null)::public.credit_donation_result;
  end if;

  -- Normalize: only a matched account with a positive amount is credited.
  v_tokens := greatest(coalesce(p_tokens, 0), 0);
  if p_user is not null and v_tokens > 0 then
    v_status := 'credited';
  else
    v_status := 'unmatched';
    v_tokens := 0;
  end if;

  -- Idempotency: one row per Ko-fi transaction. A replay inserts 0 rows.
  insert into public.kofi_donations
    (kofi_transaction_id, user_id, email, from_name, message, amount, currency, tokens, status)
  values
    (p_txn_id, p_user, p_email, p_from, p_message, p_amount, p_currency, v_tokens, v_status)
  on conflict (kofi_transaction_id) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    -- Already processed this transaction → do NOT credit again.
    return ('duplicate', null)::public.credit_donation_result;
  end if;

  if v_status = 'credited' then
    -- Row-locks the profile; the read-modify-write is race-free against
    -- concurrent grants/redemptions. tokens >= 0 CHECK (0006) still holds (add only).
    update public.profiles
       set tokens = tokens + v_tokens
     where id = p_user
     returning * into v_profile;
    if not found then
      -- Matched id no longer exists → abort so the donation row rolls back too,
      -- letting a later retry re-process cleanly.
      raise exception 'credit_donation: profile % not found', p_user
        using errcode = 'foreign_key_violation';
    end if;
    return ('credited', v_profile.tokens)::public.credit_donation_result;
  end if;

  return ('unmatched', null)::public.credit_donation_result;
end;
$$;

comment on function public.credit_donation(text, uuid, int, numeric, text, text, text, text) is
  'SECURITY DEFINER, service_role-only. Idempotently records a Ko-fi transaction (UNIQUE kofi_transaction_id) and, when p_user is set + p_tokens>0, credits p_tokens to that profile. Returns status credited|unmatched|duplicate|invalid + new balance. Plain donations never reach here (the webhook only calls it for token shop-orders).';


-- =============================================================================
-- Hard privilege lockdown (same posture as grant_xp / redeem_code / cosmetics).
-- =============================================================================
revoke execute on function public.credit_donation(text, uuid, int, numeric, text, text, text, text)
  from public, anon, authenticated;
grant  execute on function public.credit_donation(text, uuid, int, numeric, text, text, text, text)
  to service_role;

-- =============================================================================
-- End of 0009_kofi_donations.sql
-- =============================================================================
