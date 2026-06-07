// =============================================================================
// auth/verifyToken.ts
// Server-side verification of a Supabase access token (JWT) → the real user id.
//
// This is the ONLY place the server turns a client-supplied token into a
// trusted identity. It is used both by the SP grant HTTP route (Authorization:
// Bearer <token>) and by the MP socket identity-linking on room:create /
// :join / :rejoin. The service_role admin client validates the token against
// Supabase Auth — the client cannot forge a different user's id, because the
// id we return comes from Supabase, not from anything the client asserts.
//
// CONTRACT: verifyAccessToken NEVER throws to its caller. A missing, malformed,
// expired, or otherwise invalid token resolves to `null` (treated as a guest).
// This keeps the existing MP join flow non-blocking: a guest with no/bad token
// still joins normally, just without a linked userId (and so earns no XP).
// =============================================================================

import { admin } from "./supabaseClients.js";

/**
 * Resolve a Supabase access token to its user id, or null.
 *
 * @param token A raw Supabase access_token (JWT), WITHOUT the "Bearer " prefix.
 * @returns the authenticated user's id on success; null on any failure
 *          (missing/empty token, invalid/expired token, network/SDK error, or a
 *          response without a user). Never rejects.
 */
export async function verifyAccessToken(token?: string): Promise<string | null> {
  // No token → guest. Don't even call out.
  if (typeof token !== "string" || token.trim() === "") return null;
  try {
    // admin() uses the service_role key (server-only). getUser(token) validates
    // the JWT and returns the user it belongs to; we trust ONLY data.user.id.
    const { data, error } = await admin().auth.getUser(token.trim());
    if (error) return null;
    return data?.user?.id ?? null;
  } catch {
    // Swallow everything (network blip, misconfig, malformed token). The caller
    // gets a guest (null) and the surrounding flow proceeds unblocked. We do
    // NOT log the token (it's a secret) or the raw error object.
    return null;
  }
}
