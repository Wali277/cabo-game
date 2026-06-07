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
