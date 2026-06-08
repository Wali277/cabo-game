import { useEffect, useRef, useState } from "react"; // useState kept for hydrated
import "./App.css";
import { useStore } from "./state/store";
import { Menu } from "./ui/Menu";
import { BotPicker } from "./ui/BotPicker";
import { Table } from "./ui/Table";
import { Lobby } from "./ui/Lobby";
import { CoinToss } from "./ui/CoinToss";
import { StrawDraw } from "./ui/StrawDraw";
import { AudioControls } from "./ui/AudioControls";
import { HelpButton } from "./ui/HelpButton";
import { SettingsFab } from "./ui/SettingsFab";
import { KofiDonateButton } from "./ui/KofiDonateButton";
import { ChatPanel } from "./ui/ChatPanel";
import { ThemePicker } from "./ui/ThemePicker";
import { EliminatedOverlay } from "./ui/EliminatedOverlay";
import { KickedOverlay } from "./ui/KickedOverlay";
import { SnapControls } from "./ui/SnapControls";
import { SnapCinematic } from "./ui/SnapCinematic";
import { SnapBonusOverlay } from "./ui/SnapBonusOverlay";
import { DragonRankPicker } from "./ui/DragonRankPicker";
import { DragonActivateCinematic } from "./ui/DragonActivateCinematic";
import { BUSTED_ROOM_KEY } from "./ui/BustedOverlay";
import { getSocket } from "./state/mp";
import { useViewMode, isStandalone } from "./state/viewmode";
import { useDeviceClass } from "./state/deviceClass";
import { RotateLockOverlay } from "./ui/RotateLockOverlay";
// Accounts layer (Phase 1 — auth only).
import { LoginScreen } from "./ui/auth/LoginScreen";
import { SignupScreen } from "./ui/auth/SignupScreen";
import { ForgotPasswordScreen } from "./ui/auth/ForgotPasswordScreen";
import { initAuth } from "./state/auth";
import { useAccountCosmetics } from "./state/accountCosmetics";
// Accounts layer (Phase 3 — profile menu shell): bottom-left account tab
// (menu only — shows username · level · token count · XP bar) and the global
// profile modal (self-gates).
import { AccountMenuTab } from "./ui/account/AccountMenuTab";
import { ProfilePanel } from "./ui/account/ProfilePanel";
// Accounts layer (Phase 4 — XP reward): the SP "game finished" → grant signal
// (no-op for guests/MP) and the global reward-celebration overlay (self-gates).
import { useSpXpGrant } from "./state/useSpXpGrant";
import { XpRewardOverlay } from "./ui/account/XpRewardOverlay";
// Accounts layer — token-purchase celebration (frontend-only): the menu-side
// "balance rose" watcher + the global reveal overlay (self-gates on tokenGrant).
import { useTokenGrantWatch } from "./state/useTokenGrantWatch";
import { TokenPurchaseOverlay } from "./ui/account/TokenPurchaseOverlay";
// "Report a bug" form — opened from the Settings speed-dial; self-gates on the
// store's `reportBugOpen`.
import { ReportBugModal } from "./ui/ReportBugModal";

function getRoomFromPath(): string | null {
  const m = window.location.pathname.match(/\/room\/([A-Za-z0-9]{4,8})/);
  return m ? m[1].toUpperCase() : null;
}

