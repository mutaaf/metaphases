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
import { isProjected } from "../shared/projected";
import { buildIcs, cardSvg, quartersFrom, shapeChart, nyDate, type IcsItem } from "../shared/depth";
import { reactionMove, sessionHabit } from "../shared/reaction";
import { applyPreReport, isReit, judgeReaction, reitEstimateOffBasis, nasdaqDayActuals, nasdaqDayEps, needsEpsBasis, periodKey, pickConsensus, sameEpsUnit, type EstSnapshot } from "../shared/compare";
import { shareEps, yahooSymbol } from "../shared/shareClass";
import overridesFile from "../data/date-overrides.json" with { type: "json" };
import { activeOverrides, applyToEvents, applyToRows, closedDay, flagClosed, type DateOverrides } from "../shared/dateOverrides";
import { daysApart, isDated, lookbackDays, LOOKBACK_DAYS, tickerShareTitle, tradingDaysSince, nqDate, skippedQuarter } from "../shared/pending";
import { JUST_DAYS, pendingLine, reportedCard, reportedLine, reportOutcome, surprisePct, tickerShareDesc, type DayRow, type Outcome } from "../shared/reported";
import { buildIndex, crossCheck, crossOne, nasdaqDaySessions, withDay, windowDays, windowEnd, XCHECK_MIN_CAP, XCHECK_REACH, type NqDay, type NqWindow } from "../shared/crossCheck";
import { aliasMap, commitSupp, dropUnscaled, homeListing, mergeSupplement, refreshEntry, staleSymbols, supplementSymbols, suppRows, unfetched, SUPP_LOCK_S, type SuppDoc, type Universe } from "../shared/calendarSupplement";
import { secureHtml } from "../shared/csp";
import { borrowHistory, isDegraded, sheetTtl, staleUsable, standIn, SHEET_DEGRADED_TTL, SHEET_STALE_TTL, SHEET_TTL, type StaleSheet } from "../shared/sheetCache";

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
const U = universe as Record<string, { n: string; mc: number; c?: string; ec?: string; sec?: string }>;
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

async function getJson<T = any>(url: string, headers: Record<string, string> = {}, timeoutMs?: number): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers, cf: { cacheTtl: 60 }, ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}) } as RequestInit);
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
    out.push({ s: sym, d: e.date, h: (e.hour || "") as Session, q: e.quarter, y: e.year, eE: shareEps(sym, e.epsEstimate), eA: shareEps(sym, e.epsActual), rE: e.revenueEstimate, rA: e.revenueActual, t: tracked ? 1 : 0 });
  }
  return out;
}

// ── 0024: the per-symbol supplement ─────────────────────────────────────
const SUPP_KEY = CAL("cal:supp:v2"); // v2: v1 cached empty rows for ADRs answered under their home label
const SUPP_LOCK = CAL("cal:supp:lock:v1");
/** `symbol=` only returns upcoming dates, so the supplement covers ranges that touch the next ~4 months. */
const SUPP_BACK = 7, SUPP_AHEAD = 120;

async function readSupp(): Promise<SuppDoc> {
  try { const hit = await caches.default.match(SUPP_KEY); return hit ? dropUnscaled((await hit.json()) as SuppDoc) : {}; } catch { return {}; }
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
  const updates: SuppDoc = {};
  got.forEach((r, i) => { if (r.status === "fulfilled") updates[due[i]] = refreshEntry(doc[due[i]], r.value, today, Date.now()); });
  if (!Object.keys(updates).length) return doc;
  // Read-merge-write (0047): never overwrite another refresh's progress with this request's older copy.
  const write = (d: SuppDoc) => caches.default.put(SUPP_KEY, new Response(JSON.stringify(d), { headers: { "Cache-Control": "public, max-age=604800", "Content-Type": "application/json" } }));
  const done = commitSupp({ read: readSupp, write }, doc, updates, SUPP_SYMBOLS);
  ctx.waitUntil(done.catch(() => {}));
  return { ...doc, ...updates };
}

const touchesSupp = (from: string, to: string, today: string) => to >= addDays(today, -SUPP_BACK) && from <= addDays(today, SUPP_AHEAD);

/** One day's processed events. v3 (0058): judged rows carry Nasdaq's actual (`nA`), so settled days re-read it. The last-good copy moves too, or a fallback would serve the old mixed pairs. */
const CAL_DAY = (day: string) => CAL(`cal:v3:${day}`);

async function putDay(day: string, events: EarningsEvent[], today: string, ctx: ExecutionContext) {
  const body = JSON.stringify(events);
  ctx.waitUntil(Promise.all([
    caches.default.put(CAL_DAY(day), new Response(body, { headers: { "Cache-Control": `public, max-age=${calTtl(day, today)}`, "Content-Type": "application/json" } })),
    caches.default.put(CAL(`cal:stale:v3:${day}`), new Response(body, { headers: { "Cache-Control": "public, max-age=604800" } })),
  ]));
}

// ── 0035: estimates as they stood before the print ─────────────────────
const EST = (day: string) => CAL(`est:v1:${day}`);
/** Kept well past a season: the snapshot is the only record of the bar before the print. */
const EST_TTL = 180 * 86400;

async function readSnap(day: string): Promise<EstSnapshot> {
  try { const hit = await caches.default.match(EST(day)); return hit ? ((await hit.json()) as EstSnapshot) : {}; } catch { return {}; }
}

/** Nasdaq's day calendar: pre-report EPS consensus (`e`) and, on the same basis, the reported EPS (`a`, 0058) for that day's reporters (one call per day, cached). */
async function nasdaqDay(day: string, today: string, ctx: ExecutionContext): Promise<{ e: Record<string, number>; a: Record<string, number> | null }> {
  const req = CAL(`nq:cal:v2:${day}`);
  const hit = await readJson<{ e: Record<string, number>; a: Record<string, number> | null }>(req);
  if (hit) return hit;
  // A slow Nasdaq must not hold up the calendar, and an empty answer isn't cached for a week.
  const body = await getJson<any>(`https://api.nasdaq.com/api/calendar/earnings?date=${day}`, UA, 4000);
  const e = nasdaqDayEps(body);
  if (!Object.keys(e).length) throw new Error("nasdaq day calendar empty");
  // Nasdaq adds the `eps` column a day or two after the report (live, Nov 12: none for Nov 11, 225 for Nov 10).
  // Until it does, the actuals are null (rows not judged yet) and the answer is kept an hour, not a week.
  const a = (body?.data?.rows ?? []).some((r: any) => r && "eps" in r) ? nasdaqDayActuals(body) : null;
  const val = { e, a };
  ctx.waitUntil(putJson(req, val, day < today && a ? 7 * 86400 : 3600));
  return val;
}

