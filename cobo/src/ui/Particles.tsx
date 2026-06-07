/**
 * Three particle systems for the v3.1 polish wave:
 *
 *   • CaboLettersBurst — 4 letters (L-U-M-O) explode outward from a screen
 *     coordinate when someone calls LUMO. Hooked into Table.tsx via a useEffect
 *     watching the latest animation event.
 *
 *   • ShatterGlass — red glass shards radiate from the centre of the
 *     BustedOverlay modal when the local player is busted.
 *
 *   • FireworksLayer — multi-burst firework field rendered behind the
 *     GloriousVictory modal. Each burst recycles every few seconds so the
 *     winner sits in a continuous celebration until they dismiss it.
 *
 * Every system respects framer-motion's `useReducedMotion()` and renders
 * nothing when the user prefers reduced motion.
 */
import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { useViewMode } from "../state/viewmode";

/* ─────────────────────────────────────────────────────────────────────────
   LUMO letter burst
   ─────────────────────────────────────────────────────────────────────── */

interface CaboLettersBurstProps {
  /** Viewport-relative anchor point (centre of the burst). */
  x: number;
  y: number;
  /** Letter colour. Default matches the danger red. */
  color?: string;
}

const BURST_LETTERS = [
  { ch: "L", angle: -135 }, // up-left
  { ch: "U", angle: -45  }, // up-right
  { ch: "M", angle: 135  }, // down-left
  { ch: "O", angle: 45   }, // down-right
];

export function CaboLettersBurst({ x, y, color = "#ff5b6e" }: CaboLettersBurstProps) {
  const reduced = useReducedMotion();
  if (reduced) return null;

  const distance = 130;

  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        pointerEvents: "none",
        zIndex: 9999,
        transform: "translate(-50%, -50%)",
      }}
      aria-hidden="true"
    >
      {BURST_LETTERS.map((l, i) => {
        const rad = (l.angle * Math.PI) / 180;
        const dx = Math.cos(rad) * distance;
        const dy = Math.sin(rad) * distance;
        return (
          <motion.div
            key={l.ch}
            initial={{ x: 0, y: 0, scale: 0.5, opacity: 0, rotate: 0 }}
            animate={{
              x: [0, dx * 0.3, dx],
              y: [0, dy * 0.3, dy],
              scale: [0.5, 1.9, 0.4],
              opacity: [0, 1, 1, 0],
              rotate: [0, 180, 360],
            }}
            transition={{
              duration: 1.0,
              ease: [0.16, 0.7, 0.32, 1],
              delay: i * 0.05,
              opacity: { times: [0, 0.15, 0.7, 1] },
            }}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              fontSize: 56,
              fontWeight: 900,
              color,
              textShadow:
                "0 0 12px rgba(255,91,110,0.6), 0 4px 10px rgba(0,0,0,0.55), 0 0 24px rgba(255,91,110,0.35)",
              fontFamily: "'Fredoka', system-ui, sans-serif",
              transform: "translate(-50%, -50%)",
              letterSpacing: 1,
            }}
          >
            {l.ch}
          </motion.div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Shatter glass — for the BustedOverlay
   ─────────────────────────────────────────────────────────────────────── */

interface ShatterGlassProps {
  color?: string;
  /** Number of shards. 8 reads as "explosion" without being chaotic. */
  shards?: number;
}

export function ShatterGlass({ color = "#ff5b6e", shards }: ShatterGlassProps) {
  const reduced = useReducedMotion();
  const mobile = useViewMode() === "mobile";
  // Fewer SVG shards on mobile (each animates 5 props over 1.6s) — still
  // reads as a shatter. Desktop keeps the fuller 9-shard burst.
  const shardCount = shards ?? (mobile ? 5 : 9);
  if (reduced) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "visible",
        zIndex: 0,
      }}
      aria-hidden="true"
    >
      {Array.from({ length: shardCount }, (_, i) => {
        const angle = (i / shardCount) * 360 + (Math.random() * 30 - 15);
        const rad = (angle * Math.PI) / 180;
        const distance = 200 + Math.random() * 100;
        const dx = Math.cos(rad) * distance;
        const dy = Math.sin(rad) * distance + 80; // gravity bias downward
        const rot = angle + 180 + Math.random() * 360;
        const size = 22 + Math.random() * 18;
        const triangleH = size * 1.4;
        return (
          <motion.svg
            key={i}
            viewBox={`0 0 ${size} ${triangleH}`}
            width={size}
            height={triangleH}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transformOrigin: "center center",
              marginLeft: -size / 2,
              marginTop: -triangleH / 2,
            }}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
            animate={{
              x: [0, dx * 0.6, dx],
              y: [0, dy * 0.4, dy + 220], // gravity-arc fall
              rotate: [0, rot * 0.5, rot],
              opacity: [1, 1, 0],
              scale: [1, 1, 0.85],
            }}
            transition={{
              duration: 1.6,
              ease: [0.16, 0.7, 0.32, 1],
              delay: i * 0.03,
            }}
          >
            {/* Irregular triangular shard with a subtle highlight edge */}
            <polygon
              points={`${size / 2},2 ${size - 2},${triangleH - 2} 2,${triangleH - 2}`}
              fill={color}
              opacity="0.85"
            />
            <polygon
              points={`${size / 2},2 ${size - 4},${triangleH * 0.4} ${size / 2 + 1},${triangleH * 0.7}`}
              fill="rgba(255,255,255,0.35)"
            />
          </motion.svg>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Fireworks — for GloriousVictory
   ─────────────────────────────────────────────────────────────────────── */

interface FireworksLayerProps {
  /** How many simultaneous bursts at any moment. Default 6. */
  count?: number;
}

export function FireworksLayer({ count = 6 }: FireworksLayerProps) {
  const reduced = useReducedMotion();
  const mobile = useViewMode() === "mobile";
  // Each burst runs an INFINITE loop of ~14 particles for the whole victory
  // screen — the longest-lived animation in the game. Halve the bursts on
  // mobile so the celebration doesn't peg the GPU. Desktop keeps all 6.
  const effCount = mobile ? Math.min(count, 3) : count;

  // Generate fixed random positions / delays per mount so the bursts feel
  // organic but stable (no re-randomising on every render).
  const bursts = useMemo(() => {
    const arr: Array<{ x: number; y: number; delay: number; hue: number; id: number }> = [];
    for (let i = 0; i < effCount; i++) {
      arr.push({
        // Bursts spread across the viewport with a bit of margin
        x: 10 + Math.random() * 80,    // % from left
        y: 12 + Math.random() * 50,    // % from top (upper-mid bias)
        delay: Math.random() * 2.4,
        hue: Math.floor(Math.random() * 360),
        id: i,
      });
    }
    return arr;
  }, [effCount]);

  if (reduced) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 410, // above .overlay (400) but below .modal (~500 via overlay child stacking)
        overflow: "hidden",
      }}
      aria-hidden="true"
    >
      {bursts.map((b) => (
        <Firework key={b.id} x={b.x} y={b.y} delay={b.delay} hue={b.hue} mobile={mobile} />
      ))}
    </div>
  );
}

