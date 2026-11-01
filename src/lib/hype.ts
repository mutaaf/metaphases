// Hype Check: turn a social-media caption into stocks, then into red flags and honest questions.
// Every function here is pure and unit-tested. Flags come only from real numbers in TickerResponse —
// never sentiment, never advice.
import type { TickerResponse } from "../../shared/types";

export interface Co { n: string; mc: number }

/** Words that look like tickers in a caption but almost never mean one. */
const NOISE = new Set([
  "A", "I", "AI", "CEO", "CFO", "CTO", "USA", "US", "UK", "EU", "IPO", "ETF", "ETFS", "CPI", "GDP", "PCE", "FOMC", "FED", "SEC", "EPS", "PE",
  "YOLO", "FOMO", "LOL", "OMG", "WTF", "IMO", "IMHO", "TBH", "DD", "ATH", "NFA", "DYOR", "HODL", "BUY", "SELL", "HOLD", "NOW", "NEW", "ALL",
  "IT", "ON", "OR", "AND", "THE", "FOR", "BIG", "GO", "SO", "AM", "PM", "ET", "PT", "TV", "NYSE", "NASDAQ", "DOW", "SPX", "API", "EV", "EVS",
  "MOON", "PUMP", "BULL", "BEAR", "LONG", "SHORT", "CALL", "CALLS", "PUT", "PUTS", "OTC", "WSB", "TIKTOK", "X", "IG", "FYP", "GDP", "Q", "Q1", "Q2", "Q3", "Q4",
]);

/** Everyday names people use on socials that don't match the legal name. */
const ALIASES: Record<string, string> = {
  google: "GOOGL", alphabet: "GOOGL", facebook: "META", instagram: "META", meta: "META", disney: "DIS", "coca-cola": "KO", coke: "KO",
  berkshire: "BRK.B", "home depot": "HD", walmart: "WMT", costco: "COST", starbucks: "SBUX", mcdonalds: "MCD", "mcdonald's": "MCD",
  nike: "NKE", tesla: "TSLA", nvidia: "NVDA", amazon: "AMZN", apple: "AAPL", microsoft: "MSFT", netflix: "NFLX", palantir: "PLTR",
  amd: "AMD", intel: "INTC", robinhood: "HOOD", coinbase: "COIN", uber: "UBER", airbnb: "ABNB", spotify: "SPOT", shopify: "SHOP",
  "jpmorgan": "JPM", "jp morgan": "JPM", "goldman": "GS", boeing: "BA", target: "TGT", chipotle: "CMG", lululemon: "LULU", reddit: "RDDT", sofi: "SOFI",
};

const STOP_FIRST = new Set(["general", "american", "united", "first", "international", "national", "global", "digital", "advanced", "applied", "bank", "energy", "health", "public", "western", "southern", "northern", "royal", "the", "new", "best", "booking", "target", "progressive"]);