function App() {
  const screen = useStore((s) => s.screen);
  const enterLobby = useStore((s) => s.enterLobby);
  // NOTE: do NOT memoize the room code here. leaveRoom() clears the URL to "/"
  // so re-reading getRoomFromPath() on each Lobby mount gives the correct value
  // (null after a game ends, real code only on a fresh direct-link visit).
  const [hydrated, setHydrated] = useState(false);

  // Phone-mode toggle (set via the button in the main menu). Adds a single
  // `mobile-mode` class to <body> that drives every layout override in App.css.
  const viewMode = useViewMode();
  // Device class + orientation (see deviceClass.ts) — drives the additive
  // tablet-landscape / rotate-lock hooks and data-* attributes. Resolution:
  //   phone-portrait / phone-landscape / tablet-portrait → mobile-mode
  //   tablet-landscape                                    → tablet-landscape (NO mobile-mode)
  //   phone-landscape                                     → + rotate-lock cover
  //   desktop                                             → none of the above
  const { device, orientation } = useDeviceClass();
  useEffect(() => {
    const body = document.body;
    // `mobile-mode` mirrors the resolved ViewMode exactly (phone either way +
    // tablet-portrait). This keeps the giant body.mobile-mode block in App.css
    // governing the phone layout, untouched.
    body.classList.toggle("mobile-mode", viewMode === "mobile");
    // Additive, desktop-isolated hooks (new CSS gated on these only):
    body.classList.toggle(
      "tablet-landscape",
      device === "tablet" && orientation === "landscape",
    );
    body.classList.toggle(
      "rotate-lock",
      device === "phone" && orientation === "landscape",
    );
    body.setAttribute("data-device", device);
    body.setAttribute("data-orientation", orientation);
    return () => {
      body.classList.remove("mobile-mode");
      body.classList.remove("tablet-landscape");
      body.classList.remove("rotate-lock");
      body.removeAttribute("data-device");
      body.removeAttribute("data-orientation");
    };
  }, [viewMode, device, orientation]);

  // Installed-PWA flag → CSS reclaims the status-bar safe area and uses the
  // extra space. Standalone never changes within a session, so set it once.
  useEffect(() => {
    document.body.classList.toggle("standalone", isStandalone());
  }, []);

  // Accounts layer (Phase 1 — auth only): restore any persisted Supabase
  // session once on mount and keep the store's `account` synced. Fire-and-
  // forget — it never blocks the game UI.
  useEffect(() => {
    void initAuth();
  }, []);

  // Accounts layer (Phase 2): apply the EFFECTIVE cosmetics (table wallpaper +
  // card skin) from the signed-in account — defaults for guests, the profile's
  // clamped selections for accounts. Re-applies whenever the account or its
  // active cosmetics change (including after initAuth restores a session).
  useAccountCosmetics();

  // Accounts layer (Phase 4): watch for a completed SP match (logged-in only)
  // and request the server's XP grant once per match. No-op for guests / MP /
  // training — MP rewards arrive via the `xp:reward` socket event.
  useSpXpGrant();

  // Accounts layer: while on the menu, watch for the signed-in token balance to
  // rise (e.g. after a Ko-fi purchase made in another tab) and pop the reveal.
  // Frontend-only — refresh-on-focus + a gentle poll, no socket/backend.
  useTokenGrantWatch();

  const prevScreenRef = useRef(screen);
  const firstRender = useRef(true);

  useEffect(() => {
    const room = getRoomFromPath();
    if (room) {
      // Check if this player was previously busted/eliminated from this room.
      // If yes, show the elimination screen immediately — don't enter the lobby.
      try {
        const raw = localStorage.getItem(BUSTED_ROOM_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as { code: string };
          if (saved.code === room) {
            useStore.setState({ eliminatedFromRoom: true });
            setHydrated(true);
            return;
          }
        }
      } catch { /* ignore malformed data */ }

      // Normal path: open the socket (auto-rejoins via stored session if any)
      // and navigate to the lobby/room screen.
      getSocket();
      enterLobby();
    }
    setHydrated(true);
  }, [enterLobby]);

  // ── Browser history sync ──────────────────────────────────────────────────
  // The app uses Zustand state for navigation, not a router, so the browser
  // has no history by default. We push exactly ONE entry when leaving the menu
  // and replace it when returning, giving the back button one meaningful step.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      history.replaceState({ cabScreen: screen }, "");
      prevScreenRef.current = screen;
      return;
    }

    const prev = prevScreenRef.current;
    prevScreenRef.current = screen;

    if (screen === "menu") {
      // Back at menu (via UI button or browser back) — replace so there's
      // nothing left to go "forward" to.
      history.replaceState({ cabScreen: "menu" }, "");
    } else if (prev === "menu") {
      // Leaving menu for a new session — push one entry so back works.
      history.pushState({ cabScreen: screen }, "");
    }
    // Internal transitions (lobby → coin_toss → game) intentionally share
    // the same single history entry; no extra push.
  }, [screen]);

  // ── Browser back / forward handler ────────────────────────────────────────
  useEffect(() => {
    function handlePopState() {
      const { screen: s, game, backToMenu } = useStore.getState();

      // Mirror the "← Menu" button: ask for confirmation mid-game
      if (s === "game" && game?.phase !== "round_over") {
        const ok = window.confirm("Leave the game and return to the main menu?");
        if (!ok) {
          // User cancelled — re-push so the browser history entry is restored
          history.pushState({ cabScreen: s }, "");
          return;
        }
      }

      backToMenu();
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  if (!hydrated) return null;
  return (
    <>
      {screen === "menu" && <Menu />}
      {/* Accounts layer (Phase 1 — auth screens) */}
      {screen === "login" && <LoginScreen />}
      {screen === "signup" && <SignupScreen />}
      {screen === "forgot" && <ForgotPasswordScreen />}
      {screen === "botPicker" && <BotPicker />}
      {screen === "lobby" && <Lobby initialCode={getRoomFromPath() ?? undefined} />}
      {screen === "coin_toss" && <CoinToss />}
      {screen === "straw_draw" && <StrawDraw />}
      {screen === "game" && <Table />}
      {screen === "game" && <SnapControls />}
      {screen === "game" && <SnapCinematic />}
      {screen === "game" && <SnapBonusOverlay />}
      {screen === "game" && <DragonRankPicker />}
      {screen === "game" && <DragonActivateCinematic />}
      {/* Combined Settings FAB (desktop) — its Sound/Help buttons open the
          AudioControls panel and the HelpButton overlay below. On phones it's
          hidden; those actions live in the in-game ⋯ menu / menu sound toggle. */}
      <SettingsFab />
      {/* Ko-fi "Donate" pill — sits to the LEFT of the gear, shown on every
          screen exactly like the gear (hidden on phones via CSS). It's a plain
          external link, deliberately outside the FAB mutex. */}
      <KofiDonateButton />
      <HelpButton />
      <AudioControls />
      <ChatPanel />
      {/* Theme picker is in-game only — it changes the table background,
          which doesn't exist on the menu or lobby. */}
      {screen === "game" && <ThemePicker />}
      <EliminatedOverlay />
      <KickedOverlay />
      {/* Accounts layer (Phase 3 — profile menu shell). The bottom-left tab
          shows only on the menu (with the token count inside it); the panel
          self-gates on profilePanelOpen + account. */}
      {screen === "menu" && <AccountMenuTab />}
      <ProfilePanel />

      {/* Accounts layer (Phase 4): global XP-reward celebration. Self-gates on
          the store's `xpReward` (null → nothing) so it can sit over any screen
          — the game-over overlays AND the menu. z-index is above Busted/Glory
          so the reward reads after the result. */}
      <XpRewardOverlay />

      {/* Accounts layer — token-purchase celebration. Self-gates on the store's
          `tokenGrant` (null → nothing). The coin "falls" in with a Claim button
          when the balance rises (Ko-fi purchase). Tokens are already credited —
          Claim just acknowledges. Sits just under the XP reward (z-index 458). */}
      <TokenPurchaseOverlay />

      {/* "Report a bug" form — global, self-gates on `reportBugOpen`. Opened
          from the Settings speed-dial 🐛 button. */}
      <ReportBugModal />

      {/* Phone-landscape "rotate your device" cover — self-gates on the device
          class (phone + landscape only); can never show on tablet/desktop. The
          game stays mounted underneath. */}
      <RotateLockOverlay />
    </>
  );
}

export default App;
