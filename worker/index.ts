// Metaphases API — a thin, cached layer over free data sources. Served at mutaafaziz.com/metaphases/
// (Worker route mutaafaziz.com/metaphases*); every path below is relative to BASE.
//   /api/calendar?from&to   earnings events (Finnhub), filtered to tracked + large reporters
//   /api/ticker/:symbol     the deep sheet: Compass grade, setup grade, reaction history, street view
//   /api/macro              macro event strip (FRED release calendar + FOMC) and the Market Mood index
// Every route is "graceful in failure" (Compass UX principle #2/#3): partial data + warnings, never a blank 500.
import universe from "../data/universe.json";
import type { CalendarResponse, EarningsEvent, MacroResponse, Session, TickerResponse, Reaction, MoodComponent, MacroEvent } from "../shared/types";
import { compassGrade, setupGrade, rsi, sma } from "../shared/grades";
import { FOMC, HOLIDAYS } from "../shared/market";
import { parseRecapQuery, recapImageKey } from "../shared/kidsWeek";
import { KID_COMPANIES, KID_BY_SYMBOL, LEVELS } from "../shared/kids";
import { buildWhyInput, groupFor, whyMoved, type DailySeries, type WhyRange } from "../shared/kidsWhy";
import channel from "../packs/channel.json" with { type: "json" };
import guestNova from "../packs/guest-coach-nova/pack.json" with { type: "json" };
import { storyKidsRecapSvg, storyKidsSvg, storyMacroSvg, storyMoodSvg, storyTickerSvg } from "../shared/story";
import { moodPlain, whatTheyDo, whenPlain } from "../shared/plain";
import { handleAi } from "./ai";
import { handleSupport, type KvLike } from "./support";
import { epsIn, estimateCurrency, isUsd, readEstimate } from "../shared/currency";
import { buildIcs, cardSvg, quartersFrom, shapeChart, nyDate, type IcsItem } from "../shared/depth";
import { periodKey, pickConsensus } from "../shared/compare";
import overridesFile from "../data/date-overrides.json" with { type: "json" };
import { applyToEvents, applyToRows, closedDay, flagClosed, type DateOverrides } from "../shared/dateOverrides";
import { aliasMap, homeListing, mergeSupplement, refreshEntry, staleSymbols, supplementSymbols, suppRows, unfetched, SUPP_LOCK_S, type SuppDoc, type Universe } from "../shared/calendarSupplement";

interface Env {
  FINNHUB_API_KEY: string;
  FRED_API_KEY: string;
  ASSETS: Fetcher;
  AI?: { run(model: string, input: unknown, opts?: unknown): Promise<unknown> };
  CF_VERSION?: { id: string; tag?: string; timestamp?: string };
  /** Moon Club support inbox (KV, 180-day TTL). */
  SUPPORT?: KvLike;
}

const BASE = "/metaphases";
const SITE = "https://mutaafaziz.com";
const U = universe as Record<string, { n: string; mc: number; c?: string; ec?: string }>;
const FH = "https://finnhub.io/api/v1";
/** Company-announced dates that beat Finnhub's projection (0013). */
const OVERRIDES = overridesFile as unknown as DateOverrides;
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", Accept: "application/json" };

// ── tiny cache helper on the edge Cache API (free, per-colo) ─────────────
async function cached<T>(key: string, ttl: number, ctx: ExecutionContext, fn: () => Promise<T>): Promise<T> {
  const cache = caches.default;
  const req = new Request(`https://cache.metaphases.internal/${encodeURIComponent(key)}`);
  const hit = await cache.match(req);
  if (hit) return (await hit.json()) as T;
  const val = await fn();
  ctx.waitUntil(cache.put(req, new Response(JSON.stringify(val), { headers: { "Cache-Control": `public, max-age=${ttl}`, "Content-Type": "application/json" } })));
  return val;
}

async function getJson<T = any>(url: string, headers: Record<string, string> = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers, cf: { cacheTtl: 60 } } as RequestInit);
    if (r.status === 429 && attempt < 3) { await new Promise((ok) => setTimeout(ok, 700 * (attempt + 1))); continue; }
    if (!r.ok) throw new Error(`${new URL(url).hostname} ${r.status}`);
    return (await r.json()) as T;
  }
}

/** Run async jobs with bounded concurrency (Finnhub's free tier dislikes bursts). */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      try { out[k] = { status: "fulfilled", value: await fn(items[k]) }; } catch (reason) { out[k] = { status: "rejected", reason }; }
    }
  }));
  return out;
}

const json = (data: unknown, maxAge = 300) =>
  new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${maxAge}`, "Access-Control-Allow-Origin": "*" } });

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const todayNY = () => new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));

// ── /api/calendar ───────────────────────────────────────────────────────
const BIG_REVENUE = 1e9; // untracked companies still appear if they're this large

const CAL = (key: string) => new Request(`https://cache.metaphases.internal/${encodeURIComponent(key)}`);
/** How long a day's list stays fresh: settled history 6 h, the next two weeks 30 min, far-ahead dates 6 h (they rarely move). */
const calTtl = (day: string, today: string) => (day < addDays(today, -3) || day > addDays(today, 14) ? 21600 : 1800);
/** Finnhub returns at most ~1500 rows per call; a range at or past this is treated as truncated and re-fetched day by day. */
const RANGE_CAP = 1400;

/** Home listings (7203.T) → the tracked US symbol (TM), from the universe's logo names (0024). */
const ALIAS = aliasMap(U as Universe);
/** Tracked names the range feed is known to drop; their `symbol=` rows fill the gap (0024). */
const SUPP_SYMBOLS = supplementSymbols(U as Universe);

function toEvents(rows: any[]): EarningsEvent[] {
  const out: EarningsEvent[] = [];
  const native = new Set<string>((rows ?? []).map((e) => e.symbol));
  for (const e of rows ?? []) {
    const alias = ALIAS[e.symbol];
    if (alias && native.has(alias)) continue; // the US row wins over its home listing
    const sym = alias ?? e.symbol;
    const tracked = sym in U;
    if (!tracked && !((e.revenueEstimate ?? 0) >= BIG_REVENUE || (e.revenueActual ?? 0) >= BIG_REVENUE)) continue;
    if (!tracked && /[.\-]/.test(sym)) continue; // skip foreign share classes without logos
    out.push({ s: sym, d: e.date, h: (e.hour || "") as Session, q: e.quarter, y: e.year, eE: e.epsEstimate, eA: e.epsActual, rE: e.revenueEstimate, rA: e.revenueActual, t: tracked ? 1 : 0 });
  }
  return out;
}

// ── 0024: the per-symbol supplement ─────────────────────────────────────
const SUPP_KEY = CAL("cal:supp:v2"); // v2: v1 cached empty rows for ADRs answered under their home label
const SUPP_LOCK = CAL("cal:supp:lock:v1");
/** `symbol=` only returns upcoming dates, so the supplement covers ranges that touch the next ~4 months. */
const SUPP_BACK = 7, SUPP_AHEAD = 120;

async function readSupp(): Promise<SuppDoc> {
  try { const hit = await caches.default.match(SUPP_KEY); return hit ? ((await hit.json()) as SuppDoc) : {}; } catch { return {}; }
}

/**
 * The supplement document, refreshing at most a few stale symbols (pooled, 2 at a time), and at most once a
 * minute per colo (a short-lived lock in the cache, taken before any call). A failed symbol keeps its last
 * good rows. `refresh: false` (a failed range call this request, or the share-card path) only reads the
 * cache: a rate limit must never turn into more calls.
 */
