interface Props {
  size?: number;
}

/**
 * Billy Smalls — a small cheerful kid with a backwards cap, freckles, and a
 * big toothy grin. Yellows / oranges to read as "easy / friendly".
 */
export function BillyPortrait({ size = 96 }: Props) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      aria-label="Billy Smalls portrait"
      role="img"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="billy-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff3b8" />
          <stop offset="100%" stopColor="#ffb84a" />
        </linearGradient>
        <linearGradient id="billy-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd9b0" />
          <stop offset="100%" stopColor="#f3b97f" />
        </linearGradient>
      </defs>

      <circle cx="48" cy="48" r="46" fill="url(#billy-bg)" />

      {/* Body / shirt */}
      <path
        d="M14 88 Q14 64 32 60 Q48 56 64 60 Q82 64 82 88 Z"
        fill="#7ec8ff"
        stroke="#3a7ad1"
        strokeWidth="2.5"
      />
      <path d="M40 60 L42 70 L54 70 L56 60" fill="#5fb0f0" />

      {/* Head */}
      <circle cx="48" cy="40" r="22" fill="url(#billy-skin)" stroke="#b97c4c" strokeWidth="2" />

      {/* Tuft of hair under the cap */}
      <path
        d="M30 32 Q32 22 40 22 Q48 18 56 22 Q64 22 66 32 Q60 28 48 28 Q36 28 30 32 Z"
        fill="#a25a26"
      />

      {/* Backwards cap */}
      <path
        d="M28 30 Q34 18 48 18 Q62 18 68 30 Q68 34 60 34 L36 34 Q28 34 28 30 Z"
        fill="#ff5b6e"
        stroke="#b8253a"
        strokeWidth="2"
      />
      <rect x="32" y="32" width="32" height="3.5" fill="#b8253a" />
      <path d="M52 30 L66 30 Q72 32 70 38 Q66 36 56 34 Z" fill="#ff5b6e" stroke="#b8253a" strokeWidth="2" />

      {/* Eyes */}
      <circle cx="40" cy="42" r="3.5" fill="#1c1d2b" />
      <circle cx="56" cy="42" r="3.5" fill="#1c1d2b" />
      <circle cx="41" cy="41" r="1.2" fill="#fff" />
      <circle cx="57" cy="41" r="1.2" fill="#fff" />

      {/* Freckles */}
      <circle cx="36" cy="49" r="1" fill="#b97c4c" />
      <circle cx="40" cy="51" r="1" fill="#b97c4c" />
      <circle cx="56" cy="51" r="1" fill="#b97c4c" />
      <circle cx="60" cy="49" r="1" fill="#b97c4c" />

      {/* Toothy grin */}
      <path
        d="M38 53 Q48 62 58 53"
        fill="#3a1c1c"
        stroke="#3a1c1c"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="44" y="55" width="3" height="3" fill="#fff" />
      <rect x="49" y="55" width="3" height="3" fill="#fff" />
    </svg>
  );
}

/**
 * General Marcy — refined fashion-illustration portrait. Sharp black bob,
 * smoky almond eyes with proper lashes, fuller crimson lips, defined
 * cheekbones, beauty mark, gold choker + earrings, tailored black coat.
 */