/** Nasdaq's figures are dollars: only swap them in for tracked names whose estimates are in dollars too. */
const usdEstimates = (s: string) => s in U && isUsd(U[s].ec ?? "USD");

/**
 * Snapshot unreported rows' estimates; judge reported rows against the snapshot, else Nasdaq's
 * pre-report consensus. Never fails the day: a Nasdaq error leaves Finnhub's figures as they were.
 */
async function preReportDay(day: string, events: EarningsEvent[], today: string, ctx: ExecutionContext): Promise<EarningsEvent[]> {
  const snap = await readSnap(day);
  // Also for a reported row whose EPS is on another basis from its estimate (0049): Nasdaq's figure may settle it.
  const needNq = events.some((e) => ((e.eA != null || e.rA != null) && !snap[e.s] && e.eE != null) || (usdEstimates(e.s) && needsEpsBasis(e, snap[e.s]?.eE)));
  const nq = needNq ? await nasdaqDay(day, today, ctx).catch(() => null) : null;
  const { events: out, updates } = applyPreReport(events, snap, nq?.e ?? {}, usdEstimates, day > today, nq?.a);
  if (Object.keys(updates).length) {
    // Re-read just before writing and add only our entries: another request's newer snapshot survives (0047).
    ctx.waitUntil((async () => {
      const latest = await readSnap(day);
      await caches.default.put(EST(day), new Response(JSON.stringify({ ...latest, ...updates }), { headers: { "Cache-Control": `public, max-age=${EST_TTL}`, "Content-Type": "application/json" } }));
    })().catch(() => {}));
  }
  return out;
}

// ── 0015: cross-check the next 14 days against Nasdaq's per-day calendar ──
// A second opinion, never on the critical path: a request that may build the window fetches at most
// NQX_PER_BUILD missing days (one builder per colo per minute, no 429 retries, a short timeout), failures are
// remembered for 15 minutes, and everything else reads the folded window from the cache only.
/** Keep what the calendar can show: tracked names, plus anything big enough to pass its size gate. */
const keepNq = (s: string, cap: number) => s in U || cap >= XCHECK_MIN_CAP;
/** The folded window, read in one cache lookup (written once every day in it has loaded). */
const NQX_IDX = (today: string) => CAL(`nq:x:idx:v1:${today}`);
const NQX_DAY = (day: string) => CAL(`nq:x:v1:${day}`);
const NQX_FAIL = CAL("nq:x:fail:v1");
const NQX_LOCK = CAL("nq:x:lock:v1");
const NQX_PER_BUILD = 2;

async function readJson<T>(req: Request): Promise<T | null> {
  try { const hit = await caches.default.match(req); return hit ? ((await hit.json()) as T) : null; } catch { return null; }
}
const putJson = (req: Request, val: unknown, ttl: number) =>
  caches.default.put(req, new Response(JSON.stringify(val), { headers: { "Cache-Control": `public, max-age=${ttl}`, "Content-Type": "application/json" } })).catch(() => {});