async function supplement(env: Env, ctx: ExecutionContext, today: string, refresh: boolean): Promise<SuppDoc> {
  const doc = await readSupp();
  let due = refresh ? staleSymbols(doc, SUPP_SYMBOLS, Date.now()) : [];
  if (due.length) {
    try {
      if (await caches.default.match(SUPP_LOCK)) due = [];
      else await caches.default.put(SUPP_LOCK, new Response("1", { headers: { "Cache-Control": `public, max-age=${SUPP_LOCK_S}` } }));
    } catch { due = []; }
  }
  if (!due.length) return doc;
  const from = addDays(today, -SUPP_BACK), to = addDays(today, SUPP_AHEAD);
  const got = await pool(due, 2, async (s) => suppRows(s, (await getJson<{ earningsCalendar: any[] }>(`${FH}/calendar/earnings?symbol=${encodeURIComponent(s)}&from=${from}&to=${to}&token=${env.FINNHUB_API_KEY}`)).earningsCalendar, homeListing(U as Universe, s)));
  let changed = false;
  got.forEach((r, i) => { if (r.status === "fulfilled") { doc[due[i]] = refreshEntry(doc[due[i]], r.value, today, Date.now()); changed = true; } });
  if (changed) ctx.waitUntil(caches.default.put(SUPP_KEY, new Response(JSON.stringify(doc), { headers: { "Cache-Control": "public, max-age=604800", "Content-Type": "application/json" } })));
  return doc;
}

const touchesSupp = (from: string, to: string, today: string) => to >= addDays(today, -SUPP_BACK) && from <= addDays(today, SUPP_AHEAD);

async function putDay(day: string, events: EarningsEvent[], today: string, ctx: ExecutionContext) {
  const body = JSON.stringify(events);
  ctx.waitUntil(Promise.all([
    caches.default.put(CAL(`cal:v2:${day}`), new Response(body, { headers: { "Cache-Control": `public, max-age=${calTtl(day, today)}`, "Content-Type": "application/json" } })),
    caches.default.put(CAL(`cal:stale:v2:${day}`), new Response(body, { headers: { "Cache-Control": "public, max-age=604800" } })),
  ]));
}

async function fetchCalendarDay(day: string, env: Env): Promise<EarningsEvent[]> {
  const data = await getJson<{ earningsCalendar: any[] }>(`${FH}/calendar/earnings?from=${day}&to=${day}&token=${env.FINNHUB_API_KEY}`);
  return toEvents(data.earningsCalendar);
}

/**
 * One week's days. Cached days come straight from the cache; the rest come from ONE Finnhub range call
 * (not one per day), so paging months ahead stays far under the free tier's ~60 calls/min. That burst of
 * per-day calls is what left months past February empty. A truncated range falls back to per-day calls,
 * and any failure falls back to the last good copy (kept 7 days).
 */
async function calendarWeek(days: string[], env: Env, ctx: ExecutionContext, health: { failed: boolean } = { failed: false }): Promise<PromiseSettledResult<EarningsEvent[]>[]> {
  const today = iso(todayNY());
  const out: PromiseSettledResult<EarningsEvent[]>[] = new Array(days.length);
  const missing: number[] = [];
  await Promise.all(days.map(async (d, i) => {
    const hit = await caches.default.match(CAL(`cal:v2:${d}`));
    if (hit) out[i] = { status: "fulfilled", value: (await hit.json()) as EarningsEvent[] }; else missing.push(i);
  }));
  if (!missing.length) return out;
  const from = days[Math.min(...missing)], to = days[Math.max(...missing)];
  let byDay: Map<string, EarningsEvent[]> | null = null;
  let rangeError: unknown = null;
  try {
    const data = await getJson<{ earningsCalendar: any[] }>(`${FH}/calendar/earnings?from=${from}&to=${to}&token=${env.FINNHUB_API_KEY}`);
    const rows = data.earningsCalendar ?? [];
    if (rows.length < RANGE_CAP || from === to) {
      byDay = new Map();
      for (const e of toEvents(rows)) (byDay.get(e.d) ?? byDay.set(e.d, []).get(e.d)!).push(e);
    }
  } catch (e) {
    // A failed range call (429 after retries, upstream down) must not fan out into per-day retries:
    // that only deepens the rate limit. Go straight to the last good copy.
    rangeError = e;
    health.failed = true;
  }
  const settle = async (i: number, load: () => Promise<EarningsEvent[]>) => {
    const d = days[i];
    try {
      const ev = await load();
      putDay(d, ev, today, ctx);
      out[i] = { status: "fulfilled", value: ev };
    } catch (reason) {
      health.failed = true;
      const stale = await caches.default.match(CAL(`cal:stale:v2:${d}`));
      out[i] = stale ? { status: "fulfilled", value: (await stale.json()) as EarningsEvent[] } : { status: "rejected", reason };
    }
  };
  if (rangeError) {
    await Promise.all(missing.map((i) => settle(i, () => Promise.reject(rangeError))));
  } else if (byDay) {
    const m = byDay;
    await Promise.all(missing.map((i) => settle(i, async () => m.get(days[i]) ?? [])));
  } else {
    // Truncated busy week: day by day, at most 2 in flight (3 weeks in parallel stays ≤ 6 calls at once).
    await pool(missing, 2, (i) => settle(i, () => fetchCalendarDay(days[i], env)));
  }
  return out;
}

/** A single day (the share-card and brief paths), through the same cache and fallbacks. */
async function calendarDay(day: string, env: Env, ctx: ExecutionContext): Promise<EarningsEvent[]> {
  const [r] = await calendarWeek([day], env, ctx);
  if (r.status === "fulfilled") return r.value;
  throw r.reason;
}

async function calendar(url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const from = url.searchParams.get("from") ?? iso(new Date());
  const to = url.searchParams.get("to") ?? addDays(from, 34);
  const days: string[] = [];
  for (let d = from; d <= to && days.length < 45; d = addDays(d, 1)) {
    const wd = new Date(d + "T12:00:00Z").getUTCDay();
    if (wd !== 0 && wd !== 6) days.push(d);
  }
  // Group by week (a Monday starts a new group): one upstream call per week at most.
  const weeks: string[][] = [];
  for (const d of days) {
    if (!weeks.length || new Date(d + "T12:00:00Z").getUTCDay() === 1) weeks.push([]);
    weeks[weeks.length - 1].push(d);
  }
  const health = { failed: false };
  const perWeek = await pool(weeks, 3, (w) => calendarWeek(w, env, ctx, health));
  const results = perWeek.flatMap((r, wi) => (r.status === "fulfilled" ? r.value : weeks[wi].map(() => ({ status: "rejected", reason: r.reason }) as PromiseSettledResult<EarningsEvent[]>)));
  const warnings: string[] = [];
  let events: EarningsEvent[] = [];
  const loaded = new Set<string>();
  results.forEach((r, i) => (r.status === "fulfilled" ? (events.push(...r.value), loaded.add(days[i])) : warnings.push(`Couldn't load ${days[i]} — showing the rest.`)));
  const today = iso(todayNY());
  if (touchesSupp(from, to, today)) {
    // After the range calls, never alongside them; and no new calls at all if any upstream call failed,
    // even one a stale copy covered (0024: a rate limit must not become more calls).
    const doc = await supplement(env, ctx, today, !health.failed && warnings.length === 0);
    events = mergeSupplement(events, doc, from, to, (d) => loaded.has(d));
    // Not fetched yet here (a cold cache): say so, never let an absent row read as "doesn't report".
    const cold = unfetched(doc, SUPP_SYMBOLS);
    if (cold) warnings.push(`Still checking ${cold} overseas companies' report dates — some may be missing for now.`);
  }
  const fixed = flagClosed(applyToEvents(events, OVERRIDES, from, to, today, (s) => s in U));
  const body: CalendarResponse = { from, to, events: fixed, asOf: new Date().toISOString(), warnings };
  return json(body, 600);
}