export function MarcyPortrait({ size = 96 }: Props) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      aria-label="General Marcy portrait"
      role="img"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="marcy-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d4ecd8" />
          <stop offset="55%" stopColor="#6fbf85" />
          <stop offset="100%" stopColor="#2f6d44" />
        </linearGradient>
        <linearGradient id="marcy-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fce0c1" />
          <stop offset="100%" stopColor="#e8b88c" />
        </linearGradient>
        <linearGradient id="marcy-coat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2c2c38" />
          <stop offset="100%" stopColor="#06060a" />
        </linearGradient>
        <linearGradient id="marcy-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#36363c" />
          <stop offset="55%" stopColor="#0a0a10" />
          <stop offset="100%" stopColor="#000" />
        </linearGradient>
        <radialGradient id="marcy-hair-shine" cx="0.3" cy="0.2" r="0.3">
          <stop offset="0%" stopColor="#9090a0" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#9090a0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="marcy-lips" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e63a78" />
          <stop offset="100%" stopColor="#a8205a" />
        </linearGradient>
        <radialGradient id="marcy-eyeshadow" cx="0.5" cy="0.4" r="0.6">
          <stop offset="0%" stopColor="#7a4a8a" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#7a4a8a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="48" cy="48" r="46" fill="url(#marcy-bg)" />

      {/* ── BACK layer of hair (drawn before coat & head) ──
          A wide cascade behind the shoulders. The head and coat will
          cover the front portion of this shape, leaving only the long
          strands flowing past the face and over the shoulders. */}
      <path
        d="M16 36 Q14 16 48 12 Q82 16 80 36 L82 92 L62 92 Q60 78 60 56 L36 56 Q36 78 34 92 L14 92 Z"
        fill="url(#marcy-hair)"
      />
      {/* Shine highlights down the length */}
      <ellipse cx="22" cy="68" rx="2.5" ry="10" fill="url(#marcy-hair-shine)" opacity="0.55" />
      <ellipse cx="74" cy="68" rx="2.5" ry="10" fill="url(#marcy-hair-shine)" opacity="0.55" />

      {/* Tailored black coat — structured shoulders, sharp lapels */}
      <path
        d="M8 92 Q8 64 26 60 L40 64 L48 72 L56 64 L70 60 Q88 64 88 92 Z"
        fill="url(#marcy-coat)"
        stroke="#000"
        strokeWidth="2"
      />
      {/* Coat lapels */}
      <path d="M38 64 L43 80 L48 72 L53 80 L58 64 L48 60 Z" fill="#16161e" stroke="#000" strokeWidth="0.6" />
      {/* Cream silk blouse peek */}
      <path d="M44 62 L48 74 L52 62 Z" fill="#f6ebd6" />
      {/* Subtle pearl button */}
      <circle cx="48" cy="68" r="1.2" fill="#f6ebd6" stroke="#b8a06e" strokeWidth="0.4" />

      {/* Gold choker */}
      <path d="M40 60 Q48 63 56 60" stroke="#ffd86b" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="48" cy="62" r="1.2" fill="#ffd86b" stroke="#b8901c" strokeWidth="0.4" />

      {/* Neck — slimmer, more feminine */}
      <path d="M43 56 L43 61 Q48 63 53 61 L53 56 Z" fill="url(#marcy-skin)" stroke="#b8845c" strokeWidth="0.5" />

      {/* Head — refined oval with subtle taper to chin */}
      <path
        d="M28 38 Q28 18 48 18 Q68 18 68 38 Q68 50 64 56 Q56 62 48 62 Q40 62 32 56 Q28 50 28 38 Z"
        fill="url(#marcy-skin)"
        stroke="#b8845c"
        strokeWidth="1.2"
      />
      {/* Cheekbone shading */}
      <path d="M32 46 Q36 50 34 54 Q30 50 32 46 Z" fill="#d9a574" opacity="0.35" />
      <path d="M64 46 Q60 50 62 54 Q66 50 64 46 Z" fill="#d9a574" opacity="0.35" />

      {/* ── FRONT layer of hair (drawn over the head, framing the face) ──
          Top crown + side strands beside the temples. Critically, these
          STOP at the brow line — face stays visible. */}
      {/* Top crown — covers the upper half of the head, hairline curves
          slightly down at the temples. */}
      <path
        d="M26 32 Q26 14 48 14 Q70 14 70 32 Q70 38 66 36 Q60 32 56 34 L40 34 Q36 32 30 36 Q26 38 26 32 Z"
        fill="url(#marcy-hair)"
      />
      {/* Side-swept fringe over forehead — sweeps right to left */}
      <path
        d="M30 30 Q44 28 60 34 Q56 38 44 36 Q34 35 30 30 Z"
        fill="url(#marcy-hair)"
      />
      {/* Middle part line (subtle) */}
      <path d="M48 14 L48 22" stroke="#000" strokeWidth="0.6" opacity="0.6" />
      {/* Side strands beside the cheeks (don't cover the face) */}
      <path d="M28 32 Q24 44 28 56 L32 56 Q30 44 32 34 Z" fill="url(#marcy-hair)" />
      <path d="M68 32 Q72 44 68 56 L64 56 Q66 44 64 34 Z" fill="url(#marcy-hair)" />
      {/* Hair shine on the crown */}
      <ellipse cx="36" cy="22" rx="7" ry="3.5" fill="url(#marcy-hair-shine)" />
      <ellipse cx="58" cy="22" rx="5" ry="2.5" fill="url(#marcy-hair-shine)" opacity="0.7" />

      {/* Eyeshadow base (soft smoky violet) */}
      <ellipse cx="40" cy="42" rx="5" ry="2.5" fill="url(#marcy-eyeshadow)" />
      <ellipse cx="56" cy="42" rx="5" ry="2.5" fill="url(#marcy-eyeshadow)" />

      {/* Shaped brows — clean arch peaking inward */}
      <path
        d="M34 37 Q37 35 40 35.5 Q43 36 44 38"
        stroke="#0a0a10"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M52 38 Q53 36 56 35.5 Q59 35 62 37"
        stroke="#0a0a10"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />

      {/* Almond eyes — larger, more expressive */}
      <path d="M34 44 Q40 40 45 44 Q40 47 34 44 Z" fill="#fff" />
      <path d="M51 44 Q56 40 62 44 Q56 47 51 44 Z" fill="#fff" />
      {/* Iris — slightly larger */}
      <circle cx="40" cy="44" r="2.2" fill="#3a2860" />
      <circle cx="56" cy="44" r="2.2" fill="#3a2860" />
      {/* Pupil */}
      <circle cx="40" cy="44" r="1.2" fill="#0a0a10" />
      <circle cx="56" cy="44" r="1.2" fill="#0a0a10" />
      {/* Iris highlight */}
      <circle cx="40.8" cy="43.3" r="0.7" fill="#fff" />
      <circle cx="56.8" cy="43.3" r="0.7" fill="#fff" />
      {/* Eyeliner — top, with subtle winged flick */}
      <path d="M34 44 Q40 40 45 44 L46 43 L45 44" stroke="#0a0a10" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M51 44 Q56 40 62 44 L63 43" stroke="#0a0a10" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      {/* Wing flick */}
      <path d="M45 44 L47 41" stroke="#0a0a10" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M62 44 L64 41" stroke="#0a0a10" strokeWidth="1.4" strokeLinecap="round" />
      {/* Lower lashes — small ticks */}
      <path d="M36 46 L36 47" stroke="#0a0a10" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M40 46.8 L40 48" stroke="#0a0a10" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M44 46 L44 47" stroke="#0a0a10" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M52 46 L52 47" stroke="#0a0a10" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M56 46.8 L56 48" stroke="#0a0a10" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M60 46 L60 47" stroke="#0a0a10" strokeWidth="0.8" strokeLinecap="round" />

      {/* Defined cheek blush */}
      <ellipse cx="34" cy="51" rx="3.5" ry="2.2" fill="#ff7a96" opacity="0.45" />
      <ellipse cx="62" cy="51" rx="3.5" ry="2.2" fill="#ff7a96" opacity="0.45" />

      {/* Beauty mark — under right eye */}
      <circle cx="58.5" cy="49" r="0.6" fill="#3a1c0a" />

      {/* Subtle slim nose */}
      <path d="M48 47 L47 53 Q48 54.5 49 53 Z" fill="#d9a574" opacity="0.7" />
      <ellipse cx="47.4" cy="53.4" rx="0.6" ry="0.4" fill="#b8845c" opacity="0.55" />
      <ellipse cx="48.6" cy="53.4" rx="0.6" ry="0.4" fill="#b8845c" opacity="0.55" />

      {/* Fuller pouty lips — defined cupid's bow with highlight */}
      <path
        d="M40 56.5 Q44 55.5 46 56.5 L48 55.5 L50 56.5 Q52 55.5 56 56.5 Q55 60.5 48 61.2 Q41 60.5 40 56.5 Z"
        fill="url(#marcy-lips)"
        stroke="#7a1244"
        strokeWidth="0.7"
      />
      {/* Cupid's bow shadow */}
      <path d="M44 56.5 L46 56 L48 56.4 L50 56 L52 56.5" stroke="#7a1244" strokeWidth="0.5" fill="none" />
      {/* Lower lip highlight */}
      <path d="M44 59 Q48 60.2 52 59" stroke="#ff9bc0" strokeWidth="0.8" fill="none" opacity="0.85" strokeLinecap="round" />

      {/* Sassy smirk lift — right corner raised */}
      <path d="M52 56.5 Q55 55 56 56.5" stroke="#7a1244" strokeWidth="0.9" fill="none" strokeLinecap="round" />

      {/* Gold drop earrings */}
      <circle cx="26" cy="48" r="1.4" fill="#ffd86b" stroke="#b8901c" strokeWidth="0.4" />
      <path d="M26 49.5 L26 53" stroke="#ffd86b" strokeWidth="0.8" />
      <circle cx="26" cy="54" r="1.6" fill="#ffd86b" stroke="#b8901c" strokeWidth="0.5" />
      <circle cx="70" cy="48" r="1.4" fill="#ffd86b" stroke="#b8901c" strokeWidth="0.4" />
      <path d="M70 49.5 L70 53" stroke="#ffd86b" strokeWidth="0.8" />
      <circle cx="70" cy="54" r="1.6" fill="#ffd86b" stroke="#b8901c" strokeWidth="0.5" />
    </svg>
  );
}

