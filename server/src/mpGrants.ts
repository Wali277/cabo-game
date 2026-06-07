// =============================================================================
// mpGrants.ts
// Server-authoritative MULTIPLAYER XP grants, fired at match-end.
//
// This is the MP counterpart to the SP route in auth/router.ts. Where SP is
// trust-based (the client asserts "I finished a bot game"), MP is 100%
// server-initiated: the server alone decides who won, who left, and how many
// rounds completed — the client is NEVER consulted for amounts or outcomes.
// Amounts come from XP_CONFIG. Each granted member is told ONLY their own
// reward, over their own socket (never broadcast room-wide).
//
// IDEMPOTENCY (two layers, so a double-fire can't double-pay):
//   * room.xpGranted guards the whole function per MATCH (set true on first run,
//     reset to false in startRoomGame). The many code paths that can set
//     room.gloriosVictory all call this; only the first does work.
//   * The ledger game_key `mp:${room.matchId}` + xp_grants UNIQUE(user_id,
//     game_key) makes even a leaked second call a DB no-op per user.
// =============================================================================

import type { Server } from "socket.io";
import type { Room } from "./rooms.js";
import { admin } from "./auth/supabaseClients.js";
import { XP_CONFIG } from "./auth/config.js";
import { buildReward } from "./auth/reward.js";
import { verifyAccessToken } from "./auth/verifyToken.js";

/**
 * Grant end-of-match MP XP to every linked member of `room`, and emit each one
 * their private `xp:reward` event. Safe to call repeatedly (guarded by
 * room.xpGranted). `cause` distinguishes a normal bust/finish from a forfeit:
 *
 *   - 'bust'    : the match reached a Glorious Victor through normal play
 *                 (busts / tiebreakers / sudden death / final survivor).
 *                 → winner gets FRIEND_WIN, everyone else FRIEND_LOSS.
 *   - 'forfeit' : the match collapsed because an opponent left/forfeited.
 *                 → remaining players get OPPONENT_ABANDON *if at least one full
 *                   round completed*, else 0.
 *
 * In BOTH causes, a member who themselves LEFT (their playerId is forfeited in
 * room.disconnects) gets ON_LEAVE (0) — you don't earn XP for abandoning.
 *
 * Per-member grants are wrapped in try/catch: one user's failed grant (DB blip,
 * missing profile) must not break the others or the room flow.
 */
export async function grantMpRewards(
  io: Server,
  room: Room,
  cause: "bust" | "forfeit",
): Promise<void> {
  // Per-match guard: only the first call for this match does anything.
  if (room.xpGranted) return;
  room.xpGranted = true;

  // Best-effort RE-LINK pass (closes the identity-link under-payment race):
  // linkIdentity verifies the access token fire-and-forget AFTER join, so a
  // match that ends before that network round-trip resolves would leave a
  // legitimately-logged-in player with userId still unset → 0 XP. Give each such
  // member one more chance to link, right when XP is about to be granted. We
  // only touch members who are still connected, unlinked, and have a stashed
  // token (typically zero or one) — already-linked members are NOT re-verified,
  // so the extra match-end latency is bounded. Per-member try/catch ensures one
  // failed verify can never break the grant. Guests (no authToken) are skipped.
  for (const member of room.members) {
    if (member.userId) continue; // already linked — don't re-verify
    if (!member.connected || !member.socketId) continue; // gone — skip
    if (!member.authToken) continue; // guest / no token to re-link
    try {
      const userId = await verifyAccessToken(member.authToken);
      if (userId) member.userId = userId; // only set on a truthy resolve
    } catch {
      // verifyAccessToken never rejects, but be defensive — a failure for one
      // member must never break the grant for the rest. Never log the token.
    }
  }

  // Did at least one full round complete? Used to gate the abandon reward (no
  // XP for a match that fell apart before a single round finished). scores[id]
  // gains one entry per completed round; any player's array length ≥ 1 ⇒ yes.
  const anyPlayerId = room.game?.players[0]?.id;
  const roundsCompleted =
    !!anyPlayerId && (room.game?.scores[anyPlayerId]?.length ?? 0) >= 1;

  const gameKey = `mp:${room.matchId}`;

  for (const member of room.members) {
    // Only linked accounts earn XP. Guests (no userId) are skipped entirely.
    if (!member.userId) continue;

    // Decide this member's amount (server-owned; client never influences it).
    let amount: number;
    if (room.disconnects[member.playerId]?.forfeited) {
      // THIS member left/forfeited → no reward, regardless of cause.
      amount = XP_CONFIG.ON_LEAVE; // 0
    } else if (cause === "forfeit") {
      // Match ended by an opponent's abandon. Reward only if a round completed.
      amount = roundsCompleted ? XP_CONFIG.OPPONENT_ABANDON : 0;
    } else {
      // Normal completion: the Glorious Victor wins big, everyone else gets the
      // participation amount. gloriosVictory is the server's authoritative id.
      amount =
        member.playerId === room.gloriosVictory
          ? XP_CONFIG.FRIEND_WIN
          : XP_CONFIG.FRIEND_LOSS;
    }

    // Skip a zero grant outright — no ledger row, no socket emit.
    if (amount <= 0) continue;

    try {
      const { data, error } = await admin().rpc("grant_xp", {
        p_user: member.userId,
        p_game_key: gameKey,
        p_amount: amount,
        p_source: "mp",
      });
      if (error) {
        throw new Error(`grant_xp failed: ${error.message}`);
      }
      const row = Array.isArray(data) ? data[0] : data;
      const reward = buildReward(row, "mp", amount);
      // Private per-member emit — the recipient's own socket only.
      io.sockets.sockets.get(member.socketId)?.emit("xp:reward", reward);
    } catch (err) {
      // One member's failure must not abort the others or the room. Log a
      // non-secret tag only (never the token/userId payload contents).
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[mp:grant] member grant failed: ${message}`);
    }
  }
}