// ── Yahoo candles ───────────────────────────────────────────────────────
interface Candles { t: number[]; o: number[]; h: number[]; l: number[]; c: number[] }
async function candles(symbol: string, range: string, ctx: ExecutionContext): Promise<Candles> {
  return cached(`yc:${symbol}:${range}`, 3600, ctx, async () => {
    const hosts = ["query1", "query2"];
    let lastErr: unknown;
    for (const h of hosts) {
      try {
        const d = await getJson<any>(`https://${h}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`, UA);
        const r = d.chart.result[0];
        const q = r.indicators.quote[0];
        const out: Candles = { t: [], o: [], h: [], l: [], c: [] };
        r.timestamp.forEach((t: number, i: number) => {
          if (q.close[i] == null) return;
          out.t.push(t); out.o.push(q.open[i]); out.h.push(q.high[i]); out.l.push(q.low[i]); out.c.push(q.close[i]);
        });
        return out;
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  });
}
// nyDate: see shared/depth.ts (arithmetic, never Intl in a hot loop).

// ── /api/ticker/:symbol ────────────────────────────────────────────────
/** Finnhub's metric=all is ~200 KB (170 KB of quarterly series). Keep only what the grades and quarter bars read,
 *  so a cached copy is ~10 KB and parsing it stays well inside the free plan's CPU budget (Cloudflare 1102). */
const SERIES_KEYS = ["eps", "salesPerShare", "grossMargin", "operatingMargin"];
function slimMetric(raw: any) {
  const q = raw?.series?.quarterly ?? {};
  const quarterly: Record<string, unknown[]> = {};
  for (const key of SERIES_KEYS) if (Array.isArray(q[key])) quarterly[key] = q[key].slice(0, 12);
  return { metric: raw?.metric ?? {}, series: { quarterly } };
}

/** The finished sheet, edge-cached for 5 minutes: sheets, share pages and OG cards all read one small JSON. */
async function tickerData(symbol: string, env: Env, ctx: ExecutionContext): Promise<TickerResponse> {
  return cached<TickerResponse>(`tk:v2:${symbol}`, 300, ctx, () => buildTicker(symbol, env, ctx));
}

async function ticker(symbol: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  return json(await tickerData(symbol, env, ctx), 300);
}

async function buildTicker(symbol: string, env: Env, ctx: ExecutionContext): Promise<TickerResponse> {
  const k = env.FINNHUB_API_KEY;
  const warnings: string[] = [];
  const today = iso(todayNY());
  const settle = async <T>(label: string, p: Promise<T>): Promise<T | null> => {
    try { return await p; } catch { warnings.push(label); return null; }
  };
  const fh = <T>(path: string, ttl: number) => cached<T>(`fh:${path}`, ttl, ctx, () => getJson<T>(`${FH}/${path}${path.includes("?") ? "&" : "?"}token=${k}`));

  const [profile, quote, metric, recs, surprises, upcoming, nasdaq, chart] = await Promise.all([
    settle("Company profile unavailable.", fh<any>(`stock/profile2?symbol=${symbol}`, 86400)),
    settle("Live quote unavailable.", fh<any>(`quote?symbol=${symbol}`, 120)),
    settle("Fundamentals unavailable — quality grade skipped.", cached<any>(`fh:metric:slim:v1:${symbol}`, 21600, ctx, async () => slimMetric(await getJson<any>(`${FH}/stock/metric?symbol=${symbol}&metric=all&token=${k}`)))),
    settle("Analyst ratings unavailable.", fh<any[]>(`stock/recommendation?symbol=${symbol}`, 43200)),
    settle("Earnings history unavailable.", fh<any[]>(`stock/earnings?symbol=${symbol}`, 21600)),
    settle("Upcoming date unavailable.", fh<any>(`calendar/earnings?symbol=${symbol}&from=${addDays(today, -40)}&to=${addDays(today, 120)}`, 3600)),
    settle("Past report dates unavailable — reaction history skipped.", cached<any>(`nq:surprise:${symbol}`, 43200, ctx, () => getJson(`https://api.nasdaq.com/api/company/${symbol}/earnings-surprise`, UA))),
    settle("Price history unavailable — setup grade skipped.", candles(symbol, "2y", ctx)),
  ]);

  const cal: any[] = applyToRows(symbol, upcoming?.earningsCalendar ?? [], OVERRIDES, today);
  const nextE = cal.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const lastE = cal.filter((e) => e.date < today).sort((a, b) => b.date.localeCompare(a.date))[0];
  const habit: Session = (nextE?.hour || lastE?.hour || "") as Session;

  // Finnhub's estimates for foreign filers are in the reporting currency; Nasdaq's history is USD.
  const rows: any[] = nasdaq?.data?.earningsSurpriseTable?.rows ?? [];
  const currency = estimateCurrency({
    estimateCurrency: profile?.estimateCurrency, currency: profile?.currency, known: U[symbol]?.ec,
    country: profile?.country || U[symbol]?.c, epsE: nextE?.epsEstimate ?? null,
    usdEps: rows.slice(0, 4).map((r) => (typeof r.eps === "number" ? r.eps : parseFloat(r.eps))),
  });
  const usd = isUsd(currency);
  // The sheet explains a non-USD basis next to the estimates (next.currency); no partial-data warning needed.

  // Past prints: Nasdaq gives report dates; Finnhub gives estimate/actual. Join on order (both newest-first).
  // Finnhub figures only fill gaps when they're in dollars too.
  const history: Reaction[] = [];
  const barDates = chart ? chart.t.map(nyDate) : []; // computed once per build
  const closeOn = (day: string, offset: number) => {
    if (!chart) return null;
    const dates = barDates;
    let i = dates.findIndex((d) => d >= day);
    if (i < 0) return null;
    if (dates[i] !== day && offset === 0) return null;
    i += offset;
    return i >= 0 && i < chart.c.length ? chart.c[i] : null;
  };
  rows.slice(0, 8).forEach((r, i) => {
    const [mm, dd, yy] = String(r.dateReported).split("/");
    const date = `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    // One consensus per quarter: Finnhub's (the calendar's) when we have it for this quarter, else Nasdaq's.
    const f = !usd ? undefined
      : lastE && lastE.date === date && lastE.epsEstimate != null ? { estimate: lastE.epsEstimate, actual: lastE.epsActual }
      : surprises?.find((x) => periodKey(x.period) != null && periodKey(x.period) === periodKey(r.fiscalQtrEnd));
    const session: Session = lastE && lastE.date === date ? (lastE.hour as Session) : habit;
    let move: number | null = null;
    const before = session === "bmo" ? closeOn(date, -1) : closeOn(date, 0);
    const after = session === "bmo" ? closeOn(date, 0) : closeOn(date, 1);
    if (before && after) move = ((after - before) / before) * 100;
    const pick = pickConsensus({ estimate: r.consensusForecast, actual: r.eps, surprisePct: r.percentageSurprise }, f);
    history.push({ date, session, period: r.fiscalQtrEnd, epsE: pick.epsE, epsA: pick.epsA, surprisePct: pick.surprisePct, move });
  });
  // Fall back to Finnhub's four quarters if Nasdaq was unreachable.
  if (!history.length && surprises?.length && usd) {
    for (const f of surprises.slice(0, 4)) history.push({ date: f.period, session: "", period: f.period, epsE: f.estimate, epsA: f.actual, surprisePct: f.surprisePercent, move: null });
  }
  // A print reported in the last ~40 days might be on Finnhub's calendar before Nasdaq's table catches up.
  if (usd && lastE && lastE.epsActual != null && !history.some((h) => h.date === lastE.date)) {
    const b = lastE.hour === "bmo" ? closeOn(lastE.date, -1) : closeOn(lastE.date, 0);
    const a = lastE.hour === "bmo" ? closeOn(lastE.date, 0) : closeOn(lastE.date, 1);
    history.unshift({ date: lastE.date, session: lastE.hour, period: `Q${lastE.quarter} ${lastE.year}`, epsE: lastE.epsEstimate, epsA: lastE.epsActual, surprisePct: lastE.epsEstimate ? ((lastE.epsActual - lastE.epsEstimate) / Math.abs(lastE.epsEstimate)) * 100 : null, move: b && a ? ((a - b) / b) * 100 : null });
  }

  const judged = history.filter((h) => h.epsA != null && h.epsE != null);
  const beats = judged.filter((h) => (h.epsA as number) >= (h.epsE as number)).length;
  const beatRate = judged.length ? { beats, total: judged.length } : null;
  const moves = history.map((h) => h.move).filter((m): m is number => m != null);
  const expectedMove = moves.length ? moves.reduce((a, b) => a + Math.abs(b), 0) / moves.length : null;

  const compass = metric?.metric ? compassGrade(metric.metric) : { score: null, grade: null, factors: [] };
  const setup = chart && chart.c.length > 60
    ? setupGrade({ close: chart.c, high: chart.h, low: chart.l, beatRate: beatRate ? beatRate.beats / beatRate.total : null })
    : { score: null, grade: null, factors: [], trend: "—", rsi: null, atrPct: null, from52wHigh: null };

  let street: TickerResponse["street"] = null;
  if (recs?.length) {
    const cur = recs[0];
    const pct = (r: any) => { const t = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell; return t ? ((r.strongBuy + r.buy) / t) * 100 : 0; };
    street = { buy: cur.strongBuy + cur.buy, hold: cur.hold, sell: cur.sell + cur.strongSell, period: cur.period, buyPctChange3m: recs[3] ? pct(cur) - pct(recs[3]) : null };
  }

  const name = profile?.name || U[symbol]?.n || symbol;
  const read: string[] = [];
  // A projected date on a closed-market day isn't a date yet (0045): say so instead of stating it.
  const closed = nextE && !nextE.source ? closedDay(nextE.date) : null;
  if (nextE && closed) {
    read.push(`${name}'s Q${nextE.quarter} report date is not confirmed yet: the data feed projects ${new Date(nextE.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}, when the market is closed (${closed}).`);
  } else if (nextE) {
    const when = { bmo: "before the opening bell", amc: "after the close", dmh: "during market hours", "": "(time not yet confirmed)" }[nextE.hour as Session] ?? "";
    read.push(`${name} reports Q${nextE.quarter} on ${new Date(nextE.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })} ${when}.`);
  }
  const estLine = readEstimate(name, nextE?.epsEstimate, currency, history[0]?.epsA);
  if (estLine) read.push(estLine);
  if (beatRate) read.push(`It has beaten the estimate in ${beats} of its last ${judged.length} reports.`);
  if (expectedMove != null) read.push(`The stock has moved about ±${expectedMove.toFixed(1)}% on a typical report — that's the size of swing to be ready for.`);
  if (setup.grade) read.push(`Into the print it's in ${/^[aeiou]/i.test(setup.trend) ? "an" : "a"} ${setup.trend.toLowerCase()}${setup.rsi != null ? ` with RSI ${setup.rsi.toFixed(0)}` : ""}.`);
  if (compass.grade) read.push(`As a long-term holding it grades ${compass.grade} on Compass quality.`);

  const body: TickerResponse = {
    symbol,
    profile: profile?.name ? { name: profile.name, logo: profile.logo, industry: profile.finnhubIndustry, country: profile.country, web: profile.weburl, marketCap: profile.marketCapitalization, currency: typeof profile.currency === "string" ? profile.currency : "USD", exchange: profile.exchange, ipo: profile.ipo } : null,
    quote: quote?.c ? { price: quote.c, change: quote.d, changePct: quote.dp, prevClose: quote.pc, asOf: quote.t } : null,
    next: nextE ? { date: nextE.date, session: (nextE.hour || "") as Session, quarter: nextE.quarter, year: nextE.year, epsE: nextE.epsEstimate, revE: nextE.revenueEstimate, currency, ...(nextE.source ? { confirmed: nextE.source } : {}), ...(closed ? { closed } : {}) } : null,
    compass, setup, history, expectedMove, beatRate, street,
    spark: chart ? chart.c.slice(-126) : [],
    chart: chart ? shapeChart(chart.t, chart.c) : null,
    quarters: quartersFrom(metric?.series?.quarterly, profile?.shareOutstanding ?? null),
    read, warnings,
  };
  return body;
}

// ── /api/macro ─────────────────────────────────────────────────────────
const RELEASES: { id: number; key: string; name: string; kind: MacroEvent["kind"]; blurb: string }[] = [
  { id: 50, key: "jobs", name: "Jobs report", kind: "jobs", blurb: "How many jobs the economy added last month, plus the unemployment rate. Strong hiring can mean higher rates for longer." },
  { id: 10, key: "cpi", name: "CPI inflation", kind: "inflation", blurb: "How fast consumer prices are rising. Hotter-than-expected readings tend to hit growth stocks hardest." },
  { id: 46, key: "ppi", name: "PPI", kind: "inflation", blurb: "Inflation at the wholesale level — an early hint at where consumer prices are heading." },
  { id: 54, key: "pce", name: "PCE inflation", kind: "inflation", blurb: "The Fed's preferred inflation gauge. It moves rate expectations." },
  { id: 9, key: "retail", name: "Retail sales", kind: "consumer", blurb: "Are shoppers still spending? Consumer spending is about two-thirds of the US economy." },
  { id: 53, key: "gdp", name: "GDP growth", kind: "growth", blurb: "The broadest scorecard of the economy's growth over a quarter." },
  { id: 192, key: "jolts", name: "Job openings", kind: "jobs", blurb: "How many positions employers are trying to fill — a read on labor-market tightness." },
];

async function macro(env: Env, ctx: ExecutionContext): Promise<Response> {
  const warnings: string[] = [];
  const today = iso(todayNY());
  const horizon = addDays(today, 150);
  const events: MacroEvent[] = [];
  const rel = await Promise.allSettled(
    RELEASES.map((r) =>
      cached(`fred:${r.id}:${today}`, 43200, ctx, () =>
        getJson<any>(`https://api.stlouisfed.org/fred/release/dates?release_id=${r.id}&realtime_start=${addDays(today, -40)}&realtime_end=${horizon}&include_release_dates_with_no_data=true&file_type=json&api_key=${env.FRED_API_KEY}`),
      ).then((d) => ({ r, dates: (d.release_dates ?? []).map((x: any) => x.date as string) })),
    ),
  );
  for (const x of rel) {
    if (x.status !== "fulfilled") continue;
    for (const date of x.value.dates) events.push({ key: x.value.r.key, name: x.value.r.name, date, kind: x.value.r.kind, blurb: x.value.r.blurb });
  }
  if (rel.some((x) => x.status === "rejected")) warnings.push("Some economic release dates couldn't be loaded.");
  for (const f of FOMC) events.push({ key: "fomc", name: "FOMC decision", date: f.date, kind: "fed", blurb: `The Federal Reserve announces interest rates at 2:00 PM ET${f.sep ? ", with fresh economic projections (the 'dot plot')" : ""}.${f.tentative ? " Date is tentative." : ""}` });
  events.sort((a, b) => a.date.localeCompare(b.date));

  let mood: MacroResponse["mood"] = null;
  try {
    mood = await cached(`mood:v1:${today}:${new Date().getUTCHours()}`, 3600, ctx, () => marketMood(ctx));
  } catch {
    warnings.push("Market Mood is resting — price data didn't load.");
  }
  const body: MacroResponse = { events, mood, holidays: HOLIDAYS, asOf: new Date().toISOString(), warnings };
  return json(body, 900);
}

/** Market Mood: our own fear↔greed gauge, built the Market Digest way — explainable components, each 0-100. */
async function marketMood(ctx: ExecutionContext): Promise<NonNullable<MacroResponse["mood"]>> {
  const syms = ["SPY", "^VIX", "RSP", "HYG", "LQD", "TLT"] as const;
  const series = await Promise.all(syms.map((s) => candles(s, "1y", ctx)));
  const [spy, vix, rsp, hyg, lqd, tlt] = series.map((s) => s.c);
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  const ret = (xs: number[], n: number, end: number) => (xs[end] / xs[end - n] - 1) * 100;

  const at = (back: number): MoodComponent[] => {
    const cut = (xs: number[]) => xs.slice(0, xs.length - back);
    const s = cut(spy), v = cut(vix), r = cut(rsp), h = cut(hyg), l = cut(lqd), t = cut(tlt);
    const e = (xs: number[]) => xs.length - 1;
    const ma125 = sma(s, 125) ?? s[e(s)];
    const mom = ((s[e(s)] - ma125) / ma125) * 100;
    const vma = sma(v, 50) ?? v[e(v)];
    const vixRel = ((v[e(v)] - vma) / vma) * 100;
    const breadth = ret(r, 20, e(r)) - ret(s, 20, e(s));
    const credit = ret(h, 20, e(h)) - ret(l, 20, e(l));
    const haven = ret(s, 20, e(s)) - ret(t, 20, e(t));
    const strength = rsi(s.slice(-120)) ?? 50;
    return [
      { key: "momentum", label: "Momentum", score: clamp(50 + mom * 6), reading: `S&P ${mom >= 0 ? "+" : ""}${mom.toFixed(1)}% vs 125-day avg`, why: "Stocks well above their half-year average signal confidence; well below signals fear." },
      { key: "volatility", label: "Volatility", score: clamp(50 - vixRel * 1.6), reading: `VIX ${v[e(v)].toFixed(1)} (${vixRel >= 0 ? "+" : ""}${vixRel.toFixed(0)}% vs 50-day)`, why: "The VIX is the market's 'fear gauge' — it spikes when investors pay up for protection." },
      { key: "breadth", label: "Breadth", score: clamp(50 + breadth * 10), reading: `Equal-weight ${breadth >= 0 ? "leads" : "lags"} by ${Math.abs(breadth).toFixed(1)} pts`, why: "When the average stock keeps up with the giants, the rally is broad and healthy." },
      { key: "credit", label: "Junk bond demand", score: clamp(50 + credit * 18), reading: `High-yield ${credit >= 0 ? "beats" : "trails"} investment-grade by ${Math.abs(credit).toFixed(1)} pts`, why: "Investors reach for riskier bonds when they feel safe — and flee them when they don't." },
      { key: "haven", label: "Safe-haven demand", score: clamp(50 + haven * 5), reading: `Stocks ${haven >= 0 ? "beat" : "trail"} Treasuries by ${Math.abs(haven).toFixed(1)} pts (20d)`, why: "Money rushing into Treasuries is a classic sign of fear." },
      { key: "strength", label: "Price strength", score: clamp(strength * 1.15 - 7), reading: `S&P RSI ${strength.toFixed(0)}`, why: "RSI above 70 means stocks are running hot; under 30 means washed out." },
    ];
  };
  const score = (cs: MoodComponent[]) => Math.round(cs.reduce((a, c) => a + c.score, 0) / cs.length);
  const components = at(0);
  const history: number[] = [];
  for (let b = 59; b >= 0; b--) history.push(score(at(b)));
  const s = score(components);
  const label = s < 25 ? "Extreme fear" : s < 45 ? "Fear" : s <= 55 ? "Neutral" : s <= 75 ? "Greed" : "Extreme greed";
  return { score: s, label, components, history };
}

// ── Share metadata: crawlers don't run JS, so rewrite <head> at the edge per URL ──
const PAGES: Record<string, { title: string; desc: string; image?: string; kids?: boolean }> = {
  "/": { title: "Metaphases · Every earnings report, phase by phase", desc: "Who reports, when, how they've moved before — and how much of your money rides on it. A calmer, deeper earnings calendar." },
  "/watchlist": { title: "Your watchlist, in phases · Metaphases", desc: "Every company you track: when it reports next, its setup and Compass grades, and whether it's under your buy price." },
  "/compass": { title: "Compass: what reports with your money · Metaphases", desc: "Paste your stocks and funds. See which earnings reports actually move your money over the next two months — looking through your ETFs." },
  "/retrace": { title: "Retrace: how the reports really landed · Metaphases", desc: "Every report this month graded against Wall Street's consensus: beat rates, sector scorecards, the biggest surprises." },
  "/learn": { title: "Learn the language of earnings · Metaphases", desc: "EPS, consensus, typical move, P/E, RSI — every term on Metaphases in plain English." },
  "/today": { title: "Today, in 60 seconds · Metaphases", desc: "The market's mood, the reports that touch your money and this week's big event — in plain English, one swipe at a time." },
  "/check": { title: "Hype Check: saw a stock on socials? · Metaphases", desc: "Paste a TikTok, Instagram or X caption. See what the company actually does, when it reports, how wild it swings and the red flags — before you buy. Never advice." },
  "/kids": { title: "Metaphases Kids — money, explained for kids", desc: "One-minute lessons, a lemonade-stand game and a pretend piggy bank that follows real prices. For ages 8–12. No ads, no sign-up, nothing to buy.", image: `${SITE}${BASE}/og-kids.png`, kids: true },
  "/kids/start": { title: "Luna's Lemonade Stand — learn money by playing", desc: "Run a lemonade stand to learn what a company, a share, a price and a report card are. A free game for ages 8–12, with no ads.", image: `${SITE}${BASE}/og-kids.png`, kids: true },
  "/kids/app": { title: "Moon Club for iPhone & iPad — money, explained for kids", desc: "Luna's money club as a native iPhone and iPad app: quests, one-minute lessons and a pretend piggy bank. On-device AI, no ads, no accounts, no tracking.", image: `${SITE}${BASE}/og-kids.png`, kids: true },
  "/kids/privacy": { title: "Privacy · Metaphases Kids and Moon Club", desc: "Privacy policy for Moon Club and Metaphases Kids. No accounts, no ads, no tracking: what stays on the device, what leaves it and why.", image: `${SITE}${BASE}/og-kids.png`, kids: true },
  "/kids/support": { title: "Moon Club help & support", desc: "Answers for grown-ups about Moon Club and Metaphases Kids: pretend money, Ask Luna, the grown-up check, Family League codes, lesson packs, resetting progress, plus a contact form.", image: `${SITE}${BASE}/og-kids.png`, kids: true },
  "/kids/school": { title: "Moon School — one-minute money lessons for kids", desc: "93 tiny lessons on money, earning, saving, spending, borrowing, companies, shares, report cards, charts and why prices move, with worked examples, growth pictures and sorting games. Read aloud, for ages 6–11.", image: `${SITE}${BASE}/og-kids.png`, kids: true },
  "/kids/guess": { title: "Guess the Report Card — a kids' game with real companies", desc: "Will a company kids know beat or miss its report card? Guess, then see why. Pretend money only, for ages 6–11, no ads.", image: `${SITE}${BASE}/og-kids.png`, kids: true },
  "/kids/piggy": { title: "The Pretend Piggy Bank — practise with real prices", desc: "$1,000 of pretend coins across up to five companies kids know, following real prices. Learn why spreading out is safer. No real money.", image: `${SITE}${BASE}/og-kids.png`, kids: true },
  "/kids/gamenight": { title: "Moon Club Game Night — two players, one phone", desc: "Guess the same report cards head to head and let Luna keep score. In the Moon Club app for iPhone and iPad. Pretend money, no ads.", image: `${SITE}${BASE}/og-kids.png`, kids: true },
  "/kids/garden": { title: "The Moon Garden — plant points, watch them grow", desc: "Kids plant the Moon points they earned in companies they know and watch real daily prices move them. Points only, never money. In the Moon Club app.", image: `${SITE}${BASE}/og-kids.png`, kids: true },
  "/kids/league": { title: "You're invited to a Moon Club family league", desc: "Compare guesses on companies' report cards with family. The code holds only companies, dates and guesses, and a grown-up adds it.", image: `${SITE}${BASE}/og-kids.png`, kids: true },
  "/kids/pack": { title: "A Moon Club lesson pack", desc: "New one-minute money lessons and a new island on the Moon Club map, checked by a teacher and a markets expert. A grown-up turns it on.", image: `${SITE}${BASE}/og-kids.png`, kids: true },
  "/about": { title: "Where Metaphases comes from · Metaphases", desc: "A calmer earnings calendar with a memory: the best ideas from Market Digest and Compass, free, explained, never advice. Data, lineage and how the agents keep it running." },
};
const SESSION_WORDS: Record<string, string> = { bmo: "before the open", amc: "after the close", dmh: "during market hours", "": "" };

async function shareMeta(url: URL, env: Env, ctx: ExecutionContext): Promise<{ title: string; desc: string; image?: string; kids?: boolean } | null> {
  const path = url.pathname.slice(BASE.length) || "/";
  const t = path.match(/^\/t\/([A-Za-z.\-]{1,10})$/)?.[1] ?? url.searchParams.get("t");
  if (t) {
    const sym = t.toUpperCase();
    try {
      const d = await tickerData(sym, env, ctx);
      const name = d.profile?.name ?? U[sym]?.n ?? sym;
      const when = d.next && !d.next.closed ? new Date(d.next.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : null;
      const title = when ? `${sym} reports ${when} ${SESSION_WORDS[d.next!.session]} · Metaphases`.replace("  ", " ") : d.next?.closed ? `${sym} earnings: date not confirmed yet · Metaphases` : `${name} (${sym}) earnings · Metaphases`;
      const bits = [
        d.beatRate ? `Beat ${d.beatRate.beats} of its last ${d.beatRate.total}` : null,
        d.expectedMove != null ? `typical move ±${d.expectedMove.toFixed(1)}%` : null,
        d.setup.grade ? `setup ${d.setup.grade}` : null,
        d.compass.grade ? `Compass quality ${d.compass.grade}` : null,
      ].filter(Boolean);
      const desc = `${name}${d.next?.epsE != null ? ` — Street expects ${epsIn(d.next.epsE, d.next.currency)} EPS` : ""}. ${bits.join(" · ")}${bits.length ? "." : ""} The full read, phase by phase.`;
      return { title, desc, image: `${SITE}${BASE}/og/t/${sym}.png` };
    } catch { return { title: `${sym} earnings · Metaphases`, desc: PAGES["/"].desc }; }
  }
  const day = url.searchParams.get("day");
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const label = new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
    try {
      const withSupp = mergeSupplement(await calendarDay(day, env, ctx), await readSupp(), day, day, () => true); // cache only (0024)
      const evs = applyToEvents(withSupp, OVERRIDES, day, day, iso(todayNY()), (s) => s in U).filter((e) => e.t).sort((a, b) => (U[b.s]?.mc ?? 0) - (U[a.s]?.mc ?? 0));
      const top = evs.slice(0, 4).map((e) => e.s).join(", ");
      return { title: `${evs.length} earnings on ${label} · Metaphases`, desc: evs.length ? `${top}${evs.length > 4 ? ` and ${evs.length - 4} more` : ""} — sorted by session, with estimates, results and how each stock has reacted before.` : `A quiet day on the earnings calendar.` };
    } catch { return { title: `Earnings on ${label} · Metaphases`, desc: PAGES["/"].desc }; }
  }
  if (path.startsWith("/kids/")) {
    const pre = ["/kids/school/", "/kids/league/", "/kids/pack/"].find((x) => path.startsWith(x));
    return PAGES[path] ?? (pre ? PAGES[pre.slice(0, -1)] : PAGES["/kids"]);
  }
  return PAGES[path] ?? null;
}

async function page(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  // Fetch the directory URL, not index.html: the asset layer 307s "index.html" to its directory.
  const res = await env.ASSETS.fetch(new Request(new URL(`${BASE}/`, url), req));
  const meta = await shareMeta(url, env, ctx);
  if (!meta) return res;
  const canonical = `${SITE}${url.pathname}${url.search}`;
  const set = (attr: string) => ({ element(el: Element) { el.setAttribute(attr, attr === "href" ? canonical : el.getAttribute("property")?.endsWith("description") || el.getAttribute("name")?.endsWith("description") ? meta.desc : el.getAttribute("property") === "og:url" ? canonical : meta.title); } });
  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(meta.title); } })
    .on('meta[property="og:title"], meta[name="twitter:title"]', set("content"))
    .on('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]', set("content"))
    .on('meta[property="og:url"]', set("content"))
    .on('link[rel="canonical"]', set("href"))
    .on('meta[property="og:image"], meta[name="twitter:image"]', { element(el) { if (meta.image) el.setAttribute("content", meta.image); } })
    .on('meta[property="og:image:alt"]', { element(el) { if (meta.image) el.setAttribute("content", meta.title); } })
    // Kids pages wear Luna: their own favicon, home-screen icon and app title.
    .on('link[rel="icon"]', { element(el) { if (meta.kids) el.setAttribute("href", el.getAttribute("type") === "image/png" ? `${BASE}/kids-icon-512.png` : `${BASE}/kids-icon.svg`); } })
    .on('link[rel="apple-touch-icon"]', { element(el) { if (meta.kids) el.setAttribute("href", `${BASE}/kids-apple-touch-icon.png`); } })
    .on('meta[name="apple-mobile-web-app-title"]', { element(el) { if (meta.kids) el.setAttribute("content", "Moon Club"); } })
    .transform(new Response(res.body, { status: 200, headers: (() => { const h = new Headers(res.headers); h.set("Content-Type", "text/html; charset=utf-8"); h.set("Cache-Control", "public, max-age=300"); return h; })() }));
}

