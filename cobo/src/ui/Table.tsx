import { useEffect, useRef } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useStore } from "../state/store";
import { PlayerSeat } from "./PlayerSeat";
import { Center } from "./Center";
import { LeftPanel } from "./LeftPanel";
import { Scoreboard, RoundEndOverlay } from "./Scoreboard";
import { ActionBanner } from "./ActionBanner";
import { ActionLog } from "./ActionLog";
import { botMove, ingestReveals, maybeBotSnap, resetBotKnowledge } from "../ai/bot";
import { clearReveals as clearRevealsEngine } from "../engine/game";

export function Table() {
  const game = useStore((s) => s.game!);
  const humanId = useStore((s) => s.humanId);
  const mode = useStore((s) => s.mode);
  const toast = useStore((s) => s.toast);
  const setToast = useStore((s) => s.setToast);
  const trySnap = useStore((s) => s.trySnap);
  const consumeAnimations = useStore((s) => s.consumeAnimations);

  const lastRound = useRef(game.roundNumber);
  useEffect(() => {
    if (lastRound.current !== game.roundNumber) {
      resetBotKnowledge();
      lastRound.current = game.roundNumber;
    }
  }, [game.roundNumber]);

  // Ingest reveals into bot beliefs each render
  useEffect(() => {
    ingestReveals(game);
  }, [game.reveals, game.phase, game.currentPlayer]);

  // Auto-play bots — read latest store at timer fire to avoid stale closures.
  // Don't fire while a transient reveal is being shown to the human, so the
  // human can actually read peeked cards before the next turn starts.
  const hasTransientReveal = game.reveals.some((r) => r.reason !== "round_end");
  useEffect(() => {
    if (mode === "mp") return; // bots only in single-player
    if (game.phase === "setup_peek") return;
    if (game.phase === "round_over") return;
    if (hasTransientReveal) return;
    const cur = game.players[game.currentPlayer];
    if (!cur.isBot) return;
    const delay = 950 + Math.floor(Math.random() * 700);
    const t = setTimeout(() => {
      const latest = useStore.getState().game;
      if (!latest) return;
      const curNow = latest.players[latest.currentPlayer];
      if (!curNow.isBot) return;
      if (latest.phase === "setup_peek" || latest.phase === "round_over") return;
      if (latest.reveals.some((r) => r.reason !== "round_end")) return;
      useStore.setState({ game: botMove(latest) });
    }, delay);
    return () => clearTimeout(t);
  }, [game.phase, game.currentPlayer, hasTransientReveal, mode]);

  // Auto-clear transient reveals after a short window so cards flip back.
  // Setup peek reveals are intentionally NOT auto-cleared — they stay face-up
  // until startPlay() so players can take their time memorising their cards.
  useEffect(() => {
    if (game.phase === "setup_peek") return;
    const transients = game.reveals.filter(
      (r) => r.reason !== "round_end" && r.reason !== "setup",
    );
    if (transients.length === 0) return;
    const t = setTimeout(() => {
      const latest = useStore.getState().game;
      if (!latest) return;
      useStore.setState({ game: clearRevealsEngine(latest) });
    }, 2400);
    return () => clearTimeout(t);
  }, [game.reveals, game.phase]);

  // Show toasts from latest animations
  useEffect(() => {
    if (game.animations.length === 0) return;
    const latest = game.animations[game.animations.length - 1];
    let msg: string | null = null;
    switch (latest.kind) {
      case "snap_success":
        msg = `${nameById(game, latest.payload.playerId as string)} snapped!`;
        break;
      case "snap_fail":
        msg = `${nameById(game, latest.payload.playerId as string)} snap failed — penalty card!`;
        break;
      case "cabo_called":
        msg = `${nameById(game, latest.payload.playerId as string)} called CABO — final round!`;
        break;
    }
    if (msg) setToast(msg);
    // Clear animations queue after a moment (so layout transitions complete)
    const t = setTimeout(() => consumeAnimations(), 500);
    return () => clearTimeout(t);
  }, [game.animations]);

  // Occasional bot snaps — check whenever discard changes
  useEffect(() => {
    if (mode === "mp") return;
    if (game.phase === "round_over" || game.phase === "setup_peek") return;
    const t = setTimeout(() => {
      const latest = useStore.getState().game;
      if (!latest) return;
      if (latest.phase === "round_over" || latest.phase === "setup_peek") return;
      const move = maybeBotSnap(latest);
      if (move) trySnap(move.playerId, move.handIndex);
    }, 700 + Math.random() * 1100);
    return () => clearTimeout(t);
  }, [game.discard.length]);

  // Assign opponents to table positions based on count
  // 1 opp → top | 2 opps → top + right | 3 opps → top + left + right
  const others = game.players.filter((p) => p.id !== humanId);
  const humanIdx = game.players.findIndex((p) => p.id === humanId);
  const human = game.players[humanIdx];

  type SlotName = "top" | "left" | "right";
  const slotOrder: SlotName[] =
    others.length === 1 ? ["top"] :
    others.length === 2 ? ["top", "right"] :
    ["top", "left", "right"];

  const slotMap: Partial<Record<SlotName, typeof others[0]>> = {};
  others.forEach((p, i) => { slotMap[slotOrder[i]] = p; });

  const backToMenu = useStore((s) => s.backToMenu);
  function handleQuit() {
    if (game.phase === "round_over") { backToMenu(); return; }
    const ok = window.confirm("Leave the game and return to the main menu?");
    if (ok) backToMenu();
  }

  function seatFor(p: typeof others[0]) {
    return game.players.findIndex((pp) => pp.id === p.id);
  }

  return (
    <LayoutGroup>
      <div className={`table-root players-${game.players.length}`}>
        {/* Compact top bar */}
        <div className="top-bar">
          <button className="btn ghost menu-back" onClick={handleQuit}>← Menu</button>
          <span className="top-round-label">Round {game.roundNumber}</span>
        </div>

        {/* Three-column game body: left panel | table grid | right sidebar */}
        <div className="game-body">
          <LeftPanel />

          {/* Table grid — players sit on each side of the deck */}
          <div className="table-grid">
            {/* Top opponent */}
            <div className="tslot tslot-top">
              {slotMap.top && (
                <PlayerSeat
                  key={slotMap.top.id}
                  player={slotMap.top}
                  seatIndex={seatFor(slotMap.top)}
                  totalSeats={game.players.length}
                  isCurrent={game.players[game.currentPlayer].id === slotMap.top.id}
                  isHuman={false}
                  tablePos="top"
                />
              )}
            </div>

            {/* Left opponent */}
            <div className="tslot tslot-left">
              {slotMap.left && (
                <PlayerSeat
                  key={slotMap.left.id}
                  player={slotMap.left}
                  seatIndex={seatFor(slotMap.left)}
                  totalSeats={game.players.length}
                  isCurrent={game.players[game.currentPlayer].id === slotMap.left.id}
                  isHuman={false}
                  tablePos="left"
                />
              )}
            </div>

            {/* Centre — deck & discard */}
            <div className="tslot tslot-center">
              <Center />
            </div>

            {/* Right opponent */}
            <div className="tslot tslot-right">
              {slotMap.right && (
                <PlayerSeat
                  key={slotMap.right.id}
                  player={slotMap.right}
                  seatIndex={seatFor(slotMap.right)}
                  totalSeats={game.players.length}
                  isCurrent={game.players[game.currentPlayer].id === slotMap.right.id}
                  isHuman={false}
                  tablePos="right"
                />
              )}
            </div>

            {/* Bottom — human player */}
            <div className="tslot tslot-bottom">
              <PlayerSeat
                player={human}
                seatIndex={humanIdx}
                totalSeats={game.players.length}
                isCurrent={game.players[game.currentPlayer].id === humanId}
                isHuman={true}
                tablePos="bottom"
              />
            </div>
          </div>

          {/* Right sidebar: scoreboard + action log */}
          <div className="right-sidebar">
            <Scoreboard />
            <ActionLog />
          </div>
        </div>

        <AnimatePresence>
          {toast && (
            <motion.div
              className="toast"
              initial={{ y: 40, opacity: 0, scale: 0.7 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ type: "spring", stiffness: 240, damping: 18 }}
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        <ActionBanner />
        <RoundEndOverlay />
      </div>
    </LayoutGroup>
  );
}

function nameById(game: ReturnType<typeof useStore.getState>["game"] & {}, id: string) {
  return game.players.find((p) => p.id === id)?.name ?? id;
}
