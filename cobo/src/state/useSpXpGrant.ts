/**
 * ────────────────────────────────────────────────────────────────────────────
 * ACCOUNTS LAYER (Phase 4 — SP "game finished" → XP grant signal)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Client→server signal that a SINGLE-PLAYER match COMPLETED for a logged-in
 * account, so the server can grant the end-of-game XP. MP grants come from the
 * server's `xp:reward` socket event (see mp.ts) — this hook is SP-only.
 *
 * WHAT COUNTS AS "COMPLETED" (eligible for the grant), detected ONCE per match:
 *   - the human WON the match              → `elim.gloriosVictory === humanId`
 *   - the human was ELIMINATED (busted out)→ at a `round_over`, the human is in
 *     `elim.bustedThisRound` (note: sudden-death contestants are pulled OUT of
 *     bustedThisRound by computeSpBust, so a human still listed here is truly
 *     eliminated — this mirrors BustedOverlay's own gate).
 * Quitting before either (backToMenu) sends NOTHING → 0 XP (correct).
 *
 * The amount + the grant are SERVER-AUTHORITATIVE. We only POST the stable
 * per-match `spGameKey` (so the server's idempotency keys the award to the match
 * — a replay reuses the key → granted once) and render the reward it returns.
 *
 * Guests / MP / Training: skipped. The hook is a no-op without a signed-in
 * account in `mode === "sp"`.
 *
 * Mount once, globally, in App.tsx.
 */
import { useEffect, useRef } from "react";
import { useStore } from "./store";
import { grantSpGame } from "./auth";

export function useSpXpGrant(): void {
  const mode = useStore((s) => s.mode);
  const account = useStore((s) => s.account);
  const humanId = useStore((s) => s.humanId);
  const elim = useStore((s) => s.elim);
  const gamePhase = useStore((s) => s.game?.phase ?? null);
  const spGameKey = useStore((s) => s.spGameKey);
  const setXpReward = useStore((s) => s.setXpReward);

  // Once-guard: the gameKey we've already granted (or are mid-flight on). A new
  // SP match generates a fresh spGameKey (store.init), so this naturally re-arms
  // per match; a replay within a match keeps the SAME key and won't re-fire.
  const grantedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Eligibility gate: signed-in account, single-player, with a match key.
    if (mode !== "sp" || !account || !spGameKey) return;

    // Terminal outcome for the human?
    const humanWon = elim.gloriosVictory === humanId;
    const humanBustedOut =
      gamePhase === "round_over" && elim.bustedThisRound.includes(humanId);
    if (!humanWon && !humanBustedOut) return;

    // Fire exactly once per match. Mark the key BEFORE awaiting so a re-render
    // during the request can't double-send.
    if (grantedKeyRef.current === spGameKey) return;
    grantedKeyRef.current = spGameKey;

    let cancelled = false;
    void grantSpGame(spGameKey).then((reward) => {
      if (cancelled) return;
      // Re-check we're still in the same match before celebrating — guards a
      // fast backToMenu()/new match between request and response.
      if (useStore.getState().spGameKey !== spGameKey) return;
      if (reward) {
        setXpReward(reward);
      } else {
        // No reward (signed-out race or grant failure): release the end-of-game
        // result overlay, which defers waiting for this match's XP experience.
        // Without this it would wait for a celebration that's never coming.
        useStore.setState({ rewardResolvedKey: spGameKey });
      }
    });

    return () => {
      cancelled = true;
    };
    // Depend on the SPECIFIC fields read (not the whole `elim` object, which
    // changes every round) so this doesn't re-run on unrelated round churn.
    // gamePhase is included so a bust that lands on a `round_over` re-evaluates;
    // the grantedKeyRef guard keeps it single-fire regardless of extra renders.
  }, [
    mode,
    account,
    humanId,
    elim.gloriosVictory,
    elim.bustedThisRound,
    gamePhase,
    spGameKey,
    setXpReward,
  ]);
}
