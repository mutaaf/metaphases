// A fixed progress state for the Move-my-progress tests and the exported cross-platform vector
// (the Swift app must decode this exact code to this exact state).
import type { TransferState } from "./kidsTransfer";

export const TRANSFER_SAMPLE: TransferState = {
  guesses: [
    { s: "AAPL", d: "2026-10-29", pick: "beat", price: "up", at: "2026-10-27", result: "right", priceResult: "wrong" },
    { s: "DIS", d: "2026-11-05", pick: "miss", price: "up", at: "2026-10-30" },
    { s: "KO", d: "2026-10-21", pick: "beat", at: "2026-10-20", result: "right" },
  ],
  piggy: {
    started: "2026-10-20",
    holdings: [{ s: "DIS", coins: 400, shares: 4, start: 100 }, { s: "RBLX", coins: 300, shares: 7.5, start: 40 }],
    history: { "2026-10-20": 1000, "2026-10-26": 1010, "2026-10-30": 1024.14 },
  },
  lessons: ["company", "share"],
  lessonDates: { share: "2026-10-28", company: "2026-10-10" },
  seenBadges: ["first-guess", "lemonade"],
  me: 2,
  league: [{ emoji: 3, guesses: [{ s: "AAPL", d: "2026-10-29", pick: "beat", price: "up" }] }],
  quest: ["company", "shares"],
  questDone: true,
};