/** One Nasdaq day as symbol → session. No 429 retries (this is optional data); a malformed answer is a failure, an empty day (`rows: null`) is not. */
async function fetchNasdaqDay(day: string, ms = 2500): Promise<NqDay> {
  const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${day}`, { headers: UA, signal: AbortSignal.timeout(ms) } as RequestInit);
  if (!r.ok) throw new Error(`api.nasdaq.com ${r.status}`);
  const body = (await r.json()) as any;
  if (!body?.data || typeof body.data !== "object" || !("rows" in body.data)) throw new Error("nasdaq day calendar malformed");
  return nasdaqDaySessions(body, keepNq);
}

/** How far ahead a next report's Nasdaq day is read on demand (later days rarely carry a session). */
const NQ_ON_DEMAND_REACH = 45;
/**
 * 0057: one upcoming Nasdaq day, read on demand (the habit past moves are measured with), so it never waits
 * for the 0015 window to reach that date. Shares the window's day cache and failure memory: one call per day
 * per colo every 6 h, none for 15 minutes after a failure, and never throws (null = Nasdaq can't say). No
 * promise is shared across requests (a cancelled request must not strand another); the cache absorbs repeats.
 */
async function nasdaqDayOnDemand(day: string, today: string, ctx: ExecutionContext): Promise<NqDay | null> {
  // Nasdaq wipes a past day's sessions (LESSONS 2026-11-11), and far-off days rarely carry one.
  if (day < today || day > addDays(today, NQ_ON_DEMAND_REACH)) return null;
  const hit = await readJson<NqDay>(NQX_DAY(day));
  if (hit) return hit;
  const failed = (await readJson<Record<string, number>>(NQX_FAIL)) ?? {};
  if (failed[day] > Date.now()) return null;
  try {
    const v = await fetchNasdaqDay(day);
    ctx.waitUntil(putJson(NQX_DAY(day), v, Object.keys(v).length ? 21600 : 3600));
    return v;
  } catch (e) {
    // 0059: a slow answer (over the sheet's 2.5 s) isn't remembered as a failure, so the 4 s background fill can
    // still load that day; a refusal or a malformed answer is.
    if ((e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError") return null;
    // Re-read and merge, so another day's remembered failure survives (0047).
    ctx.waitUntil((async () => putJson(NQX_FAIL, { ...((await readJson<Record<string, number>>(NQX_FAIL)) ?? {}), [day]: Date.now() + 15 * 60_000 }, 900))());
    return null;
  }
}

/** The background fill's timeout: Nasdaq's day calendar answers in 1.2–3.3 s (0059), so 2.5 s lost whole days. */
const NQX_BUILD_TIMEOUT = 4000;
const WHEN_LONG: Record<Session, string> = { bmo: "before the opening bell", amc: "after the close", dmh: "during market hours", "": "" };

/**
 * The window's Nasdaq listings. The folded copy when this colo has one; otherwise the cached days (a partly
 * loaded window is still evidence for the days it has, 0059), plus, only when `build` is set, up to
 * NQX_PER_BUILD fetched ones (if this request takes the per-colo lock). Returns null when there's nothing to
 * compare against.
 */
async function nasdaqWindow(today: string, ctx: ExecutionContext, build: boolean): Promise<NqWindow | null> {
  const folded = await readJson<NqWindow>(NQX_IDX(today));
  if (folded) return folded;
  const days = windowDays(today);
  const loaded: Record<string, NqDay> = {};
  const missing: string[] = [];
  await Promise.all(days.map(async (d) => { const v = await readJson<NqDay>(NQX_DAY(d)); if (v) loaded[d] = v; else missing.push(d); }));
  if (build && missing.length && !(await caches.default.match(NQX_LOCK).catch(() => true))) {
    await caches.default.put(NQX_LOCK, new Response("1", { headers: { "Cache-Control": "public, max-age=60" } })).catch(() => {});
    const failed = (await readJson<Record<string, number>>(NQX_FAIL)) ?? {};
    const now = Date.now();
    const take = missing.filter((d) => !(failed[d] > now)).slice(0, NQX_PER_BUILD);
    // 0059: the fill runs after the response (its 4 s timeout never delays the calendar); the next read has the days.
    if (take.length) ctx.waitUntil((async () => {
      const got = await pool(take, 2, (d) => fetchNasdaqDay(d, NQX_BUILD_TIMEOUT));
      const fresh: Record<string, number> = {};
      await Promise.all(got.map(async (r, i) => {
        if (r.status === "fulfilled") await putJson(NQX_DAY(take[i]), r.value, Object.keys(r.value).length ? 21600 : 3600);
        else fresh[take[i]] = now + 15 * 60_000;
      }));
      // Re-read and merge, so another request's remembered failure survives (0047).
      if (Object.keys(fresh).length) await putJson(NQX_FAIL, { ...((await readJson<Record<string, number>>(NQX_FAIL)) ?? {}), ...fresh }, 900);
    })().catch(() => {}));
  }
  if (!Object.keys(loaded).length) return null;
  const w: NqWindow = { from: today, to: windowEnd(today), loaded: Object.keys(loaded).sort(), idx: buildIndex(loaded) };
  if (w.loaded.length === days.length) ctx.waitUntil(putJson(NQX_IDX(today), w, 3600));
  return w;
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
    const hit = await caches.default.match(CAL_DAY(d));
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
      const ev = await preReportDay(d, await load(), today, ctx);
      putDay(d, ev, today, ctx);
      out[i] = { status: "fulfilled", value: ev };
    } catch (reason) {
      health.failed = true;
      const stale = await caches.default.match(CAL(`cal:stale:v3:${d}`));
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
  let pending = 0;
  if (touchesSupp(from, to, today)) {
    // After the range calls, never alongside them; and no new calls at all if any upstream call failed,
    // even one a stale copy covered (0024: a rate limit must not become more calls).
    const doc = await supplement(env, ctx, today, !health.failed && warnings.length === 0);
    events = mergeSupplement(events, doc, from, to, (d) => loaded.has(d));
    // Not fetched yet here (a cold cache): count them so an absent row never reads as "doesn't report".
    // A progress count, not a warning (0047): nothing failed, so the client mustn't say "busy" or retry.
    pending = unfetched(doc, SUPP_SYMBOLS);
  }
  let fixed = flagClosed(applyToEvents(events, OVERRIDES, from, to, today, (s) => s in U));
  // 0015: only ranges that reach the next 14 days (or a month past them, for a projected date Nasdaq lists sooner).
  // A Nasdaq failure leaves the events as Finnhub has them. It isn't a calendar failure, so it's not a warning:
  // warnings make the client say "busy" and retry (0047). `unchecked` counts the days that couldn't be compared.
  let unchecked = 0;
  if (to >= today && from <= addDays(windowEnd(today), XCHECK_REACH)) {
    // Only ranges overlapping the window may fetch; later ranges (the month view fires several at once) read the cache.
    const w = await nasdaqWindow(today, ctx, from <= windowEnd(today)).catch(() => null);
    if (w) fixed = crossCheck(fixed, w);
    unchecked = windowDays(today).length - (w?.loaded.length ?? 0);
  }
  const body: CalendarResponse = { from, to, events: fixed, asOf: new Date().toISOString(), warnings, ...(pending ? { pending } : {}), ...(unchecked ? { unchecked } : {}) };
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
        const d = await getJson<any>(`https://${h}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(symbol))}?range=${range}&interval=1d`, UA);
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

/**
 * The finished sheet, edge-cached for 5 minutes: sheets, share pages and OG cards all read one small JSON.
 * 0043: a sheet that lost its date or history to a rate limit is cached for 30 s only, and the last good copy
 * (`tk:stale:v5:SYM`, 24 h) stands in for it, marked as an earlier read. `ttl` is what both cache layers use.
 */
async function tickerEntry(symbol: string, env: Env, ctx: ExecutionContext): Promise<{ data: TickerResponse; ttl: number }> {
  const key = new Request(`https://cache.metaphases.internal/${encodeURIComponent(`tk:v6:${symbol}`)}`);
  const staleKey = new Request(`https://cache.metaphases.internal/${encodeURIComponent(`tk:stale:v5:${symbol}`)}`);
  const hit = await caches.default.match(key);
  if (hit) { const data = (await hit.json()) as TickerResponse; return { data, ttl: sheetTtl(data) }; }
  const built = await buildTicker(symbol, env, ctx);
  const today = iso(todayNY());
  let data = built;
  if (isDegraded(built)) {
    const old = await caches.default.match(staleKey).then((r) => (r ? (r.json() as Promise<StaleSheet>) : null)).catch(() => null);
    const ny = todayNY();
    const nowMin = ny.getHours() * 60 + ny.getMinutes();
    // Only the past reports failed: keep the fresh date and report-day state, borrow the history.
    if (!built.warnings.includes("Upcoming date unavailable.")) { if (staleUsable(old, today, nowMin, "history")) data = borrowHistory(built, old, today); }
    else if (staleUsable(old, today, nowMin)) data = standIn(old, today);
  } else {
    const s: StaleSheet = { at: Date.now(), day: today, data: built };
    ctx.waitUntil(caches.default.put(staleKey, new Response(JSON.stringify(s), { headers: { "Cache-Control": `public, max-age=${SHEET_STALE_TTL}`, "Content-Type": "application/json" } })).catch(() => {}));
  }
  const ttl = sheetTtl(data);
  ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(data), { headers: { "Cache-Control": `public, max-age=${ttl}`, "Content-Type": "application/json" } })).catch(() => {}));
  return { data, ttl };
}
async function tickerData(symbol: string, env: Env, ctx: ExecutionContext): Promise<TickerResponse> {
  return (await tickerEntry(symbol, env, ctx)).data;
}