// ── /api/quotes?s=AAPL,DIS: batched live prices (Kids piggy bank). Cheap on purpose: each symbol is
// one small cached Finnhub quote (2 min), at most 10 per request, a few at a time (LESSONS: 1102). ──
async function quotes(url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const syms = Array.from(new Set((url.searchParams.get("s") ?? "").toUpperCase().split(/[,\s]+/).filter((x) => /^[A-Z.\-]{1,10}$/.test(x)))).slice(0, 10);
  const results = await pool(syms, 4, (sym) =>
    cached<any>(`fh:quote?symbol=${sym}`, 120, ctx, () => getJson(`${FH}/quote?symbol=${sym}&token=${env.FINNHUB_API_KEY}`)),
  );
  const out: Record<string, { price: number; changePct: number; prevClose: number }> = {};
  const warnings: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value?.c) out[syms[i]] = { price: r.value.c, changePct: r.value.dp ?? 0, prevClose: r.value.pc ?? r.value.c };
    else warnings.push(`No price for ${syms[i]} right now.`);
  });
  return json({ quotes: out, asOf: new Date().toISOString(), warnings }, 120);
}

// ── /api/kids/candles: daily candles + volume for Moon Club's Market World (kid-known companies only) ──
// Read-only public prices; the request carries nothing about the child. Shape matches MoonClubCore.CandleBundle.
async function kidsCandles(url: URL, ctx: ExecutionContext): Promise<Response> {
  const allowed = new Set(KID_COMPANIES.map((c) => c.s));
  const syms = Array.from(new Set((url.searchParams.get("s") ?? "").toUpperCase().split(/[,\s]+/))).filter((s) => allowed.has(s)).slice(0, 8);
  const results = await pool(syms, 3, (sym) => cached<any>(`ykc:${sym}`, 21600, ctx, async () => {
    const d = await getJson<any>(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1y&interval=1d`, UA);
    const r = d.chart.result[0], q = r.indicators.quote[0];
    const out = { s: sym, d: [] as string[], o: [] as number[], h: [] as number[], l: [] as number[], c: [] as number[], v: [] as number[] };
    const r2 = (x: number) => Math.round(x * 100) / 100;
    r.timestamp.forEach((t: number, i: number) => {
      if (q.close[i] == null || q.open[i] == null) return;
      out.d.push(nyDate(t)); out.o.push(r2(q.open[i])); out.h.push(r2(q.high[i])); out.l.push(r2(q.low[i])); out.c.push(r2(q.close[i])); out.v.push(q.volume[i] ?? 0);
    });
    return out;
  }));
  const series = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  return json({ asOf: new Date().toISOString(), series, warnings: syms.length > series.length ? ["Some charts are unavailable right now."] : [] }, 3600);
}

// ── /api/kids/why?s=SYM&range=1d|5d: "Why did it move?" clues for a kid-known company ─────────
// Inputs come only from data we already use: Yahoo daily closes (the stock, SPY, its sector ETF, plus
// dividend cut-off days) and Nasdaq's report-card history. No Finnhub call, so it can't eat the free
// tier's 60/min budget. The explanation is computed by shared/kidsWhy.ts; it never invents news.
async function kidsDaily(sym: string, ctx: ExecutionContext): Promise<DailySeries & { div: { date: string; amount: number }[] }> {
  return cached(`ykw:${sym}`, 1800, ctx, async () => {
    const d = await getJson<any>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3mo&interval=1d&events=div`, UA);
    const r = d.chart.result[0], q = r.indicators.quote[0];
    const out = { d: [] as string[], c: [] as number[], div: [] as { date: string; amount: number }[] };
    r.timestamp.forEach((t: number, i: number) => { if (q.close[i] != null) { out.d.push(nyDate(t)); out.c.push(Math.round(q.close[i] * 100) / 100); } });
    for (const v of Object.values<any>(r.events?.dividends ?? {})) if (v?.amount && v?.date) out.div.push({ date: nyDate(v.date), amount: v.amount });
    return out;
  });
}
async function kidsWhy(url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const s = (url.searchParams.get("s") ?? "").toUpperCase();
  const range: WhyRange = url.searchParams.get("range") === "5d" ? "5d" : "1d";
  const co = KID_BY_SYMBOL[s];
  if (!co) return json({ error: "Pick a company from Moon Club's list.", warnings: [] }, 0);
  const warnings: string[] = [];
  const settle = async <T>(label: string, p: Promise<T>): Promise<T | null> => { try { return await p; } catch { warnings.push(label); return null; } };
  const g = groupFor(s);
  const today = iso(todayNY());
  const [stock, spy, sector, nq, fhCal] = await Promise.all([
    settle("We couldn't get this company's prices right now.", kidsDaily(s, ctx)),
    settle("We couldn't see the whole market right now.", kidsDaily("SPY", ctx)),
    g ? settle("We couldn't see its group right now.", kidsDaily(g.etf, ctx)) : Promise.resolve(null),
    settle("We couldn't see its report cards right now.", cached<any>(`nq:surprise:${s}`, 43200, ctx, () => getJson(`https://api.nasdaq.com/api/company/${s}/earnings-surprise`, UA))),
    // One Finnhub call per company per day (cached 24 h): only for the report's session (before the open /
    // after the close), so a report isn't credited with a move that came before it.
    settle("We couldn't see when it reports.", cached<any>(`fh:why-hour:${s}:${today}`, 86400, ctx, () => getJson(`${FH}/calendar/earnings?symbol=${s}&from=${addDays(today, -40)}&to=${addDays(today, 120)}&token=${env.FINNHUB_API_KEY}`))),
  ]);
  const cal: any[] = fhCal?.earningsCalendar ?? [];
  const habit = (cal.find((e) => e.hour)?.hour ?? "") as "bmo" | "amc" | "dmh" | "";
  const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,]/g, "")); return Number.isFinite(n) ? n : null; };
  const reports = ((nq?.data?.earningsSurpriseTable?.rows ?? []) as any[]).map((r) => {
    const [mm, dd, yy] = String(r.dateReported).split("/");
    const date = `${yy}-${(mm ?? "").padStart(2, "0")}-${(dd ?? "").padStart(2, "0")}`;
    return { date, eA: num(r.eps), eE: num(r.consensusForecast), hour: ((cal.find((e) => e.date === date)?.hour ?? habit) || "") as "bmo" | "amc" | "dmh" | "" };
  });
  const input = buildWhyInput({ s, nick: co.nick, range, stock, spy, sector, reports, dividends: stock?.div ?? [] });
  return json({ input, why: whyMoved(input, today), warnings }, 900);
}

