// "Why did it move?" — a pure, honest explainer for kids. Given a company's day or week move plus the
// context we already fetch (its report card, the whole market = SPY, its group = an equal-weight sector
// ETF, a dividend cut-off day, and how big its normal moves are), it ranks the CLUES in kid words. It
// never invents news: every cause comes from a number we have, and when the numbers don't explain a big
// move it says "we're not sure". Reviewed by both curriculum experts (moon-club docs/CURRICULUM.md).
// Mirrored in Swift (MoonClubCore Why.swift) and pinned by the `why` vectors.

export type WhyRange = "1d" | "5d";
export interface WhyInput {
  s: string;
  nick: string;
  range: WhyRange;
  /** % change over the window (last close vs the close before the window). */
  move: number | null;
  /** SPY's % change over the SAME dates. */
  market: number | null;
  /** The company's group (an equal-weight sector ETF) and its % change over the same dates. */
  sector: { etf: string; name: string; move: number | null } | null;
  /** A report card whose first trading reaction falls in the window. eA null = shared, numbers not in yet. */
  report: { date: string; eA: number | null; eE: number | null } | null;
  /** A dividend cut-off (ex-dividend) day inside the window; pct = payout as % of the close before it. */
  dividend: { date: string; amount: number; pct: number | null } | null;
  /** This company's typical size of move for this range (mean absolute % move, last ~3 months). */
  normal: number | null;
  /** The last trading day in the window (NY date). */
  asOf?: string;
}
export type WhyCauseId = "report" | "market" | "company" | "sector" | "dividend" | "wiggle" | "unknown";
/** `learn`: the Moon School lesson that teaches this clue (the app and web link to it when the lesson exists). */
export interface WhyCause { id: WhyCauseId; title: string; line: string; weight: number; learn: string }
export interface WhyResult {
  dir: "up" | "down" | "flat" | "none";
  headline: string;
  size: "tiny" | "normal" | "big" | "huge" | "unknown";
  sizeLine: string;
  causes: WhyCause[];
  honest: string;
}

/**
 * Kid-known companies → their group. EQUAL-WEIGHT sector ETFs on purpose: in the cap-weighted ones
 * (XLK, XLC, XLY) Apple, Microsoft, Google, Amazon and Tesla are a big slice of the group, so "its group
 * went down too" would partly be the company explaining itself (expert review, round 2).
 */
export const KID_GROUPS: Record<string, { etf: string; name: string }> = {
  tech: { etf: "RSPT", name: "the tech companies" },
  media: { etf: "RSPC", name: "the TV, games and internet companies" },
  wants: { etf: "RSPD", name: "the companies that sell things people want, like shoes, toys and treats" },
  needs: { etf: "RSPS", name: "the companies that sell things people need, like food and soap" },
};
export const KID_SECTOR: Record<string, keyof typeof KID_GROUPS> = {
  AAPL: "tech", MSFT: "tech",
  DIS: "media", RBLX: "media", NFLX: "media", GOOGL: "media", TTWO: "media", SPOT: "media",
  MCD: "wants", NKE: "wants", SONY: "wants", HAS: "wants", AMZN: "wants", SBUX: "wants", CMG: "wants", TSLA: "wants",
  KO: "needs", PEP: "needs", WMT: "needs", TGT: "needs", HSY: "needs",
};
export const groupFor = (s: string) => (KID_SECTOR[s] ? KID_GROUPS[KID_SECTOR[s]] : null);