async function ticker(symbol: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { data, ttl } = await tickerEntry(symbol, env, ctx);
  return json(data, ttl);
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

  // 0046: per-share figures in the tracked share's unit (BRK.B: Finnhub's are per Class A share).
  const listOf = (v: unknown): any[] => (Array.isArray(v) ? v : []);
  for (const e of listOf(upcoming?.earningsCalendar)) { e.epsEstimate = shareEps(symbol, e.epsEstimate); e.epsActual = shareEps(symbol, e.epsActual); }
  for (const f of listOf(surprises)) { f.estimate = shareEps(symbol, f.estimate); f.actual = shareEps(symbol, f.actual); }
  const epsSeries: unknown = metric?.series?.quarterly?.eps;
  const quarterly = Array.isArray(epsSeries) ? { ...metric.series.quarterly, eps: epsSeries.map((p) => ({ ...p, v: shareEps(symbol, p.v) })) } : metric?.series?.quarterly;
  const cal: any[] = applyToRows(symbol, upcoming?.earningsCalendar ?? [], OVERRIDES, today);
  const nextE = cal.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const lastE = cal.filter((e) => e.date < today).sort((a, b) => b.date.localeCompare(a.date))[0];
  // 0015/0059: the calendar's Nasdaq cross-check, from the cached days (folded or not: one slow day must not
  // blind every sheet). A blank session both feeds agree on is filled before the report-day state (0039) is
  // worked out from it.
  // The rows the calendar's crossCheck compares: no company date, no figures in, not projected onto a closed day.
  const xcheck = !!nextE && !nextE.source && nextE.epsActual == null && nextE.revenueActual == null && !closedDay(nextE.date);
  let nqWin = xcheck ? await nasdaqWindow(today, ctx, false).catch(() => null) : null;
  // 0057: the habit past reports are measured with. A company-dated row already carries its own session (or
  // none). Unless the window already loaded that day: read the one Nasdaq day the next report is on, on demand (one
  // shared, cached call per day), so the habit never waits for the window to reach that date. 0059: inside the
  // window, that day joins the cross-check too, so the sheet's session matches the calendar's.
  const inWin = !!nqWin && nqWin.loaded.includes(nextE?.date ?? ""); // the window already answered for that day
  const nqNextDay = nextE && !nextE.source && !nextE.hour && !inWin ? await nasdaqDayOnDemand(nextE.date, today, ctx) : null;
  const nqNextHour = nqNextDay?.[symbol];
  if (xcheck && nqNextDay) nqWin = withDay(nqWin, today, nextE.date, nqNextDay);
  if (nqWin && nextE && !nextE.hour) { const c = crossOne(symbol, nextE.date, "", nqWin); if (c?.h) nextE.hour = c.h; }
  const habit: Session = sessionHabit(nextE?.hour, nqNextHour, lastE?.hour);
  // The last print's estimate as it stood before the report (0035), when the calendar recorded it.
  const lastSnapRaw = lastE ? (await readSnap(lastE.date))[symbol]?.eE ?? null : null;
  const lastSnap = sameEpsUnit(symbol, lastSnapRaw, lastE?.epsEstimate) ? lastSnapRaw : null;

  // Finnhub's estimates for foreign filers are in the reporting currency; Nasdaq's history is USD.
  const rows: any[] = nasdaq?.data?.earningsSurpriseTable?.rows ?? [];
  const currency = estimateCurrency({
    estimateCurrency: profile?.estimateCurrency, currency: profile?.currency, known: U[symbol]?.ec,
    country: profile?.country || U[symbol]?.c, epsE: nextE?.epsEstimate ?? null,
    usdEps: rows.slice(0, 4).map((r) => (typeof r.eps === "number" ? r.eps : parseFloat(r.eps))),
  });
  const usd = isUsd(currency);
  // 0049: a REIT's actual is often FFO against a GAAP estimate, so its EPS only counts as the same basis within EPS_BASIS_MAX.
  const reit = isReit(symbol, U[symbol]?.sec ?? profile?.finnhubIndustry);

  // 0038: a quarter whose projected date passed without a result has dropped off `symbol=` (future dates
  // only), so `nextE` may be the quarter after it. Keep the unreported quarter as the next report instead,
  // with its passed date and estimates when the cached calendar still holds its row.
  const reportedDates = rows.map((r) => nqDate(r.dateReported)).filter((d): d is string => d != null);
  const skip = skippedQuarter(nextE, reportedDates);
  let pending: { quarter: number; year: number; passed: string; hour: Session; eE: number | null; rE: number | null } | null = null;
  let skipRow: EarningsEvent | null = null;
  let companyDated = false;
  if (skip) {
    const row = skipRow = await passedRow(symbol, skip, lookbackDays(today, addDays(reportedDates[0], 45)));
    // Only call it pending when the calendar shows the quarter's day passed at least two trading days ago with no
    // figures. A fresher row, a row with figures, or no row at all (this colo never cached it) can just be a feed
    // that's a day behind a normal report, and that must not read as a missed report.
    // A company-announced date for this quarter that has passed means it reported on that day (AXON, Nov 5),
    // whatever the cached Finnhub projection (Nov 2) says: the feeds are only behind.
    const ov = activeOverrides(OVERRIDES, today)[symbol];
    companyDated = !!ov && ov.quarter === skip.quarter && ov.year === skip.year;
    if (!companyDated && row && row.eA == null && row.rA == null && tradingDaysSince(row.d, today) >= 2) {
      pending = { ...skip, passed: row.d, hour: (row.h ?? "") as Session, eE: row.eE ?? null, rE: row.rE ?? null };
    }
  }
  // A company-dated row that the override had to create carries no estimates; borrow the calendar's for that quarter.
  if (nextE?.source && nextE.epsEstimate == null && nextE.revenueEstimate == null) {
    const row = await passedRow(symbol, nextE, lookbackDays(today, addDays(today, -LOOKBACK_DAYS)));
    if (row && row.eA == null) { nextE.epsEstimate = row.eE; nextE.revenueEstimate = row.rE; }
  }
  // The sheet explains a non-USD basis next to the estimates (next.currency); no partial-data warning needed.

  // 0039: a report that's out (or due, with its session over) is said so the same day. Today's row: Finnhub's
  // `symbol=` answer, else the calendar route's cached day (whose estimate is already the pre-report bar, 0035).
  // The day after, `symbol=` has dropped the row (future dates only), so use the skipped quarter's cached row.
  const nyNow = todayNY();
  const nowMin = nyNow.getHours() * 60 + nyNow.getMinutes();
  let outcome: Outcome = null;
  if (nextE && nextE.date === today) {
    const row = await passedRow(symbol, nextE, [today]);
    const snapRaw = (await readSnap(today))[symbol]?.eE;
    const snapE = sameEpsUnit(symbol, snapRaw, nextE.epsEstimate ?? row?.eE) ? snapRaw : undefined;
    const day: DayRow = {
      date: today, hour: nextE.hour || row?.h || "", quarter: nextE.quarter, year: nextE.year,
      eE: row?.eE ?? snapE ?? nextE.epsEstimate ?? null, eA: nextE.epsActual ?? row?.eA ?? null,
      rE: row?.rE ?? nextE.revenueEstimate ?? null, rA: nextE.revenueActual ?? row?.rA ?? null,
      ...(row?.nE != null ? { nE: row.nE } : {}),
      ...(row && row.nA !== undefined ? { nA: row.nA } : {}),
    };
    outcome = reportOutcome(day, today, nowMin);
  } else if (skip && skipRow && !pending && !companyDated) {
    outcome = reportOutcome({ date: skipRow.d, hour: skipRow.h ?? "", quarter: skip.quarter, year: skip.year, eE: skipRow.eE ?? null, eA: skipRow.eA ?? null, rE: skipRow.rE ?? null, rA: skipRow.rA ?? null, ...(skipRow.nE != null ? { nE: skipRow.nE } : {}), ...(skipRow.nA !== undefined ? { nA: skipRow.nA } : {}) }, today, nowMin);
  }
  const reported = outcome?.kind === "reported" ? outcome.row : null;
  const duePending = outcome?.kind === "results-pending" ? outcome.row : null;
  // What the sheet calls "next": after a same-day report, the following quarter (if the feed lists one).
  const upNext = reported && nextE && reported.date === nextE.date
    ? cal.filter((e) => e.date > today && !(e.quarter === nextE.quarter && e.year === nextE.year)).sort((a, b) => a.date.localeCompare(b.date))[0]
    : duePending ? undefined : nextE;

  // 0057: a dated row's own session, else the habit. A company-dated row (override) without a session is unknown:
  // never filled from a feed's guess.
  const ownSession = (row: { hour?: string; source?: unknown }): Session => (row.hour as Session) || (row.source ? "" : habit);
  // Past prints: Nasdaq gives report dates; Finnhub gives estimate/actual. Join on order (both newest-first).
  // Finnhub figures only fill gaps when they're in dollars too.
  const history: Reaction[] = [];
  // 0058: each row's actual as Finnhub reports it (the company's measure, the basis of Finnhub's upcoming estimate).
  const fhActual = new Map<Reaction, number | null>();
  const keep = (h: Reaction, fa: unknown) => { fhActual.set(h, typeof fa === "number" && Number.isFinite(fa) ? fa : null); return h; };
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
    // That date's own session when the calendar has it, else the habit; unknown stays unknown (move "—").
    const session: Session = lastE && lastE.date === date ? ownSession(lastE) : habit;
    const move = reactionMove(session, date, closeOn);
    const pick = pickConsensus({ estimate: r.consensusForecast, actual: r.eps, surprisePct: r.percentageSurprise }, f, lastE && lastE.date === date ? lastSnap : null);
    // 0049: an actual on another basis from its estimate gets no surprise; Nasdaq's consensus stands in when it matches.
    const nE = typeof r.consensusForecast === "number" ? r.consensusForecast : parseFloat(r.consensusForecast);
    history.push(keep(judgeReaction({ date, session, period: r.fiscalQtrEnd, epsE: pick.epsE, epsA: pick.epsA, surprisePct: pick.surprisePct, move } as Reaction, Number.isFinite(nE) ? nE : null, reit), f?.actual));
  });
  // Fall back to Finnhub's four quarters if Nasdaq was unreachable.
  if (!history.length && surprises?.length && usd) {
    // Finnhub gives the quarter, not the day it was reported (0046): never show a quarter-end as a report date.
    // The quarter the calendar dated comes in just below, with its date; the rest are labelled by quarter only.
    for (const f of surprises.slice(0, 4)) {
      if (lastE && lastE.epsActual != null && lastE.quarter === f.quarter && lastE.year === f.year) continue;
      const label = f.quarter && f.year ? `Q${f.quarter} ${f.year}` : `Quarter to ${String(f.period).slice(0, 7)}`; // never a bare YYYY-MM-DD
      history.push(keep(judgeReaction({ date: label, session: "", period: label, epsE: f.estimate, epsA: f.actual, surprisePct: f.surprisePercent, move: null } as Reaction, null, reit), f.actual));
    }
  }
  // A print reported in the last ~40 days might be on Finnhub's calendar before Nasdaq's table catches up.
  if (usd && lastE && lastE.epsActual != null && !history.some((h) => h.date === lastE.date)) {
    const session: Session = ownSession(lastE);
    const est = lastSnap ?? lastE.epsEstimate;
    history.unshift(keep(judgeReaction({ date: lastE.date, session, period: `Q${lastE.quarter} ${lastE.year}`, epsE: est, epsA: lastE.epsActual, surprisePct: est ? ((lastE.epsActual - est) / Math.abs(est)) * 100 : null, move: reactionMove(session, lastE.date, closeOn) } as Reaction, null, reit), lastE.epsActual));
  }

  // 0039: the report that's out heads the history until Nasdaq lists it. Non-dollar figures stay off the
  // dollar table ("—"); the move waits for a settled post-report close.
  if (reported && !history.some((h) => Math.abs(daysApart(h.date, reported.date)) <= 3)) {
    // A company-dated report with no stated session stays unknown, whatever the cached feed row says (LESSONS 2026-11-10).
    const rs: Session = nextE?.source && !nextE.hour && reported.date === nextE.date ? "" : ownSession(reported);
    const settled = tradingDaysSince(reported.date, today) >= (rs === "bmo" || rs === "dmh" ? 1 : 2);
    history.unshift(keep(judgeReaction({
      date: reported.date, session: rs, period: `Q${reported.quarter} ${reported.year}`,
      epsE: usd ? reported.eE : null, epsA: usd ? reported.eA : null, surprisePct: usd ? surprisePct(reported.eE, reported.eA) : null,
      move: settled ? reactionMove(rs, reported.date, closeOn) : null,
    } as Reaction, usd ? reported.nE : null, reit, usd ? reported.nA : undefined), usd ? reported.eA : null));
  }

  const judged = history.filter((h) => h.epsA != null && h.epsE != null && !h.basis);
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
  // 0049: a REIT whose recent results were on another basis from the feed's estimate (FFO vs net income): its
  // upcoming estimate isn't quoted as the bar. Only on evidence: plenty of REITs' feed figures match (PLD, CCI).
  const ffo = reit && reitEstimateOffBasis(history, duePending ? duePending.eE : pending ? pending.eE : upNext?.epsEstimate);
  const read: string[] = [];
  // A projected date on a closed-market day isn't a date yet (0045): say so instead of stating it.
  const closed = upNext && !upNext.source && !pending ? closedDay(upNext.date) : null;
  const longDay = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
  const out = reported || duePending;
  const projected = !!upNext && !pending && !duePending && !closed && isProjected({ date: upNext.date, session: upNext.hour || "", source: upNext.source }, today);
  // 0015: name Nasdaq's day when it lists the next report elsewhere (the date itself stays the feed's).
  let nqNext: { date: string; session: Session } | undefined;
  if (nqWin && upNext && upNext === nextE && !duePending && !pending && !reported && !upNext.source && !closed) {
    const c = crossOne(symbol, upNext.date, (upNext.hour || "") as Session, nqWin);
    if (c?.x === "differs" && c.xd) nqNext = { date: c.xd, session: c.xh ?? "" };
  }
  if (reported) read.push(reportedLine(name, { date: reported.date, session: reported.hour, quarter: reported.quarter, epsE: reported.eE, epsA: reported.eA, nE: usd ? reported.nE : undefined, nA: usd ? reported.nA : undefined, reit }, today, (v) => epsIn(v, currency)));
  if (duePending) {
    read.push(pendingLine(name, { date: duePending.date, session: duePending.hour, quarter: duePending.quarter }, today));
    if (duePending.eE != null && !ffo) read.push(`The estimate going in was ${epsIn(duePending.eE, currency)} a share.`);
  } else if (pending) {
    read.push(`${name}'s Q${pending.quarter} report date is not confirmed yet: the data feed expected it on ${longDay(pending.passed)} and has no results yet.`);
  } else if (upNext && closed) {
    read.push(`${name}'s Q${upNext.quarter} report date is not confirmed yet: the data feed projects ${longDay(upNext.date)}, when the market is closed (${closed}).`);
  } else if (upNext && projected && !nqNext) {
    // 0007: the feed's projection, not the company's date: "expected around", and no session stated as fact.
    read.push(`${name}${reported ? "'s next report" : `'s Q${upNext.quarter} report`} is expected around ${longDay(upNext.date)}, but the company hasn't confirmed the date yet.`);
  } else if (upNext) {
    const when = upNext.hour ? WHEN_LONG[upNext.hour as Session] ?? "" : nqNext ? "" : "(time not yet confirmed)";
    // 0059: a date Nasdaq lists elsewhere is said to be unconfirmed, as on the calendar.
    const nqWhen = nqNext ? (nqNext.date === upNext.date ? (nqNext.session ? `it ${WHEN_LONG[nqNext.session]} that day` : "it at another time that day") : `${longDay(nqNext.date)}${nqNext.session ? ` ${WHEN_LONG[nqNext.session]}` : ""}`) : "";
    read.push(`${name}${reported ? "'s next report is" : " reports"} Q${upNext.quarter} on ${longDay(upNext.date)} ${when}${nqNext ? `, but that's unconfirmed: Nasdaq's calendar lists ${nqWhen}` : ""}.`.replace(" .", ".").replace(" ,", ","));
  }
  const estLine = duePending ? null
    : ffo ? ((pending ? pending.eE : upNext?.epsEstimate) != null ? `${name} is a REIT whose recent results came in on a different measure from the feed's estimate (usually funds from operations against net income a share), so we don't quote the estimate as the bar.` : null)
    // 0058: last quarter's actual on the upcoming estimate's basis (Finnhub's), never Nasdaq's ($2.95 vs $1.84 for AMD).
    : readEstimate(name, pending ? pending.eE : upNext?.epsEstimate, currency, history[0] ? fhActual.get(history[0]) ?? null : null);
  if (estLine) read.push(estLine);
  if (beatRate) read.push(`It has beaten the estimate in ${beats} of its last ${judged.length} reports.`);
  if (expectedMove != null) read.push(`The stock has moved about ±${expectedMove.toFixed(1)}% on a typical report${out ? "." : " — that's the size of swing to be ready for."}`);
  if (setup.grade && !out) read.push(`Into the print it's in ${/^[aeiou]/i.test(setup.trend) ? "an" : "a"} ${setup.trend.toLowerCase()}${setup.rsi != null ? ` with RSI ${setup.rsi.toFixed(0)}` : ""}.`);
  if (compass.grade) read.push(`As a long-term holding it grades ${compass.grade} on Compass quality.`);


  const body: TickerResponse = {
    symbol,
    profile: profile?.name ? { name: profile.name, logo: profile.logo, industry: profile.finnhubIndustry, country: profile.country, web: profile.weburl, marketCap: profile.marketCapitalization, currency: typeof profile.currency === "string" ? profile.currency : "USD", exchange: profile.exchange, ipo: profile.ipo } : null,
    quote: quote?.c ? { price: quote.c, change: quote.d, changePct: quote.dp, prevClose: quote.pc, asOf: quote.t } : null,
    next: duePending ? { date: duePending.date, session: duePending.hour as Session, quarter: duePending.quarter, year: duePending.year, epsE: duePending.eE, revE: duePending.rE, currency, status: "results-pending" }
      : pending ? { date: pending.passed, session: pending.hour, quarter: pending.quarter, year: pending.year, epsE: pending.eE, revE: pending.rE, currency, overdue: true }
      : upNext ? { date: upNext.date, session: (upNext.hour || "") as Session, quarter: upNext.quarter, year: upNext.year, epsE: upNext.epsEstimate, revE: upNext.revenueEstimate, currency, ...(upNext.source ? { confirmed: upNext.source } : {}), ...(closed ? { closed } : {}), ...(nqNext ? { nasdaq: nqNext } : {}), ...(projected ? { projected: true as const } : {}) } : null,
    ...(reported && tradingDaysSince(reported.date, today) <= JUST_DAYS ? { justReported: { date: reported.date, session: reported.hour as Session, quarter: reported.quarter, year: reported.year, epsE: reported.eE, epsA: reported.eA, currency, ...(usd && reported.nE != null ? { nE: reported.nE } : {}), ...(usd && reported.nA !== undefined ? { nA: reported.nA } : {}), ...(reit ? { reit: true as const } : {}) } } : {}),
    compass, setup, history, expectedMove, beatRate, street,
    spark: chart ? chart.c.slice(-126) : [],
    chart: chart ? shapeChart(chart.t, chart.c) : null,
    quarters: quartersFrom(quarterly, profile?.shareOutstanding ?? null),
    read, warnings,
  };
  if (ffo && body.next) body.next.epsBasis = "ffo";
  return body;
}

/** The pending quarter's row in the cached calendar days (fresh, else the last good copy), newest day first. */
async function passedRow(symbol: string, q: { quarter: number; year: number }, days: string[]): Promise<EarningsEvent | null> {
  const found = await Promise.all(days.map(async (d) => {
    try {
      const hit = (await caches.default.match(CAL_DAY(d))) ?? (await caches.default.match(CAL(`cal:stale:v3:${d}`)));
      const evs = hit ? ((await hit.json()) as EarningsEvent[]) : [];
      return evs.find((e) => e.s === symbol && e.q === q.quarter && e.y === q.year) ?? null;
    } catch { return null; }
  }));
  return found.find((e) => e != null) ?? null;
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

async function shareMeta(url: URL, env: Env, ctx: ExecutionContext): Promise<{ title: string; desc: string; image?: string; kids?: boolean; ttl?: number } | null> {
  const path = url.pathname.slice(BASE.length) || "/";
  const t = path.match(/^\/t\/([A-Za-z.\-]{1,10})$/)?.[1] ?? url.searchParams.get("t");
  if (t) {
    const sym = t.toUpperCase();
    try {
      const { data: d, ttl } = await tickerEntry(sym, env, ctx);
      const name = d.profile?.name ?? U[sym]?.n ?? sym;
      const title = tickerShareTitle(sym, name, d.next, d.justReported);
      const desc = tickerShareDesc(name, d);
      // 0043: an unfurl built from a degraded sheet (or a stand-in) is cached no longer than the sheet itself.
      return { title, desc, image: `${SITE}${BASE}/og/t/${sym}.png`, ttl };
    } catch { return { title: `${sym} earnings · Metaphases`, desc: PAGES["/"].desc, ttl: SHEET_DEGRADED_TTL }; }
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
  // 0036: unconditionally (no If-None-Match), so the shell is always a full 200 HTML response that carries the
  // CSP. A 304 has no Content-Type, and would let a pre-CSP cached copy keep running without the policy.
  const res = await env.ASSETS.fetch(new Request(new URL(`${BASE}/`, url), { method: "GET" }));
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
    .transform(new Response(res.body, { status: 200, headers: (() => { const h = new Headers(res.headers); h.set("Content-Type", "text/html; charset=utf-8"); h.set("Cache-Control", `public, max-age=${Math.min(300, meta.ttl ?? 300)}`); return h; })() }));
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
    const d = await getJson<any>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(sym))}?range=1y&interval=1d`, UA);
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
    const d = await getJson<any>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(sym))}?range=3mo&interval=1d&events=div`, UA);
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
  // Company-announced dates and sessions first, as on the sheet (0013/0050).
  const cal: any[] = applyToRows(s, fhCal?.earningsCalendar ?? [], OVERRIDES, today);
  // 0057: the same habit as the sheet (Finnhub's next, Nasdaq's listing for that date, Finnhub's last).
  const up = cal.filter((e) => e.date >= today).sort((x, y) => x.date.localeCompare(y.date))[0];
  const last = cal.filter((e) => e.date < today).sort((x, y) => y.date.localeCompare(x.date))[0];
  const nqUp = up && !up.source && !up.hour ? (await nasdaqDayOnDemand(up.date, today, ctx))?.[s] : undefined;
  const habit = sessionHabit(up?.hour, nqUp, last?.hour);
  const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,]/g, "")); return Number.isFinite(n) ? n : null; };
  const reports = ((nq?.data?.earningsSurpriseTable?.rows ?? []) as any[]).map((r) => {
    const [mm, dd, yy] = String(r.dateReported).split("/");
    const date = `${yy}-${(mm ?? "").padStart(2, "0")}-${(dd ?? "").padStart(2, "0")}`;
    return { date, eA: num(r.eps), eE: num(r.consensusForecast), hour: ((cal.find((e) => e.date === date)?.hour || habit) || "") as "bmo" | "amc" | "dmh" | "" };
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
      items.push({ symbol: sym, name: U[sym]?.n ?? sym, date: e.date, session: (e.hour || "") as Session, quarter: e.quarter, year: e.year, epsE: shareEps(sym, e.epsEstimate ?? null), cur: U[sym]?.ec, url: `${SITE}${BASE}/t/${sym}`, ...(!e.source && closedDay(e.date) ? { closed: closedDay(e.date)! } : {}), ...(isProjected({ date: e.date, session: e.hour || "", source: e.source }, today) ? { projected: true } : {}) });
    }
  });
  items.sort((a, b) => a.date.localeCompare(b.date));
  return new Response(buildIcs(items, new Date()), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="metaphases-earnings.ics"', "Cache-Control": "public, max-age=21600" },
  });
}