// ── /api/kids/packs: the curated lesson-pack channel (signed, reviewed packs only) ─────────────
// The app verifies each pack's Ed25519 signature against the public key it ships with, and a grown-up
// turns a pack on behind the gate. Bodies are JSON.stringify of the committed pack — the exact bytes
// scripts/sign-packs.ts signed (packs/channel.json holds the signatures).
const CHANNEL_PACKS: Record<string, unknown> = { "guest-coach-nova": guestNova };
function kidsPacks(p: string): Response {
  if (p === "/api/kids/packs") return json({ format: 1, publicKey: channel.publicKey, packs: channel.packs.filter((x) => x.ready && CHANNEL_PACKS[x.id]) }, 3600);
  const id = p.slice("/api/kids/packs/".length).replace(/\.json$/, "");
  const entry = channel.packs.find((x) => x.id === id);
  if (!entry || !entry.ready || !CHANNEL_PACKS[id]) return json({ error: "No such pack." }, 0);
  return new Response(JSON.stringify(CHANNEL_PACKS[id]), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600", "x-pack-sig": entry.sig } });
}

// ── /api/ics: subscribe to a watchlist's report dates in any calendar app ──
async function ics(url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const syms = Array.from(new Set((url.searchParams.get("s") ?? "").toUpperCase().split(/[,\s]+/).filter((x) => /^[A-Z.\-]{1,10}$/.test(x)))).slice(0, 50);
  const today = iso(todayNY());
  const to = addDays(today, 120);
  const results = await pool(syms, 6, (sym) =>
    cached<any>(`fh:ics:${sym}:${today}`, 21600, ctx, () => getJson(`${FH}/calendar/earnings?symbol=${sym}&from=${today}&to=${to}&token=${env.FINNHUB_API_KEY}`)),
  );
  const items: IcsItem[] = [];
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    const sym = syms[i];
    for (const e of applyToRows(sym, r.value?.earningsCalendar ?? [], OVERRIDES, today)) {
      if (e.date < today) continue;
      items.push({ symbol: sym, name: U[sym]?.n ?? sym, date: e.date, session: (e.hour || "") as Session, quarter: e.quarter, year: e.year, epsE: e.epsEstimate ?? null, cur: U[sym]?.ec, url: `${SITE}${BASE}/t/${sym}` });
    }
  });
  items.sort((a, b) => a.date.localeCompare(b.date));
  return new Response(buildIcs(items, new Date()), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="metaphases-earnings.ics"', "Cache-Control": "public, max-age=21600" },
  });
}