/** Typical move sizes when we have no history: a big US stock wiggles about this much. */
export const DEFAULT_NORMAL: Record<WhyRange, number> = { "1d": 1.5, "5d": 3.5 };
/** A market or group move smaller than this is just noise, not a clue (about half of SPY's usual move). */
export const MIN_CLUE: Record<WhyRange, number> = { "1d": 0.4, "5d": 0.8 };
/** Each clue → the Core lesson that teaches it ("report" depends on the result; see whyMoved). */
export const WHY_LEARN: Record<WhyCauseId, string> = {
  report: "after", market: "why-market", company: "prices", sector: "why-group", dividend: "div-day", wiggle: "why-wiggle", unknown: "why-unsure",
};
export const WHY_HONEST = "These are clues from the numbers, not the whole story. Nobody knows for sure what comes next.";
/** Beat / in line / miss, with a small tolerance (an exact match is not a beat). */
export function reportResult(eA: number, eE: number): "beat" | "inline" | "miss" {
  const d = eA - eE, tol = Math.max(0.005, Math.abs(eE) * 0.01);
  return Math.abs(d) < tol ? "inline" : d > 0 ? "beat" : "miss";
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (v: number) => Math.abs(v).toFixed(1);
const ORDER: WhyCauseId[] = ["report", "market", "company", "sector", "dividend", "wiggle", "unknown"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];

/** When the window was, in words that are always true: "today", "on Friday", "over the past week". */
export function whyWhen(range: WhyRange, asOf: string | undefined, today: string | undefined): string {
  if (range === "5d") return "over the past week";
  return !asOf || asOf === today ? "today" : `on ${weekday(asOf)}`;
}

export function whyMoved(x: WhyInput, today?: string): WhyResult {
  const when = whyWhen(x.range, x.asOf, today);
  const unknown: WhyCause = { id: "unknown", title: "We're not sure", line: "Sometimes prices move for reasons we can't see yet.", weight: 0.5, learn: WHY_LEARN.unknown };
  if (x.move == null) {
    return { dir: "none", headline: `We don't have ${x.nick}'s price yet.`, size: "unknown", sizeLine: "", causes: [unknown], honest: WHY_HONEST };
  }
  const m = x.move, am = Math.abs(m);
  const dir = am < 0.05 ? "flat" : m > 0 ? "up" : "down";
  const opp = dir === "up" ? "down" : "up";
  const normal = Math.max(0.1, x.normal ?? DEFAULT_NORMAL[x.range]);
  const ratio = am / normal;
  const size = ratio < 0.5 ? "tiny" : ratio < 1.5 ? "normal" : ratio < 3 ? "big" : "huge";
  const headline = dir === "flat" ? `${x.nick} barely moved ${when}.` : `${x.nick} went ${dir} ${pct(m)}% ${when}.`;
  const sizeLine = {
    tiny: "That's smaller than its usual wiggle.",
    normal: "That's about its usual size of move.",
    big: "That's bigger than its usual move.",
    huge: "That's a lot bigger than its usual move.",
  }[size];
  const big = (v: number | null | undefined): v is number => v != null && Math.abs(v) >= MIN_CLUE[x.range];
  const sameWay = (v: number | null | undefined): v is number => dir !== "flat" && big(v) && Math.sign(v) === Math.sign(m);
  const otherWay = (v: number | null | undefined): v is number => dir !== "flat" && big(v) && Math.sign(v) === -Math.sign(m);

  const causes: WhyCause[] = [];
  // 1. A report card in the window: the strongest clue we can have.
  if (x.report) {
    const { eA, eE } = x.report;
    const res = eA == null || eE == null ? null : reportResult(eA, eE);
    const line =
      eA == null ? "It shared its report card, so people had lots of new facts." :
      res == null ? "It shared its report card, so people had lots of new facts." :
      dir === "flat" ? "It shared its report card, but the price barely moved." :
      res === "inline" ? "It matched what grown-ups guessed. Hopes and what comes next may have mattered most." :
      res === "beat" && dir === "up" ? "It beat what grown-ups guessed, and people may have liked the news." :
      res === "beat" ? "It beat what grown-ups guessed, but people may have hoped for even more." :
      dir === "down" ? "It missed what grown-ups guessed, and people may have been let down." :
      "It missed what grown-ups guessed, but people may have feared even worse.";
    // The lesson that explains this kind of report day: a surprise the price "disagreed" with is about expectations.
    const learn = res == null ? "report-card" : dir === "flat" ? "after" : res === "inline" ? "guidance" : (res === "beat") === (dir === "up") ? "after" : "expectations";
    causes.push({ id: "report", title: "Report card day", line, weight: size === "big" || size === "huge" ? 0.9 : 0.6, learn });
  }
  // 2. The whole market: moved the same way (a clue, sized honestly), or the other way (so it was about the company).
  if (sameWay(x.market)) {
    const share = Math.abs(x.market) / am;
    causes.push({
      id: "market", title: "The whole market moved",
      line: share < 0.5
        ? `The whole market went ${dir} a little ${when} too, but not nearly this much.`
        : `The whole market went ${dir} ${when} too. On days like that, most companies move the same way.`,
      weight: r2(0.3 + 0.6 * Math.min(1, share)), learn: WHY_LEARN.market,
    });
  } else if (otherWay(x.market)) {
    causes.push({ id: "company", title: "Not the whole market", line: `The whole market went ${opp} ${when}. So this move was probably about ${x.nick} itself.`, weight: 0.5, learn: WHY_LEARN.company });
  }
  // 3. Its group moved together, more than the whole market did.
  if (x.sector && sameWay(x.sector.move)) {
    const excess = Math.abs(x.sector.move) - (sameWay(x.market) ? Math.abs(x.market) : 0);
    if (excess >= 0.3) causes.push({
      id: "sector", title: "Its group moved together",
      line: `Its group went ${dir} ${when} too. That group is ${x.sector.name}.`,
      weight: r2(0.25 + 0.6 * Math.min(1, excess / am)), learn: WHY_LEARN.sector,
    });
  }
  // 4. A dividend cut-off day: the price drops by about the payout. Only on down moves, sized by the payout.
  if (x.dividend && dir === "down") {
    const share = x.dividend.pct != null ? Math.min(1, x.dividend.pct / am) : 0.3;
    const day = x.range === "1d" ? when : "in the past week";
    causes.push({
      id: "dividend", title: "Dividend cut-off day",
      line: `Its dividend cut-off day was ${day}. The price often drops by about the payout${x.dividend.pct != null ? `, here about ${x.dividend.pct.toFixed(1)}% of the price` : ""}.`,
      weight: r2(0.3 + 0.6 * share), learn: WHY_LEARN.dividend,
    });
  }
  // 5. A normal wiggle (only when nothing big happened).
  if ((size === "tiny" || size === "normal") && !causes.some((c) => c.id === "report")) {
    causes.push({ id: "wiggle", title: "A normal wiggle", line: "Prices move a little every day, even with no news.", weight: size === "tiny" ? 0.8 : 0.5, learn: WHY_LEARN.wiggle });
  }
  // 6. Honest uncertainty: a big move our clues don't explain.
  const best = causes.reduce((a, c) => Math.max(a, c.weight), 0);
  if (!causes.length || ((size === "big" || size === "huge") && best < 0.6)) causes.push(unknown);

  causes.sort((a, b) => b.weight - a.weight || ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  return { dir, headline, size, sizeLine, causes: causes.slice(0, 3), honest: WHY_HONEST };
}

// ── Building the input from daily closes (the worker calls this; pure so it is tested) ─────────
/** Daily RAW closes (Yahoo `close`, never `adjclose`: adjusted closes hide the dividend drop). */
export interface DailySeries { d: string[]; c: number[] }
/** % change between two dates, looked up by date, so the stock, SPY and the group cover the SAME days. */
function changeBetween(s: DailySeries | null, from: string, to: string): number | null {
  if (!s) return null;
  const i = s.d.indexOf(from), j = s.d.indexOf(to);
  if (i < 0 || j < 0 || j <= i || !(s.c[i] > 0)) return null;
  return r2(((s.c[j] - s.c[i]) / s.c[i]) * 100);
}
/** Mean absolute k-day % move over the series (the company's "normal wiggle"). */
export function normalMove(s: DailySeries | null, k: number): number | null {
  if (!s || s.c.length < k + 10) return null;
  let sum = 0, n = 0;
  for (let i = k; i < s.c.length; i++) { const a = s.c[i - k]; if (a > 0) { sum += Math.abs((s.c[i] - a) / a) * 100; n++; } }
  return n ? r2(sum / n) : null;
}
export type ReportHour = "bmo" | "amc" | "dmh" | "";
/**
 * Did this report's first trading reaction land in the window (from, last]? A before-the-open report moves
 * its own day; an after-the-close one moves the next day. Unknown hour stays conservative both ways.
 */
export function reportInWindow(date: string, hour: ReportHour, from: string, last: string): boolean {
  if (date > from && date <= last) return !(date === last && hour === "amc");
  return date === from && hour !== "bmo" && hour !== "dmh";
}

export function buildWhyInput(a: {
  s: string; nick: string; range: WhyRange;
  stock: DailySeries | null; spy: DailySeries | null; sector: DailySeries | null;
  reports: { date: string; eA: number | null; eE: number | null; hour?: ReportHour }[];
  dividends: { date: string; amount: number }[];
}): WhyInput {
  const k = a.range === "1d" ? 1 : 5;
  const st = a.stock;
  const n = st?.d.length ?? 0;
  const from = n > k ? st!.d[n - 1 - k] : null; // the close before the window
  const last = n ? st!.d[n - 1] : null;
  const report = from && last
    ? a.reports.filter((r) => reportInWindow(r.date, r.hour ?? "", from, last)).sort((x, y) => y.date.localeCompare(x.date))[0] ?? null
    : null;
  const div = from && last ? a.dividends.filter((d) => d.date > from && d.date <= last).sort((x, y) => y.date.localeCompare(x.date))[0] ?? null : null;
  const di = div && st ? st.d.indexOf(div.date) : -1;
  const prev = di > 0 && st ? st.c[di - 1] : null;
  const g = groupFor(a.s);
  return {
    s: a.s, nick: a.nick, range: a.range,
    move: from && last ? changeBetween(st, from, last) : null,
    market: from && last ? changeBetween(a.spy, from, last) : null,
    sector: g ? { etf: g.etf, name: g.name, move: from && last ? changeBetween(a.sector, from, last) : null } : null,
    report: report ? { date: report.date, eA: report.eA, eE: report.eE } : null,
    dividend: div ? { date: div.date, amount: div.amount, pct: prev ? r2((div.amount / prev) * 100) : null } : null,
    normal: normalMove(st, k),
    asOf: last ?? undefined,
  };
}
