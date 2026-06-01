import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useStore } from "../state/store";
import { useViewMode } from "../state/viewmode";
import { PlayerSeat } from "./PlayerSeat";
import { Center } from "./Center";
import { LeftPanel } from "./LeftPanel";
import { Scoreboard, RoundEndOverlay } from "./Scoreboard";
import { BustedOverlay } from "./BustedOverlay";
import { GameLostOverlay } from "./GameLostOverlay";
import { GloriousVictory } from "./GloriousVictory";
import { SuddenDeathSplash } from "./SuddenDeathSplash";
import { EvolvedOutcomeCinematic } from "./EvolvedOutcomeCinematic";
import { ActionBanner } from "./ActionBanner";
import { RoundStartCinematic } from "./RoundStartCinematic";
import { ActionLog } from "./ActionLog";
import { TrainingPanel } from "./TrainingPanel";
import { MpNotices } from "./MpNotices";
import { armBotSnap, botMove, executeBotSnap, findBotSnap, ingestReveals, reactToRoundEnd, resetBotKnowledge } from "../ai/bot";
import { clearReveals as clearRevealsEngine } from "../engine/game";
import { Audio } from "../audio/sounds";
import { useTheme } from "../state/theme";
import { AquariumWallpaper } from "./AquariumWallpaper";
import { NorthernLightsWallpaper } from "./NorthernLightsWallpaper";
import { EmeraldWallpaper } from "./EmeraldWallpaper";
import { OceanWallpaper } from "./OceanWallpaper";
import { CrimsonWallpaper } from "./CrimsonWallpaper";
import { CosmicWallpaper } from "./CosmicWallpaper";
import { CaboLettersBurst } from "./Particles";
import { actionSwapAnimationHoldMs } from "./cardMotion";
import { useFitToViewport } from "./fitScale";

// How long a transient peek / spy reveal stays face-up before it auto-flips
// back. There is no tap-to-skip — it dismisses smoothly on its own. Snappy but
// long enough to read and memorise the card. (Tunable: lower = faster.)
const REVEAL_HOLD_MS = 1800;

