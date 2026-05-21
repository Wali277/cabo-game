/**
 * LibraryWallpaper — live animated overlay for the "Cozy Library" table theme.
 *
 * Scene: a wood-panelled library with floor-to-ceiling bookshelves on the
 * left and right edges of the viewport. Each shelf is packed with colourful
 * books of varying heights. Candles flicker on the shelves, a brass lantern
 * hangs from the top, and a soft fireplace glow warms one side.
 *
 * Live effects (kept subtle so the scene reads as ambient, not distracting):
 *   1. Candle flames — flicker via opacity + scale wobble
 *   2. Candle / lantern glow halos — pulse gently
 *   3. Fireplace glow — slow breathing pulse
 *
 * Honours `prefers-reduced-motion`.
 */
import { motion, useReducedMotion } from "framer-motion";

// ─── Book colour palette ───────────────────────────────────────────────────
// Deep, library-appropriate hues. Picked from classic leather + cloth book
// bindings: oxblood, forest green, navy, sepia, mustard, plum, teal, burgundy.
const BOOK_COLORS = [
  "#7a2818", // oxblood red
  "#1f3a2a", // forest green
  "#1f2c4c", // navy
  "#5a3a1f", // sepia brown
  "#a87a18", // mustard gold
  "#4a2348", // plum
  "#1f4a4a", // teal
  "#5a1838", // burgundy
  "#2d4818", // moss
  "#4a3818", // antique tan
  "#3a2050", // royal purple
  "#1a3a52", // slate blue
];

// ─── Shelf books generator ─────────────────────────────────────────────────
// Each shelf section produces a row of N books with varying heights so the
// tops form an uneven natural skyline. `shelfTop` and `shelfBottom` are %
// of viewport height — books fill that band as a flex row of vertical bars.
interface Book {
  width: number;     // px
  height: number;    // % of shelf band height
  color: string;
  /** Subtle horizontal tilt in degrees, ±2°. Some books lean. */
  tilt: number;
  /** A few books get a thin gold band detail */
  banded: boolean;
}
function makeShelf(seed: number, count: number): Book[] {
  return Array.from({ length: count }, (_, i) => {
    const s = seed * 31 + i * 17;
    return {
      width: 14 + (s % 9),
      height: 75 + ((s * 3) % 25),
      color: BOOK_COLORS[(s * 7) % BOOK_COLORS.length],
      tilt: i % 11 === 0 ? (i % 2 === 0 ? 3 : -3) : 0,
      banded: i % 4 === 0,
    };
  });
}

// Each side has 4 shelves stacked. shelfBand defines top/bottom % of viewport.
const SHELVES = [
  { topPct: 6,  heightPct: 19, count: 8 },
  { topPct: 28, heightPct: 19, count: 8 },
  { topPct: 50, heightPct: 19, count: 8 },
  { topPct: 72, heightPct: 19, count: 8 },
];

// ─── Candles ──────────────────────────────────────────────────────────────
// Positioned in front of the bookshelves at the shelf-divider lines so they
// read as "objects sitting on the wood plank between book rows".
interface Candle {
  side: "left" | "right";
  /** Vertical position as % of viewport, anchored to candle BASE */
  yPct: number;
  /** Pixel offset from the SCREEN EDGE (not from the shelf's inner edge).
   *  Stays within the shelf's min-width of 130px so candles always render
   *  on-screen even on narrow viewports. */
  xPx: number;
  /** Candle stick height in px */
  stickHeight: number;
  delay: number;
}
const CANDLES: Candle[] = [
  { side: "left",  yPct: 27, xPx: 56,  stickHeight: 36, delay: 0    },
  { side: "left",  yPct: 49, xPx: 70,  stickHeight: 28, delay: 0.7  },
  { side: "left",  yPct: 71, xPx: 50,  stickHeight: 40, delay: 1.4  },
  { side: "right", yPct: 27, xPx: 70,  stickHeight: 32, delay: 0.4  },
  { side: "right", yPct: 49, xPx: 50,  stickHeight: 38, delay: 1.1  },
  { side: "right", yPct: 71, xPx: 64,  stickHeight: 30, delay: 1.7  },
];

