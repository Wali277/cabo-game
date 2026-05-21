/**
 * CabinWallpaper — live animated overlay for the "Cozy Cabin" night theme.
 *
 * Scene: a wooden cabin under a starry night sky with two cats sleeping out
 * front. A crescent moon sits in the upper right. The cabin's windows glow
 * warm and a thin column of smoke rises from the chimney.
 *
 * Live effects (kept intentionally minimal per the spec):
 *   1. Chimney smoke — soft grey puffs continuously rise and dissipate
 *   2. Stars — occasional twinkle (random delays per star)
 *
 * Everything else is static (cabin, cats, moon).
 *
 * Honours `prefers-reduced-motion` via useReducedMotion(): animations stop
 * but the scene remains visible.
 */
import { motion, useReducedMotion } from "framer-motion";

// ─── Stars ──────────────────────────────────────────────────────────────────
// Sprinkled across the upper ~55% of the viewport (sky region). Deterministic
// pseudo-random distribution so the layout doesn't shift between renders.
interface Star {
  id: number;
  x: number; // 0–100 (% of viewport width)
  y: number; // 0–55 (% of viewport height)
  size: number;
  delay: number;
  twinkleDuration: number;
  repeatDelay: number;
}
const STARS: Star[] = Array.from({ length: 70 }, (_, i) => ({
  id: i,
  x: (i * 13.7 + (i % 7) * 5.3) % 100,
  y: 2 + ((i * 3.1 + (i % 5) * 4) % 53),
  size: 1 + (i % 4) * 0.7,
  delay: (i * 0.7) % 14,
  twinkleDuration: 1.6 + (i % 4) * 0.4,
  // Long pause between twinkles so it reads as "occasional", not constant
  repeatDelay: 5 + (i % 6) * 1.5,
}));

// ─── Chimney smoke puffs ────────────────────────────────────────────────────
// Each puff rises, drifts horizontally slightly, and fades out over its cycle.
interface Puff {
  id: number;
  delay: number;
  duration: number;
  drift: number; // horizontal pixel drift
  startScale: number;
  endScale: number;
}
const SMOKE_PUFFS: Puff[] = Array.from({ length: 7 }, (_, i) => ({
  id: i,
  delay: i * 1.1,
  duration: 7 + (i % 3) * 1.0,
  drift: (i % 2 === 0 ? 1 : -1) * (8 + (i % 3) * 4),
  startScale: 0.5 + (i % 3) * 0.1,
  endScale: 2.5 + (i % 4) * 0.6,
}));