function Firework({ x, y, delay, hue, mobile }: { x: number; y: number; delay: number; hue: number; mobile: boolean }) {
  const particles = mobile ? 8 : 14;
  const cycle = 3.6 + Math.random() * 1.4;

  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
      }}
    >
      {Array.from({ length: particles }, (_, i) => {
        const angle = (i / particles) * 360;
        const rad = (angle * Math.PI) / 180;
        const distance = 70 + Math.random() * 30;
        const targetX = Math.cos(rad) * distance;
        const targetY = Math.sin(rad) * distance;
        const colorHue = hue + (Math.random() * 30 - 15);
        return (
          <motion.div
            key={i}
            initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
            animate={{
              x: [0, targetX * 0.6, targetX],
              y: [0, targetY * 0.5, targetY + 20], // slight gravity sag
              scale: [0, 1.3, 0],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: 1.8,
              delay,
              repeat: Infinity,
              repeatDelay: cycle,
              ease: [0.16, 0.7, 0.32, 1],
              opacity: { times: [0, 0.1, 0.7, 1] },
            }}
            style={{
              position: "absolute",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: `hsl(${colorHue}, 100%, 65%)`,
              boxShadow: `0 0 8px hsl(${colorHue}, 100%, 75%), 0 0 16px hsl(${colorHue}, 100%, 55%)`,
            }}
          />
        );
      })}

      {/* Bright central flash that pulses with the burst */}
      <motion.div
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 2.5] }}
        transition={{
          duration: 0.4,
          delay,
          repeat: Infinity,
          repeatDelay: cycle + 1.4,
          ease: "easeOut",
        }}
        style={{
          position: "absolute",
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: `hsl(${hue}, 100%, 90%)`,
          boxShadow: `0 0 20px hsl(${hue}, 100%, 75%)`,
          left: -7,
          top: -7,
        }}
      />
    </div>
  );
}
