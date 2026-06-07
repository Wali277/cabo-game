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