/** Legal name → the core words people actually say ("Palantir Technologies Inc." → "palantir technologies", first word "palantir"). */
export function coreName(name: string): { full: string; first: string | null } {
  const full = name
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(inc|incorporated|corporation|corp|co|company|ltd|limited|plc|holdings?|group|class [abc]|the|n\.?v|s\.?a|ag|se)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const first = full.split(" ")[0] ?? "";
  return { full, first: first.length >= 5 && !STOP_FIRST.has(first) ? first : null };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Find the stocks a caption, URL or query is talking about, in the order they appear. Max 3.
 * Cashtags ($NVDA) always count, even for unknown symbols (those get an "unknown" flag later).
 * Bare uppercase words count only if they're real tickers we track and not noise ("CEO", "USA").
 * Company names and everyday aliases ("Palantir", "Google") count too.
 */
export function extractTickers(text: string, universe: Record<string, Co>, max = 3): string[] {
  if (!text) return [];
  const hits: { s: string; at: number }[] = [];
  const add = (s: string, at: number) => { if (s && !hits.some((h) => h.s === s)) hits.push({ s, at }); };

  for (const m of text.matchAll(/\$([A-Za-z]{1,5}(?:\.[A-Za-z])?)\b/g)) add(m[1].toUpperCase(), m.index ?? 0);
  for (const m of text.matchAll(/\/(?:quote|stocks?|symbol)\/([A-Za-z.]{1,6})\b/gi)) { const s = m[1].toUpperCase(); if (universe[s]) add(s, m.index ?? 0); }
  for (const m of text.matchAll(/(?<![$\w])([A-Z]{2,5}(?:\.[A-Z])?)(?![\w])/g)) { const s = m[1]; if (universe[s] && !NOISE.has(s)) add(s, m.index ?? 0); }
  // A lone lowercase/mixed ticker query like "nvda" or "pltr".
  const trimmed = text.trim();
  if (/^[A-Za-z]{1,5}(\.[A-Za-z])?$/.test(trimmed) && universe[trimmed.toUpperCase()] && !NOISE.has(trimmed.toUpperCase())) add(trimmed.toUpperCase(), 0);

  const lower = text.toLowerCase();
  for (const [alias, s] of Object.entries(ALIASES)) {
    const m = new RegExp(`(?<![\\w-])${escapeRe(alias)}(?:'s)?(?![\\w-])`).exec(lower);
    if (m && universe[s]) add(s, m.index);
  }
  // Legal-name matching, biggest companies first so "Apple" beats a smaller namesake.
  const byCap = Object.entries(universe).sort((a, b) => b[1].mc - a[1].mc);
  for (const [s, c] of byCap) {
    const { full, first } = coreName(c.n);
    for (const phrase of [full, first]) {
      if (!phrase || phrase.length < 4) continue;
      const m = new RegExp(`(?<![\\w-])${escapeRe(phrase)}(?![\\w-])`).exec(lower);
      if (m) { add(s, m.index); break; }
    }
  }
  return hits.sort((a, b) => a.at - b.at).slice(0, max).map((h) => h.s);
}

export interface Flag { key: string; tone: "red" | "amber" | "info"; label: string; why: string }

const numFrom = (v: string | undefined) => { const x = parseFloat(String(v ?? "").replace(/[^\d.\-]/g, "")); return Number.isFinite(x) ? x : null; };
const input = (t: TickerResponse, factor: string, label: string) =>
  [...t.compass.factors, ...t.setup.factors].find((f) => f.key === factor)?.inputs.find((i) => i.label === label)?.value;

/** Red flags from real data only. Each says what it means in plain words. */
export function redFlags(t: TickerResponse | null, opts: { tracked: boolean; today?: string } = { tracked: true }): Flag[] {
  const F: Flag[] = [];
  if (!opts.tracked) F.push({ key: "unknown", tone: "amber", label: "Not on our list of widely followed companies", why: "It may be small or thinly traded. Less coverage means less information — and bigger swings." });
  if (!t) return F;
  const q = (t.quarters ?? []).filter((x) => x.eps != null || x.om != null);
  const last = q[q.length - 1];
  const opm = numFrom(input(t, "profitability", "Operating margin"));
  if ((last?.eps != null && last.eps < 0) || (last?.om != null && last.om < 0) || (opm != null && opm < 0)) {
    F.push({ key: "unprofitable", tone: "red", label: "Not making a profit yet", why: "It's spending more than it earns. The price depends on people believing that changes." });
  }
  if (t.expectedMove != null && t.expectedMove >= 8) {
    F.push({ key: "swingy", tone: "red", label: `Jumps about ±${t.expectedMove.toFixed(0)}% on earnings day`, why: "A report can move it a lot in one morning — in either direction." });
  } else if (t.setup.atrPct != null && t.setup.atrPct >= 4) {
    F.push({ key: "volatile", tone: "amber", label: `Moves about ${t.setup.atrPct.toFixed(1)}% on an ordinary day`, why: "That's a bumpy ride even without news." });
  }
  const spark = t.spark ?? [];
  const run3m = spark.length > 63 ? (spark[spark.length - 1] / spark[spark.length - 64] - 1) * 100 : null;
  if (run3m != null && run3m >= 30 && t.setup.from52wHigh != null && t.setup.from52wHigh >= -6) {
    F.push({ key: "hot", tone: "amber", label: `Up ${run3m.toFixed(0)}% in 3 months, near its yearly high`, why: "A lot of good news may already be in the price. Late buyers take the most risk." });
  }
  const de = numFrom(input(t, "health", "Debt / equity"));
  if (de != null && de > 2) F.push({ key: "debt", tone: "amber", label: "Carries heavy debt", why: `It owes about ${de.toFixed(1)}× what shareholders own. Debt gets harder when sales slow or rates rise.` });
  const val = t.compass.factors.find((f) => f.key === "valuation")?.grade;
  if (val === "F" || val === "D") F.push({ key: "pricey", tone: "info", label: "Expensive compared with its profits", why: "Investors are paying up for future growth. If growth disappoints, the price can fall far." });
  if (t.next && opts.today) {
    const n = Math.round((Date.parse(t.next.date) - Date.parse(opts.today)) / 86400000);
    if (n >= 0 && n <= 7) F.push({ key: "soon", tone: "info", label: n === 0 ? "Reports today" : `Reports in ${n} day${n === 1 ? "" : "s"}`, why: "Buying right before a report means betting on how it lands." });
  }
  return F;
}

/** Three honest questions to ask before buying — shaped by the flags we found. */
export function questionsFor(flags: Flag[], name: string): string[] {
  const Q: string[] = [];
  const has = (k: string) => flags.some((f) => f.key === k);
  if (has("unprofitable")) Q.push(`When does ${name} expect to make money — and what if it takes longer?`);
  if (has("swingy") || has("volatile")) Q.push("Could you hold on if it dropped 15% the morning after a report?");
  if (has("hot")) Q.push("Who's posting about it — and did they buy before telling you?");
  if (has("debt")) Q.push(`What happens to ${name} if sales slow and it still has to pay its debts?`);
  if (has("unknown")) Q.push("Can you find its last annual report and explain what it sells?");
  for (const q of [
    `What does ${name} actually sell, and who pays for it?`,
    "Why is everyone talking about it right now?",
    "How much of your money would this be — and are you OK if it halves?",
  ]) if (Q.length < 3 && !Q.includes(q)) Q.push(q);
  return Q.slice(0, 3);
}
