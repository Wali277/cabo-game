import { motion } from "framer-motion";
import { useStore } from "../state/store";
import { HelpReference } from "./HelpReference";
import { Audio } from "../audio/sounds";

/**
 * In-game help button — sits bottom-right, just to the LEFT of the audio
 * FAB. Tap to open the reference "notepad" overlay (HelpReference). Rendered
 * conditionally via the helpOpen store flag so any screen with HelpButton
 * mounted has the rules a click away.
 */
export function HelpButton() {
  const helpOpen = useStore((s) => s.helpOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  return (
    <>
      <motion.button
        className="help-fab"
        onClick={() => {
          Audio.playSfx("click");
          setHelpOpen(!helpOpen);
        }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        aria-label="Open in-game help"
      >
        ?
      </motion.button>
      {helpOpen && <HelpReference onClose={() => setHelpOpen(false)} />}
    </>
  );
}
