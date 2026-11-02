// Metaphases Kids — quest chapters 2 and 3, broken into micro-lessons a 9-year-old can tap through.
// Ch2 "Save or Grow?" (saving vs investing) and Ch3 "Your Slice Pays You" (dividends). All copy here is
// held to Flesch–Kincaid grade ≤ 5 by a unit test, and all the math is fixed (no randomness, no real
// prices) so every kid sees the same story. Nothing here is advice: both saving and investing are good
// tools, picked by WHEN you need the money.

export type ChapterId = "lemonade" | "save" | "dividends";
export type SaveStage = "jar" | "tree" | "choose" | "check";
export type DivStage = "payout" | "snowball" | "real" | "check";

export interface ChapterMeta { id: ChapterId; emoji: string; title: string; blurb: string; badge: string }
export const CHAPTERS: ChapterMeta[] = [
  { id: "lemonade", emoji: "🍋", title: "Luna's Lemonade Stand", blurb: "What a company, a share and a price are.", badge: "lemonade" },
  { id: "save", emoji: "🌳", title: "Save or Grow?", blurb: "A savings jar or a money tree. When do you pick each?", badge: "smart-saver" },
  { id: "dividends", emoji: "🪙", title: "Your Slice Pays You", blurb: "Some companies share their profit with owners.", badge: "dividend-detective" },
];
export const CH_STAGES = { save: ["jar", "tree", "choose", "check"], dividends: ["payout", "snowball", "real", "check"] } as const;
const LEMONADE_STAGES = ["company", "shares", "price", "report"];

/** Which chapters are finished, from the quest stage list in kids progress ("save:jar", …). */
export function chaptersDone(quest: string[], lemonadeDone: boolean): ChapterId[] {
  const out: ChapterId[] = [];
  if (lemonadeDone || LEMONADE_STAGES.every((s) => quest.includes(s))) out.push("lemonade");
  for (const id of ["save", "dividends"] as const) if (CH_STAGES[id].every((s) => quest.includes(`${id}:${s}`))) out.push(id);
  return out;
}
/** The chapter a kid should do next, or null when every chapter is done. */
export function nextChapter(done: ChapterId[]): ChapterMeta | null {
  return CHAPTERS.find((c) => !done.includes(c.id)) ?? null;
}

// ── The math (fixed, so it's the same for every kid and testable) ───────────────────────────
export const START = 10;
export const JAR_RATE = 2; // % a year
/** A FIXED bumpy path for the money tree: two down years, about 7% a year on average. */
export const TREE_YEARS = [14, 8, -15, 18, 9, 6, -8, 14, 10, 18];
const r2 = (v: number) => Math.round(v * 100) / 100;
/** Value at the start (index 0) and after each year. */
export function jarPath(years: number, start = START): number[] {
  const out = [start];
  for (let i = 0; i < years; i++) out.push(r2(out[i] * (1 + JAR_RATE / 100)));
  return out;
}
export function treePath(years: number, start = START): number[] {
  const out = [start];
  for (let i = 0; i < years; i++) out.push(r2(out[i] * (1 + TREE_YEARS[i % TREE_YEARS.length] / 100)));
  return out;
}

export const SLICES = 4;
export const PAY_PER_SLICE = 1;
export const SLICE_PRICE = 5;
export const SEASONS = 6;
/** Dividends over seasons: spend them, or replant them into more slices (fractional slices allowed). */
export function snowball(seasons = SEASONS): { spend: { spent: number; slices: number; pay: number }[]; replant: { slices: number; pay: number }[] } {
  const spend = [{ spent: 0, slices: SLICES, pay: SLICES * PAY_PER_SLICE }];
  const replant = [{ slices: SLICES, pay: SLICES * PAY_PER_SLICE }];
  for (let i = 0; i < seasons; i++) {
    const s = spend[i];
    spend.push({ spent: s.spent + s.pay, slices: SLICES, pay: SLICES * PAY_PER_SLICE });
    const r = replant[i];
    const slices = Math.round((r.slices + r.pay / SLICE_PRICE) * 100) / 100;
    replant.push({ slices, pay: r2(slices * PAY_PER_SLICE) });
  }
  return { spend, replant };
}

