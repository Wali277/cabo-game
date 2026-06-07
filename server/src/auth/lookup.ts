// =============================================================================
// auth/lookup.ts
// Shared account-lookup helpers (service_role / admin client).
//
// These were originally module-private in auth/router.ts. They are extracted
// here so that OTHER server-authoritative entry points (e.g. the Ko-fi donation
// webhook in webhooks/kofi.ts) can resolve an account WITHOUT duplicating the
// lookup logic — there is exactly ONE implementation of each.
//
//   * findUserByEmail(db, email)      -> { id, ... } | null   (auth user id === profile id)
//   * findProfileByUsername(db, name) -> { id, username } | null
//
// router.ts re-exports both for back-compat with its existing internal callers.
// No secret is ever logged here; errors carry only the Supabase message.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

// SECURITY TODO (Phase-1 deferred; acceptable at friends-scale): findUserByEmail pages listUsers O(users) and the unknown-username branch returns before signInWithPassword, creating a username-existence timing oracle. Before any public/scaled launch: store lower(email) on profiles (indexed) for O(1) lookup, and add a constant-time dummy sign-in on the unknown-identifier path so existing-vs-missing latency matches. Response bodies are already generic.
/**
 * Look up an auth user by email via the admin API. Supabase has no direct
 * get-by-email, so we page through listUsers and match case-insensitively.
 * Capped at a sane number of pages so this can't run unbounded. Returns the
 * user object or null.
 */
export async function findUserByEmail(
  db: SupabaseClient,
  email: string,
): Promise<{ id: string; email?: string; email_confirmed_at?: string | null } | null> {
  const target = email.toLowerCase();
  const perPage = 1000;
  const maxPages = 20; // up to 20k users; revisit if the user base grows past this
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`findUserByEmail: listUsers failed: ${error.message}`);
    }
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) {
      return {
        id: match.id,
        email: match.email ?? undefined,
        email_confirmed_at: match.email_confirmed_at ?? null,
      };
    }
    if (users.length < perPage) break; // last page
  }
  return null;
}

/** Find a profile id + the username's exact stored form by username (citext). */
export async function findProfileByUsername(
  db: SupabaseClient,
  username: string,
): Promise<{ id: string; username: string } | null> {
  const { data, error } = await db
    .from("profiles")
    .select("id, username")
    .eq("username", username) // citext → case-insensitive match
    .limit(1);
  if (error) {
    throw new Error(`findProfileByUsername: ${error.message}`);
  }
  return data?.[0] ?? null;
}
