import { useStore } from "../state/store";
import { HelpReference } from "./HelpReference";

/**
 * Host for the in-game Help reference overlay. The BUTTON that opens it now
 * lives in the combined Settings FAB (SettingsFab) on desktop and the in-game
 * top-bar ⋯ menu on phones — this component just mounts the overlay whenever
 * the `helpOpen` store flag is set, so any screen it's mounted on has the rules
 * a click away. (The main menu's "? How to play" button sets the same flag.)
 */
export function HelpButton() {
  const helpOpen = useStore((s) => s.helpOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  return helpOpen ? <HelpReference onClose={() => setHelpOpen(false)} /> : null;
}