// ── Chapter 2: Save or Grow? ────────────────────────────────────────────────────────────────
export const SAVE = {
  intro: "You made $10 at your lemonade stand. Nice! Now what? You can keep it safe, or help it grow. Let's try both.",
  jar: {
    title: "The savings jar",
    ask: "Put your $10 in a savings jar at the bank. The bank pays you a little extra each year to keep it there. Tap to make a year go by!",
    tap: "A year goes by",
    done: "Your money grew a tiny bit every year. It never went down. That's saving: safe and slow. The extra the bank pays you is called interest.",
    remember: "Saving is safe. It grows slowly, and it does not go down.",
  },
  tree: {
    title: "The money tree",
    ask: "Now plant $10 as a money tree. That means you buy a slice of a company. Tap to make 10 years go by. Watch both lines!",
    tap: "A year goes by",
    downYear: "Oh no! A bad year. The tree lost some leaves. Don't worry. Wait and see.",
    upYear: "A good year! The tree grew.",
    done: "Some years the tree went down. But after 10 years it grew much more than the jar! That's investing: it can grow more, but it can go down too. It needs time.",
    remember: "Investing can grow more over many years. But it can go down too, so it needs time.",
  },
  choose: {
    title: "Jar or tree?",
    ask: "Here's the secret: pick by WHEN you need the money. Need it soon? Use the jar. Need it in many years? Plant a tree. Sort each card!",
    done: "You sorted them all! Money for soon goes in the jar. Money for a long time from now can grow in a tree.",
    remember: "Soon means save. Far away means you can invest.",
  },
  check: {
    title: "Quick check",
    done: "Chapter done! Now you know when to save and when to grow.",
  },
  finish: "You are a Smart Saver! You know that saving is safe and slow, and investing can grow more but needs time.",
} as const;

export interface SortItem { id: string; emoji: string; text: string; answer: "save" | "invest"; why: string }
export const SORT_ITEMS: SortItem[] = [
  { id: "toy", emoji: "🧸", text: "A toy next week", answer: "save", why: "Next week is soon. The tree might have a bad week, so keep it in the jar." },
  { id: "college", emoji: "🎓", text: "College in 10 years", answer: "invest", why: "10 years is a long time. A tree has time to grow, even after bad years." },
  { id: "gift", emoji: "🎁", text: "A birthday gift for Mom this month", answer: "save", why: "This month is very soon. Keep it safe in the jar." },
  { id: "grownup", emoji: "🧑‍💼", text: "When you're a grown-up", answer: "invest", why: "That's many years away. Lots of time for a tree to grow." },
  { id: "bike", emoji: "🚲", text: "A new bike next summer", answer: "save", why: "Next summer is not very far. The jar keeps it safe until then." },
];

export interface CheckQ { q: string; options: string[]; answer: number; why: string }
export const SAVE_CHECK: CheckQ[] = [
  { q: "Which one can go DOWN some years?", options: ["The money tree", "The savings jar"], answer: 0, why: "An investment can go down in a bad year. Savings in the bank do not." },
  { q: "You need money for a game next week. Where should it be?", options: ["In the savings jar", "In the money tree"], answer: 0, why: "Next week is soon. Keep money you need soon in the jar." },
];

// ── Chapter 3: Your Slice Pays You (dividends) ──────────────────────────────────────────────
export const DIV = {
  intro: "Remember how Bear, Bunny and Frog each own a slice of your stand? When the stand makes a profit, it can share some with them!",
  payout: {
    title: "Pay the owners",
    ask: "Your stand made $8 of profit. It keeps $4 to grow. The other $4 goes to the owners: $1 for each slice. Tap each owner to hand out a coin!",
    done: "Every owner got $1, even you! A company can share its profit like this. That is a dividend.",
    remember: "A dividend is a bit of the profit. Each owner gets some.",
  },
  snowball: {
    title: "Spend or replant?",
    ask: "You own 4 slices, so you get $4 each season. You can spend it, or replant it to buy more slices. Which ends up with more slices? Guess, then tap!",
    tap: "Next season",
    done: "Spending was fun, and that's OK! But replanting bought more slices. More slices pay more coins. It's like a snowball. It gets bigger as it rolls.",
    remember: "Replanting dividends buys more slices, and more slices pay more.",
  },
  real: {
    title: "Real companies",
    ask: "Do these real companies pay dividends? Guess for each one, then flip the card!",
    yes: "gives owners a bit of its profit, a few times a year.",
    no: "puts its money back in to grow.",
    done: "Some companies share profit with owners. Others put it all back into growing. Both are normal!",
    remember: "Some companies pay dividends. Some use all their money to grow.",
  },
  check: {
    title: "Quick check",
    done: "Chapter done! You know what a dividend is.",
  },
  finish: "You are a Dividend Detective! Some companies share their profit with owners. Replant it, and it can grow.",
} as const;

export const DIV_CARDS: { s: string; pays: boolean }[] = [
  { s: "KO", pays: true }, { s: "TSLA", pays: false }, { s: "MCD", pays: true }, { s: "RBLX", pays: false }, { s: "HSY", pays: true },
  { s: "NFLX", pays: false }, { s: "WMT", pays: true }, { s: "AMZN", pays: false }, { s: "PEP", pays: true },
];

export const DIV_CHECK: CheckQ[] = [
  { q: "What is a dividend?", options: ["Profit shared with the owners", "A new kind of toy", "Money you owe the bank"], answer: 0, why: "A dividend is a bit of profit. The company shares it with the people who own its shares." },
  { q: "If you replant your dividends, you get…", options: ["More slices", "Fewer slices"], answer: 0, why: "Replanting buys more slices, and more slices pay you more next time." },
];
