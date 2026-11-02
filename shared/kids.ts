// Metaphases Kids — the pure logic behind the Market Moon Club (unit-tested, no network, no state).
// Safety model: everything is PRETEND money that tracks real prices. Nothing here can buy or sell.
import type { Session } from "./types";

// ── Companies a 9-year-old already knows ────────────────────────────────────────────────────
export interface KidCo { s: string; nick: string; hook: string; emoji: string }
export const KID_COMPANIES: KidCo[] = [
  { s: "DIS", nick: "Disney", hook: "makes Disney movies, Pixar and Marvel", emoji: "🏰" },
  { s: "MCD", nick: "McDonald's", hook: "makes Happy Meals and fries", emoji: "🍟" },
  { s: "NKE", nick: "Nike", hook: "makes sneakers and sports clothes", emoji: "👟" },
  { s: "AAPL", nick: "Apple", hook: "makes the iPhone and iPad", emoji: "📱" },
  { s: "MSFT", nick: "Microsoft", hook: "makes Xbox and owns Minecraft", emoji: "🎮" },
  { s: "RBLX", nick: "Roblox", hook: "runs Roblox", emoji: "🧱" },
  { s: "SONY", nick: "Sony", hook: "makes the PlayStation", emoji: "🕹️" },
  { s: "HAS", nick: "Hasbro", hook: "makes toys like Monopoly and Play-Doh", emoji: "🎲" },
  { s: "KO", nick: "Coca-Cola", hook: "makes Coca-Cola and Sprite", emoji: "🥤" },
  { s: "PEP", nick: "PepsiCo", hook: "makes Pepsi, Doritos and Gatorade", emoji: "🥨" },
  { s: "NFLX", nick: "Netflix", hook: "streams shows and movies", emoji: "🍿" },
  { s: "GOOGL", nick: "Google", hook: "runs Google and YouTube", emoji: "▶️" },
  { s: "AMZN", nick: "Amazon", hook: "delivers packages and runs Prime Video", emoji: "📦" },
  { s: "WMT", nick: "Walmart", hook: "runs Walmart stores", emoji: "🛒" },
  { s: "TGT", nick: "Target", hook: "runs Target stores", emoji: "🎯" },
  { s: "SBUX", nick: "Starbucks", hook: "makes Starbucks drinks, even hot chocolate", emoji: "☕" },
  { s: "CMG", nick: "Chipotle", hook: "makes Chipotle burritos", emoji: "🌯" },
  { s: "HSY", nick: "Hershey", hook: "makes Hershey's chocolate and Reese's", emoji: "🍫" },
  { s: "TTWO", nick: "Take-Two", hook: "makes video games like NBA 2K", emoji: "🏀" },
  { s: "SPOT", nick: "Spotify", hook: "plays music on Spotify", emoji: "🎧" },
  { s: "TSLA", nick: "Tesla", hook: "makes electric cars", emoji: "🚗" },
];
export const KID_BY_SYMBOL: Record<string, KidCo> = Object.fromEntries(KID_COMPANIES.map((c) => [c.s, c]));
export const isKidCo = (s: string) => s in KID_BY_SYMBOL;

// ── Dates and words a kid uses ──────────────────────────────────────────────────────────────
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
const KID_SESSION: Record<Session, string> = { bmo: "before school starts", dmh: "during the school day", amc: "after school", "": "(the time isn't set yet)" };