// ── /og/t/:sym.(svg|png): per-ticker share card ─────────────────────────
/** The card, and whether it was drawn from a degraded sheet or a stand-in (0043: such a card is never kept for 6 hours). */
async function cardFor(sym: string, env: Env, ctx: ExecutionContext): Promise<{ svg: string; degraded: boolean }> {
  const d = await tickerData(sym, env, ctx);
  return { svg: cardFromSheet(sym, d), degraded: sheetTtl(d) < SHEET_TTL };
}
function cardFromSheet(sym: string, d: TickerResponse): string {
  const when = isDated(d.next) ? new Date(d.next.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : null;
  // 0039: once it's out (or due), the card says so instead of "Reports …" with the estimate.
  const rc = reportedCard(d, iso(todayNY()));
  // 0059: a date (or time) Nasdaq lists differently is never drawn as fact: no session glyph, and the headline says so.
  const nq = !rc && when ? d.next?.nasdaq : undefined;
  const contested = nq ? { headline: `Reports ${when}, ${nq.date === d.next!.date ? "time" : "date"} unconfirmed`, session: "" as Session }
    // 0007: a projected date is "expected around", with no session glyph.
    : !rc && when && d.next?.projected ? { headline: `Expected around ${when}, not yet confirmed`, session: "" as Session } : {};
  return cardSvg({ symbol: sym, name: d.profile?.name ?? U[sym]?.n ?? sym, when, session: d.justReported?.session ?? d.next?.session ?? "", ...contested, move: d.expectedMove, beats: d.beatRate?.beats ?? null, total: d.beatRate?.total ?? null, epsE: d.next?.epsBasis ? null : d.next?.epsE ?? null, cur: d.next?.currency, ...(rc ?? {}) });
}

async function ogCard(sym: string, fmt: "svg" | "png", req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const fallback = () => env.ASSETS.fetch(new Request(new URL(`${BASE}/og.png`, req.url), req));
  try {
    const day = iso(todayNY());
    const key = new Request(`https://cache.metaphases.internal/og-png-v7-${sym}-${day}`);
    // A card drawn while degraded is kept 30 s under its own key, so an unfurl burst renders it once, not per request.
    const shortKey = new Request(`https://cache.metaphases.internal/og-png-v7-${sym}-${day}-d`);
    if (fmt === "png") { const hit = (await caches.default.match(key)) ?? (await caches.default.match(shortKey)); if (hit) return hit; }
    // 0043: a card drawn while the sheet's date or history failed to load is served briefly and never cached.
    const svgKey = new Request(`https://cache.metaphases.internal/${encodeURIComponent(`og:svg:v6:${sym}:${day}`)}`);
    const svgHit = await caches.default.match(svgKey);
    const { svg, degraded } = svgHit ? { svg: await svgHit.text(), degraded: false } : await cardFor(sym, env, ctx);
    const age = degraded ? SHEET_DEGRADED_TTL : 21600;
    if (!svgHit && !degraded) ctx.waitUntil(caches.default.put(svgKey, new Response(svg, { headers: { "Cache-Control": "public, max-age=21600" } })).catch(() => {}));
    if (fmt === "svg") return new Response(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": `public, max-age=${age}` } });
    const { renderPng } = await import("./og");
    const png = await renderPng(svg, ctx);
    const res = new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": `public, max-age=${age}` } });
    ctx.waitUntil(caches.default.put(degraded ? shortKey : key, res.clone()).catch(() => {}));
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
    const svg = await cached(`story:svg:v3:${kind}:${day}`, 21600, ctx, async () => {
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
          when: isDated(d.next) ? whenPlain(d.next.date, d.next.session, day) : d.next ? "date not confirmed yet" : "date not announced yet",
          session: d.next?.session ?? "", epsE: d.next?.epsBasis ? null : d.next?.epsE ?? null, cur: d.next?.currency, move: d.expectedMove, grade: d.compass.grade,
          beats: d.beatRate?.beats ?? null, total: d.beatRate?.total ?? null, ...(reportedCard(d, day) ?? {}),
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
      // The guide is a real static page (public/guide/index.html), readable without JS; the SPA shell must not catch it.
      if (p === "/guide" || p === "/guide/index.html") return Response.redirect(`${url.origin}${BASE}/guide/`, 301);
      if (p === "/guide/") return secureHtml(await env.ASSETS.fetch(new Request(new URL(`${BASE}/guide/`, url), { method: "GET" })));
      const isPage = req.method === "GET" && !/\.[a-z0-9]{2,12}$/i.test(p);
      // 0036: every HTML response carries the CSP that blocks Cloudflare's edge-injected analytics beacon.
      if (isPage) return secureHtml(await page(req, env, ctx));
      return secureHtml(await env.ASSETS.fetch(req));
    } catch (e) {
      return new Response(JSON.stringify({ error: "We couldn't reach the market data service. Try again in a moment.", detail: String(e) }), { status: 502, headers: { "Content-Type": "application/json" } });
    }
  },
} satisfies ExportedHandler<Env>;
