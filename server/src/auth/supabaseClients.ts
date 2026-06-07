// =============================================================================
// auth/supabaseClients.ts
// Supabase client singletons for the trusted server.
//
//   * admin     — service_role key. BYPASSES RLS. Used for every privileged
//                 operation: creating auth users, reading/writing profiles and
//                 email_codes, confirming emails, resetting passwords. The
//                 service_role key is server-only and must NEVER reach a client.
//   * anonAuth  — anon key. RLS-constrained. Used ONLY to exercise the normal
//                 password sign-in path (signInWithPassword) so we get a real
//                 user session (access/refresh tokens) exactly as the client
//                 would. We do NOT use it for any privileged read/write.
//
// Both are created lazily on first use via requireEnv(), so the server process
// can still start for non-auth use when these env vars are unset; the auth
// routes will then throw a clear "Missing required environment variable" error.
// =============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./config.js";

let _admin: SupabaseClient | null = null;
let _anonAuth: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS — treat as fully trusted/privileged.
 * autoRefreshToken/persistSession are off: this is a stateless server client,
 * not a logged-in browser session.
 */
export function admin(): SupabaseClient {
  if (_admin) return _admin;
  const url = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  _admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _admin;
}

/**
 * Anon client used solely for password sign-in (to mint a user session the same
 * way the client would). persistSession is off — the server holds no session.
 */
export function anonAuth(): SupabaseClient {
  if (_anonAuth) return _anonAuth;
  const url = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  _anonAuth = createClient(url, anonKey, {
    // persistSession off AND autoRefreshToken off: this client only mints a
    // session momentarily during password sign-in / re-auth (login,
    // change-password, delete) and the callers read ONLY the immediate
    // signInErr — so no user session should linger or auto-refresh in this
    // shared server-side client. (Mirrors admin()'s stateless config.)
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _anonAuth;
}