/** "tomorrow after school", "Tuesday before school starts", "on Nov 17 after school". */
export function kidWhen(date: string, session: Session, today: string): string {
  const n = daysBetween(today, date);
  const day = n === 0 ? "today" : n === 1 ? "tomorrow" : n === -1 ? "yesterday" : n > 1 && n < 7 ? parse(date).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) : `on ${parse(date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  return `${day} ${KID_SESSION[session]}`;
}

/** Market Mood (0 fear → 100 greed) as weather. */
export interface Weather { icon: "storm" | "cloud" | "partly" | "sun" | "bright"; emoji: string; title: string; line: string }
export function weatherFor(score: number): Weather {
  if (score < 25) return { icon: "storm", emoji: "⛈️", title: "Stormy", line: "People feel scared. Lots of them are selling, so prices can bounce around a lot." };
  if (score < 45) return { icon: "cloud", emoji: "☁️", title: "Cloudy", line: "People are a bit worried. They are being careful with their money." };
  if (score <= 55) return { icon: "partly", emoji: "⛅", title: "Partly sunny", line: "People feel calm. Not scared, not too excited." };
  if (score <= 75) return { icon: "sun", emoji: "☀️", title: "Sunny", line: "People feel brave. Lots of them want to buy shares." };
  return { icon: "bright", emoji: "🌞", title: "Super sunny", line: "Everyone feels very brave. Maybe a little too brave!" };
}

const dollars = (v: number) => `$${v.toFixed(2)}`;
/** A price move as pocket money: "+4.8% is like $10 turning into $10.48". */
export function moveAnalogy(move: number): string {
  const after = 10 * (1 + move / 100);
  return move >= 0 ? `That's like $10 of pocket money turning into ${dollars(after)}!` : `That's like $10 of pocket money shrinking to ${dollars(after)}.`;
}
/** "Last time it got its report card, the price went up 4.8%." */
export function lastTimeLine(move: number | null): string {
  if (move == null) return "We don't know yet how the price moved last time.";
  const dir = move >= 0 ? "went up" : "went down";
  return `Last time it got its report card, the price ${dir} ${Math.abs(move).toFixed(1)}%. ${moveAnalogy(move)}`;
}
/** What grown-ups expect, in kid words. */
export function expectLine(epsE: number | null): string {
  if (epsE == null) return "Grown-ups haven't guessed a number yet.";
  if (epsE < 0) return `Grown-ups expect it to lose about ${dollars(Math.abs(epsE))} for every share. Some companies spend more than they make while they grow.`;
  return `Grown-ups expect it to make about ${dollars(epsE)} of profit for every share.`;
}

// ── Guess the Report Card ───────────────────────────────────────────────────────────────────
export type Pick = "beat" | "miss";
export interface Guess { s: string; d: string; pick: Pick; price?: "up" | "down"; at: string; result?: "right" | "wrong"; priceResult?: "right" | "wrong" }
export type Resolution = "pending" | "right" | "wrong" | "unknown";
/** Beat = the real profit per share was at least what grown-ups expected. */
export function resolveGuess(pick: Pick, e: { eA: number | null; eE: number | null } | null | undefined): Resolution {
  if (!e || e.eA == null) return "pending";
  if (e.eE == null) return "unknown";
  const beat = e.eA >= e.eE;
  return (pick === "beat") === beat ? "right" : "wrong";
}
export function resolvePrice(pick: "up" | "down" | undefined, move: number | null | undefined): Resolution {
  if (!pick) return "unknown";
  if (move == null) return "pending";
  return (pick === "up") === (move >= 0) ? "right" : "wrong";
}
/** Why it beat or missed, in kid words. */
export function whyLine(nick: string, e: { eA: number | null; eE: number | null }): string {
  if (e.eA == null || e.eE == null) return `${nick} hasn't shared its report card yet.`;
  const beat = e.eA >= e.eE;
  return `Grown-ups expected ${dollars(e.eE)} a share. ${nick} made ${dollars(e.eA)}. That's ${beat ? "more" : "less"} than expected, so it ${beat ? "BEAT" : "MISSED"}!`;
}

// ── Pretend Piggy Bank ──────────────────────────────────────────────────────────────────────
export const START_COINS = 1000;
export const MAX_PICKS = 5;
export interface PiggyHolding { s: string; coins: number; shares: number; start: number }
/** Split coins evenly across picks, in steps of 10, any remainder going to the first pick. */
export function evenSplit(syms: string[], total = START_COINS): Record<string, number> {
  if (!syms.length) return {};
  const each = Math.floor(total / syms.length / 10) * 10;
  const out: Record<string, number> = Object.fromEntries(syms.map((s) => [s, each]));
  out[syms[0]] += total - each * syms.length;
  return out;
}
/** Turn coins into pretend shares at today's prices. Skips companies without a price. */
export function buyPretend(coins: Record<string, number>, prices: Record<string, number | undefined>): PiggyHolding[] {
  return Object.entries(coins)
    .filter(([s, c]) => c > 0 && (prices[s] ?? 0) > 0)
    .map(([s, c]) => ({ s, coins: c, start: prices[s]!, shares: c / prices[s]! }));
}
export function piggyValue(h: PiggyHolding[], prices: Record<string, number | undefined>): number {
  return h.reduce((a, x) => a + x.shares * (prices[x.s] ?? x.start), 0);
}
export function holdingChange(x: PiggyHolding, price: number | undefined): number {
  return ((price ?? x.start) / x.start - 1) * 100;
}
export function biggestMover(h: PiggyHolding[], prices: Record<string, number | undefined>): { s: string; change: number } | null {
  let best: { s: string; change: number } | null = null;
  for (const x of h) { const c = holdingChange(x, prices[x.s]); if (!best || Math.abs(c) > Math.abs(best.change)) best = { s: x.s, change: c }; }
  return best;
}
/** The eggs-in-baskets lesson, tuned to how many companies the kid picked. */
export function basketTip(n: number): string {
  if (n <= 1) return "All your eggs are in one basket! If that one company has a bad day, all your pretend money feels it.";
  if (n === 2) return "Two baskets is safer than one. Adding more companies spreads out the bumps.";
  if (n < 5) return `${n} baskets! If one company has a bad day, the others can help balance it out.`;
  return "5 baskets: nicely spread out! One bad day won't spoil the whole bunch.";
}

