// Grading engines ported from Market Digest:
//   - Compass quality grade  ← src/analysis/fundamentals.py (valuation / profitability / growth / health)
//   - Setup grade            ← src/analysis/multi_tf_scorer.py + daytrade_scorer.py (RSI zone, trend, 52w range, volatility)
//   - score_to_grade         ← daytrade_scorer.GRADE_SCALE, identical thresholds
import type { Factor, Grade } from "./types";

const GRADE_SCALE: [number, Grade][] = [
  [90, "A+"], [85, "A"], [80, "A-"], [75, "B+"], [70, "B"], [65, "B-"], [60, "C+"], [55, "C"], [50, "C-"], [40, "D"],
];

export function scoreToGrade(score: number | null): Grade | null {
  if (score == null || Number.isNaN(score)) return null;
  for (const [t, g] of GRADE_SCALE) if (score >= t) return g;
  return "F";
}

type M = Record<string, number | string | undefined>;
const num = (m: M, ...keys: string[]): number | null => {
  for (const k of keys) {
    const v = m[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
};

/** Step scorer: first threshold the value clears wins (same shape as fundamentals.py). */
function step(v: number | null, steps: [number, number][], fallback: number, lowerIsBetter = false): number | null {
  if (v == null) return null;
  for (const [t, s] of steps) if (lowerIsBetter ? v < t : v > t) return s;
  return fallback;
}
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};
const fmt = (v: number | null, suffix = "", d = 1) => (v == null ? "—" : `${v.toFixed(d)}${suffix}`);

export function compassGrade(m: M): { score: number | null; grade: Grade | null; factors: Factor[] } {
  const pe = num(m, "peTTM", "peExclExtraTTM");
  const pb = num(m, "pbQuarterly", "pb");
  const ev = num(m, "evEbitdaTTM");
  const valuation = avg([
    pe != null && pe > 0 ? step(pe, [[15, 90], [20, 70], [30, 50]], 30, true) : null,
    pb != null && pb > 0 ? step(pb, [[1.5, 90], [3, 70], [5, 50]], 30, true) : null,
    ev != null && ev > 0 ? step(ev, [[10, 90], [15, 70], [25, 50]], 30, true) : null,
  ]);

  const gm = num(m, "grossMarginTTM"), om = num(m, "operatingMarginTTM"), roe = num(m, "roeTTM"), roa = num(m, "roaTTM");
  const profitability = avg([
    step(gm, [[50, 90], [30, 70], [15, 50]], 30),
    step(om, [[25, 90], [15, 70], [5, 50]], 30),
    step(roe, [[20, 90], [15, 70], [5, 50]], 30),
    step(roa, [[10, 90], [5, 70], [2, 50]], 30),
  ]);

  const rg = num(m, "revenueGrowthTTMYoy"), eg = num(m, "epsGrowthTTMYoy");
  const growth = avg([step(rg, [[20, 90], [10, 70], [0, 50]], 20), step(eg, [[20, 90], [10, 70], [0, 50]], 20)]);

  const de = num(m, "totalDebt/totalEquityQuarterly", "longTermDebt/equityQuarterly");
  const cr = num(m, "currentRatioQuarterly", "currentRatioAnnual");
  const pfcf = num(m, "pfcfShareTTM");
  const health = avg([
    step(de, [[0.5, 90], [1, 70], [2, 50]], 25, true),
    step(cr, [[2, 90], [1.5, 70], [1, 50]], 25),
    pfcf == null ? null : pfcf > 0 ? 80 : 30,
  ]);

  const factors: Factor[] = [
    {
      key: "valuation", label: "Valuation", score: valuation, grade: scoreToGrade(valuation),
      why: valuation == null ? "Not enough pricing data to judge." : valuation >= 70 ? "You're paying a fair-to-cheap price for each dollar it earns." : valuation >= 50 ? "Priced about like the market — not a bargain, not a bubble." : "Investors are paying a premium; a lot of good news is already in the price.",
      inputs: [
        { label: "P/E", value: fmt(pe, "×"), term: "pe" },
        { label: "P/B", value: fmt(pb, "×"), term: "pb" },
        { label: "EV/EBITDA", value: fmt(ev, "×"), term: "evebitda" },
      ],
    },
    {
      key: "profitability", label: "Profitability", score: profitability, grade: scoreToGrade(profitability),
      why: profitability == null ? "Margins weren't reported." : profitability >= 70 ? "Keeps a big slice of every sale — a sign of pricing power." : profitability >= 50 ? "Solidly profitable, though margins are ordinary." : "Thin margins leave little room for a bad quarter.",
      inputs: [
        { label: "Gross margin", value: fmt(gm, "%"), term: "grossmargin" },
        { label: "Operating margin", value: fmt(om, "%"), term: "opmargin" },
        { label: "ROE", value: fmt(roe, "%"), term: "roe" },
        { label: "ROA", value: fmt(roa, "%"), term: "roa" },
      ],
    },
    {
      key: "growth", label: "Growth", score: growth, grade: scoreToGrade(growth),
      why: growth == null ? "Growth history unavailable." : growth >= 70 ? "Sales and profits are expanding at a healthy clip." : growth >= 50 ? "Growing, but modestly." : "Revenue or earnings are shrinking year over year.",
      inputs: [
        { label: "Revenue growth (TTM)", value: fmt(rg, "%"), term: "revgrowth" },
        { label: "EPS growth (TTM)", value: fmt(eg, "%"), term: "eps" },
      ],
    },
    {
      key: "health", label: "Health", score: health, grade: scoreToGrade(health),
      why: health == null ? "Balance-sheet data unavailable." : health >= 70 ? "Low debt and plenty of cash to cover the bills." : health >= 50 ? "Manageable debt; nothing alarming." : "Leans on debt — worth watching if rates or sales turn.",
      inputs: [
        { label: "Debt / equity", value: fmt(de, "×", 2), term: "de" },
        { label: "Current ratio", value: fmt(cr, "×", 2), term: "currentratio" },
        { label: "Free cash flow", value: pfcf == null ? "—" : pfcf > 0 ? "Positive" : "Negative", term: "fcf" },
      ],
    },
  ];
  const score = avg([valuation, profitability, growth, health]);
  return { score, grade: scoreToGrade(score), factors };
}

// ── Technicals ─────────────────────────────────────────────────────────

export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

export const sma = (xs: number[], n: number) => (xs.length < n ? null : xs.slice(-n).reduce((a, b) => a + b, 0) / n);

export function atrPct(high: number[], low: number[], close: number[], n = 14): number | null {
  if (close.length <= n) return null;
  const trs: number[] = [];
  for (let i = close.length - n; i < close.length; i++) {
    trs.push(Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1])));
  }
  return (trs.reduce((a, b) => a + b, 0) / n / close[close.length - 1]) * 100;
}

