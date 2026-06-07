import type { ComponentType } from "react";
import { BillyPortrait, MarcyPortrait, BobPortrait } from "../ui/BotPortrait";

export type BotDifficulty = "billy" | "marcy" | "bob";

export type ChatMoment =
  | "callCabo"
  | "roundWin"
  | "roundHighHand"
  | "busted"
  | "gloriousVictory"
  | "juicyDraw";

export interface BotProfile {
  id: BotDifficulty;
  baseName: string;
  difficultyLabel: "Easy" | "Medium" | "Extreme";
  difficultyClass: "easy" | "medium" | "extreme";
  tagline: string;
  description: string;
  accent: string;
  Portrait: ComponentType<{ size?: number }>;
  chat: Record<ChatMoment, string[]>;
}

export const BOT_PROFILES: Record<BotDifficulty, BotProfile> = {
  billy: {
    id: "billy",
    baseName: "Billy Smalls",
    difficultyLabel: "Easy",
    difficultyClass: "easy",
    tagline: "Sweet kid. Bad at cards.",
    description:
      "Billy means well, but he doesn't really get it. Draws from the discard for no reason, calls Lumo at random, and forgets which cards he peeked. Great for warm-ups.",
    accent: "#ffd86b",
    Portrait: BillyPortrait,
    chat: {
      callCabo: [
        "Lumo? Is that what I say?",
        "Luuumooo! I think!",
        "Uhh, lumo!",
        "I wanna stop now!",
      ],
      roundWin: ["I won?! Yay!", "Did I do that?", "Lucky me!", "Wait, really?"],
      roundHighHand: [
        "Oh no, my cards are bad...",
        "Were these supposed to be low?",
        "Whoops.",
        "I thought I was winning...",
      ],
      busted: [
        "I'm out? But I just got here!",
        "Aw man...",
        "Did I do something wrong?",
        "Buh-bye!",
      ],
      gloriousVictory: [
        "I WON THE WHOLE THING?!",
        "Best day ever!",
        "Wait — what just happened?",
        "Mom! I won!",
      ],
      juicyDraw: ["Ooh shiny!", "What's this one do?", "Is this a good one?", "Pretty!"],
    },
  },

  marcy: {
    id: "marcy",
    baseName: "General Marcy",
    difficultyLabel: "Medium",
    difficultyClass: "medium",
    tagline: "Calculated. Composed. A little smug.",
    description:
      "Marcy plays a textbook hand: tracks reveals, calls Lumo when the numbers favor her, and rarely wastes an action. Beatable if you outplay her — not if you just out-luck her.",
    accent: "#67e0a3",
    Portrait: MarcyPortrait,
    chat: {
      callCabo: [
        "Tactical retreat. Lumo.",
        "Engaging endgame. Lumo.",
        "And that's the play. Lumo.",
        "Lumo. Sit down.",
      ],
      roundWin: ["Textbook.", "As predicted.", "Outmaneuvered.", "Did you expect different?"],
      roundHighHand: ["Tactical setback.", "Regrouping.", "Recalibrating.", "Noted."],
      busted: [
        "Strategic withdrawal denied.",
        "Well played, soldier.",
        "I'll see you at the rematch.",
        "Acceptable losses. Mostly mine.",
      ],
      gloriousVictory: [
        "Victory secured.",
        "All according to plan.",
        "Game. Set. Sass.",
        "Dismissed.",
      ],
      juicyDraw: [
        "Oh, you shouldn't have given me this.",
        "Mmm, weaponized.",
        "This'll do nicely.",
        "Intel acquired.",
      ],
    },
  },

  bob: {
    id: "bob",
    baseName: "Bob",
    difficultyLabel: "Extreme",
    difficultyClass: "extreme",
    tagline: "He doesn't lose. He just hasn't bothered yet.",
    description:
      "Bob reads you. He tracks every card you've peeked, swaps into the slots you trust, and races you to Lumo the moment you look comfortable. You will lose more than you win.",
    accent: "#ff5b6e",
    Portrait: BobPortrait,
    chat: {
      callCabo: [
        "Lumo. Sit down.",
        "Lumo. You're done.",
        "Game over. Lumo.",
        "Don't bother. Lumo.",
      ],
      roundWin: [
        "Embarrassing.",
        "Was that supposed to be hard?",
        "Try harder next round.",
        "I barely tried.",
      ],
      roundHighHand: [
        "...whatever. Lucky shot.",
        "Won't happen twice.",
        "Don't get used to it.",
        "Cute.",
      ],
      busted: [
        "...what? Impossible.",
        "This is a fluke.",
        "I demand a rematch.",
        "You cheated. Somehow.",
      ],
      gloriousVictory: [
        "Of course.",
        "Was there ever any doubt?",
        "Bow.",
        "Maybe stick to checkers.",
      ],
      juicyDraw: ["Mmh. Perfect.", "Thank you, deck.", "Oh, you'll regret this.", "Exactly what I needed."],
    },
  },
};

/**
 * Pick a line from a bot's chat pool for the given moment.
 * Returns null if the bot id is unknown (defensive).
 */
export function pickChatLine(botId: BotDifficulty, moment: ChatMoment): string | null {
  const pool = BOT_PROFILES[botId]?.chat[moment];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Build display names for N bots of the same character. Single bot keeps the
 * base name; multiples get Roman-numeral suffixes ("Billy Smalls", "Billy
 * Smalls II", "Billy Smalls III").
 */
export function nameForSlot(botId: BotDifficulty, slot: number): string {
  const base = BOT_PROFILES[botId].baseName;
  if (slot === 0) return base;
  const numerals = ["", "II", "III", "IV"];
  return `${base} ${numerals[slot] ?? `${slot + 1}`}`;
}