/**
 * Bob — bald Black man, strong jaw, dignified-confident expression. Sharp
 * goatee, dark suit with a red tie (his signature crimson accent).
 */
export function BobPortrait({ size = 96 }: Props) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      aria-label="Bob portrait"
      role="img"
      style={{ display: "block" }}
    >
      <defs>
        <radialGradient id="bob-bg" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0%" stopColor="#6b1e2a" />
          <stop offset="100%" stopColor="#1c0a10" />
        </radialGradient>
        <linearGradient id="bob-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6b4326" />
          <stop offset="100%" stopColor="#3d2310" />
        </linearGradient>
        <radialGradient id="bob-head-shine" cx="0.45" cy="0.18" r="0.45">
          <stop offset="0%" stopColor="#8a5a3a" stopOpacity="1" />
          <stop offset="100%" stopColor="#8a5a3a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bob-suit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c1d2b" />
          <stop offset="100%" stopColor="#08080c" />
        </linearGradient>
      </defs>

      <circle cx="48" cy="48" r="46" fill="url(#bob-bg)" />

      {/* Broad masculine shoulders — dark suit */}
      <path
        d="M6 92 Q6 60 28 56 Q48 50 68 56 Q90 60 90 92 Z"
        fill="url(#bob-suit)"
        stroke="#000"
        strokeWidth="2"
      />
      {/* Suit lapels (V) */}
      <path d="M36 62 L48 78 L60 62 L52 56 L48 60 L44 56 Z" fill="#0a0a14" stroke="#000" strokeWidth="0.8" />
      {/* White shirt peek */}
      <path d="M44 60 L48 74 L52 60 Z" fill="#fff" opacity="0.92" />
      {/* Crimson tie (Bob's signature) */}
      <path d="M46 62 L46.5 74 L48 78 L49.5 74 L50 62 L48 60 Z" fill="#8b1c2e" stroke="#5a0e1c" strokeWidth="0.5" />
      {/* Tie knot */}
      <path d="M46 60 L48 64 L50 60 L48 58 Z" fill="#a32135" />

      {/* Neck — broad, masculine */}
      <path d="M40 56 L40 60 Q48 64 56 60 L56 56 Z" fill="url(#bob-skin)" stroke="#1a0a05" strokeWidth="0.6" />

      {/* Bald head — strong, slightly squared jaw */}
      <path
        d="M28 32 Q28 14 48 14 Q68 14 68 32 L68 48 Q68 60 48 62 Q28 60 28 48 Z"
        fill="url(#bob-skin)"
        stroke="#1a0a05"
        strokeWidth="1.5"
      />
      {/* Head highlight (gives the bald sheen) */}
      <ellipse cx="44" cy="24" rx="14" ry="7" fill="url(#bob-head-shine)" />

      {/* Heavy masculine brow ridge shadow */}
      <path d="M30 38 Q48 32 66 38 L66 42 L30 42 Z" fill="#1a0a05" opacity="0.35" />

      {/* Thick straight brows */}
      <path d="M34 38 L43 38" stroke="#0a0a14" strokeWidth="3" strokeLinecap="round" />
      <path d="M53 38 L62 38" stroke="#0a0a14" strokeWidth="3" strokeLinecap="round" />

      {/* Eyes — calm, confident gaze (no sunglasses) */}
      <ellipse cx="40" cy="44" rx="3.2" ry="2" fill="#fff" />
      <ellipse cx="56" cy="44" rx="3.2" ry="2" fill="#fff" />
      <circle cx="40" cy="44" r="1.7" fill="#1c1408" />
      <circle cx="56" cy="44" r="1.7" fill="#1c1408" />
      {/* Eye glints */}
      <circle cx="40.6" cy="43.4" r="0.6" fill="#fff" />
      <circle cx="56.6" cy="43.4" r="0.6" fill="#fff" />

      {/* Broad nose */}
      <path d="M48 46 L45 53 Q48 55 51 53 Z" fill="#2a1408" opacity="0.55" />
      <ellipse cx="46.5" cy="53" rx="1" ry="0.6" fill="#1a0a05" opacity="0.6" />
      <ellipse cx="49.5" cy="53" rx="1" ry="0.6" fill="#1a0a05" opacity="0.6" />

      {/* Mustache */}
      <path d="M40 56 Q44 55 48 56 Q52 55 56 56" stroke="#0a0a14" strokeWidth="2.2" fill="none" strokeLinecap="round" />

      {/* Goatee — sharp, masculine */}
      <path
        d="M42 58 Q44 62 48 63 Q52 62 54 58 Q54 65 48 67 Q42 65 42 58 Z"
        fill="#0a0a14"
      />

      {/* Confident half-smirk */}
      <path
        d="M42 60 Q48 63 55 59"
        stroke="#1a0a05"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />

      {/* Small ear bumps to complete the silhouette */}
      <ellipse cx="27" cy="40" rx="2.2" ry="4.5" fill="url(#bob-skin)" stroke="#1a0a05" strokeWidth="0.6" />
      <ellipse cx="69" cy="40" rx="2.2" ry="4.5" fill="url(#bob-skin)" stroke="#1a0a05" strokeWidth="0.6" />
      {/* Small gold ear stud (extra confidence detail) */}
      <circle cx="27" cy="42" r="1" fill="#ffd86b" stroke="#b8901c" strokeWidth="0.4" />
    </svg>
  );
}