export function LibraryWallpaper() {
  const reduced = useReducedMotion();

  return (
    <div
      className="library-wallpaper"
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      {/* ── Floor (warm wood plank gradient at the bottom) ───────────── */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "12%",
          background:
            "linear-gradient(180deg, rgba(74, 42, 24, 0) 0%, rgba(58, 32, 18, 0.6) 40%, rgba(40, 22, 12, 0.9) 100%)",
        }}
      />
      {/* Subtle floor plank lines */}
      <svg
        viewBox="0 0 1000 100"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "10%",
          opacity: 0.35,
        }}
      >
        {[0, 200, 400, 600, 800].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="100" stroke="#1a0c04" strokeWidth="1.5" />
        ))}
      </svg>

      {/* ── Left & right bookshelves ─────────────────────────────────── */}
      {(["left", "right"] as const).map((side) => (
        <div
          key={side}
          style={{
            position: "absolute",
            [side]: 0,
            top: 0,
            bottom: 0,
            width: "16%",
            minWidth: 130,
            background:
              "linear-gradient(" + (side === "left" ? "90deg" : "270deg") +
              ", rgba(54, 30, 14, 0.92) 0%, rgba(64, 38, 18, 0.85) 60%, rgba(40, 22, 12, 0.55) 100%)",
          }}
        >
          {/* Vertical wood grain stripes for shelf side panel */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0.25,
              background:
                "repeating-linear-gradient(90deg, transparent 0 18px, rgba(20, 10, 4, 0.5) 18px 19px)",
            }}
          />

          {/* Shelves */}
          {SHELVES.map((shelf, sIdx) => {
            const books = makeShelf(sIdx * (side === "left" ? 1 : 2) + 1, shelf.count);
            return (
              <div
                key={sIdx}
                style={{
                  position: "absolute",
                  left: 6,
                  right: 6,
                  top: `${shelf.topPct}%`,
                  height: `${shelf.heightPct}%`,
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 3,
                  paddingLeft: 4,
                  paddingRight: 4,
                  borderBottom: "4px solid #2a1606",
                  boxShadow: "0 4px 0 #1a0c04",
                }}
              >
                {books.map((book, bIdx) => (
                  <div
                    key={bIdx}
                    style={{
                      width: book.width,
                      height: `${book.height}%`,
                      background: `linear-gradient(180deg, ${book.color} 0%, ${book.color} 75%, rgba(0,0,0,0.4) 100%)`,
                      borderTop: "2px solid rgba(0,0,0,0.35)",
                      borderLeft: "1px solid rgba(255,255,255,0.06)",
                      borderRight: "1px solid rgba(0,0,0,0.45)",
                      borderRadius: "1px 1px 0 0",
                      transform: book.tilt ? `rotate(${book.tilt}deg)` : undefined,
                      transformOrigin: "bottom center",
                      position: "relative",
                      flexShrink: 0,
                    }}
                  >
                    {/* Optional gold band */}
                    {book.banded && (
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          top: "30%",
                          height: 2,
                          background: "rgba(255, 216, 107, 0.6)",
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          {/* Top crown moulding for the bookcase */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: 18,
              background: "linear-gradient(180deg, #2a1606 0%, #3a200c 100%)",
              boxShadow: "0 3px 6px rgba(0, 0, 0, 0.5)",
            }}
          />
        </div>
      ))}

      {/* ── Candles with flickering flames ───────────────────────────── */}
      {CANDLES.map((c, i) => {
        const sideCSS = c.side === "left"
          ? { left: `${c.xPx}px` }
          : { right: `${c.xPx}px` };
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              ...sideCSS,
              top: `${c.yPct}%`,
              width: 10,
              height: c.stickHeight + 16,
              pointerEvents: "none",
            }}
          >
            {/* Candle stick */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 1,
                width: 8,
                height: c.stickHeight,
                background:
                  "linear-gradient(180deg, #f4ead0 0%, #e8d8a8 60%, #c4ad70 100%)",
                borderRadius: "1px",
                boxShadow: "0 2px 3px rgba(0, 0, 0, 0.4)",
              }}
            />
            {/* Wax drip on side */}
            <div
              style={{
                position: "absolute",
                bottom: c.stickHeight - 6,
                right: 0,
                width: 3,
                height: 8,
                background: "#e8d8a8",
                borderRadius: "0 0 2px 2px",
                opacity: 0.85,
              }}
            />
            {/* Wick (tiny dark line) */}
            <div
              style={{
                position: "absolute",
                bottom: c.stickHeight + 1,
                left: 4,
                width: 1.5,
                height: 4,
                background: "#1a0c04",
              }}
            />
            {/* Flame */}
            <motion.div
              style={{
                position: "absolute",
                bottom: c.stickHeight + 4,
                left: 1,
                width: 8,
                height: 12,
                borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
                background:
                  "radial-gradient(ellipse at 50% 70%, #fff8b0 0%, #ffcc40 40%, #ff8a18 80%, transparent 100%)",
                filter: "blur(0.4px)",
                transformOrigin: "bottom center",
                willChange: "transform, opacity",
              }}
              animate={
                reduced
                  ? {}
                  : {
                      scaleY: [1, 1.18, 0.9, 1.12, 1],
                      scaleX: [1, 0.92, 1.05, 0.95, 1],
                      opacity: [0.95, 1, 0.85, 0.98, 0.95],
                    }
              }
              transition={
                reduced
                  ? {}
                  : {
                      duration: 0.55,
                      delay: c.delay,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }
              }
            />
            {/* Warm halo around the flame */}
            <motion.div
              style={{
                position: "absolute",
                bottom: c.stickHeight - 4,
                left: -22,
                width: 54,
                height: 54,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(255, 190, 90, 0.45) 0%, rgba(255, 150, 50, 0.18) 40%, transparent 70%)",
                filter: "blur(8px)",
                willChange: "opacity, transform",
              }}
              animate={
                reduced
                  ? {}
                  : { opacity: [0.55, 0.8, 0.5, 0.75, 0.55], scale: [1, 1.08, 0.96, 1.05, 1] }
              }
              transition={
                reduced
                  ? {}
                  : { duration: 2.4, delay: c.delay, repeat: Infinity, ease: "easeInOut" }
              }
            />
          </div>
        );
      })}

      {/* ── Hanging lantern at the top centre ────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          transform: "translateX(-50%)",
          width: 60,
          height: 90,
          pointerEvents: "none",
        }}
      >
        {/* Chain */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: 2,
            height: 30,
            background:
              "repeating-linear-gradient(180deg, #aa8842 0 3px, #6a5020 3px 6px)",
            transform: "translateX(-50%)",
          }}
        />
        {/* Lantern frame */}
        <div
          style={{
            position: "absolute",
            left: 10,
            top: 30,
            width: 40,
            height: 50,
            background: "linear-gradient(180deg, #3a2010 0%, #2a1808 100%)",
            border: "2px solid #aa8842",
            borderRadius: "4px",
            boxShadow:
              "0 0 24px rgba(255, 190, 80, 0.35), inset 0 0 12px rgba(0, 0, 0, 0.7)",
          }}
        >
          {/* Glass panel with warm glow */}
          <motion.div
            style={{
              position: "absolute",
              inset: 4,
              background:
                "radial-gradient(circle at 50% 60%, rgba(255, 220, 130, 0.85) 0%, rgba(255, 170, 70, 0.55) 40%, rgba(180, 100, 30, 0.3) 80%)",
              borderRadius: "2px",
              willChange: "opacity",
            }}
            animate={reduced ? {} : { opacity: [0.85, 1, 0.92, 1, 0.85] }}
            transition={
              reduced
                ? {}
                : { duration: 3.6, repeat: Infinity, ease: "easeInOut" }
            }
          />
          {/* Vertical bars on lantern */}
          <div
            style={{
              position: "absolute",
              inset: 4,
              background:
                "repeating-linear-gradient(90deg, transparent 0 11px, rgba(40, 22, 10, 0.45) 11px 13px)",
              borderRadius: "2px",
            }}
          />
        </div>
        {/* Lantern cap */}
        <div
          style={{
            position: "absolute",
            left: 6,
            top: 26,
            width: 48,
            height: 8,
            background: "linear-gradient(180deg, #6a4824 0%, #4a3018 100%)",
            borderRadius: "4px 4px 0 0",
          }}
        />
      </div>

      {/* Wide warm halo from the hanging lantern */}
      <motion.div
        style={{
          position: "absolute",
          left: "50%",
          top: -40,
          width: 280,
          height: 280,
          borderRadius: "50%",
          transform: "translateX(-50%)",
          background:
            "radial-gradient(circle, rgba(255, 200, 110, 0.28) 0%, rgba(255, 170, 70, 0.1) 35%, transparent 65%)",
          filter: "blur(20px)",
          willChange: "opacity, transform",
        }}
        animate={
          reduced
            ? {}
            : { opacity: [0.85, 1, 0.85], scale: [1, 1.04, 1] }
        }
        transition={
          reduced
            ? {}
            : { duration: 5, repeat: Infinity, ease: "easeInOut" }
        }
      />

      {/* ── Fireplace glow on the right side (just warmth, no full fireplace) ── */}
      <motion.div
        style={{
          position: "absolute",
          right: "12%",
          bottom: "8%",
          width: 320,
          height: 220,
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse, rgba(255, 130, 40, 0.22) 0%, rgba(255, 90, 20, 0.12) 30%, transparent 65%)",
          filter: "blur(28px)",
          willChange: "opacity",
        }}
        animate={
          reduced
            ? {}
            : { opacity: [0.65, 0.95, 0.7, 1, 0.65] }
        }
        transition={
          reduced
            ? {}
            : { duration: 4.5, repeat: Infinity, ease: "easeInOut" }
        }
      />

      {/* Soft top vignette so the top edge feels deep */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: "30%",
          background:
            "linear-gradient(180deg, rgba(10, 4, 0, 0.45) 0%, transparent 100%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
