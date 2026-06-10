// =============================================================================
// bot.ts — thin store-facing adapter over the pure decision core in brain.ts.
//
// All decision logic lives in ./brain (headless, engine-only imports, fully
// testable without a DOM). This file wires the Zustand store into it:
// difficulty + training flags for botMove, and speech-bubble side effects
// (emitBotSpeech) for the chat moments. Table.tsx imports ONLY from here.
// =============================================================================

import type { AnimationEvent, GameState } from "../engine/types";
import { useStore } from "../state/store";
import { type BotDifficulty, type ChatMoment, pickChatLine } from "./bots";
import {
  type BotSnapPlan,
  armBotSnap,
  decideBotMove,
  executeBotSnap,
  findBotSnap,
  ingestReveals,
  resetBotKnowledge,
  suggestBotDelayMs,
} from "./brain";

// Pure pieces re-exported unchanged so Table.tsx keeps a single import line.
export { armBotSnap, executeBotSnap, findBotSnap, ingestReveals, resetBotKnowledge, suggestBotDelayMs };
export type { BotSnapPlan };

// ────────────────────────────────────────────────────────────────────────────
// Side-effect: speech bubbles
// ────────────────────────────────────────────────────────────────────────────

/** Per-persona speech cooldown so back-to-back moments don't visually stomp.
 *  Billy babbles, Marcy is clipped, Bob speaks rarely and lets it land. */
const SPEECH_COOLDOWN_MS: Record<BotDifficulty, number> = {
  billy: 1400,
  marcy: 2000,
  bob: 2400,
};

/** Emit a speech bubble for the given bot, picking from the configured pool.
 *  Safe in SP only — no-op when no bot difficulty is active (MP). */
function emitBotSpeech(playerId: string, moment: ChatMoment) {
  const diff = useStore.getState().botDifficulty;
  if (!diff) return;
  const line = pickChatLine(diff, moment);
  if (!line) return;
  const prev = useStore.getState().botSpeech;
  if (prev && Date.now() - prev.at < SPEECH_COOLDOWN_MS[diff]) return;
  useStore.setState({
    botSpeech: { playerId, text: line, at: Date.now() },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Entry point — the only move function Table.tsx calls
// ────────────────────────────────────────────────────────────────────────────

export function botMove(state: GameState): GameState {
  const s = useStore.getState();
  return decideBotMove(state, {
    difficulty: s.botDifficulty ?? "marcy",
    training: s.training,
    speak: emitBotSpeech,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Round-end reactions (called from Table.tsx on phase → round_over)
// ────────────────────────────────────────────────────────────────────────────

/** When a round ends, pick one bot to react to its outcome. Prefer the round
 *  winner (their roundWin line wins). If no bot won, the bot with the
 *  highest hand gets a roundHighHand line. Single-shot per round transition. */
export function reactToRoundEnd(state: GameState) {
  if (state.phase !== "round_over") return;
  const bots = state.players.filter((p) => p.isBot);
  if (bots.length === 0) return;

  // Did a bot win the round?
  const winnerId = state.winnerId;
  if (winnerId) {
    const winnerBot = bots.find((b) => b.id === winnerId);
    if (winnerBot) {
      emitBotSpeech(winnerBot.id, "roundWin");
      return;
    }
  }

  // Otherwise have the worst-scoring bot complain.
  const lastRoundScore = (id: string) => {
    const scoresArr = state.scores[id] ?? [];
    return scoresArr[scoresArr.length - 1] ?? 0;
  };
  const worst = [...bots].sort((a, b) => lastRoundScore(b.id) - lastRoundScore(a.id))[0];
  if (worst) emitBotSpeech(worst.id, "roundHighHand");
}

// ────────────────────────────────────────────────────────────────────────────
// Snap-outcome reactions (called from Table.tsx's animations effect, SP only)
// ────────────────────────────────────────────────────────────────────────────

/** Map a snap_correct / snap_wrong / snap_penalty_draw animation event to a
 *  chat moment for any bot participant: the bot that landed it gloats
 *  (snapHit), a bot whose card got snapped by someone else complains
 *  (gotSnapped), and a bot that whiffed mutters (snapMiss). A wrong snap
 *  pushes snap_reveal + snap_wrong + snap_penalty_draw in ONE engine call and
 *  Table.tsx reads only the LAST animation, so the common wrong-snap path
 *  arrives here as snap_penalty_draw (whose payload also carries snapperId);
 *  the snap_wrong branch still covers the deck-empty case where no penalty
 *  follows. One bubble max per event — the speech cooldown in emitBotSpeech
 *  keeps rapid snap chains readable. */
export function reactToSnapOutcome(anim: AnimationEvent, state: GameState) {
  const payload = anim.payload as {
    snapperId?: string;
    targetId?: string;
    isSelf?: boolean;
  };
  const isBot = (id?: string) =>
    !!id && !!state.players.find((p) => p.id === id)?.isBot;
  if (anim.kind === "snap_correct") {
    if (isBot(payload.snapperId)) {
      emitBotSpeech(payload.snapperId!, "snapHit");
    } else if (!payload.isSelf && isBot(payload.targetId)) {
      emitBotSpeech(payload.targetId!, "gotSnapped");
    }
  } else if (anim.kind === "snap_wrong" || anim.kind === "snap_penalty_draw") {
    if (isBot(payload.snapperId)) {
      emitBotSpeech(payload.snapperId!, "snapMiss");
    }
  }
}