// ── /og/t/:sym.(svg|png): per-ticker share card ─────────────────────────
async function cardFor(sym: string, env: Env, ctx: ExecutionContext): Promise<string> {
  const d = await tickerData(sym, env, ctx);
  const when = d.next && !d.next.closed ? new Date(d.next.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : null;
  return cardSvg({ symbol: sym, name: d.profile?.name ?? U[sym]?.n ?? sym, when, session: d.next?.session ?? "", move: d.expectedMove, beats: d.beatRate?.beats ?? null, total: d.beatRate?.total ?? null, epsE: d.next?.epsE ?? null, cur: d.next?.currency });
}

async function ogCard(sym: string, fmt: "svg" | "png", req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const fallback = () => env.ASSETS.fetch(new Request(new URL(`${BASE}/og.png`, req.url), req));
  try {
    const day = iso(todayNY());
    const svg = await cached(`og:svg:v2:${sym}:${day}`, 21600, ctx, () => cardFor(sym, env, ctx));
    if (fmt === "svg") return new Response(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=21600" } });
    const key = new Request(`https://cache.metaphases.internal/og-png-v2-${sym}-${day}`);
    const hit = await caches.default.match(key);
    if (hit) return hit;
    const { renderPng } = await import("./og");
    const png = await renderPng(svg, ctx);
    const res = new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=21600" } });
    ctx.waitUntil(caches.default.put(key, res.clone()));
    return res;
  } catch {
    return fallback();
  }
}

// ── /og/story/*.png: 9:16 story cards for Instagram / WhatsApp stories ─────
async function storyCard(kind: string, req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const fallback = () => env.ASSETS.fetch(new Request(new URL(`${BASE}/og.png`, req.url), req));
  try {
    const day = iso(todayNY());
    const svg = await cached(`story:svg:v2:${kind}:${day}`, 21600, ctx, async () => {
      if (kind === "kids") return storyKidsSvg();
      const rc = kind.match(/^kids-recap:(\d+)\.(\d+)\.(\d+)\.(n|-?[\d.]+)\.(\d)$/);
      if (rc) {
        const x = parseRecapQuery(new URLSearchParams({ g: rc[1], r: rc[2], l: rc[3], lv: rc[5], ...(rc[4] === "n" ? {} : { p: rc[4] }) }));
        return storyKidsRecapSvg(x, LEVELS[x.lv].name);
      }
      const t = kind.match(/^t\/([A-Z.\-]{1,10})$/);
      if (t) {
        const sym = t[1];
        const d = (await (await ticker(sym, env, ctx)).json()) as TickerResponse;
        const name = d.profile?.name ?? U[sym]?.n ?? sym;
        return storyTickerSvg({
          symbol: sym, name, does: whatTheyDo(name, d.profile?.industry),
          when: d.next && !d.next.closed ? whenPlain(d.next.date, d.next.session, day) : d.next ? "date not confirmed yet" : "date not announced yet",
          session: d.next?.session ?? "", epsE: d.next?.epsE ?? null, cur: d.next?.currency, move: d.expectedMove, grade: d.compass.grade,
          beats: d.beatRate?.beats ?? null, total: d.beatRate?.total ?? null,
        });
      }
      const m = (await (await macro(env, ctx)).json()) as MacroResponse;
      if (kind === "mood" && m.mood) { const p = moodPlain(m.mood.score); return storyMoodSvg(m.mood.score, p.headline, p.line); }
      if (kind === "week") {
        const rank: Record<string, number> = { fomc: 5, cpi: 4, jobs: 3, pce: 2, gdp: 2 };
        const ev = m.events.filter((e) => e.date >= day && e.date <= addDays(day, 9)).sort((a, b) => (rank[b.key] ?? 0) - (rank[a.key] ?? 0))[0];
        if (ev) return storyMacroSvg(ev.name, whenPlain(ev.date, "", day).replace(" (time not confirmed yet)", ""), ev.blurb);
      }
      throw new Error("no story");
    });
    const key = new Request(`https://cache.metaphases.internal/story-png-v2-${encodeURIComponent(kind)}-${day}`);
    const hit = await caches.default.match(key);
    if (hit) return hit;
    const { renderPng } = await import("./og");
    const res = new Response(await renderPng(svg, ctx, 1080), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=21600" } });
    ctx.waitUntil(caches.default.put(key, res.clone()));
    return res;
  } catch {
    return fallback();
  }
}

// ── /api/health: one probe per upstream, so agents and the operator can see what's degraded ──
async function health(env: Env, ctx: ExecutionContext): Promise<Response> {
  const today = iso(todayNY());
  const probe = async (name: string, fn: () => Promise<unknown>) => {
    const t0 = Date.now();
    try { await fn(); return { name, ok: true, ms: Date.now() - t0 }; } catch (e) { return { name, ok: false, ms: Date.now() - t0, error: String(e).slice(0, 160) }; }
  };
  const sources = await cached(`health:${Math.floor(Date.now() / 300000)}`, 300, ctx, () => Promise.all([
    probe("finnhub", () => getJson(`${FH}/quote?symbol=AAPL&token=${env.FINNHUB_API_KEY}`)),
    probe("fred", () => getJson(`https://api.stlouisfed.org/fred/release/dates?release_id=50&realtime_start=${today}&include_release_dates_with_no_data=true&limit=1&file_type=json&api_key=${env.FRED_API_KEY}`)),
    probe("yahoo", () => getJson(`https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=5d&interval=1d`, UA)),
    probe("nasdaq", () => getJson(`https://api.nasdaq.com/api/company/AAPL/earnings-surprise`, UA)),
    // The path users actually hit: the full sheet (cached). Upstreams can be up while this fails (critique 2026-11-01 0700).
    probe("ticker", async () => { const d = await tickerData("AAPL", env, ctx); if (!d.profile && !d.quote) throw new Error("empty sheet"); }),
  ]));
  const ok = sources.every((x) => x.ok);
  return new Response(JSON.stringify({ ok, build: env.CF_VERSION?.id ?? "dev", deployedAt: env.CF_VERSION?.timestamp ?? null, universe: Object.keys(U).length, sources, asOf: new Date().toISOString() }), {
    status: ok ? 200 : 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === BASE) return Response.redirect(`${url.origin}${BASE}/${url.search}`, 301);
    if (!url.pathname.startsWith(BASE + "/")) return env.ASSETS.fetch(req);
    const p = url.pathname.slice(BASE.length);
    try {
      if (p === "/api/calendar") return await calendar(url, env, ctx);
      if (p === "/api/macro") return await macro(env, ctx);
      if (p === "/api/health") return await health(env, ctx);
      if (p.startsWith("/api/ai/")) { const r = await handleAi(p, req, env); if (r) return r; }
      if (p === "/api/ics") return await ics(url, env, ctx);
      if (p === "/api/quotes") return await quotes(url, env, ctx);
      if (p === "/api/kids/candles") return await kidsCandles(url, ctx);
      if (p === "/api/kids/why") return await kidsWhy(url, env, ctx);
      if (p === "/api/kids/support") return await handleSupport(req, env);
      if (p === "/api/kids/packs" || p.startsWith("/api/kids/packs/")) return kidsPacks(p);
      if (p === "/og/story/kids.png") return await storyCard("kids", req, env, ctx);
      // 0027: counts only; parseRecapQuery drops anything else, so nothing personal can be rendered.
      if (p === "/og/story/kids-recap.png") return await storyCard(`kids-recap:${recapImageKey(parseRecapQuery(url.searchParams))}`, req, env, ctx);
      const story = p.match(/^\/og\/story\/(t\/[A-Za-z.\-]{1,10}|mood|week)\.png$/);
      if (story) return await storyCard(story[1].toUpperCase().replace(/^T\//, "t/").replace(/^MOOD$/, "mood").replace(/^WEEK$/, "week"), req, env, ctx);
      const og = p.match(/^\/og\/t\/([A-Za-z.\-]{1,10})\.(svg|png)$/);
      if (og) return await ogCard(og[1].toUpperCase(), og[2] as "svg" | "png", req, env, ctx);
      const m = p.match(/^\/api\/ticker\/([A-Za-z.\-]{1,10})$/);
      if (m) return await ticker(m[1].toUpperCase(), env, ctx);
      if (p.startsWith("/api/")) return json({ error: "Not found" }, 0);
      const isPage = req.method === "GET" && !/\.[a-z0-9]{2,12}$/i.test(p);
      if (isPage) return await page(req, env, ctx);
      return env.ASSETS.fetch(req);
    } catch (e) {
      return new Response(JSON.stringify({ error: "We couldn't reach the market data service. Try again in a moment.", detail: String(e) }), { status: 502, headers: { "Content-Type": "application/json" } });
    }
  },
} satisfies ExportedHandler<Env>;