/** Market Digest's RSI zone score: recovery zone 30-50 is the sweet spot. */
function scoreRsi(r: number | null) {
  if (r == null) return 40;
  if (r >= 30 && r <= 50) return 80 + (50 - r);
  if (r > 50 && r <= 60) return 60;
  if (r < 30) return 70;
  if (r > 70) return 20;
  return 50;
}

export function setupGrade(c: { close: number[]; high: number[]; low: number[]; beatRate: number | null }) {
  const { close, high, low } = c;
  const last = close[close.length - 1];
  const r = rsi(close);
  const s50 = sma(close, 50), s200 = sma(close, 200);
  let trend = "Sideways";
  if (s50 && s200) {
    if (last > s50 && s50 > s200) trend = "Uptrend";
    else if (last < s50 && s50 < s200) trend = "Downtrend";
    else if (last > s200) trend = "Pullback in uptrend";
    else trend = "Recovering";
  }
  const trendScore = { Uptrend: 90, "Pullback in uptrend": 70, Sideways: 50, Recovering: 45, Downtrend: 20 }[trend] ?? 50;
  const hi = Math.max(...high.slice(-252)), lo = Math.min(...low.slice(-252));
  const from52 = hi ? ((last - hi) / hi) * 100 : null;
  const rangePos = hi > lo ? (last - lo) / (hi - lo) : null;
  const rangeScore = rangePos == null ? null : rangePos > 0.85 ? 75 : rangePos > 0.6 ? 85 : rangePos > 0.35 ? 60 : 35;
  const a = atrPct(high, low, close);
  const volScore = a == null ? null : a < 1.5 ? 85 : a < 2.5 ? 70 : a < 4 ? 50 : 30;
  const beatScore = c.beatRate == null ? null : Math.round(30 + c.beatRate * 65);

  const factors: Factor[] = [
    {
      key: "trend", label: "Trend", score: trendScore, grade: scoreToGrade(trendScore),
      why: { Uptrend: "Price is above its 50- and 200-day averages, and they're stacked the right way.", "Pullback in uptrend": "Long-term trend is up, but the stock has dipped below its 50-day.", Sideways: "No clear direction yet.", Recovering: "Bouncing, but still under its long-term average.", Downtrend: "Below both moving averages — sellers are in control." }[trend] ?? "",
      inputs: [
        { label: "Price", value: last.toFixed(2) },
        { label: "50-day avg", value: s50 ? s50.toFixed(2) : "—", term: "sma" },
        { label: "200-day avg", value: s200 ? s200.toFixed(2) : "—", term: "sma" },
      ],
    },
    {
      key: "momentum", label: "Momentum", score: Math.round(scoreRsi(r)), grade: scoreToGrade(scoreRsi(r)),
      why: r == null ? "Not enough history." : r > 70 ? "Running hot into the print — expectations may be stretched." : r < 30 ? "Washed out; a decent report could spark a bounce." : r <= 50 ? "Cooled off — room to run if results surprise." : "Steady, neither hot nor cold.",
      inputs: [{ label: "RSI (14-day)", value: r == null ? "—" : r.toFixed(0), term: "rsi" }],
    },
    {
      key: "range", label: "52-week range", score: rangeScore, grade: scoreToGrade(rangeScore),
      why: rangePos == null ? "—" : rangePos > 0.85 ? "Near its yearly high." : rangePos < 0.35 ? "Closer to the yearly low than the high." : "In the middle of its yearly range.",
      inputs: [
        { label: "From 52w high", value: from52 == null ? "—" : `${from52.toFixed(1)}%` },
        { label: "52w low / high", value: `${lo.toFixed(2)} / ${hi.toFixed(2)}` },
      ],
    },
    {
      key: "volatility", label: "Volatility", score: volScore, grade: scoreToGrade(volScore),
      why: a == null ? "—" : a < 2.5 ? "Calm day-to-day swings." : "Big daily swings — size positions accordingly.",
      inputs: [{ label: "ATR (14-day)", value: a == null ? "—" : `${a.toFixed(2)}% of price`, term: "atr" }],
    },
    {
      key: "track", label: "Track record", score: beatScore, grade: scoreToGrade(beatScore),
      why: c.beatRate == null ? "No recent results to judge." : c.beatRate >= 0.75 ? "Habitually beats Wall Street's estimate." : c.beatRate >= 0.5 ? "Beats about as often as it misses." : "Has missed estimates more often than not.",
      inputs: [{ label: "Beat rate", value: c.beatRate == null ? "—" : `${Math.round(c.beatRate * 100)}%`, term: "beat" }],
    },
  ];
  // Weights mirror the swing scorer's emphasis on trend, plus the earnings-specific track record.
  const w: Record<string, number> = { trend: 0.3, momentum: 0.2, range: 0.15, volatility: 0.1, track: 0.25 };
  let tot = 0, wsum = 0;
  for (const f of factors) if (f.score != null) { tot += f.score * w[f.key]; wsum += w[f.key]; }
  const score = wsum ? Math.round((tot / wsum) * 10) / 10 : null;
  return { score, grade: scoreToGrade(score), factors, trend, rsi: r, atrPct: a, from52wHigh: from52 };
}
