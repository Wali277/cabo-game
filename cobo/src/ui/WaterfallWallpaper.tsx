import type { ReactElement } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Waterfall wallpaper — painterly forest cliff scene.
 *
 * Visual layers (back → front):
 *   1. Sky strip + distant mountains (in the base gradient + soft mound SVG)
 *   2. Cliff face — large irregular dark gray silhouette with subtle shading
 *   3. Pine forest on each side — stacked triangle silhouettes
 *   4. Waterfall body — vertical white/cyan streams falling continuously
 *   5. Vapor mist — semi-transparent blobs rising from the base
 *   6. Pool — teal bowl at the bottom with pulsing ripples
 *   7. Foreground tree silhouettes — almost-black pines framing the edges
 *
 * Motion is transform/opacity only (compositor-friendly), and the whole
 * scene collapses to a still tableau when prefers-reduced-motion is on.
 */

// ────────────────────────────────────────────────────────────────────────────
// SVG building blocks
// ────────────────────────────────────────────────────────────────────────────

/** A single pine tree silhouette — triangular stacked tiers. */
function Pine({ height = 200, dark = false }: { height?: number; dark?: boolean }): ReactElement {
  const w = height * 0.55;
  const dark1 = dark ? "#050d05" : "#0a2510";
  const dark2 = dark ? "#0a1810" : "#1a3a1a";
  const dark3 = dark ? "#0d2018" : "#2a4a2a";
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width={w} height={height} aria-hidden="true">
      <defs>
        <linearGradient id={`pine-${dark ? "f" : "b"}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={dark2} />
          <stop offset="100%" stopColor={dark1} />
        </linearGradient>
      </defs>
      {/* Trunk */}
      <rect x={w * 0.42} y={height * 0.78} width={w * 0.16} height={height * 0.22} fill={dark1} />
      {/* Three tiers of foliage */}
      <polygon points={`${w / 2},${height * 0.02} ${w * 0.05},${height * 0.46} ${w * 0.95},${height * 0.46}`} fill={`url(#pine-${dark ? "f" : "b"})`} />
      <polygon points={`${w / 2},${height * 0.22} ${w * 0.02},${height * 0.62} ${w * 0.98},${height * 0.62}`} fill={`url(#pine-${dark ? "f" : "b"})`} />
      <polygon points={`${w / 2},${height * 0.42} ${0},${height * 0.82} ${w},${height * 0.82}`} fill={dark3} />
    </svg>
  );
}

/** Large painterly mountain silhouette (distant, soft). */
function MountainBack(): ReactElement {
  return (
    <svg viewBox="0 0 1600 320" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="wf-mountain" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5a7a96" />
          <stop offset="100%" stopColor="#3a5a76" />
        </linearGradient>
      </defs>
      <path
        d="M 0 320 L 0 200 Q 120 80 280 160 Q 420 60 580 140 Q 720 40 880 130 Q 1020 60 1180 150 Q 1340 80 1480 140 Q 1560 160 1600 200 L 1600 320 Z"
        fill="url(#wf-mountain)"
        opacity="0.85"
      />
    </svg>
  );
}

/** The cliff face — large irregular dark rock spanning the centre. */
function Cliff(): ReactElement {
  return (
    <svg viewBox="0 0 1600 900" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="wf-cliff" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a3a42" />
          <stop offset="50%" stopColor="#2a2a32" />
          <stop offset="100%" stopColor="#1e1e26" />
        </linearGradient>
        <linearGradient id="wf-cliff-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a4a52" />
          <stop offset="100%" stopColor="#2a2a32" />
        </linearGradient>
      </defs>
      {/* Main cliff body — irregular mound with bumpy top edge framing the sky */}
      <path
        d="M 0 900
           L 0 320
           Q 60 280 140 300
           Q 230 240 320 280
           Q 420 180 540 240
           Q 660 200 760 260
           L 760 260
           Q 760 240 760 220
           Q 740 200 730 200 L 870 200 Q 860 200 840 220 Q 840 240 840 260
           Q 940 200 1060 260
           Q 1180 180 1300 240
           Q 1380 220 1460 280
           Q 1540 260 1600 320
           L 1600 900 Z"
        fill="url(#wf-cliff)"
      />
      {/* Highlight band along the top edge to suggest a worn rim */}
      <path
        d="M 0 320 Q 60 280 140 300 Q 230 240 320 280 Q 420 180 540 240 Q 660 200 760 260 L 760 274 Q 660 214 540 254 Q 420 194 320 294 Q 230 254 140 314 Q 60 294 0 334 Z"
        fill="url(#wf-cliff-edge)"
        opacity="0.6"
      />
      <path
        d="M 840 260 Q 940 200 1060 260 Q 1180 180 1300 240 Q 1380 220 1460 280 Q 1540 260 1600 320 L 1600 334 Q 1540 274 1460 294 Q 1380 234 1300 254 Q 1180 194 1060 274 Q 940 214 840 274 Z"
        fill="url(#wf-cliff-edge)"
        opacity="0.6"
      />
      {/* Scattered cracks / shadow seams for texture */}
      <path d="M 220 380 Q 260 460 240 560 Q 220 660 280 760" stroke="#0d0d12" strokeWidth="2" fill="none" opacity="0.55" />
      <path d="M 1320 400 Q 1280 500 1340 620 Q 1280 720 1320 820" stroke="#0d0d12" strokeWidth="2" fill="none" opacity="0.55" />
      <path d="M 100 480 Q 140 580 110 700" stroke="#0d0d12" strokeWidth="1.6" fill="none" opacity="0.4" />
      <path d="M 1500 460 Q 1460 580 1490 700" stroke="#0d0d12" strokeWidth="1.6" fill="none" opacity="0.4" />
    </svg>
  );
}

/** The base pool — teal rounded shape at the bottom. */
function Pool(): ReactElement {
  return (
    <svg viewBox="0 0 1600 200" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="wf-pool" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3da8c4" />
          <stop offset="50%" stopColor="#2a8aa8" />
          <stop offset="100%" stopColor="#1a5a70" />
        </linearGradient>
      </defs>
      {/* Pool basin — rounded ellipse fading into the bottom */}
      <path
        d="M 0 200 L 0 60 Q 200 20 400 50 Q 600 10 800 40 Q 1000 10 1200 50 Q 1400 20 1600 60 L 1600 200 Z"
        fill="url(#wf-pool)"
      />
      {/* Surface highlight band */}
      <ellipse cx="800" cy="62" rx="700" ry="12" fill="#7ad0e0" opacity="0.35" />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Animated element configs
// ────────────────────────────────────────────────────────────────────────────

/**
 * Waterfall streams — each is a vertical band positioned across the cliff
 * face, filled with a `linear-gradient` of cyan/white that scrolls
 * downward via `background-position`. The result is a continuous "falling
 * water" appearance without needing dozens of per-frame React updates.
 *
 * Positions are in viewport percent of the wallpaper width. The cliff sits
 * across the central ~36% of the screen, so streams cluster around 50%.
 */
const STREAMS: { left: string; width: string; top: string; bottom: string; opacity: number; duration: number }[] = [
  { left: "45.5%", width: "1.2%", top: "26%", bottom: "16%", opacity: 0.85, duration: 1.0 },
  { left: "47.0%", width: "1.8%", top: "24%", bottom: "16%", opacity: 0.95, duration: 1.1 },
  { left: "49.0%", width: "2.5%", top: "22%", bottom: "16%", opacity: 1.00, duration: 1.0 },
  { left: "51.5%", width: "2.5%", top: "22%", bottom: "16%", opacity: 1.00, duration: 1.05 },
  { left: "54.0%", width: "1.8%", top: "24%", bottom: "16%", opacity: 0.95, duration: 1.1 },
  { left: "55.8%", width: "1.2%", top: "26%", bottom: "16%", opacity: 0.85, duration: 1.0 },
  { left: "48.3%", width: "0.8%", top: "30%", bottom: "16%", opacity: 0.55, duration: 0.9 },
  { left: "52.3%", width: "0.8%", top: "30%", bottom: "16%", opacity: 0.55, duration: 0.95 },
];

/** Vapor mist blobs rising from the base of the waterfall. */
const VAPOR: { left: string; size: number; delay: number; duration: number }[] = [
  { left: "47%", size: 60,  delay: 0,    duration: 4.0 },
  { left: "50%", size: 80,  delay: 1.2,  duration: 4.5 },
  { left: "53%", size: 70,  delay: 0.6,  duration: 4.2 },
  { left: "45%", size: 50,  delay: 2.4,  duration: 5.0 },
  { left: "55%", size: 55,  delay: 1.8,  duration: 4.6 },
  { left: "49%", size: 90,  delay: 3.0,  duration: 5.4 },
];

/** Pool ripples — concentric rings pulsing outward. */
const RIPPLES: { left: string; bottom: string; size: number; delay: number; duration: number }[] = [
  { left: "44%", bottom: "8%", size: 50,  delay: 0,   duration: 4.0 },
  { left: "52%", bottom: "6%", size: 70,  delay: 1.5, duration: 5.0 },
  { left: "48%", bottom: "4%", size: 90,  delay: 2.8, duration: 4.5 },
  { left: "56%", bottom: "10%", size: 40, delay: 0.8, duration: 3.8 },
];

/** Side pine forest (a row of trees along each edge of the cliff base). */
const SIDE_PINES_LEFT: { left: string; bottom: string; height: number; dark?: boolean }[] = [
  { left: "0%",   bottom: "12%", height: 180 },
  { left: "5%",   bottom: "10%", height: 220 },
  { left: "11%",  bottom: "11%", height: 200 },
  { left: "17%",  bottom: "9%",  height: 240 },
  { left: "24%",  bottom: "12%", height: 180 },
  { left: "31%",  bottom: "14%", height: 160 },
  { left: "37%",  bottom: "16%", height: 140 },
];
const SIDE_PINES_RIGHT: { right: string; bottom: string; height: number; dark?: boolean }[] = [
  { right: "0%",  bottom: "12%", height: 180 },
  { right: "5%",  bottom: "10%", height: 220 },
  { right: "11%", bottom: "11%", height: 200 },
  { right: "17%", bottom: "9%",  height: 240 },
  { right: "24%", bottom: "12%", height: 180 },
  { right: "31%", bottom: "14%", height: 160 },
  { right: "37%", bottom: "16%", height: 140 },
];
/** A pair of very large dark foreground pines framing the bottom corners. */
const FG_PINES: { side: "left" | "right"; bottom: string; height: number }[] = [
  { side: "left",  bottom: "-4%", height: 360 },
  { side: "right", bottom: "-2%", height: 380 },
];

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function WaterfallWallpaper() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="waterfall-wallpaper" aria-hidden="true">
      {/* Distant mountains — a thin band ~22% from top */}
      <div className="waterfall-mountains" style={{ left: 0, right: 0, top: "10%", height: "18%" }}>
        <MountainBack />
      </div>

      {/* Cliff face — spans most of the scene */}
      <div className="waterfall-cliff" style={{ left: 0, right: 0, top: 0, bottom: 0 }}>
        <Cliff />
      </div>

      {/* Pool basin at the very bottom */}
      <div className="waterfall-pool" style={{ left: 0, right: 0, bottom: 0, height: "20%" }}>
        <Pool />
      </div>

      {/* Pool ripples */}
      {RIPPLES.map((r, i) => (
        <motion.div
          key={`ripple-${i}`}
          className="waterfall-ripple"
          style={{ left: r.left, bottom: r.bottom, width: r.size, height: r.size * 0.35 }}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={
            reduceMotion
              ? { scale: 1, opacity: 0.4 }
              : { scale: [0.4, 1.4], opacity: [0.7, 0] }
          }
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: r.duration, delay: r.delay, repeat: Infinity, ease: "easeOut" }
          }
        />
      ))}

      {/* Waterfall streams — vertical bands with a scrolling cyan gradient */}
      {STREAMS.map((s, i) => (
        <motion.div
          key={`stream-${i}`}
          className="waterfall-stream"
          style={{
            left: s.left,
            width: s.width,
            top: s.top,
            bottom: s.bottom,
            opacity: s.opacity,
            // The gradient cycles vertically; we animate background-position
            // to drag it downward continuously. Using `repeating-linear-gradient`
            // gives us seamless looping at no extra render cost.
            background:
              "repeating-linear-gradient(180deg, rgba(255,255,255,0.95) 0 18px, rgba(180,212,220,0.78) 18px 32px, rgba(255,255,255,0.95) 32px 50px)",
            backgroundSize: "100% 50px",
            borderRadius: "60% 60% 30% 30% / 8% 8% 4% 4%",
          }}
          animate={
            reduceMotion
              ? { backgroundPositionY: "0px" }
              : { backgroundPositionY: ["0px", "50px"] }
          }
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: s.duration, repeat: Infinity, ease: "linear" }
          }
        />
      ))}

      {/* Vapor mist rising from the waterfall base */}
      {VAPOR.map((v, i) => (
        <motion.div
          key={`vapor-${i}`}
          className="waterfall-vapor"
          style={{
            left: v.left,
            bottom: "16%",
            width: v.size,
            height: v.size,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 40% 40%, rgba(255,255,255,0.85) 0%, rgba(200,222,232,0.45) 50%, transparent 75%)",
          }}
          initial={{ y: 0, opacity: 0, scale: 0.6 }}
          animate={
            reduceMotion
              ? { opacity: 0.3, scale: 1 }
              : { y: [-0, -120, -160], opacity: [0, 0.55, 0], scale: [0.6, 1.3, 1.7] }
          }
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: v.duration, delay: v.delay, repeat: Infinity, ease: "easeOut" }
          }
        />
      ))}

      {/* Side pine forests — clusters of trees on the cliff's lower flanks */}
      {SIDE_PINES_LEFT.map((p, i) => (
        <div
          key={`pl-${i}`}
          className="waterfall-tree"
          style={{ left: p.left, bottom: p.bottom }}
        >
          <Pine height={p.height} dark={p.dark} />
        </div>
      ))}
      {SIDE_PINES_RIGHT.map((p, i) => (
        <div
          key={`pr-${i}`}
          className="waterfall-tree"
          style={{ right: p.right, bottom: p.bottom }}
        >
          <Pine height={p.height} dark={p.dark} />
        </div>
      ))}

      {/* Foreground framing pines — almost black */}
      {FG_PINES.map((p, i) => (
        <div
          key={`fg-${i}`}
          className="waterfall-tree"
          style={
            p.side === "left"
              ? { left: "-2%", bottom: p.bottom }
              : { right: "-2%", bottom: p.bottom }
          }
        >
          <Pine height={p.height} dark={true} />
        </div>
      ))}
    </div>
  );
}