export function CabinWallpaper() {
  const reduced = useReducedMotion();

  return (
    <div
      className="cabin-wallpaper"
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      {/* ── Moon (top-right) ─────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: "8%",
          right: "10%",
          width: 80,
          height: 80,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 35% 35%, #fff8d6 0%, #f5e9a8 55%, #d4c478 100%)",
          boxShadow:
            "0 0 30px rgba(255, 248, 200, 0.55), 0 0 60px rgba(255, 240, 180, 0.3), 0 0 100px rgba(255, 230, 150, 0.18)",
        }}
      >
        {/* Subtle craters */}
        <div
          style={{
            position: "absolute", top: "30%", left: "55%", width: 8, height: 8,
            borderRadius: "50%", background: "rgba(200, 185, 130, 0.4)",
          }}
        />
        <div
          style={{
            position: "absolute", top: "60%", left: "30%", width: 6, height: 6,
            borderRadius: "50%", background: "rgba(200, 185, 130, 0.35)",
          }}
        />
        <div
          style={{
            position: "absolute", top: "45%", left: "70%", width: 4, height: 4,
            borderRadius: "50%", background: "rgba(200, 185, 130, 0.3)",
          }}
        />
      </div>

      {/* ── Stars (twinkling occasionally) ──────────────────────────────── */}
      {STARS.map((s) => (
        <motion.div
          key={s.id}
          style={{
            position: "absolute",
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            borderRadius: "50%",
            background: "#ffffff",
            boxShadow: `0 0 ${s.size * 3}px rgba(255, 255, 255, 0.7)`,
            opacity: 0.55,
            willChange: "opacity, transform",
          }}
          animate={
            reduced
              ? {}
              : { opacity: [0.5, 1, 0.5], scale: [1, 1.4, 1] }
          }
          transition={
            reduced
              ? {}
              : {
                  duration: s.twinkleDuration,
                  delay: s.delay,
                  repeat: Infinity,
                  repeatDelay: s.repeatDelay,
                  ease: "easeInOut",
                }
          }
        />
      ))}

      {/* ── Distant tree silhouettes (static — sets the forest mood) ────── */}
      <svg
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "26%",
          width: "100%",
          height: 120,
          opacity: 0.5,
        }}
      >
        {[80, 200, 340, 480, 620, 760, 900, 1040, 1140].map((cx, i) => {
          const w = 70 + (i % 3) * 20;
          const h = 130 + (i % 4) * 18;
          return (
            <polygon
              key={i}
              points={`${cx},${200 - h} ${cx - w / 2},200 ${cx + w / 2},200`}
              fill="#1a2818"
            />
          );
        })}
      </svg>

      {/* ── Ground patch under the cabin ────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "26%",
          background:
            "linear-gradient(180deg, rgba(34, 52, 30, 0) 0%, rgba(28, 44, 22, 0.55) 30%, rgba(20, 32, 16, 0.85) 100%)",
        }}
      />

      {/* ── The cabin + cats (anchored bottom-centre) ───────────────────── */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "8%",
          transform: "translateX(-50%)",
          width: 360,
          height: 280,
        }}
      >
        <svg viewBox="0 0 360 280" width="360" height="280">
          {/* Soft glow on the ground behind the cabin */}
          <ellipse cx="180" cy="262" rx="170" ry="14" fill="rgba(0,0,0,0.35)" />

          {/* Chimney (drawn first so the roof overlaps it cleanly) */}
          <rect x="232" y="50" width="26" height="65" fill="#5a3220" />
          <rect x="228" y="46" width="34" height="10" fill="#3d2014" />

          {/* Roof — triangular front */}
          <polygon points="60,110 180,40 300,110" fill="#7a3f1f" />
          {/* Roof shadow line */}
          <polygon points="60,110 300,110 290,118 70,118" fill="#5a2c14" />
          {/* Roof beam under eaves */}
          <rect x="58" y="108" width="244" height="6" fill="#3d1f0c" />

          {/* House body — log cabin texture via horizontal stripes */}
          <rect x="70" y="114" width="220" height="140" fill="#8b542a" />
          {/* Log lines */}
          {[122, 134, 146, 158, 170, 182, 194, 206, 218, 230, 242].map((y) => (
            <line
              key={y}
              x1="72"
              y1={y}
              x2="288"
              y2={y}
              stroke="#5a3219"
              strokeWidth="1"
            />
          ))}

          {/* Front porch step */}
          <rect x="148" y="230" width="64" height="14" fill="#5a3219" />
          <rect x="142" y="244" width="76" height="6" fill="#3d2014" />

          {/* Door */}
          <rect x="155" y="172" width="50" height="60" fill="#3d2014" />
          <rect x="159" y="176" width="42" height="52" fill="#5a3219" />
          {/* Door panels */}
          <rect x="163" y="180" width="34" height="22" fill="#3d2014" opacity="0.4" />
          <rect x="163" y="206" width="34" height="20" fill="#3d2014" opacity="0.4" />
          {/* Doorknob */}
          <circle cx="195" cy="206" r="1.8" fill="#ffd86b" />

          {/* Hanging lantern above door */}
          <line x1="180" y1="158" x2="180" y2="166" stroke="#3d2014" strokeWidth="1.5" />
          <rect x="174" y="166" width="12" height="14" fill="#3d2014" />
          <rect x="176" y="168" width="8" height="10" fill="#ffd86b" opacity="0.85" />

          {/* Left window with warm glow */}
          <rect x="90" y="146" width="42" height="42" fill="#3d2014" />
          <rect x="94" y="150" width="34" height="34" fill="#ffd86b" />
          {/* Window cross */}
          <line x1="111" y1="150" x2="111" y2="184" stroke="#3d2014" strokeWidth="2" />
          <line x1="94" y1="167" x2="128" y2="167" stroke="#3d2014" strokeWidth="2" />
          {/* Window box with flowers */}
          <rect x="88" y="186" width="46" height="10" fill="#5a3219" />
          <circle cx="96" cy="184" r="3" fill="#fff" opacity="0.9" />
          <circle cx="106" cy="184" r="3" fill="#fff" opacity="0.9" />
          <circle cx="116" cy="184" r="3" fill="#fff" opacity="0.9" />
          <circle cx="126" cy="184" r="3" fill="#fff" opacity="0.9" />

          {/* Right window with warm glow */}
          <rect x="228" y="146" width="42" height="42" fill="#3d2014" />
          <rect x="232" y="150" width="34" height="34" fill="#ffd86b" />
          <line x1="249" y1="150" x2="249" y2="184" stroke="#3d2014" strokeWidth="2" />
          <line x1="232" y1="167" x2="266" y2="167" stroke="#3d2014" strokeWidth="2" />
          <rect x="226" y="186" width="46" height="10" fill="#5a3219" />
          <circle cx="234" cy="184" r="3" fill="#fff" opacity="0.9" />
          <circle cx="244" cy="184" r="3" fill="#fff" opacity="0.9" />
          <circle cx="254" cy="184" r="3" fill="#fff" opacity="0.9" />
          <circle cx="264" cy="184" r="3" fill="#fff" opacity="0.9" />

          {/* Tiny upper attic window */}
          <rect x="170" y="74" width="20" height="22" fill="#3d2014" />
          <rect x="172" y="76" width="16" height="18" fill="#ffd86b" opacity="0.75" />

          {/* Stones at the base */}
          <ellipse cx="60" cy="252" rx="12" ry="6" fill="#5a5048" />
          <ellipse cx="76" cy="256" rx="9" ry="5" fill="#454039" />
          <ellipse cx="296" cy="252" rx="11" ry="6" fill="#5a5048" />
          <ellipse cx="282" cy="256" rx="8" ry="4.5" fill="#454039" />

          {/* Bush on left */}
          <ellipse cx="38" cy="254" rx="22" ry="14" fill="#2a4020" />
          <ellipse cx="32" cy="250" rx="10" ry="8" fill="#324c26" />
          <ellipse cx="46" cy="250" rx="10" ry="8" fill="#324c26" />

          {/* ── Orange cat sleeping (left of door) ─────────────────────── */}
          <g transform="translate(96, 244)">
            {/* Body curled */}
            <ellipse cx="22" cy="14" rx="22" ry="10" fill="#d97a35" />
            {/* Stripes on body */}
            <path d="M 8 11 Q 12 14 8 17" stroke="#a85a20" strokeWidth="1.3" fill="none" />
            <path d="M 18 9 Q 22 12 18 15" stroke="#a85a20" strokeWidth="1.3" fill="none" />
            <path d="M 30 11 Q 34 14 30 17" stroke="#a85a20" strokeWidth="1.3" fill="none" />
            {/* Tail wrapped over body */}
            <path
              d="M 40 14 Q 50 6 38 0 Q 28 6 32 14"
              fill="#d97a35"
              stroke="#a85a20"
              strokeWidth="0.5"
            />
            {/* Head */}
            <circle cx="6" cy="8" r="7" fill="#d97a35" />
            {/* Ears */}
            <polygon points="1,5 3,0 6,4" fill="#d97a35" />
            <polygon points="6,4 9,0 11,5" fill="#d97a35" />
            <polygon points="2,3 4,1 5,4" fill="#f4a368" />
            <polygon points="7,4 9,1 10,3" fill="#f4a368" />
            {/* Closed sleepy eye */}
            <path d="M 3.5 8.5 Q 5 10 6.5 8.5" stroke="#3d2014" strokeWidth="0.8" fill="none" strokeLinecap="round" />
            {/* Tiny nose */}
            <circle cx="2" cy="10" r="0.6" fill="#3d2014" />
            {/* Whiskers */}
            <line x1="0" y1="10" x2="-3" y2="10" stroke="#3d2014" strokeWidth="0.4" />
            <line x1="0" y1="11" x2="-3" y2="12" stroke="#3d2014" strokeWidth="0.4" />
          </g>

          {/* ── Grey cat sleeping (right of door) ───────────────────────── */}
          <g transform="translate(220, 246)">
            {/* Body curled */}
            <ellipse cx="22" cy="13" rx="22" ry="10" fill="#7a7872" />
            {/* Stripes */}
            <path d="M 8 10 Q 12 13 8 16" stroke="#4a4842" strokeWidth="1.3" fill="none" />
            <path d="M 18 8 Q 22 11 18 14" stroke="#4a4842" strokeWidth="1.3" fill="none" />
            <path d="M 30 10 Q 34 13 30 16" stroke="#4a4842" strokeWidth="1.3" fill="none" />
            {/* Tail wrapped */}
            <path
              d="M 4 13 Q -6 5 6 -1 Q 16 5 12 13"
              fill="#7a7872"
              stroke="#4a4842"
              strokeWidth="0.5"
            />
            {/* Head (on the right side this time) */}
            <circle cx="38" cy="7" r="7" fill="#7a7872" />
            {/* Ears */}
            <polygon points="33,4 35,-1 38,3" fill="#7a7872" />
            <polygon points="38,3 41,-1 43,4" fill="#7a7872" />
            <polygon points="34,2 36,0 37,3" fill="#a8a59f" />
            <polygon points="39,3 41,0 42,2" fill="#a8a59f" />
            {/* Closed sleepy eye */}
            <path d="M 37 7.5 Q 38.5 9 40 7.5" stroke="#2d2c28" strokeWidth="0.8" fill="none" strokeLinecap="round" />
            {/* Nose */}
            <circle cx="42" cy="9" r="0.6" fill="#2d2c28" />
            {/* Whiskers */}
            <line x1="44" y1="9" x2="47" y2="9" stroke="#2d2c28" strokeWidth="0.4" />
            <line x1="44" y1="10" x2="47" y2="11" stroke="#2d2c28" strokeWidth="0.4" />
          </g>

          {/* Small daisies in the grass */}
          <g>
            {[
              { x: 30, y: 268 }, { x: 78, y: 270 }, { x: 130, y: 266 },
              { x: 240, y: 270 }, { x: 290, y: 266 }, { x: 330, y: 268 },
            ].map((d, i) => (
              <g key={i} transform={`translate(${d.x}, ${d.y})`}>
                <circle cx="0" cy="0" r="2.2" fill="#fff" />
                <circle cx="0" cy="0" r="0.9" fill="#ffd86b" />
              </g>
            ))}
          </g>
        </svg>

        {/* ── Chimney smoke puffs (live effect) ──────────────────────────
            The chimney top is at roughly y=46 inside the 280px-tall SVG, so
            we anchor smoke at top:46px / left:245px and animate upward. */}
        {!reduced && SMOKE_PUFFS.map((puff) => (
          <motion.div
            key={puff.id}
            style={{
              position: "absolute",
              left: 240,
              top: 32,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "rgba(220, 225, 230, 0.55)",
              filter: "blur(7px)",
              willChange: "transform, opacity",
            }}
            initial={{ y: 0, x: 0, opacity: 0, scale: puff.startScale }}
            animate={{
              y: -220,
              x: [0, puff.drift, puff.drift * 0.5, puff.drift * 1.2],
              opacity: [0, 0.55, 0.4, 0],
              scale: [puff.startScale, 1.6, 2.1, puff.endScale],
            }}
            transition={{
              duration: puff.duration,
              delay: puff.delay,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        ))}
      </div>

      {/* Soft warm glow rising from the cabin (lit windows spilling out) */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "12%",
          transform: "translateX(-50%)",
          width: 380,
          height: 200,
          background:
            "radial-gradient(ellipse at 50% 80%, rgba(255, 200, 110, 0.18) 0%, rgba(255, 180, 80, 0.06) 35%, transparent 70%)",
          filter: "blur(4px)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
