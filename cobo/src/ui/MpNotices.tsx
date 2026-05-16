import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { Audio } from "../audio/sounds";

const FORFEIT_MS = 20_000;

/**
 * Top-right notification when an opponent disconnects mid-game, with a
 * 20-second forfeit countdown. Dismissable via the X button.
 *
 * Forfeit victory overlay is also rendered here when the opponent's countdown
 * elapses without them returning.
 */
export function MpNotices() {
  const mode = useStore((s) => s.mode);
  const mp = useStore((s) => s.mp);
  const game = useStore((s) => s.game);
  const humanId = useStore((s) => s.humanId);
  const backToMenu = useStore((s) => s.backToMenu);

  const [now, setNow] = useState(Date.now());
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  // Track which players were previously disconnected so we can detect rejoins.
  const prevDisconnectIds = useRef<Set<string>>(new Set());
  // Active "returned" notices, keyed by player id with their dismiss timestamp.
  const [returned, setReturned] = useState<Array<{ id: string; name: string; at: number }>>([]);

  // Tick once a second so the countdown re-renders
  useEffect(() => {
    if (mode !== "mp" || !mp) return;
    const any = Object.values(mp.disconnects ?? {}).some((d) => !d.forfeited);
    if (!any) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [mode, mp]);

  // Detect rejoins: an id present last render but absent now (and not forfeited) = they returned.
  useEffect(() => {
    if (mode !== "mp" || !mp) return;
    const currentIds = new Set(
      Object.entries(mp.disconnects ?? {})
        .filter(([, d]) => !d.forfeited)
        .map(([id]) => id),
    );
    const rejoined: { id: string; name: string; at: number }[] = [];
    prevDisconnectIds.current.forEach((id) => {
      if (id === humanId) return; // don't show notice for myself
      if (!currentIds.has(id)) {
        const member = mp.members.find((m) => m.id === id);
        if (member?.connected) {
          rejoined.push({ id, name: member.name, at: Date.now() });
        }
      }
    });
    prevDisconnectIds.current = currentIds;
    if (rejoined.length > 0) {
      Audio.playSfx("rejoin");
      setReturned((prev) => [...prev, ...rejoined]);
      // Auto-dismiss each notice after 4s.
      rejoined.forEach((r) => {
        setTimeout(() => {
          setReturned((cur) => cur.filter((x) => x.at !== r.at));
        }, 4000);
      });
    }
  }, [mp?.disconnects, mp?.members, mode, humanId]);

  if (mode !== "mp" || !mp || !game) return null;

  // Find disconnected opponents (not the local viewer)
  const disconnectedOpponents = Object.entries(mp.disconnects ?? {})
    .filter(([id]) => id !== humanId)
    .map(([id, d]) => ({
      id,
      ...d,
      name: mp.members.find((m) => m.id === id)?.name ?? "Opponent",
    }));

  const forfeitedOpponent = disconnectedOpponents.find((d) => d.forfeited);
  const pending = disconnectedOpponents.filter((d) => !d.forfeited && !dismissed[d.id]);

  // Compute whether the LOCAL viewer should see the forfeit victory overlay.
  // Show it only when the game was in progress (not already round_over).
  const showForfeitVictory =
    !!forfeitedOpponent && game.phase !== "round_over";

  return (
    <>
      <AnimatePresence>
        {pending.map((d) => {
          const elapsed = now - d.startedAt;
          const remaining = Math.max(0, Math.ceil((FORFEIT_MS - elapsed) / 1000));
          return (
            <motion.div
              key={d.id}
              className="mp-notice"
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 60, opacity: 0 }}
              transition={{ type: "spring", stiffness: 240, damping: 22 }}
            >
              <div>
                <span className="mp-notice-title">Player left</span>
                <span className="mp-notice-body">
                  {d.name} left the match.{" "}
                  <span className="mp-notice-timer">{remaining}s</span> to return
                  before forfeit.
                </span>
              </div>
              <button
                className="mp-notice-close"
                onClick={() => setDismissed((s) => ({ ...s, [d.id]: true }))}
                aria-label="Dismiss"
              >
                ✕
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>

      <AnimatePresence>
        {returned.map((r) => (
          <motion.div
            key={`returned-${r.at}`}
            className="mp-notice mp-notice-success"
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 22 }}
          >
            <div>
              <span className="mp-notice-title">Player returned</span>
              <span className="mp-notice-body">{r.name} is back in the match.</span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {showForfeitVictory && (
          <motion.div
            className="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="modal forfeit-modal"
              initial={{ scale: 0.6, y: 20, rotate: -4 }}
              animate={{ scale: 1, y: 0, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 18 }}
            >
              <div className="modal-burst">🏆</div>
              <h2>Victory by forfeit!</h2>
              <div className="modal-subtitle">
                {forfeitedOpponent!.name} didn&apos;t return in time
              </div>
              <div className="row gap center" style={{ marginTop: 16 }}>
                <button className="btn primary big" onClick={backToMenu}>
                  Main menu
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