export function Table() {
  const game = useStore((s) => s.game!);
  const humanId = useStore((s) => s.humanId);
  const targeting = useStore((s) => s.targeting);
  const mode = useStore((s) => s.mode);
  const toast = useStore((s) => s.toast);
  const setToast = useStore((s) => s.setToast);
  const consumeAnimations = useStore((s) => s.consumeAnimations);
  // Current user-selected table background theme (persisted in localStorage).
  // The `<div className="table-bg" />` below uses its `data-theme` attribute
  // to pick which gradient stack renders behind the table.
  const tableTheme = useTheme();

  // Phone-mode layout state. When `isMobile`, the LeftPanel renders INLINE
  // in the table-grid (between deck and human cards) when it's the human's
  // turn — no more drawer/toggle for actions. The right-sidebar still slides
  // up as a bottom sheet via the 📊 Scores top-bar button.
  const viewMode = useViewMode();
  const isMobile = viewMode === "mobile";
  // Desktop board auto-fit: uniformly downscale the card board so it always
  // fits the viewport height at 100% zoom. Short laptops/MacBooks were
  // clipping the human's hand off the bottom. Disabled on mobile, which keeps
  // its own dvh/flex layout. See useFitToViewport + getFitScale.
  const { ref: tableGridRef, scale: fitScale } = useFitToViewport(
    !isMobile,
    [game.players.length, viewMode],
  );
  // Mobile: when the human must pick a card on the BOARD (a swap / peek /
  // blind-swap / peek-and-swap target, or an armed snap they're taking),
  // collapse the inline action panel so it never covers the cards they need
  // to tap. The peek-and-swap DECIDE step is excluded — it shows Yes/No
  // buttons in the panel and needs no board pick. (The snap-trigger buttons
  // live in their own bottom bar, not this panel, so snapping still works.)
  const humanSnapping =
    (game.snapPhase === "armed_self" || game.snapPhase === "armed_other") &&
    game.snappingPlayerId === humanId;
  const boardPickActive =
    (targeting !== null || humanSnapping) &&
    game.phase !== "action_peek_and_swap_decide";
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  // Phone overflow menu — consolidates the theme / sound / help / chat FABs
  // (which otherwise float over the cards) into one top-bar dropdown.
  const [moreOpen, setMoreOpen] = useState(false);
  const setAudioOpen = useStore((s) => s.setAudioOpen);
  const setThemeOpen = useStore((s) => s.setThemeOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const setChatOpen = useStore((s) => s.setChatOpen);

  // CABO letter-burst particle anchor — set when a "cabo_called" animation
  // event lands. Cleared 1.2s later so the burst auto-unmounts.
  const [caboBurst, setCaboBurst] = useState<{ x: number; y: number; key: number } | null>(null);

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
      // Snap pauses the world. The bot's pending move (and any drawn card it
      // already holds) freezes until the snap resolves; this effect re-fires
      // via the snapPhase dep below.
      if (latest.snapPhase !== "idle") return;
      // Route through applyBotMove so kicked-seat skipping + bust detection
      // fire when a bot's action lands the round in round_over (or pushes
      // someone over 60).
      useStore.getState().applyBotMove(botMove(latest));
    }, delay);
    return () => clearTimeout(t);
  }, [game.phase, game.currentPlayer, hasTransientReveal, mode, game.snapPhase]);

  // SP-only: bot snap reactions. The trigger is a CHANGE to the discard top
  // (i.e. a fresh card just landed), not every state tick. Watching the full
  // players array used to re-arm this timer on every action in 3-4 player
  // games — Bob's 320-700ms reaction window kept getting cancelled before it
  // could fire. We key on the top card's identity instead so the timer
  // survives until it fires (or the discard changes for real).
  //
  // Cinematic-first flow: at the chosen reaction time, ARM the bot's snap
  // (emits snap_armed_*, SnapCinematic shows the SNAP! overlay). Then a
  // second timer (~1.0s later, after the overlay) resolves the snap. This
  // mirrors what a human does: press → cinematic → pick.
  const botDifficulty = useStore((s) => s.botDifficulty);
  const discardTopId = game.discard[game.discard.length - 1]?.id;
  const ARM_OVERLAY_MS = 1000;
  // resolveTimerRef lives across effect re-runs so the cleanup of the
  // ARMING effect (which fires once arm changes snapPhase → armed_*) doesn't
  // cancel the scheduled resolve. Cleaned when component unmounts or when
  // a fresh discard-top triggers a brand-new plan.
  const botSnapResolveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (mode === "mp") return;
    if (!botDifficulty) return;
    if (game.phase === "setup_peek" || game.phase === "round_over") return;
    if (hasTransientReveal) return;
    if (game.snapPhase !== "idle") return; // another snap already running
    const live = useStore.getState().game;
    if (!live) return;
    const plan = findBotSnap(live, botDifficulty);
    if (!plan) return;
    const armTimer = setTimeout(() => {
      const latest = useStore.getState().game;
      if (!latest) return;
      if (latest.phase === "setup_peek" || latest.phase === "round_over") return;
      if (latest.snapPhase !== "idle") return;
      // Re-validate: discard top might have changed, or the bot already used
      // its snap budget via a parallel path.
      const bot = latest.players.find((p) => p.id === plan.botId);
      if (!bot) return;
      if (plan.kind === "self" && bot.snapsUsed.self) return;
      if (plan.kind === "other" && bot.snapsUsed.other) return;
      const armed = armBotSnap(latest, plan);
      if (armed === latest) return; // engine rejected
      useStore.getState().applyBotMove(armed);
      // After the SNAP! overlay, resolve.
      botSnapResolveTimer.current = setTimeout(() => {
        botSnapResolveTimer.current = null;
        const afterArm = useStore.getState().game;
        if (!afterArm) return;
        useStore.getState().applyBotMove(executeBotSnap(afterArm, plan));
      }, ARM_OVERLAY_MS);
    }, plan.delayMs);
    return () => {
      clearTimeout(armTimer);
    };
  }, [discardTopId, game.phase, mode, botDifficulty, hasTransientReveal, game.snapPhase]);
  // Cancel a pending resolve if the round ends or the component unmounts.
  useEffect(() => {
    return () => {
      if (botSnapResolveTimer.current) {
        clearTimeout(botSnapResolveTimer.current);
        botSnapResolveTimer.current = null;
      }
    };
  }, []);

  // SP-only: fire a bot speech bubble at each round transition (winner gloats /
  // loser complains). Keyed on roundNumber so a new round triggers exactly once.
  // Auto-clears the bubble after a short window via the next effect.
  const lastReactedRound = useRef(-1);
  useEffect(() => {
    if (mode !== "sp") return;
    if (game.phase !== "round_over") return;
    if (lastReactedRound.current === game.roundNumber) return;
    lastReactedRound.current = game.roundNumber;
    // Small delay so the cinematic round-end stamp lands first.
    const t = setTimeout(() => reactToRoundEnd(game), 1600);
    return () => clearTimeout(t);
  }, [mode, game.phase, game.roundNumber, game]);

  // Auto-clear bot speech bubble ~3.5s after it appears.
  const botSpeech = useStore((s) => s.botSpeech);
  useEffect(() => {
    if (!botSpeech) return;
    const t = setTimeout(() => {
      const latest = useStore.getState().botSpeech;
      if (latest && latest.at === botSpeech.at) {
        useStore.setState({ botSpeech: null });
      }
    }, 3500);
    return () => clearTimeout(t);
  }, [botSpeech]);

  // Auto-flip transient reveals (peek / spy / snap reveals) back face-down after
  // a short window. No tap-to-skip — it dismisses smoothly on its own. Setup
  // peek reveals are intentionally NOT auto-cleared — they stay face-up until
  // startPlay() so players can memorise their dealt cards.
  //
  // The timer is keyed on a STABLE content signature of the transient reveals,
  // NOT on `game.reveals` directly: that array's identity changes every tick
  // (bot moves, MP broadcasts), which kept restarting the timer and left the
  // peeked card stuck face-up — the "sometimes it stays" bug.
  const transientRevealKey = game.reveals
    .filter((r) => r.reason !== "round_end" && r.reason !== "setup")
    .map((r) => `${r.reason}:${r.playerId}:${r.index}:${r.card.id}`)
    .join("|");
  useEffect(() => {
    if (game.phase === "setup_peek") return;
    if (!transientRevealKey) return;
    const t = setTimeout(() => {
      const latest = useStore.getState().game;
      if (!latest) return;
      useStore.setState({ game: clearRevealsEngine(latest) });
      if (useStore.getState().mode === "mp") {
        import("../state/mp").then((m) => m.sendAction({ type: "clear_reveals" }));
      }
    }, REVEAL_HOLD_MS);
    return () => clearTimeout(t);
  }, [transientRevealKey, game.phase]);

  // Spawn the CABO letter-burst particle when a "cabo_called" animation
  // event arrives. Anchor to the centre of the caller's seat by querying
  // the `.seat-{N}` DOM element — a small concession to running outside
  // React, but lighter than forwarding refs through PlayerSeat for a
  // one-frame visual effect.
  //
  // NOTE: the 1.2s auto-clear setTimeout deliberately is NOT registered
  // in this effect's cleanup. game.animations is consumed ~500ms after
  // the cabo_called event lands, which would otherwise tear down the
  // setTimeout and yank the burst off-screen mid-animation. Instead we
  // self-clear inside the timer using the burst's key to verify the
  // burst hasn't been replaced by a newer one.
  useEffect(() => {
    if (game.animations.length === 0) return;
    const latest = game.animations[game.animations.length - 1];
    if (latest.kind !== "cabo_called") return;
    const callerId = latest.payload.playerId as string;
    const seatIdx = game.players.findIndex((p) => p.id === callerId);
    if (seatIdx < 0) return;
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`.seat-${seatIdx}`);
      const rect = el?.getBoundingClientRect();
      if (!rect) return;
      const key = Date.now();
      setCaboBurst({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        key,
      });
      setTimeout(() => {
        setCaboBurst((curr) => (curr?.key === key ? null : curr));
      }, 1200);
    });
    return () => cancelAnimationFrame(raf);
  }, [game.animations, game.players]);

  // Show toasts AND play sound effects for latest animations
  useEffect(() => {
    if (game.animations.length === 0) return;
    const latest = game.animations[game.animations.length - 1];
    let msg: string | null = null;
    switch (latest.kind) {
      case "cabo_called":
        msg = `${nameById(game, latest.payload.playerId as string)} called CABO — final round!`;
        Audio.playSfx("cabo");
        break;
      case "deal":          Audio.playSfx("card_deal"); break;
      case "draw_deck":     Audio.playSfx("card_draw"); break;
      case "draw_discard":  Audio.playSfx("card_draw"); break;
      case "discard_drawn": Audio.playSfx("card_discard"); break;
      case "swap_hand":     Audio.playSfx("card_swap"); break;
      case "blind_swap":    Audio.playSfx("card_swap"); break;
      case "peek_and_swap": Audio.playSfx("card_swap"); break;
      case "reveal": {
        // Use spy SFX when an opponent is shown a card; otherwise peek SFX
        const toIds = (latest.payload.toPlayerIds as string[]) || [];
        const ownerId = latest.payload.playerId as string;
        if (toIds.length && !toIds.includes(ownerId)) {
          Audio.playSfx("spy");
        } else {
          Audio.playSfx("peek");
        }
        break;
      }
      case "round_end":
        // Win/lose SFX is played by RoundEndOverlay on mount so it fires even
        // when this animation is consumed before a player reconnects.
        break;
      case "snap_correct":
      case "snap_wrong":
        // SFX fires inside SnapCinematic so it lines up with the splash.
        break;
      case "snap_penalty_draw":
        Audio.playSfx("snap_penalty");
        break;
    }
    if (msg) setToast(msg);
    const holdMs = actionSwapAnimationHoldMs(latest.kind, viewMode);
    const t = setTimeout(() => consumeAnimations(), holdMs);
    return () => clearTimeout(t);
  }, [game.animations, viewMode]);

  // POV rotation: each viewer sees themselves at the bottom. The other players
  // are arranged in turn-order, starting with the player who plays next.
  //  - next player (1 ahead) → top
  //  - 2 ahead             → right
  //  - 3 ahead (previous)  → left
  // This keeps each player's view consistent (the same opponent appears in the
  // same relative position from every viewer's POV).
  const humanIdx = game.players.findIndex((p) => p.id === humanId);
  // In MP a player who busts is removed from the next round's roster, so on
  // THEIR client `humanId` is no longer in `game.players` (humanIdx === -1).
  // Keep `human` nullable and render a spectator note instead of a PlayerSeat
  // with an undefined player — the latter threw inside PlayerSeat and tore the
  // whole table down (the "frozen, unresponsive screen after a bust" bug).
  const human = humanIdx >= 0 ? game.players[humanIdx] : null;
  const playerCount = game.players.length;

  const sortedOthers = game.players
    .filter((p) => p.id !== humanId)
    .map((p) => ({
      player: p,
      dist:
        (game.players.findIndex((pp) => pp.id === p.id) - humanIdx + playerCount) %
        playerCount,
    }))
    .sort((a, b) => a.dist - b.dist)
    .map((x) => x.player);

  type SlotName = "top" | "left" | "right";
  // Desktop fills top → right → left. On mobile the compact spatial layout
  // reads best when 2-player puts the lone opponent in front (top), 3-player
  // flanks you left + right, and 4-player uses front + both flanks. Order is
  // still keyed purely on turn-distance, so every viewer (incl. MP) sees a
  // consistent arrangement.
  const slotByIndex: SlotName[] = isMobile
    ? playerCount <= 2
      ? ["top"]
      : playerCount === 3
      ? ["left", "right"]
      : ["top", "left", "right"]
    : ["top", "right", "left"];
  const slotMap: Partial<Record<SlotName, (typeof game.players)[number]>> = {};
  sortedOthers.forEach((p, i) => {
    const slot = slotByIndex[i];
    if (slot) slotMap[slot] = p;
  });

  const training = useStore((s) => s.training);
  const backToMenu = useStore((s) => s.backToMenu);
  function handleQuit() {
    if (game.phase === "round_over") { backToMenu(); return; }
    const ok = window.confirm("Leave the game and return to the main menu?");
    if (ok) backToMenu();
  }

  function seatFor(p: (typeof game.players)[number]) {
    return game.players.findIndex((pp) => pp.id === p.id);
  }

  return (
    <LayoutGroup>
      <div className={`table-root players-${game.players.length}${training ? " training-active" : ""}`}>
        {/* Themed background layer (first child so it sits visually at z=0; all
            sibling UI is bumped to z=1 via CSS). The `data-theme` attribute
            selects which gradient renders — see `.table-bg[data-theme=…]` in
            App.css. Two themes also overlay an animated wallpaper (fish for
            Ocean, aurora ribbons for Northern Lights); the others use the
            pure gradient. The current value is local-only and persisted via
            `cabo:theme` in localStorage. */}
        <div className="table-bg" data-theme={tableTheme} aria-hidden="true">
          {/* Ocean = pure dark-blue gradient (no overlay).
              Aquarium = full animated underwater scene (fish, kelp, etc).
              Northern Lights = aurora ribbons + stars overlay. */}
          {/* Animated wallpaper overlays are DESKTOP-ONLY. On phones each ran
              continuous Framer / requestAnimationFrame loops (dozens of
              particles, the Aquarium physics sim, big blur/blend layers) that
              pinned the GPU and never let the renderer idle — the main cause of
              low mobile FPS. The themed gradient on `.table-bg[data-theme]` is
              pure CSS and still renders on mobile, so the table stays themed
              without the per-frame repaint. Desktop is unchanged. */}
          {!isMobile && (
            <>
              {tableTheme === "emerald"  && <EmeraldWallpaper />}
              {tableTheme === "ocean"    && <OceanWallpaper />}
              {tableTheme === "crimson"  && <CrimsonWallpaper />}
              {tableTheme === "cosmic"   && <CosmicWallpaper />}
              {tableTheme === "northern" && <NorthernLightsWallpaper />}
              {tableTheme === "aquarium" && <AquariumWallpaper />}
            </>
          )}
        </div>

        {/* Compact top bar */}
        <div className="top-bar">
          <button className="btn ghost menu-back" onClick={handleQuit}>← Menu</button>
          <span className="top-round-label">Round {game.roundNumber}</span>
          {/* Phone-mode: scoreboard still toggles as a bottom sheet.
              The action panel is now rendered INLINE in the table-grid below,
              so there's no Actions drawer toggle anymore. */}
          {isMobile && (
            <button
              className={`btn ghost mobile-drawer-btn ${rightDrawerOpen ? "active" : ""}`}
              onClick={() => {
                Audio.playSfx("click");
                setRightDrawerOpen((o) => !o);
              }}
              aria-label="Toggle scores panel"
              aria-expanded={rightDrawerOpen}
            >
              📊 Scores
            </button>
          )}
          {isMobile && (
            <div className="top-more-wrap">
              <button
                className={`btn ghost mobile-drawer-btn top-more-btn ${moreOpen ? "active" : ""}`}
                onClick={() => {
                  Audio.playSfx("click");
                  setMoreOpen((o) => !o);
                }}
                aria-label="More options"
                aria-expanded={moreOpen}
              >
                ⋯
              </button>
              {moreOpen && (
                <>
                  <div
                    className="top-more-backdrop"
                    onClick={() => setMoreOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="top-more-menu" role="menu">
                    <button
                      role="menuitem"
                      onClick={() => { Audio.playSfx("click"); setMoreOpen(false); setThemeOpen(true); }}
                    >
                      🎨 Theme
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { Audio.playSfx("click"); setMoreOpen(false); setAudioOpen(true); }}
                    >
                      🔊 Sound
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { Audio.playSfx("click"); setMoreOpen(false); setHelpOpen(true); }}
                    >
                      ❓ Help
                    </button>
                    {mode === "mp" && (
                      <button
                        role="menuitem"
                        onClick={() => { Audio.playSfx("click"); setMoreOpen(false); setChatOpen(true); }}
                      >
                        💬 Chat
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Three-column game body: left panel | table grid | right sidebar
            In mobile mode the LeftPanel is rendered INSIDE the table-grid as
            an extra slot (tslot-action) so it appears between the deck and
            the human's cards. Only when it's the human's turn. */}
        <div className="game-body">
          {!isMobile && <LeftPanel />}

          {/* Table grid — players sit on each side of the deck.
              On desktop it's uniformly down-scaled (useFitToViewport) so the
              whole board — including the human hand — always fits the viewport
              height at 100% zoom on short laptop screens. Mobile keeps its own
              dvh/flex layout (no transform). */}
          <div
            className="table-grid"
            ref={tableGridRef}
            style={
              !isMobile && fitScale < 1
                ? { transform: `scale(${fitScale})`, transformOrigin: "top center" }
                : undefined
            }
          >
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

            {/* Mobile-only: contextual action / status bar between the deck
                and the human's cards. Present throughout play — on your turn
                it holds the action buttons; on an opponent's turn LeftPanel
                shows a slim "… is thinking" status. Keeping it mounted means
                the lower band is never an empty dead zone. Hidden only at
                round_over, where the round-end overlay takes over. */}
            {isMobile && game.phase !== "round_over" && (
              <div className={`tslot tslot-action${boardPickActive ? " tslot-action-hidden" : ""}`}>
                <LeftPanel />
              </div>
            )}

            {/* Bottom — human player (or a spectator note once eliminated). */}
            <div className="tslot tslot-bottom">
              {human ? (
                <PlayerSeat
                  player={human}
                  seatIndex={humanIdx}
                  totalSeats={game.players.length}
                  isCurrent={game.players[game.currentPlayer]?.id === humanId}
                  isHuman={true}
                  tablePos="bottom"
                />
              ) : (
                <div className="spectator-note">
                  You&apos;ve been eliminated — spectating
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar: scoreboard + action log */}
          <div className={`right-sidebar ${isMobile && rightDrawerOpen ? "open" : ""}`}>
            <Scoreboard />
            <ActionLog />
          </div>
        </div>

        {/* Phone-mode drawer backdrop — tap outside to dismiss. Only the
            Scores sidebar uses drawer mode now; the Actions panel is inline. */}
        {isMobile && rightDrawerOpen && (
          <div
            className="drawer-backdrop"
            onClick={() => setRightDrawerOpen(false)}
            aria-hidden="true"
          />
        )}

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
        <RoundStartCinematic />
        <RoundEndOverlay />
        <BustedOverlay />
        <GameLostOverlay />
        <GloriousVictory />
        <SuddenDeathSplash />
        <EvolvedOutcomeCinematic />
        <MpNotices />

        {caboBurst && (
          <CaboLettersBurst
            key={caboBurst.key}
            x={caboBurst.x}
            y={caboBurst.y}
          />
        )}

      </div>

      {/* Training Chamber dev panel — fixed bar at the bottom of the screen */}
      <TrainingPanel />
    </LayoutGroup>
  );
}

function nameById(game: ReturnType<typeof useStore.getState>["game"] & {}, id: string) {
  return game.players.find((p) => p.id === id)?.name ?? id;
}