// ── Points, levels, badges ──────────────────────────────────────────────────────────────────
export const LEVELS = [
  { min: 0, name: "New Moon" },
  { min: 20, name: "Crescent Moon" },
  { min: 50, name: "Half Moon" },
  { min: 90, name: "Gibbous Moon" },
  { min: 140, name: "Full Moon" },
] as const;
export function levelFor(points: number): { index: number; name: string; next: number | null; progress: number } {
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (points >= LEVELS[k].min) i = k;
  const next = i + 1 < LEVELS.length ? LEVELS[i + 1].min : null;
  const progress = next == null ? 1 : (points - LEVELS[i].min) / (next - LEVELS[i].min);
  return { index: i, name: LEVELS[i].name, next, progress: Math.max(0, Math.min(1, progress)) };
}

/** `quest` = the Lemonade Stand is done (kept for old saves); `chapters` = every finished quest chapter. */
export interface KidsProgress { guesses: Guess[]; lessons: string[]; piggy: boolean; piggyCount: number; quest?: boolean; chapters?: string[] }
export function pointsFor(p: KidsProgress): number {
  const tries = p.guesses.length * 2;
  const right = p.guesses.filter((g) => g.result === "right").length * 10 + p.guesses.filter((g) => g.priceResult === "right").length * 5;
  const ch = p.chapters ?? [];
  const lemonade = p.quest || ch.includes("lemonade");
  return tries + right + p.lessons.length * 10 + (p.piggy ? 5 : 0) + (lemonade ? 15 : 0) + (ch.includes("save") ? 15 : 0) + (ch.includes("dividends") ? 15 : 0);
}
export interface Badge { id: string; name: string; why: string; phase: number }
export const BADGES: Badge[] = [
  { id: "lemonade", name: "Lemonade Boss", why: "You ran Luna's lemonade stand and learned the big words.", phase: 2 },
  { id: "smart-saver", name: "Smart Saver", why: "You learned when to save in a jar and when to grow a money tree.", phase: 3 },
  { id: "dividend-detective", name: "Dividend Detective", why: "You learned how a company's profit can pay its owners.", phase: 3 },
  { id: "first-guess", name: "First Guess", why: "You made your first report card guess.", phase: 0 },
  { id: "good-guess", name: "Sharp Eye", why: "One of your guesses was right!", phase: 1 },
  { id: "streak-3", name: "Hot Streak", why: "Three right guesses in a row.", phase: 3 },
  { id: "piggy", name: "Piggy Banker", why: "You started a pretend piggy bank.", phase: 1 },
  { id: "five-baskets", name: "Egg Spreader", why: "You spread your coins across 5 companies.", phase: 2 },
  { id: "first-lesson", name: "Moon Student", why: "You finished your first Moon School lesson.", phase: 1 },
  { id: "half-school", name: "Half-Moon Scholar", why: "You finished half of Moon School.", phase: 2 },
  { id: "all-school", name: "Full-Moon Scholar", why: "You finished every Moon School lesson!", phase: 4 },
];
export function badgesFor(p: KidsProgress, totalLessons: number): string[] {
  const out: string[] = [];
  if (p.quest || p.chapters?.includes("lemonade")) out.push("lemonade");
  if (p.chapters?.includes("save")) out.push("smart-saver");
  if (p.chapters?.includes("dividends")) out.push("dividend-detective");
  if (p.guesses.length) out.push("first-guess");
  if (p.guesses.some((g) => g.result === "right")) out.push("good-guess");
  const resolved = p.guesses.filter((g) => g.result).sort((a, b) => a.d.localeCompare(b.d));
  let run = 0, best = 0;
  for (const g of resolved) { run = g.result === "right" ? run + 1 : 0; best = Math.max(best, run); }
  if (best >= 3) out.push("streak-3");
  if (p.piggy) out.push("piggy");
  if (p.piggyCount >= 5) out.push("five-baskets");
  if (p.lessons.length >= 1) out.push("first-lesson");
  if (p.lessons.length >= Math.ceil(totalLessons / 2)) out.push("half-school");
  if (totalLessons && p.lessons.length >= totalLessons) out.push("all-school");
  return out;
}

// ── Reading level (Flesch–Kincaid grade), for keeping kid copy simple ───────────────────────
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}
export function fkGrade(text: string): number {
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length);
  const words = text.split(/\s+/).map((w) => w.replace(/[^A-Za-z']/g, "")).filter(Boolean);
  if (!words.length) return 0;
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
}

/** A deterministic pick for "of the day" content (same all day, changes tomorrow). */
export function ofTheDay<T>(items: T[], today: string, salt = 0): T {
  const n = parse(today).getTime() / 86400000;
  return items[Math.abs(Math.floor(n) + salt) % items.length];
}
