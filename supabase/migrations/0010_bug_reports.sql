-- =============================================================================
-- 0010_bug_reports.sql
-- Lumo — in-app "Report a bug" submissions (durable ledger + digest trigger).
-- -----------------------------------------------------------------------------
-- Mirrors the kofi_donations (0009) / redeem_code (0006) security posture
-- EXACTLY: SECURITY DEFINER, service_role-only, RLS deny-all for clients. The
-- trusted Node endpoint (server/src/api/bugReport.ts) validates + rate-limits the
-- request, optionally resolves the signed-in account, and calls submit_bug. The
-- client NEVER touches this table directly.
--
-- submit_bug records ONE row per report and returns the report id plus the
-- current number of UNRESOLVED ('new') reports. The server uses that count to
-- email the owner a digest nudge every 5th unresolved report (the owner clears
-- the backlog by flipping status to 'triaged'/'fixed' in the dashboard, which
-- drops the count so the next 5 fresh reports re-trigger the nudge).
--
-- Re-runnable (create-if-not-exists table, create-or-replace function, idempotent
-- grant/revoke). Reuses public.profiles from 0001.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Table: public.bug_reports
-- One row per submitted report. account_id is nullable (guests can report too);
-- ON DELETE SET NULL keeps the report if the account is later deleted. status
-- starts 'new' and is managed by the owner in the dashboard. Same SECRETS-grade
-- lockdown as kofi_donations: service_role only, no client read/write.
-- -----------------------------------------------------------------------------
create table if not exists public.bug_reports (
  id           bigint      generated always as identity primary key,
  created_at   timestamptz not null default now(),
  -- Owning account (nullable — guests can report without signing in).
  account_id   uuid        references public.profiles (id) on delete set null,
  username     text,        -- account username (server-resolved) or null
  email        text,        -- optional contact address the reporter typed
  message      text        not null,  -- the user's description (required)
  console_log  text,        -- optional captured client console/error dump
  user_agent   text,        -- browser/OS string (server reads the request header)
  app_version  text,        -- client build version
  screen       text,        -- which screen they were on ("menu" | "game" | ...)
  meta         jsonb,       -- extra non-sensitive diagnostics (mode, socket, viewport, errorCount)
  status       text        not null default 'new'  -- 'new' | 'triaged' | 'fixed'
);

comment on table public.bug_reports is
  'In-app bug reports. account_id nullable for guest submissions; status new|triaged|fixed (owner-managed in dashboard). service_role only (same posture as kofi_donations) — the trusted Node endpoint is the only writer.';

-- Fast count of the unresolved backlog (drives the every-5 digest email).
create index if not exists bug_reports_status_idx on public.bug_reports (status);


-- -----------------------------------------------------------------------------
-- RLS — DENY-ALL for clients (mirror kofi_donations). service_role bypasses RLS.
-- -----------------------------------------------------------------------------
alter table public.bug_reports enable row level security;
alter table public.bug_reports force  row level security;
-- Deliberately NO policies: with RLS forced and zero policies, anon &
-- authenticated can neither read nor write any row.
revoke select, insert, update, delete on public.bug_reports from anon, authenticated;
revoke select, insert, update, delete on public.bug_reports from public;


-- -----------------------------------------------------------------------------
-- Return type for submit_bug (stable, documented shape).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'submit_bug_result' and n.nspname = 'public'
  ) then
    create type public.submit_bug_result as (
      id        bigint,   -- the new report's id
      new_count int       -- unresolved ('new') reports AFTER this insert
    );
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- Function: public.submit_bug(...)
-- The ONLY supported bug-report write path. service_role-only.
-- -----------------------------------------------------------------------------
create or replace function public.submit_bug(
  p_account_id  uuid,
  p_username    text,
  p_email       text,
  p_message     text,
  p_console_log text,
  p_user_agent  text,
  p_app_version text,
  p_screen      text,
  p_meta        jsonb
)
returns public.submit_bug_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    bigint;
  v_count int;
begin
  if p_message is null or btrim(p_message) = '' then
    -- Defensive: the Node endpoint already validates, but never store a blank.
    raise exception 'submit_bug: message is required'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.bug_reports
    (account_id, username, email, message, console_log, user_agent, app_version, screen, meta)
  values
    (p_account_id, p_username, p_email, p_message, p_console_log, p_user_agent, p_app_version, p_screen, p_meta)
  -- Column-only reference (NOT "bug_reports.id"): under set search_path = '' an
  -- unqualified table correlation can fail to resolve. The bare column is always
  -- valid in a RETURNING list and avoids the empty-search_path hazard.
  returning id into v_id;

  select count(*)::int into v_count
    from public.bug_reports
   where status = 'new';

  return (v_id, v_count)::public.submit_bug_result;
end;
$$;

comment on function public.submit_bug(uuid, text, text, text, text, text, text, text, jsonb) is
  'SECURITY DEFINER, service_role-only. Records one bug report and returns its id + the current count of unresolved (status=new) reports. The Node endpoint uses new_count to send a digest email every 5th unresolved report.';


-- =============================================================================
-- Hard privilege lockdown (same posture as credit_donation / redeem_code).
-- =============================================================================
revoke execute on function public.submit_bug(uuid, text, text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant  execute on function public.submit_bug(uuid, text, text, text, text, text, text, text, jsonb)
  to service_role;

-- =============================================================================
-- End of 0010_bug_reports.sql
-- =============================================================================
