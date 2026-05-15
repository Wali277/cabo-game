import type { Card, Rank, Suit } from "./types";

const SUITS: Suit[] = ["S", "H", "D", "C"];
const RANKS: Rank[] = [
  "A", "2", "3", "4", "5", "6", "7",
  "8", "9", "10", "J", "Q", "K",
];

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${rank}${suit}`, rank, suit });
    }
  }
  // Two Jokers — valued at 0, no special action
  deck.push({ id: "Joker1", rank: "Joker", suit: "W" });
  deck.push({ id: "Joker2", rank: "Joker", suit: "W" });
  return deck;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardScore(card: Card): number {
  switch (card.rank) {
    case "A": return 1;
    case "J":
    case "Q": return 10;
    case "K":
    case "Joker": return 0;
    default: return parseInt(card.rank, 10);
  }
}

export function isRedKing(card: Card): boolean {
  return card.rank === "K" && (card.suit === "H" || card.suit === "D");
}

export function isBlackKing(card: Card): boolean {
  return card.rank === "K" && (card.suit === "S" || card.suit === "C");
}

export function actionOf(card: Card): "peek_own" | "peek_other" | "blind_swap" | "peek_and_swap" | null {
  if (card.rank === "7" || card.rank === "8") return "peek_own";
  if (card.rank === "9" || card.rank === "10") return "peek_other";
  if (card.rank === "J" || card.rank === "Q") return "blind_swap";
  if (card.rank === "K") return "peek_and_swap";
  return null;
}

export function handScore(hand: Card[]): number {
  return hand.reduce((s, c) => s + cardScore(c), 0);
}
