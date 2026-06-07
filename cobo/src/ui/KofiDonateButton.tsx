import { Audio } from "../audio/sounds";

// The creator's Ko-fi page — plain donations + the "buy tokens" item both live here.
const KOFI_URL = "https://ko-fi.com/wali277";

/**
 * Ko-fi "Donate" button — a branded pill that sits to the LEFT of the global
 * Settings gear (bottom-right), shown on every screen exactly like the gear
 * (rendered globally in App.tsx). Hidden on phones via CSS, mirroring the gear.
 *
 * This is a plain external link (opens the Ko-fi page in a new tab). It is
 * intentionally NOT part of the one-at-a-time FAB mutex (chat / audio / theme):
 * clicking it does NOT close any open popover — it just navigates away.
 */
export function KofiDonateButton() {
  return (
    <a
      className="kofi-donate"
      href={KOFI_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Support on Ko-fi (opens in a new tab)"
      onClick={() => Audio.playSfx("click")}
    >
      {/* White coffee-cup mark (Ko-fi style): cup body + saucer + handle, with
          a little steam wisp. Inline so it inherits the white text colour. */}
      <svg
        className="kofi-donate-icon"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        {/* steam */}
        <path
          d="M9 3.2c.7.6.7 1.4 0 2 .7.6.7 1.4 0 2"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M13 3.2c.7.6.7 1.4 0 2 .7.6.7 1.4 0 2"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {/* cup body */}
        <path
          d="M4 10h12v3.2A4.8 4.8 0 0 1 11.2 18H8.8A4.8 4.8 0 0 1 4 13.2V10Z"
          fill="#fff"
        />
        {/* handle */}
        <path
          d="M16 10.8h1.4a2.6 2.6 0 0 1 0 5.2H15.4"
          stroke="#fff"
          strokeWidth="1.7"
          strokeLinecap="round"
          fill="none"
        />
        {/* saucer */}
        <path
          d="M4.4 20h11.2"
          stroke="#fff"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
      <span className="kofi-donate-label">Donate</span>
    </a>
  );
}
