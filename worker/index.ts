// Metaphases API — a thin, cached layer over free data sources. Served at mutaafaziz.com/metaphases/
// (Worker route mutaafaziz.com/metaphases*); every path below is relative to BASE.
//   /api/calendar?from&to   earnings events (Finnhub), filtered to tracked + large reporters
//   /api/ticker/:symbol     the deep sheet: Compass grade, setup grade, reaction history, street view
//   /api/macro              macro event strip (FRED release calendar + FOMC) and the Market Mood index
// Every route is "graceful in failure" (Compass UX principle #2/#3): partial data + warnings, never a blank 500.
import { profileCap } from "../shared/marketCap";
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
import { currencyBreak, dropsPb, sanitizeMetric, withoutOff } from "../shared/currencyBreak";
import { companyCurrencyPairs, periodEnd, rateOn } from "../shared/adrPairs";
import { ADS_SHARES, adsMemoEntry, adsMemoKey, fromAdsMemo, mergeAdsMemo, onAdsBasis, restoreAdsReports, type AdsMemo } from "../shared/adsBasis";
import { isProjected } from "../shared/projected";
import { buildIcs, cardSvg, quartersFrom, shapeChart, nyDate, type IcsItem } from "../shared/depth";
import { contestedSession, isContested, pastSession, projectedSession, reactionMove, sessionHabit, typicalMove, usualSession } from "../shared/reaction";
import { applyPreReport, fillMovedFigures, isReit, judgeReaction, matchQuarters, nasdaqHistoryOffBasis, reitEstimateOffBasis, sameActual, nasdaqDayActuals, nasdaqDayEps, needsEpsBasis, periodKey, pickConsensus, sameEpsUnit, type EstSnapshot } from "../shared/compare";
import { shareEps, yahooSymbol } from "../shared/shareClass";
import overridesFile from "../data/date-overrides.json" with { type: "json" };
import { admitUntracked, capsGrow, capUsd, foldCaps, mergeCapDocs, nasdaqDayCaps, type CapDoc, type NqCaps } from "../shared/untrackedGate";
import { mergeShare, NQW_STALE_MS, shareBudgetLeft, shareDocOk, sharedDays, shareGrows, staleDays, type NqShareDay, type NqShareDoc } from "../shared/nqShare";
import { activeOverrides, applyToEvents, applyToRows, carryEstimates, closedDay, flagClosed, overrideSession, type DateOverrides } from "../shared/dateOverrides";
import { dayShareText } from "../shared/dayShare";
import { unconfirmedRow } from "../shared/closedRows";
import { daysApart, isDated, lookbackDays, LOOKBACK_DAYS, tickerShareTitle, tradingDaysSince, nqDate, passedQuarter, skippedQuarter } from "../shared/pending";
import { JUST_DAYS, pendingLine, reportedCard, reportedLine, reportOutcome, surprisePct, tickerShareDesc, type DayRow, type Outcome } from "../shared/reported";
import { holdUnchecked, shownSession } from "../shared/contestedTime";
import { applyLeads, leadFor, LEAD_MEMO_DAYS, nasdaqSessionLeads, noteLead, type SessionLeads } from "../shared/sessionLead";
import { applyMemos, contestsIn, dayStanding, memoCross, noteContests, windowCovered, XMEMO_DAYS, type XMemos } from "../shared/contestMemo";
import { leadIns, leadRows, leadsNasdaq } from "../shared/leadDay";
import { buildIndex, companyDayFill, crossCheck, crossOne, keepNasdaq, nasdaqDaySessions, withDay, windowDays, windowEnd, XCHECK_REACH, type Cross, type NqDay, type NqWindow } from "../shared/crossCheck";
import { aliasMap, commitSupp, dropUnscaled, fetchedAt, homeListing, mergeShared, mergeSupplement, refreshEntry, staleSymbols, supplementSymbols, suppRows, unfetched, SUPP_LOCK_S, type SuppDoc, type Universe } from "../shared/calendarSupplement";
import { secureHtml } from "../shared/csp";
import { FIGURES_CHECK_MAX, needsFiguresCheck, needsPastCheck, nqReports, phantomReport, reportDayRow, settleFiguresRow, settlePastRow, PAST_LOOKBACK_DAYS, type NqReport } from "../shared/pastRows";
import { oneReportOneRow, SAME_REPORT_DAYS } from "../shared/oneRow";
import { INSIGHTS_TAG, isKidsPath } from "../shared/insights";
import { borrowHistory, CALENDAR_NEXT, isDegraded, sheetTtl, staleUsable, standIn, SHEET_DEGRADED_TTL, SHEET_STALE_TTL, SHEET_TTL, type StaleSheet } from "../shared/sheetCache";
import { feedGoneDays, goneWarning, isGoneWarning } from "../shared/feedHorizon";
import { rsiLine, trendLine } from "../shared/trend";

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
const U = universe as Record<string, { n: string; mc: number; px?: number; mcAt?: string; c?: string; ec?: string; sec?: string }>;
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

const CAL = (key: string) => new Request(`https://cache.metaphases.internal/${encodeURIComponent(key)}`);
/** How long a day's list stays fresh: settled history 6 h, the next two weeks 30 min, far-ahead dates 6 h (they rarely move). */
const calTtl = (day: string, today: string) => (day < addDays(today, -3) || day > addDays(today, 14) ? 21600 : 1800);
/** Finnhub returns at most ~1500 rows per call; a range at or past this is treated as truncated and re-fetched day by day. */
const RANGE_CAP = 1400;

/** Home listings (7203.T) → the tracked US symbol (TM), from the universe's logo names (0024). */
const ALIAS = aliasMap(U as Universe);
/** Tracked names the range feed is known to drop; their `symbol=` rows fill the gap (0024). */
const SUPP_SYMBOLS = supplementSymbols(U as Universe);

/**
 * The feed's rows as calendar events. 0110: an untracked company is admitted by Nasdaq's dollar market cap when a
 * loaded Nasdaq day lists it (`caps`), else by revenue as before; a company-dated one (override) always.
 */
function toEvents(rows: any[], caps: NqCaps = {}, today = iso(todayNY())): EarningsEvent[] {
  const out: EarningsEvent[] = [];
  const ov = activeOverrides(OVERRIDES, today);
  const native = new Set<string>((rows ?? []).map((e) => e.symbol));
  for (const e of rows ?? []) {
    const alias = ALIAS[e.symbol];
    if (alias && native.has(alias)) continue; // the US row wins over its home listing
    const sym = alias ?? e.symbol;
    const tracked = sym in U;
    if (!tracked && !admitUntracked(Math.max(e.revenueEstimate ?? 0, e.revenueActual ?? 0), capUsd(caps, sym), sym in ov)) continue;
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

// ── 0111: one supplement every colo reads ──
// The document above is per colo (caches.default). Reads land on different colos (CMH, YYZ), and a cold one refills
// it four symbols a minute, so for ~15 minutes it served ranges without the rows only the supplement has (BNS, TD):
// the same range gave different rows read to read. A copy in KV (the 0083 pattern) seeds a cold colo in one read.
const SUPP_KV = "supp:v1";
const SUPP_KV_TTL = 7 * 86400;
/** A colo whose copy is incomplete reads KV at most once per this many seconds (the marker sits in its own cache), and
 *  backs off to SUPP_KV_IDLE_S once KV has nothing it lacks (a symbol whose `symbol=` call keeps failing). */
const SUPP_KV_SEEN = CAL("supp:kv:seen:v1");
const SUPP_KV_READ_S = 60;
const SUPP_KV_IDLE_S = 900;
/** Beyond growing KV's symbol set, a colo pushes newer entries only when KV's newest fetch is this old: a condition
 *  every colo reads off the shared copy itself, so the whole account writes a few times a day, not per colo. */
const SUPP_KV_STALE_MS = 6 * 3600_000;
/** A colo with nothing to refresh offers its copy to KV at most this often (one KV read each time). */
const SUPP_KV_CHK = CAL("supp:kv:chk:v1");
const SUPP_KV_CHECK_S = 600;
/** KV's free tier (1,000 writes a day) is shared with the support inbox and the 0083/0104 memos. */
const SUPP_KV_WRITES_PER_DAY = 24; // a one-time fill of an empty copy takes ~18 (four symbols a minute)
const keepListed = (d: SuppDoc): SuppDoc => { const k = new Set(SUPP_SYMBOLS); return Object.fromEntries(Object.entries(d).filter(([s]) => k.has(s))); };
async function readSuppKv(env: Env): Promise<SuppDoc | null> {
  if (!env.SUPPORT) return null;
  try {
    const v = await env.SUPPORT.get(SUPP_KV, { cacheTtl: 60 });
    const d = v ? JSON.parse(v) : null;
    return d && typeof d === "object" && !Array.isArray(d) ? keepListed(dropUnscaled(d as SuppDoc)) : null;
  } catch { return null; }
}
const writeSuppLocal = (d: SuppDoc) => caches.default.put(SUPP_KEY, new Response(JSON.stringify(d), { headers: { "Cache-Control": "public, max-age=604800", "Content-Type": "application/json" } }));

/** This colo's supplement, completed from the shared copy when it is missing symbols (never any upstream call). */
async function readSuppShared(env: Env, ctx: ExecutionContext, today: string): Promise<SuppDoc> {
  const local = await readSupp();
  if (!env.SUPPORT || !unfetched(local, SUPP_SYMBOLS)) return local;
  if (await readJson<number>(SUPP_KV_SEEN)) return local;
  const shared = await readSuppKv(env);
  const adds = !!shared && Object.keys(shared).some((s) => !local[s] || fetchedAt(shared[s]) > fetchedAt(local[s]));
  // Back off only when KV holds exactly this colo's symbols and nothing newer (a name whose `symbol=` call keeps failing).
  // An empty or still-filling copy (right after a deploy, every colo cold) is read again in a minute (0111 bounce).
  const idle = !!shared && !adds && unfetched(shared, SUPP_SYMBOLS) <= unfetched(local, SUPP_SYMBOLS);
  ctx.waitUntil(putJson(SUPP_KV_SEEN, 1, idle ? SUPP_KV_IDLE_S : SUPP_KV_READ_S));
  if (!shared || !adds) return local;
  const merged = keepListed(mergeShared(today, local, shared));
  // Read-merge-write (0047), so a concurrent refresh on this colo keeps its entries.
  ctx.waitUntil(readSupp().then((latest) => writeSuppLocal(keepListed(mergeShared(today, merged, latest)))).catch(() => {}));
  return merged;
}

/** Push this colo's entries to the shared copy: whenever it adds symbols KV lacks, else only once KV's newest fetch is stale. */
function shareSupp(env: Env, ctx: ExecutionContext, doc: SuppDoc, today: string): void {
  const kv = env.SUPPORT;
  if (!kv) return;
  ctx.waitUntil((async () => {
    const countKey = CAL(`supp:kv:n:v1:${today}`);
    const n = (await readJson<number>(countKey)) ?? 0;
    if (n >= SUPP_KV_WRITES_PER_DAY) return;
    const raw = await kv.get(SUPP_KV).catch(() => undefined);
    if (raw === undefined) return; // a failed read never overwrites other colos' entries
    let latest: SuppDoc = {};
    try { latest = raw ? keepListed(dropUnscaled(JSON.parse(raw) as SuppDoc)) : {}; } catch { latest = {}; } // corrupt: rewrite it
    const merged = keepListed(mergeShared(today, latest, doc));
    const grows = Object.keys(merged).some((s) => !latest[s]);
    const newest = Math.max(0, ...Object.values(latest).map(fetchedAt));
    const newer = Object.keys(merged).some((s) => latest[s] && fetchedAt(merged[s]) > fetchedAt(latest[s]));
    if (!grows && !(newer && Date.now() - newest > SUPP_KV_STALE_MS)) return;
    try { await kv.put(SUPP_KV, JSON.stringify(merged), { expirationTtl: SUPP_KV_TTL }); } catch { return; }
    await putJson(countKey, n + 1, 86400);
  })().catch(() => {}));
}

async function supplement(env: Env, ctx: ExecutionContext, today: string, refresh: boolean): Promise<SuppDoc> {
  const doc = await readSuppShared(env, ctx, today);
  let due = refresh ? staleSymbols(doc, SUPP_SYMBOLS, Date.now()) : [];
  const nothingDue = refresh && !due.length;
  if (due.length) {
    try {
      if (await caches.default.match(SUPP_LOCK)) due = [];
      else await caches.default.put(SUPP_LOCK, new Response("1", { headers: { "Cache-Control": `public, max-age=${SUPP_LOCK_S}` } }));
    } catch { due = []; }
  }
  if (!due.length) {
    // 0111: a warm colo with nothing due may hold symbols the shared copy lacks (it filled before KV existed, or KV
    // expired): offer them at most every SUPP_KV_CHECK_S. shareSupp writes only if KV grows or is stale.
    if (nothingDue && env.SUPPORT && !(await readJson<number>(SUPP_KV_CHK))) {
      ctx.waitUntil(putJson(SUPP_KV_CHK, 1, SUPP_KV_CHECK_S));
      shareSupp(env, ctx, doc, today);
    }
    return doc;
  }
  const from = addDays(today, -SUPP_BACK), to = addDays(today, SUPP_AHEAD);
  const got = await pool(due, 2, async (s) => suppRows(s, (await getJson<{ earningsCalendar: any[] }>(`${FH}/calendar/earnings?symbol=${encodeURIComponent(s)}&from=${from}&to=${to}&token=${env.FINNHUB_API_KEY}`)).earningsCalendar, homeListing(U as Universe, s)));
  const updates: SuppDoc = {};
  got.forEach((r, i) => { if (r.status === "fulfilled") updates[due[i]] = refreshEntry(doc[due[i]], r.value, today, Date.now()); });
  if (!Object.keys(updates).length) return doc;
  // Read-merge-write (0047): never overwrite another refresh's progress with this request's older copy.
  const done = commitSupp({ read: readSupp, write: writeSuppLocal }, doc, updates, SUPP_SYMBOLS);
  ctx.waitUntil(done.catch(() => {}));
  const next = { ...doc, ...updates };
  shareSupp(env, ctx, next, today); // 0111
  return next;
}

const touchesSupp = (from: string, to: string, today: string) => to >= addDays(today, -SUPP_BACK) && from <= addDays(today, SUPP_AHEAD);

/** One day's processed events. v3 (0058): judged rows carry Nasdaq's actual (`nA`), so settled days re-read it. The last-good copy moves too, or a fallback would serve the old mixed pairs. */
const CAL_DAY = (day: string) => CAL(`cal:v3:${day}`);

async function putDay(day: string, events: EarningsEvent[], today: string, ctx: ExecutionContext, ttl = calTtl(day, today)) {
  const body = JSON.stringify(events);
  ctx.waitUntil(Promise.all([
    caches.default.put(CAL_DAY(day), new Response(body, { headers: { "Cache-Control": `public, max-age=${ttl}`, "Content-Type": "application/json" } })),
    caches.default.put(CAL(`cal:stale:v3:${day}`), new Response(body, { headers: { "Cache-Control": `public, max-age=${staleTtl(day, today)}` } })),
  ]));
}
/** 0118: a finished day's rows don't change, and Finnhub drops them after about a month, so a past day's last good copy
 *  is kept for a season (re-written each time it is served after the feed dropped it); a live day's for a week. */
const STALE_PAST_TTL = 90 * 86400;
const staleTtl = (day: string, today: string) => (day < addDays(today, -3) ? STALE_PAST_TTL : 604800);
/** 0118: the feed has dropped this past day (`feedGoneDays`). Remembered in the day's own cache entry (an empty list,
 *  so neighbour reads see no rows, plus a header), so a re-read costs no upstream call and no extra cache read. */
const GONE_HEADER = "X-Feed-Gone";
class FeedGone extends Error {}
function putGone(day: string, today: string, ctx: ExecutionContext) {
  ctx.waitUntil(caches.default.put(CAL_DAY(day), new Response("[]", { headers: { "Cache-Control": `public, max-age=${calTtl(day, today)}`, "Content-Type": "application/json", [GONE_HEADER]: "1" } })).catch(() => {}));
}

// ── 0035: estimates as they stood before the print ─────────────────────
const EST = (day: string) => CAL(`est:v1:${day}`);
/** Kept well past a season: the snapshot is the only record of the bar before the print. */
const EST_TTL = 180 * 86400;

async function readSnap(day: string): Promise<EstSnapshot> {
  try { const hit = await caches.default.match(EST(day)); return hit ? ((await hit.json()) as EstSnapshot) : {}; } catch { return {}; }
}

/** Nasdaq's day calendar: pre-report EPS consensus (`e`) and, on the same basis, the reported EPS (`a`, 0058) for that day's reporters (one call per day, cached). */
// 0097: v3, because v2 copies (7 days) can hold last year's EPS for names whose actual hadn't posted yet.
const NQ_CAL = (day: string) => CAL(`nq:cal:v3:${day}`);
async function nasdaqDay(day: string, today: string, ctx: ExecutionContext): Promise<{ e: Record<string, number>; a: Record<string, number> | null }> {
  const req = NQ_CAL(day);
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
  // 0097: Nasdaq posts a day's actuals in batches (before-open names first), so a recent day with a forecast still
  // missing its actual is kept an hour, not a week, or a late batch (Ross, after the close) would wait 7 days.
  const partial = !!a && Object.keys(e).some((s) => !(s in a)) && day >= addDays(today, -4);
  ctx.waitUntil(putJson(req, val, day < today && a && !partial ? 7 * 86400 : 3600));
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
  const figured = (e: EarningsEvent) => e.eA != null || e.rA != null;
  // 0080: a past day with figures always reads it (one cached call per day), to see who Nasdaq lists that day.
  const pastFigures = day < today && events.some(figured);
  const needNq = pastFigures || events.some((e) => (figured(e) && !snap[e.s] && e.eE != null) || (usdEstimates(e.s) && needsEpsBasis(e, snap[e.s]?.eE)));
  const nq = needNq ? await nasdaqDay(day, today, ctx).catch(() => null) : null;
  const pre = applyPreReport(events, snap, nq?.e ?? {}, usdEstimates, day > today, nq?.a);
  const updates = pre.updates;
  // 0080: a row with figures that Nasdaq's day calendar doesn't list is a suspect (`nx`): settlePast checks it
  // against the company's report history. Most are a next-morning listing; the history check tells them apart.
  const listed = pastFigures && nq ? new Set([...Object.keys(nq.e), ...Object.keys(nq.a ?? {})]) : null;
  const out = listed ? pre.events.map((e) => (figured(e) && !listed.has(e.s) ? { ...e, nx: 1 as const } : e)) : pre.events;
  if (Object.keys(updates).length) {
    // Re-read just before writing and add only our entries: another request's newer snapshot survives (0047).
    ctx.waitUntil((async () => {
      const latest = await readSnap(day);
      await caches.default.put(EST(day), new Response(JSON.stringify({ ...latest, ...updates }), { headers: { "Cache-Control": `public, max-age=${EST_TTL}`, "Content-Type": "application/json" } }));
    })().catch(() => {}));
  }
  return out;
}

/** Nasdaq's figures are dollars, and an untracked row is shown in dollars: the rule settlePast fills by. */
const dollarFigures = (s: string) => !(s in U) || isUsd(U[s].ec ?? "USD");
/**
 * 0097: past days read for company-dated rows per request. Every such day an override can still date (entries stop
 * applying 14 days on: about 10 weekdays), so a month range answers like a week range (0041) even while newer days
 * hold rows that can't fill yet. Warm reads are cache hits; a cold or failing day is fetched at most every 15 min.
 */
const MOVED_DAYS_MAX = 10;
const NQ_MOVED_FAIL = (day: string) => CAL(`nq:cal:fail:v1:${day}`);
/**
 * 0097: run company-dated rows that `applyToEvents` moved onto a past day through that day's Nasdaq figures (the same
 * cached `nasdaqDay` call the day's own pre-report step makes). `fetchFresh: false` reads the cache only (share text).
 */
async function preReportMoved(events: EarningsEvent[], today: string, ctx: ExecutionContext, fetchFresh = true): Promise<EarningsEvent[]> {
  // Non-dollar rows too: they take Nasdaq's pair whole, in dollars (`ec`, re-review of 0097).
  const want = (e: EarningsEvent) => !!e.o && e.d < today && e.eA == null && e.rA == null && !e.c;
  const days = [...new Set(events.filter((e) => want(e) && e.d >= addDays(today, -14)).map((e) => e.d))].sort().reverse().slice(0, MOVED_DAYS_MAX);
  if (!days.length) return events;
  // Cache first; a fresh read only while no failure is remembered for that day (15 min), so a Nasdaq outage never
  // costs these calls on every read (this runs per request, not per day-cache build).
  const one = async (d: string) => {
    const hit = await readJson<{ e: Record<string, number>; a: Record<string, number> | null }>(NQ_CAL(d));
    if (hit || !fetchFresh || (await readJson<number>(NQ_MOVED_FAIL(d))) != null) return hit;
    return nasdaqDay(d, today, ctx).catch(() => { ctx.waitUntil(putJson(NQ_MOVED_FAIL(d), 1, 900)); return null; });
  };
  const got = await Promise.all(days.map(one));
  const filled = days.reduce((out, d, i) => { const nq = got[i]; return nq && nq.e ? fillMovedFigures(out, d, nq, dollarFigures) : out; }, events);
  // The release can come the evening before the company's date (HP: call Nov 19 at 10 a.m., release Nov 18 after the
  // close, and Nasdaq lists it on Nov 18). A row Nasdaq's own day doesn't list at all takes the weekday before's pair,
  // well inside 0081's FIGURES_EARLY_DAYS. A row Nasdaq lists on its day but hasn't judged yet waits for that day.
  const eve = days.map((d, i) => {
    const nq = got[i];
    if (!nq?.e) return null;
    const unlisted = new Set(filled.filter((e) => want(e) && e.d === d && !(e.s in nq.e) && !(e.s in (nq.a ?? {}))).map((e) => e.s));
    return unlisted.size ? { d, prev: prevWeekday(d), unlisted } : null;
  }).filter((x): x is { d: string; prev: string; unlisted: Set<string> } => !!x);
  if (!eve.length) return filled;
  const prevGot = await Promise.all(eve.map((x) => one(x.prev)));
  return eve.reduce((out, x, i) => { const nq = prevGot[i]; return nq && nq.e ? fillMovedFigures(out, x.d, nq, dollarFigures, x.unlisted) : out; }, filled);
}
const prevWeekday = (d: string) => { let p = addDays(d, -1); while ([0, 6].includes(new Date(p + "T12:00:00Z").getUTCDay())) p = addDays(p, -1); return p; };

/**
 * 0080: Nasdaq's day calendar for `day` doesn't list `sym` (the calendar's `nx` test), through the same cached call
 * the calendar makes, so a cold colo (a link unfurl) answers like a warm one. Only asked once the history already
 * says no report (rare). A failed or empty read is false: the figures stay, as on the calendar.
 */
/** 0083: Nasdaq's day calendar lists `sym` on `day` (one cached call; a failed read is false: no evidence). */
async function nasdaqDayLists(sym: string, day: string, today: string, ctx: ExecutionContext): Promise<boolean> {
  const hit = await nasdaqDay(day, today, ctx).catch(() => null);
  return !!hit && (sym in (hit.e ?? {}) || sym in (hit.a ?? {}));
}
async function nasdaqDayOmits(sym: string, day: string, today: string, ctx: ExecutionContext): Promise<boolean> {
  const hit = await nasdaqDay(day, today, ctx).catch(() => null);
  return !!hit && typeof hit.e === "object" && !(sym in hit.e) && !(sym in (hit.a ?? {}));
}

// ── 0015: cross-check the next 14 days against Nasdaq's per-day calendar ──
// A second opinion, never on the critical path: a request that may build the window fetches at most
// NQX_PER_BUILD missing days (one builder per colo per minute, no 429 retries, a short timeout), failures are
// remembered for 15 minutes, and everything else reads the folded window from the cache only.
/** Keep what the calendar can show: tracked names, anything big enough, and timed mid-size listings (0105). */
const keepNq = (s: string, cap: number, h: Session) => keepNasdaq(s in U, cap, h);
/** The folded window, read in one cache lookup (written once every day in it has loaded). */
const NQX_IDX = (today: string) => CAL(`nq:x:idx:v1:${today}`);
const NQX_DAY = (day: string) => CAL(`nq:x:v1:${day}`);
/** 0114 bounce 1: the same day kept for NQW_STALE_MS, served while the fresh copy is fetched again (never folded, never shared). */
const NQX_STALE = (day: string) => CAL(`nq:x:stale:v1:${day}`);
/** 0110: the same day's untracked listings → dollar cap (millions), written beside it, so the calendar can admit by size. */
const NQX_CAP = (day: string) => CAL(`nq:x:cap:v1:${day}`);
const NQX_FAIL = CAL("nq:x:fail:v1");
const NQX_LOCK = CAL("nq:x:lock:v1");
const NQX_PER_BUILD = 2;

async function readJson<T>(req: Request): Promise<T | null> {
  try { const hit = await caches.default.match(req); return hit ? ((await hit.json()) as T) : null; } catch { return null; }
}
const putJson = (req: Request, val: unknown, ttl: number) =>
  caches.default.put(req, new Response(JSON.stringify(val), { headers: { "Cache-Control": `public, max-age=${ttl}`, "Content-Type": "application/json" } })).catch(() => {});

/** One Nasdaq day as symbol → session. No 429 retries (this is optional data); a malformed answer is a failure, an empty day (`rows: null`) is not. */
/** 0110: plus the day's untracked dollar caps (`c`), from the same call. */
async function fetchNasdaqDayFull(day: string, ms = 2500): Promise<{ h: NqDay; c: NqCaps }> {
  const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${day}`, { headers: UA, signal: AbortSignal.timeout(ms) } as RequestInit);
  if (!r.ok) throw new Error(`api.nasdaq.com ${r.status}`);
  const body = (await r.json()) as any;
  if (!body?.data || typeof body.data !== "object" || !("rows" in body.data)) throw new Error("nasdaq day calendar malformed");
  return { h: nasdaqDaySessions(body, keepNq), c: nasdaqDayCaps(body, (s) => s in U) };
}
/**
 * Cache a fetched day. Caps outlive the sessions (review of #192): a day's list is rebuilt after it passes out of
 * the window (the report itself), and a $10B company admitted by size must not drop back to the revenue gate then.
 * An empty map never overwrites a fuller one's place for long (it is the same day's answer, an hour).
 */
const NQX_CAP_TTL = 45 * 86400;
const storeNqDay = (day: string, v: { h: NqDay; c: NqCaps }) => {
  const ttl = Object.keys(v.h).length ? 21600 : 3600;
  return Promise.all([putJson(NQX_DAY(day), v.h, ttl), ...(Object.keys(v.h).length ? [putJson(NQX_STALE(day), v.h, NQW_STALE_MS / 1000)] : []), putJson(NQX_CAP(day), v.c, Object.keys(v.c).length ? NQX_CAP_TTL : 3600)]);
};

/** How far ahead a next report's Nasdaq day is read on demand (later days rarely carry a session). */
const NQ_ON_DEMAND_REACH = 45;
/**
 * 0057: one upcoming Nasdaq day, read on demand (the habit past moves are measured with), so it never waits
 * for the 0015 window to reach that date. Shares the window's day cache and failure memory: one call per day
 * per colo every 6 h, none for 15 minutes after a failure, and never throws (null = Nasdaq can't say). No
 * promise is shared across requests (a cancelled request must not strand another); the cache absorbs repeats.
 */
async function nasdaqDayOnDemand(day: string, today: string, ctx: ExecutionContext, env?: Env): Promise<NqDay | null> {
  // Nasdaq wipes a past day's sessions (LESSONS 2026-11-11), and far-off days rarely carry one.
  if (day < today || day > addDays(today, NQ_ON_DEMAND_REACH)) return null;
  const hit = await readJson<NqDay>(NQX_DAY(day));
  if (hit) return hit;
  // 0114 bounce 3 review: a fresh copy another colo shared is as good as this colo's (no Nasdaq call for it).
  if (env?.SUPPORT) { const got = sharedDays(await readWindowShared(env), [day], Date.now())[day]; if (got) return got.h; }
  const failed = (await readJson<Record<string, number>>(NQX_FAIL)) ?? {};
  if (failed[day] > Date.now()) return null;
  try {
    const v = await fetchNasdaqDayFull(day);
    ctx.waitUntil(storeNqDay(day, v));
    return v.h;
  } catch (e) {
    // 0059: a slow answer (over the sheet's 2.5 s) isn't remembered as a failure, so the 4 s background fill can
    // still load that day; a refusal or a malformed answer is.
    if ((e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError") return null;
    // Re-read and merge, so another day's remembered failure survives (0047).
    ctx.waitUntil((async () => putJson(NQX_FAIL, { ...((await readJson<Record<string, number>>(NQX_FAIL)) ?? {}), [day]: Date.now() + 15 * 60_000 }, 900))());
    return null;
  }
}

/** 0060: a session the two calendars disagreed on, remembered per company for MS_DAYS after the report. */
interface ContestMemo { date: string; feed: Session; nasdaq: Session }
const MS_KEY = (sym: string) => CAL(`ms:v1:${sym}`);
const MS_DAYS = 30;
const MS_TTL = 60 * 86400;

/** The background fill's timeout: Nasdaq's day calendar answers in 1.2–3.3 s (0059), so 2.5 s lost whole days. */
const NQX_BUILD_TIMEOUT = 4000;
const SESSION_PLAIN: Record<Session, string> = { bmo: "before the open", amc: "after the close", dmh: "during market hours", "": "" };
const WHEN_LONG: Record<Session, string> = { bmo: "before the opening bell", amc: "after the close", dmh: "during market hours", "": "" };

/**
 * 0114 bounce 3: a Workers Free invocation gets 50 subrequests, and Cache API and KV calls count (the limits page:
 * "share the same quota as subrequests"). A calendar read made 70–150, so the window's day reads, which came late,
 * failed (each a silent miss: `readJson` → null) and the fill's own Nasdaq fetch threw "Too many subrequests". That
 * is why a read in three came back unchecked while Nasdaq was fine. A call refused for that reason is not Nasdaq's
 * failure, so it's never remembered as one.
 */
const overBudget = (e: unknown) => /subrequest/i.test(String((e as Error)?.message ?? e));

/**
 * The window's Nasdaq listings. The folded copy when this colo has one; otherwise the KV share first (one cached
 * read holds every day: 0114 bounce 3). A shared day fetched within the hour is taken as is; for the rest this colo's
 * own copy (fetched more recently than the share is rewritten) wins, else the share's fresh one, else a stale copy (the
 * share's, else this colo's). With `build`, days with no copy at all are fetched now (up to NQX_PER_BUILD, if this
 * request takes the per-colo lock; the wait is bounded by NQX_BUILD_TIMEOUT), early in the request, while the
 * invocation still has subrequests left. Stale days are refreshed by `/api/xcheck/fill`. Null: nothing to compare.
 */
async function nasdaqWindow(today: string, ctx: ExecutionContext, build: boolean, want?: (d: string) => boolean, env?: Env): Promise<NqWindow | null> {
  const folded = await readJson<NqWindow>(NQX_IDX(today));
  if (folded) return folded;
  const days = windowDays(today);
  const loaded: Record<string, NqDay> = {};
  const now = Date.now();
  // 0114: a day another colo fetched (shared through KV) counts as loaded here, and isn't fetched again.
  const shared = env?.SUPPORT ? await readWindowShared(env) : null;
  const fresh = sharedDays(shared, days, now);
  const recent = (d: string) => !!fresh[d] && now - (shared?.days?.[d]?.at ?? 0) < NQW_RECENT_MS;
  for (const d of days) if (recent(d)) loaded[d] = fresh[d].h;
  // This colo's own copies cost a call per day, so they're read only for the days on screen (`want`; every day when
  // none is given): the share covers the rest of the window in one read, and a calendar read's budget belongs to its
  // weeks (live, 2026-11-27 10:30 UTC: 20 day reads plus a fill ahead of a cold colo's week left it "Couldn't load").
  const own = (d: string) => !shared || !want || want(d); // no share to lean on: every day, as before
  let missing: string[] = [];
  await Promise.all(days.filter((d) => !recent(d)).map(async (d) => {
    const v = fresh[d] && !own(d) ? null : own(d) ? await readJson<NqDay>(NQX_DAY(d)) : null;
    if (v) loaded[d] = v; else if (fresh[d]) loaded[d] = fresh[d].h; else missing.push(d);
  }));
  missing = missing.sort();
  // 0114 bounce 1: a day with no fresh copy anywhere serves its stale one (the share's, else this colo's) while it's
  // fetched again. It stays in `missing`, so the refresh still runs.
  const stale: string[] = [];
  if (missing.length) {
    for (const [d, v] of Object.entries(staleDays(shared, missing, now))) { loaded[d] = v.h; stale.push(d); }
    await Promise.all(missing.filter((d) => !loaded[d] && own(d)).map(async (d) => { const v = await readJson<NqDay>(NQX_STALE(d)); if (v) { loaded[d] = v; stale.push(d); } }));
  }
  const none = missing.filter((d) => !loaded[d]);
  if (build && none.length) {
    const got = await fillWindow(none, today, ctx, want, env, true).catch(() => ({}) as Record<string, NqDay>);
    for (const [d, h] of Object.entries(got)) loaded[d] = h;
  }
  if (!Object.keys(loaded).length) return null;
  const w: NqWindow = { from: today, to: windowEnd(today), loaded: Object.keys(loaded).sort(), idx: buildIndex(loaded), ...(stale.length ? { stale: stale.sort() } : {}) };
  // A window with a stale day is never folded into the hour-long index: the index skips the refresh.
  if (w.loaded.length === days.length && !stale.length) ctx.waitUntil(putJson(NQX_IDX(today), w, 3600));
  return w;
}
/** A shared day this young is taken without reading this colo's copy (the share is rewritten only past an hour). */
const NQW_RECENT_MS = 3600_000;

/**
 * Fetch up to NQX_PER_BUILD of the `missing` days (one builder per colo per minute). What's fetched goes to the KV
 * share first (every colo reads it), then to this colo's cache. `wait`: the caller needs the days now (awaited, and
 * returned); otherwise the fill runs after the response. Returns the days it got (empty when not waited on).
 */
async function fillWindow(missing: string[], today: string, ctx: ExecutionContext, want?: (d: string) => boolean, env?: Env, wait = false): Promise<Record<string, NqDay>> {
  if (await caches.default.match(NQX_LOCK).catch(() => true)) return {};
  await caches.default.put(NQX_LOCK, new Response("1", { headers: { "Cache-Control": "public, max-age=60" } })).catch(() => {});
  const failed = (await readJson<Record<string, number>>(NQX_FAIL)) ?? {};
  const now = Date.now();
  // 0061: the days the request is showing come first (then nearest first), so a cold week view fills itself.
  const first = (d: string) => (want?.(d) ? 0 : 1);
  const take = missing.filter((d) => !(failed[d] > now)).sort((a, b) => first(a) - first(b) || a.localeCompare(b)).slice(0, NQX_PER_BUILD);
  if (!take.length) return {};
  const out: Record<string, NqDay> = {};
  const run = (async () => {
    const got = await pool(take, 2, (d) => fetchNasdaqDayFull(d, NQX_BUILD_TIMEOUT));
    const fails: Record<string, number> = {};
    const share: Record<string, NqShareDay> = {};
    got.forEach((r, i) => {
      if (r.status === "fulfilled") { share[take[i]] = { h: r.value.h, c: r.value.c, at: Date.now() }; out[take[i]] = r.value.h; }
      else if (!overBudget(r.reason)) fails[take[i]] = now + 15 * 60_000;
    });
    const writes = (async () => {
      if (env && Object.keys(share).length) await offerWindow(env, share, today).catch(() => {});
      await Promise.all(got.map((r, i) => (r.status === "fulfilled" ? storeNqDay(take[i], r.value) : null)));
      // Re-read and merge, so another request's remembered failure survives (0047).
      if (Object.keys(fails).length) await putJson(NQX_FAIL, { ...((await readJson<Record<string, number>>(NQX_FAIL)) ?? {}), ...fails }, 900);
    })().catch(() => {});
    // The fill itself is already waited on (by the caller, or by waitUntil), so its writes are too.
    await writes;
  })().catch(() => {});
  // 0059: unless the caller needs the days, the fill runs after the response; the next read has them.
  if (wait) await run; else ctx.waitUntil(run);
  return out;
}

/**
 * 0114 bounce 3: `GET /api/xcheck/fill` runs the window's fill in an invocation of its own, so its Nasdaq calls and
 * writes never compete with a calendar read for the 50 subrequests. The calendar page calls it when an answer comes
 * back unchecked, just before its re-read. Same lock, failure memory and two-day cap as before: no extra Nasdaq calls.
 */
async function xcheckFill(url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const done = (filling: string[], missing = 0) => new Response(JSON.stringify({ missing, filling, warnings: [] }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  // Another fill on this colo this minute: nothing to do (one cached read, so a burst of these costs almost nothing).
  if (await caches.default.match(NQX_LOCK).catch(() => true)) return done([]);
  const today = iso(todayNY());
  const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
  const ok = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const want = ok(from) && ok(to) ? (d: string) => d >= from && d <= to : undefined;
  const w = await nasdaqWindow(today, ctx, false, undefined, env).catch(() => null);
  const missing = windowDays(today).filter((d) => !w?.loaded.includes(d) || !!w?.stale?.includes(d));
  const got = missing.length ? await fillWindow(missing, today, ctx, want, env, true).catch(() => ({})) : {};
  return done(Object.keys(got).sort(), missing.length);
}

// ── 0114: the window's days every colo reads ──
// Same pattern as 0110's caps: one small KV record (day → sessions, caps, fetch time), a 60 s per-colo copy in front of
// it, and a write only when this colo fetched a day the record lacks or holds stale. Writes are capped per colo and,
// in the record itself, for all colos together (`NQW_GLOBAL_WRITES_PER_DAY`).
const NQW_KV = "nqw:v1";
const NQW_KV_TTL = 2 * 86400;
const NQW_LOCAL = CAL("nqw:local:v1");
const NQW_WLOCK = CAL("nqw:kv:w:v1");
/** KV's free tier (1,000 writes a day) is shared with the support inbox and the other memos. */
const NQW_WRITES_PER_DAY = 12;
/** One offer in flight per isolate, claimed synchronously. */
let nqwOffering = false;
/** The shared window (null: none yet, or unreadable: this only ever adds evidence). */
async function readWindowShared(env: Env): Promise<NqShareDoc | null> {
  if (!env.SUPPORT) return null;
  const local = await readJson<{ m: NqShareDoc | null }>(NQW_LOCAL);
  if (local) return local.m;
  try {
    const v = await env.SUPPORT.get(NQW_KV, { cacheTtl: 60 });
    const parsed = v ? JSON.parse(v) : null;
    const m = shareDocOk(parsed) ? parsed : null;
    await putJson(NQW_LOCAL, { m }, 60);
    return m;
  } catch { return null; }
}
/** Offer freshly fetched days (runs inside the fill's waitUntil). Read-merge-write; never writes after a failed read. */
async function offerWindow(env: Env, fetched: Record<string, NqShareDay>, today: string): Promise<void> {
  const kv = env.SUPPORT;
  if (!kv || nqwOffering) return;
  const utc = new Date().toISOString().slice(0, 10);
  const seen = await readWindowShared(env);
  if (!shareGrows(seen, fetched, Date.now()) || !shareBudgetLeft(seen, utc)) return;
  nqwOffering = true;
  try {
    if (await caches.default.match(NQW_WLOCK).catch(() => true)) return; // another isolate on this colo is writing
    await putJson(NQW_WLOCK, 1, 30);
    const countKey = CAL(`nqw:n:v1:${utc}`);
    const n = (await readJson<number>(countKey)) ?? 0;
    if (n >= NQW_WRITES_PER_DAY) return;
    const raw = await kv.get(NQW_KV).catch(() => undefined);
    if (raw === undefined) return;
    let latest: NqShareDoc | null = null;
    try { const p = raw ? JSON.parse(raw) : null; latest = shareDocOk(p) ? p : null; } catch { latest = null; } // corrupt: rewrite it
    if (!shareGrows(latest, fetched, Date.now()) || !shareBudgetLeft(latest, utc)) { await putJson(NQW_LOCAL, { m: latest }, 60); return; }
    const merged = mergeShare(latest, fetched, today, utc);
    try { await kv.put(NQW_KV, JSON.stringify(merged), { expirationTtl: NQW_KV_TTL }); } catch { return; }
    await Promise.all([putJson(countKey, n + 1, 86400), putJson(NQW_LOCAL, { m: merged }, 60)]);
  } finally { nqwOffering = false; }
}

// ── 0083: Nasdaq date contests every colo can read ──
// The window above is per data center (caches.default), so a contest seen on a warm colo vanished on a cold one,
// and PDD/WSM flipped back to "results expected". One small KV record holds the day contests seen in the last
// XMEMO_DAYS. Reads are edge-cached by KV (60 s). A write happens only when a read finds something the record
// doesn't hold yet, and at most once per change per colo per day (a cache marker), well inside KV's free writes.
const XC_KEY = "xc:v1";
const XC_TTL = (XMEMO_DAYS + 1) * 86400;
const fnv = (str: string) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0; return h.toString(36); };
/** Per-colo copy of the KV record (60 s) in front of KV, so a busy colo reads KV about once a minute. */
const XC_LOCAL = CAL("xc:local:v1");
/** At most this many KV writes per colo per day (the namespace also holds the support inbox; KV's free tier is 1,000 writes a day). */
const XC_WRITES_PER_DAY = 25;
async function readMemos(env: Env): Promise<XMemos | null> {
  if (!env.SUPPORT) return null;
  const local = await readJson<{ m: XMemos | null }>(XC_LOCAL);
  if (local) return local.m;
  try {
    const v = await env.SUPPORT.get(XC_KEY, { cacheTtl: 60 });
    const m = v ? (JSON.parse(v) as XMemos) : null;
    await putJson(XC_LOCAL, { m }, 60);
    return m;
  } catch { return null; }
}
function rememberContests(env: Env, ctx: ExecutionContext, memos: XMemos | null, found: { s: string; d: string; c: Cross | null; clear?: boolean }[], today: string): void {
  const kv = env.SUPPORT;
  const next = kv ? noteContests(memos, found, today) : null;
  if (!kv || !next) return;
  ctx.waitUntil((async () => {
    // Last writer wins (KV has no compare-and-set): merge onto the newest copy this colo can see, so another colo's
    // contest usually survives, and a lost one comes back on that colo's next read of it.
    const mark = CAL(`xc:w:v1:${today}:${fnv(JSON.stringify(found.map((f) => [f.s, f.d, f.c?.x ?? "", f.c?.xd ?? "", f.clear ? 1 : 0])))}`);
    if (await caches.default.match(mark).catch(() => null)) return;
    const countKey = CAL(`xc:n:v1:${today}`);
    const n = (await readJson<number>(countKey)) ?? 0;
    if (n >= XC_WRITES_PER_DAY) return;
    const latest = await kv.get(XC_KEY).then((v) => (v ? (JSON.parse(v) as XMemos) : null)).catch(() => memos);
    const merged = noteContests(latest, found, today);
    if (!merged) { await putJson(mark, 1, 3600); return; }
    try {
      await kv.put(XC_KEY, JSON.stringify(merged), { expirationTtl: XC_TTL });
    } catch { return; } // not marked: the next read retries
    await Promise.all([putJson(mark, 1, 86400), putJson(countKey, n + 1, 86400), putJson(XC_LOCAL, { m: merged }, 60)]);
  })().catch(() => {}));
}

// ── 0104: the sheet's session verdicts every colo's calendar and ICS can read ──
// Same pattern as the day contests above: one small KV record, a 60 s per-colo copy in front of it, a write only
// when a verdict changes, and its own small per-colo daily write cap (the namespace's free tier is shared).
const SL_KEY = "sl:v1";
const SL_TTL = (LEAD_MEMO_DAYS + 1) * 86400;
const SL_LOCAL = CAL("sl:local:v1");
const SL_WRITES_PER_DAY = 10;
async function readLeads(env: Env): Promise<SessionLeads | null> {
  if (!env.SUPPORT) return null;
  const local = await readJson<{ m: SessionLeads | null }>(SL_LOCAL);
  if (local) return local.m;
  try {
    const v = await env.SUPPORT.get(SL_KEY, { cacheTtl: 60 });
    const m = v ? (JSON.parse(v) as SessionLeads) : null;
    await putJson(SL_LOCAL, { m }, 60);
    return m;
  } catch { return null; }
}
function rememberLead(env: Env, ctx: ExecutionContext, memos: SessionLeads | null, s: string, d: string, lead: { h: "bmo" | "amc"; f: "bmo" | "amc" } | null, today: string): void {
  const kv = env.SUPPORT;
  if (!kv || !noteLead(memos, s, d, lead, today)) return;
  ctx.waitUntil((async () => {
    const countKey = CAL(`sl:n:v1:${today}`);
    const n = (await readJson<number>(countKey)) ?? 0;
    if (n >= SL_WRITES_PER_DAY) return;
    // Last writer wins: merge onto the newest copy, so another company's verdict usually survives.
    const latest = await kv.get(SL_KEY).then((v) => (v ? (JSON.parse(v) as SessionLeads) : null)).catch(() => undefined);
    // Review: a failed read never writes the local copy over other companies' verdicts.
    if (latest === undefined) return;
    const merged = noteLead(latest, s, d, lead, today);
    if (!merged) return;
    try {
      await kv.put(SL_KEY, JSON.stringify(merged), { expirationTtl: SL_TTL });
    } catch { return; }
    await Promise.all([putJson(countKey, n + 1, 86400), putJson(SL_LOCAL, { m: merged }, 60)]);
  })().catch(() => {}));
}

async function fetchCalendarDay(day: string, env: Env, caps: NqCaps = {}, today = iso(todayNY())): Promise<EarningsEvent[]> {
  const data = await getJson<{ earningsCalendar: any[] }>(`${FH}/calendar/earnings?from=${day}&to=${day}&token=${env.FINNHUB_API_KEY}`);
  // 0118 review: a truncated week's day calls see the same horizon as the range call.
  if (feedGoneDays([day], (data.earningsCalendar ?? []).map((r: any) => String(r.date)), today).length) throw new FeedGone(day);
  return toEvents(data.earningsCalendar, caps);
}

/** 0110: a day written before the Nasdaq window had loaded is kept this long, so a $10B+ company isn't missed for 30 min. */
const CAL_TTL_UNSIZED = 300;
/**
 * 0110: Nasdaq's untracked dollar caps (cache only: the window and on-demand reads fetch them), folded over the 0015
 * window and `days`. `complete` is false while some window day has no cap map yet and isn't a remembered failure
 * (a company's Nasdaq day can differ from the feed's, so the whole window counts; a Nasdaq outage never keeps the
 * short lifetime going).
 */
async function nasdaqCaps(days: string[], today: string, env?: Env, ctx?: ExecutionContext): Promise<{ caps: NqCaps; complete: boolean }> {
  const win = windowDays(today);
  const want = [...new Set([...win, ...days])];
  const [got, failed, shared] = await Promise.all([
    Promise.all(want.map((d) => readJson<NqCaps>(NQX_CAP(d)))),
    readJson<Record<string, number>>(NQX_FAIL),
    env ? readCapsShared(env) : Promise.resolve(undefined),
  ]);
  const now = Date.now();
  // 0114 review: a day this colo hasn't fetched but the window share holds (fresh) comes with that call's caps: sized.
  if (env?.SUPPORT && got.some((c) => c == null)) {
    // 0114 bounce 3 review: caps are 45-day data, so a shared day's caps count past its 6 h (sessions don't); colos no
    // longer copy the share into their own cache.
    const doc = await readWindowShared(env);
    want.forEach((d, i) => { const e = doc?.days?.[d]; if (got[i] == null && e && typeof e.at === "number" && e.at <= now && e.c && typeof e.c === "object") got[i] = e.c; });
  }
  // 0110 bounce: a day another colo has sized counts as sized here too (this colo's Nasdaq calls may keep failing).
  const complete = want.every((d, i) => got[i] != null || Object.keys(shared?.[d] ?? {}).length > 0 || !win.includes(d) || (failed?.[d] ?? 0) > now);
  if (env && ctx && shared !== undefined) {
    const local: CapDoc = {};
    want.forEach((d, i) => { if (got[i]) local[d] = got[i]!; });
    offerCaps(env, ctx, shared, local, today);
  }
  return { caps: foldCaps([...got, ...want.map((d) => shared?.[d])]), complete };
}

// ── 0110 bounce: Nasdaq's caps every colo reads ──
// Same pattern as 0083/0104/0111: one small KV record (day → untracked caps), a 60 s per-colo copy in front of it,
// and a write only when this colo holds a symbol the record lacks (read-merge-write, a per-colo daily cap).
const NQC_KV = "nqcap:v1";
/** Days kept in the record: the window ahead, and two weeks back (a passed day's list is rebuilt after the report). */
const NQC_KEEP_DAYS = 14;
const NQC_KV_TTL = 30 * 86400;
const NQC_LOCAL = CAL("nqcap:local:v1");
const NQC_WLOCK = CAL("nqcap:kv:w:v1");
/** KV's free tier (1,000 writes a day) is shared with the support inbox and the other memos. */
const NQC_WRITES_PER_DAY = 24;
const capDocOk = (v: unknown): v is CapDoc => !!v && typeof v === "object" && !Array.isArray(v);
/** Review: parsed once per isolate per NQC_MEMO_MS (a range runs up to three weeks in parallel, each asking). */
const NQC_MEMO_MS = 30_000;
let nqcMemo: { at: number; m: CapDoc | null } | null = null;
/** One offer in flight per isolate, claimed synchronously (parallel weeks would otherwise each pass the cache lock). */
let nqcOffering = false;
/** The shared record (null: KV holds none yet), or undefined when it can't be read (never written over then). */
async function readCapsShared(env: Env): Promise<CapDoc | null | undefined> {
  if (!env.SUPPORT) return undefined;
  if (nqcMemo && Date.now() - nqcMemo.at >= 0 && Date.now() - nqcMemo.at < NQC_MEMO_MS) return nqcMemo.m;
  const m = await readCapsSharedUncached(env);
  if (m !== undefined) nqcMemo = { at: Date.now(), m };
  return m;
}
async function readCapsSharedUncached(env: Env): Promise<CapDoc | null | undefined> {
  if (!env.SUPPORT) return undefined;
  const local = await readJson<{ m: CapDoc | null }>(NQC_LOCAL);
  if (local) return local.m;
  try {
    const v = await env.SUPPORT.get(NQC_KV, { cacheTtl: 60 });
    const parsed = v ? JSON.parse(v) : null;
    const m = capDocOk(parsed) ? parsed : null;
    await putJson(NQC_LOCAL, { m }, 60);
    return m;
  } catch { return undefined; }
}
function offerCaps(env: Env, ctx: ExecutionContext, shared: CapDoc | null, local: CapDoc, today: string): void {
  const kv = env.SUPPORT;
  const keepFrom = addDays(today, -NQC_KEEP_DAYS);
  if (!kv || nqcOffering || !capsGrow(shared, local, keepFrom)) return;
  nqcOffering = true;
  ctx.waitUntil((async () => {
    if (await caches.default.match(NQC_WLOCK).catch(() => true)) return; // another isolate on this colo is writing
    await putJson(NQC_WLOCK, 1, 60);
    const countKey = CAL(`nqcap:n:v1:${today}`);
    const n = (await readJson<number>(countKey)) ?? 0;
    if (n >= NQC_WRITES_PER_DAY) return;
    // Last writer wins (KV has no compare-and-set): merge onto the newest copy, and never write after a failed read.
    const raw = await kv.get(NQC_KV).catch(() => undefined);
    if (raw === undefined) return;
    let latest: CapDoc | null = null;
    try { const p = raw ? JSON.parse(raw) : null; latest = capDocOk(p) ? p : null; } catch { latest = null; } // corrupt: rewrite it
    if (!capsGrow(latest, local, keepFrom)) { nqcMemo = { at: Date.now(), m: latest }; await putJson(NQC_LOCAL, { m: latest }, 60); return; }
    const merged = mergeCapDocs(latest, local, keepFrom);
    try { await kv.put(NQC_KV, JSON.stringify(merged), { expirationTtl: NQC_KV_TTL }); } catch { return; }
    nqcMemo = { at: Date.now(), m: merged };
    await Promise.all([putJson(countKey, n + 1, 86400), putJson(NQC_LOCAL, { m: merged }, 60)]);
  })().catch(() => {}).finally(() => { nqcOffering = false; }));
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
    if (hit?.headers.get(GONE_HEADER)) out[i] = { status: "rejected", reason: new FeedGone(d) };
    else if (hit) out[i] = { status: "fulfilled", value: (await hit.json()) as EarningsEvent[] }; else missing.push(i);
  }));
  if (!missing.length) return out;
  const from = days[Math.min(...missing)], to = days[Math.max(...missing)];
  const sized = await nasdaqCaps(missing.map((i) => days[i]), today, env, ctx).catch(() => ({ caps: {} as NqCaps, complete: false }));
  const ttl = (d: string) => (sized.complete || !windowDays(today).includes(d) ? calTtl(d, today) : Math.min(CAL_TTL_UNSIZED, calTtl(d, today)));
  let byDay: Map<string, EarningsEvent[]> | null = null;
  let gone = new Set<string>();
  let rangeError: unknown = null;
  try {
    const data = await getJson<{ earningsCalendar: any[] }>(`${FH}/calendar/earnings?from=${from}&to=${to}&token=${env.FINNHUB_API_KEY}`);
    const rows = data.earningsCalendar ?? [];
    if (rows.length < RANGE_CAP || from === to) {
      byDay = new Map();
      for (const e of toEvents(rows, sized.caps, today)) (byDay.get(e.d) ?? byDay.set(e.d, []).get(e.d)!).push(e);
      // 0118: a past trading day with no feed row at all has been dropped by the feed (about a month of history).
      gone = new Set(feedGoneDays(missing.map((i) => days[i]), rows.map((r: any) => String(r.date)), today));
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
      putDay(d, ev, today, ctx, ttl(d));
      out[i] = { status: "fulfilled", value: ev };
    } catch (reason) {
      if (reason instanceof FeedGone) return settleGone(i); // not an upstream failure (0118)
      health.failed = true;
      const stale = await caches.default.match(CAL(`cal:stale:v3:${d}`));
      out[i] = stale ? { status: "fulfilled", value: (await stale.json()) as EarningsEvent[] } : { status: "rejected", reason };
    }
  };
  // 0118: a dropped day is served from its last good copy if this colo has one, never as an empty (quiet) day.
  const settleGone = async (i: number) => {
    const d = days[i];
    const stale = await caches.default.match(CAL(`cal:stale:v3:${d}`)).catch(() => undefined);
    const rows = stale ? ((await stale.json().catch(() => [])) as EarningsEvent[]) : [];
    if (rows.length) { putDay(d, rows, today, ctx, ttl(d)); out[i] = { status: "fulfilled", value: rows }; return; }
    putGone(d, today, ctx);
    out[i] = { status: "rejected", reason: new FeedGone(d) };
  };
  if (rangeError) {
    await Promise.all(missing.map((i) => settle(i, () => Promise.reject(rangeError))));
  } else if (byDay) {
    const m = byDay;
    await Promise.all(missing.map((i) => (gone.has(days[i]) ? settleGone(i) : settle(i, async () => m.get(days[i]) ?? []))));
  } else {
    // Truncated busy week: day by day, at most 2 in flight (3 weeks in parallel stays ≤ 6 calls at once).
    // 0118 review: a day call that finds the day dropped goes the same way as the range call's dropped days.
    await pool(missing, 2, (i) => settle(i, () => fetchCalendarDay(days[i], env, sized.caps, today)));
  }
  return out;
}

/** A single day (the share-card and brief paths), through the same cache and fallbacks. */
async function calendarDay(day: string, env: Env, ctx: ExecutionContext): Promise<EarningsEvent[]> {
  const [r] = await calendarWeek([day], env, ctx);
  if (r.status === "fulfilled") return r.value;
  throw r.reason;
}

// ── 0072: past rows with no figures, settled against the company's own report history ──
/** The same cache entry the ticker sheet reads (`buildTicker`), so a symbol costs one Nasdaq call per 12 h either way. */
const NQ_SURPRISE_TTL = 43200;
const nqSurpriseReq = (s: string) => CAL(`nq:surprise:${s}`);
const nqSurpriseFail = (s: string) => CAL(`nq:surprise:fail:v1:${s}`);
/** At most this many symbols are fetched fresh per request (pooled, short timeout); the rest wait for a later read. */
const PAST_FETCH_MAX = 8;
/** 0103: ADRs whose row the memo hasn't settled are fetched ahead of the rest (others take leftover slots). There are
 *  only eight names in ADS_SHARES, and each is fetched once per 12 h, then remembered (no cap by count: a busy week
 *  must not leave the fifth ADR unchecked, the 0103 bounce). */
const ADS_FETCH_MAX = 8;
/** 0103: remembered ADS decisions (one small document per colo), kept as long as a past row is checked. */
const ADS_MEMO = CAL("cal:ads:v1");
const ADS_MEMO_TTL = PAST_LOOKBACK_DAYS * 86400;
const readAdsMemo = async (): Promise<AdsMemo> => (await readJson<AdsMemo>(ADS_MEMO)) ?? {};
/** Read-merge-write (LESSONS 2026-11-05): another request's newer entries survive. */
function commitAdsMemo(ctx: ExecutionContext, seen: AdsMemo, updates: AdsMemo, today: string) {
  if (!Object.keys(updates).length) return;
  ctx.waitUntil((async () => {
    // The copy this request read counts too, so a failed re-read never writes back fewer entries than it saw.
    const latest = await readJson<AdsMemo>(ADS_MEMO);
    await putJson(ADS_MEMO, mergeAdsMemo({ ...seen, ...(latest ?? {}) }, updates, addDays(today, -PAST_LOOKBACK_DAYS)), ADS_MEMO_TTL);
  })().catch(() => {}));
}
/** 0076: neighbouring symbols checked per request for a past row moving into the range (one cache read each). */
const MOVE_IN_MAX = 4;
/** 0080: neighbouring rows with suspect figures checked per request (cache only). */
const PAD_FIGURES_MAX = 3;

/**
 * Fill a past row's figures from Nasdaq when the company did report (AMCR, ATO), flag it `od` when it didn't
 * (NIO). Never fails the calendar: a symbol whose history can't be read keeps its row as it was.
 * `fetchFresh: false` (share cards) reads the cache only.
 */
/** 0103: a past ADR row with both figures in the company's currency, within the lookback. */
const adsRowToCheck = (e: EarningsEvent, today: string) =>
  e.s in ADS_SHARES && e.eA != null && e.eE != null && e.ec !== "USD" && e.d < today && e.d >= addDays(today, -PAST_LOOKBACK_DAYS);

/** 0103: the row on the ADS basis when Nasdaq's dollar pair for the same report (±3 days) says so, at the universe's
 *  refreshed rate (the basis is a 2–8× question, so the day's rate doesn't matter). No pair or rate: unchanged.
 *  `sure`: Nasdaq dates the report on this very day and both its figures are in, so the decision is remembered. A
 *  twin a day off is never remembered (review of #188): restored, it would show the report on the wrong day. */
function adsRow(e: EarningsEvent, reports: NqReport[] | null): { row: EarningsEvent; sure: boolean } {
  const nq = reports?.find((r) => Math.abs(daysApart(r.date, e.d)) <= 3);
  const usdPer = USD_PER[e.ec ?? (U[e.s] as { ec?: string } | undefined)?.ec ?? ""];
  if (!nq || !usdPer) return { row: e, sure: false };
  const sure = nq.date === e.d && nq.eps != null && nq.est != null;
  const row = onAdsBasis(e.s, e, nq, 1 / usdPer);
  // 0041: Nasdaq dates the report on this very day, so a neighbouring twin (another basis, another day) never outranks it.
  return { row: nq.date === e.d && !row.nd ? { ...row, nd: 1 } : row, sure };
}
/** Dollars per unit of each currency, from any universe entry refreshed in it (JD's and LI's CNY rate serves BIDU too). */
const USD_PER: Record<string, number> = Object.fromEntries(Object.values(U as Record<string, { fx?: number; mcCur?: string }>)
  .filter((v) => v.mcCur && v.fx && v.fx > 0).map((v) => [v.mcCur as string, v.fx as number]));

/** 0080's phantom check, else 0119's move to the day the history dates the report (the same history read). */
const figuresRow = (e: EarningsEvent, reports: NqReport[] | null, today: string) => {
  const out = settleFiguresRow(e, reports, today);
  return out === e ? reportDayRow(e, reports) : out;
};

async function settlePast(events: EarningsEvent[], today: string, ctx: ExecutionContext, fetchFresh = true, figuresMax = FIGURES_CHECK_MAX, memo?: AdsMemo): Promise<EarningsEvent[]> {
  // 0080: plus up to `figuresMax` suspect rows with figures (`nx`), biggest first, so the reads stay bounded.
  const suspects = new Set([...new Set(events.filter((e) => needsFiguresCheck(e, today)).map((e) => e.s))]
    .sort((x, y) => (U[y]?.mc ?? 0) - (U[x]?.mc ?? 0) || x.localeCompare(y)).slice(0, figuresMax));
  // 0103: ADRs with a past row with figures, so a per-share row can be put on the ADS basis (at most the eight names
  // in ADS_SHARES). A row the memo already settled (same figures as given) needs no history read.
  const adsRows = events.filter((e) => adsRowToCheck(e, today));
  const ads = adsRows.length ? memo ?? (await readAdsMemo()) : {};
  const adrs = new Set(adsRows.filter((e) => !fromAdsMemo(e, ads)).map((e) => e.s));
  const syms = [...new Set([...events.filter((e) => needsPastCheck(e, today)).map((e) => e.s), ...suspects, ...adrs])];
  if (!syms.length && !adsRows.length) return events;
  const reports = new Map<string, ReturnType<typeof nqReports> | null>();
  const misses: string[] = [];
  await Promise.all(syms.map(async (s) => {
    const hit = await readJson<any>(nqSurpriseReq(s));
    if (hit) reports.set(s, nqReports(hit)); else misses.push(s);
  }));
  if (fetchFresh && misses.length) {
    // A symbol whose read failed lately isn't asked again for 15 minutes: a Nasdaq outage must not cost 12 calls a read.
    const failed = await Promise.all(misses.map((s) => readJson<number>(nqSurpriseFail(s))));
    const ok = misses.filter((_, i) => failed[i] == null);
    // 0103: up to ADS_FETCH_MAX ADRs go first (cached 12 h, about one call per name per colo); the rest share what is left.
    const adrFirst = ok.filter((s) => adrs.has(s)).slice(0, ADS_FETCH_MAX);
    const take = [...adrFirst, ...ok.filter((s) => !adrFirst.includes(s))].slice(0, PAST_FETCH_MAX);
    // One try each, no 429 retries (as fetchNasdaqDay): a second opinion must never spend the request's subrequests.
    const got = await pool(take, 4, async (s) => {
      const r = await fetch(`https://api.nasdaq.com/api/company/${s}/earnings-surprise`, { headers: UA, signal: AbortSignal.timeout(2500) } as RequestInit);
      if (!r.ok) throw new Error(`api.nasdaq.com ${r.status}`);
      return (await r.json()) as any;
    });
    got.forEach((r, i) => {
      if (r.status !== "fulfilled" || !r.value || typeof r.value !== "object") {
        ctx.waitUntil(putJson(nqSurpriseFail(take[i]), 1, 900).catch(() => {}));
        return;
      }
      reports.set(take[i], nqReports(r.value));
      // No table (a symbol Nasdaq doesn't cover) is an answer too, but kept an hour, not twelve.
      const ttl = r.value.data ? NQ_SURPRISE_TTL : 3600;
      ctx.waitUntil(caches.default.put(nqSurpriseReq(take[i]), new Response(JSON.stringify(r.value), { headers: { "Cache-Control": `public, max-age=${ttl}`, "Content-Type": "application/json" } })).catch(() => {}));
    });
  }
  // Nasdaq's figures are dollars: fill only rows whose figures are dollars too (untracked rows are shown in dollars).
  const usd = dollarFigures;
  const learned: AdsMemo = {};
  const settled = events.map((e) => {
    let out = needsPastCheck(e, today) ? settlePastRow(e, reports.get(e.s) ?? null, usd(e.s), today)
      : suspects.has(e.s) && needsFiguresCheck(e, today) ? figuresRow(e, reports.get(e.s) ?? null, today)
      : e;
    // 0103: after the suspect check too, so a surviving `nx` row is on the same basis as the sheet.
    if (adsRowToCheck(out, today)) {
      const known = fromAdsMemo(out, ads);
      if (known) out = known;
      else if (adrs.has(out.s)) {
        const { row, sure } = adsRow(out, reports.get(out.s) ?? null);
        const m = sure ? adsMemoEntry(out, row) : null;
        if (m) learned[adsMemoKey(out.s, out.d)] = m;
        out = row;
      }
    }
    if (out.nx == null) return out;
    const { nx: _nx, ...rest } = out; // the day caches keep `nx` for the sheet; responses don't need it
    return rest;
  });
  if (Object.keys(learned).length) {
    if (fetchFresh) commitAdsMemo(ctx, { ...ads }, learned, today);
    Object.assign(ads, learned); // this request's restore step sees them too
  }
  return settled;
}

/**
 * 0041: one report, one row, the same answer whatever range is asked for. A report's twin can sit just outside the
 * range (a Friday report with a stale Monday twin across a week edge, or the share title's single day), so the
 * neighbouring SAME_REPORT_DAYS are read from the cache only (no upstream calls), given the same overrides and past
 * check (cache only), collapsed with the range's rows, and dropped again. A cold neighbour is simply not compared.
 * Call after settlePast: its `nd` mark decides between twins.
 */
async function oneRowInRange(fixed: EarningsEvent[], from: string, to: string, today: string, ctx: ExecutionContext, memo?: AdsMemo, seen?: { rows?: EarningsEvent[] }): Promise<EarningsEvent[]> {
  const inRange = (e: EarningsEvent) => e.d >= from && e.d <= to;
  const syms = new Set(fixed.filter(inRange).map((e) => e.s));
  // 0076: a past row may have moved out (dropped below) or may move in from a neighbour: MOVE_MAX_DAYS ≤ SAME_REPORT_DAYS,
  // so the same neighbour read covers it, with no extra days.
  const padFrom = addDays(from, -SAME_REPORT_DAYS), padTo = addDays(to, SAME_REPORT_DAYS);
  const days: string[] = [];
  for (let d = padFrom; d <= padTo; d = addDays(d, 1)) {
    const wd = new Date(d + "T12:00:00Z").getUTCDay();
    if ((d < from || d > to) && wd !== 0 && wd !== 6) days.push(d);
  }
  const pastPad = padFrom < today;
  if (!syms.size && !pastPad) return fixed.filter(inRange);
  const read = async (d: string) => {
    const hit = (await caches.default.match(CAL_DAY(d)).catch(() => undefined)) ?? (await caches.default.match(CAL(`cal:stale:v3:${d}`)).catch(() => undefined));
    return hit ? ((await hit.json().catch(() => [])) as EarningsEvent[]) : [];
  };
  const all = (await Promise.all(days.map(read))).flat();
  if (seen) seen.rows = all; // 0112: the same neighbours, for leadInRange (no second read)
  // A neighbour's row counts if it's a twin of a row here, or (0076) a past row with no figures that may move here.
  // Those cost one cache read each in settlePast, so at most MOVE_IN_MAX symbols, biggest first. 0119: plus, in
  // their own slots (so they never crowd 0076's out), up to PAD_FIGURES_MAX suspects with figures (`nx`), which may
  // move here too (cache only: the pad's settlePast reads no more of them than that).
  const bySize = (list: string[]) => list.sort((x, y) => (U[y]?.mc ?? 0) - (U[x]?.mc ?? 0));
  const lone = bySize([...new Set(all.filter((e) => !syms.has(e.s) && needsPastCheck(e, today)).map((e) => e.s))]).slice(0, MOVE_IN_MAX);
  const figured = bySize([...new Set(all.filter((e) => !syms.has(e.s) && !lone.includes(e.s) && needsFiguresCheck(e, today)).map((e) => e.s))]).slice(0, PAD_FIGURES_MAX);
  const movers = new Set([...lone, ...figured]);
  const raw = all.filter((e) => syms.has(e.s) || movers.has(e.s));
  if (!raw.length) return oneReportOneRow(fixed.filter(inRange));
  const applied = flagClosed(applyToEvents(raw, OVERRIDES, padFrom, padTo, today, (s) => s in U));
  // 0085: a company-dated row here whose feed row sits on a neighbouring day was rebuilt without estimates; the same
  // override applied to the neighbours carries them (cache only, so a cold neighbour leaves "—").
  fixed = carryEstimates(fixed, applied.filter(inRange));
  let pad = applied.filter((e) => !inRange(e));
  // 0080: a neighbouring twin with phantom figures would outrank this range's row, so suspects are settled here too
  // (cache only, fewer of them).
  if (pad.length && pastPad) pad = await settlePast(pad, today, ctx, false, PAD_FIGURES_MAX, memo).catch(() => pad);
  // Keep the twins of rows here and the rows that moved here; the rest only rode along to be checked.
  pad = pad.filter((e) => inRange(e) || syms.has(e.s));
  if (!pad.length) return oneReportOneRow(fixed.filter(inRange));
  return oneReportOneRow([...fixed, ...pad]).filter(inRange);
}

/**
 * 0112: the rows a neighbouring day's feed row contributes to this range through 0099's move (`leadIns`). Only
 * companies Nasdaq (or a remembered contest, 0083) lists here with a session, that have no row here and no company
 * date, are looked for, in the SAME_REPORT_DAYS neighbours `oneRowInRange` already read (`neighbours`; read here,
 * cache only, when it didn't) plus the 0024 supplement's rows, so every row `leadRows` drops from its feed day's range
 * can be found from Nasdaq's. A cold neighbour adds nothing: that day's one-day read is then what it was before 0112.
 */
async function leadInRange(fixed: EarningsEvent[], from: string, to: string, today: string, w: NqWindow | null, memos: XMemos | null, neighbours: EarningsEvent[] | undefined, supp: SuppDoc | null): Promise<EarningsEvent[]> {
  const have = new Set(fixed.map((e) => e.s));
  const live = activeOverrides(OVERRIDES, today);
  const here = (d: string, h: string | undefined) => d >= from && d <= to && d >= today && (h === "bmo" || h === "amc");
  const want = new Set<string>();
  for (const [s, list] of Object.entries(w?.idx ?? {})) if (!have.has(s) && !(s in live) && list.some((l) => here(l.d, l.h))) want.add(s);
  for (const [s, m] of Object.entries(memos ?? {})) if (!have.has(s) && !(s in live) && here(m.xd, m.xh)) want.add(s);
  if (!want.size) return fixed;
  const padFrom = addDays(from, -SAME_REPORT_DAYS), padTo = addDays(to, SAME_REPORT_DAYS);
  let rows = neighbours;
  if (!rows) {
    const days: string[] = [];
    for (let d = padFrom; d <= padTo; d = addDays(d, 1)) {
      const wd = new Date(d + "T12:00:00Z").getUTCDay();
      if ((d < from || d > to) && wd !== 0 && wd !== 6) days.push(d);
    }
    const read = async (d: string) => {
      const hit = (await caches.default.match(CAL_DAY(d)).catch(() => undefined)) ?? (await caches.default.match(CAL(`cal:stale:v3:${d}`)).catch(() => undefined));
      return hit ? ((await hit.json().catch(() => [])) as EarningsEvent[]) : [];
    };
    rows = (await Promise.all(days.map(read))).flat();
  }
  // Feed days still ahead only, as in leadRows (a passed one stays with the past check, 0072/0076).
  const out = (e: EarningsEvent) => want.has(e.s) && e.d >= today && (e.d < from || e.d > to);
  let cand = rows.filter(out);
  const feedSyms = new Set(cand.map((e) => e.s));
  if (supp) cand = cand.concat(mergeSupplement([], supp, padFrom, padTo, () => true).filter((e) => out(e) && !feedSyms.has(e.s)));
  if (!cand.length) return fixed;
  const flagged = flagClosed(cand);
  const checked = applyMemos(w ? crossCheck(flagged, w) : flagged, memos, today, w);
  const ins = leadIns(fixed, checked, from, to, today);
  return ins.length ? [...fixed, ...ins] : fixed;
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
  // 0114 bounce 3: the cross-check's shared reads go first, before the week reads spend the invocation's 50
  // subrequests (Cache API and KV calls count): read late, they failed silently and the days read as unchecked.
  const today = iso(todayNY());
  const xRange = to >= today && from <= addDays(windowEnd(today), XCHECK_REACH);
  const inRange = (d: string) => d >= from && d <= to;
  // Awaited before the week reads start (review: a KV miss issued later still lost out to their bursts). Reads only, a
  // handful of calls: a fetch here (bounded wait, plus its writes) took the budget the week reads need, and a cold
  // colo's week came back "Couldn't load" (live, 10:30 UTC 2026-11-27). The fill for a day no colo has runs after
  // the response instead (below).
  const [w, memos, leads] = xRange
    ? await Promise.all([nasdaqWindow(today, ctx, false, inRange, env).catch(() => null), readMemos(env).catch(() => null), readLeads(env).catch(() => null)])
    : [null, null, null];
  const perWeek = await pool(weeks, 3, (w) => calendarWeek(w, env, ctx, health));
  const results = perWeek.flatMap((r, wi) => (r.status === "fulfilled" ? r.value : weeks[wi].map(() => ({ status: "rejected", reason: r.reason }) as PromiseSettledResult<EarningsEvent[]>)));
  const warnings: string[] = [];
  let events: EarningsEvent[] = [];
  const loaded = new Set<string>();
  results.forEach((r, i) => (r.status === "fulfilled" ? (events.push(...r.value), loaded.add(days[i])) : warnings.push(r.reason instanceof FeedGone ? goneWarning(days[i]) : `Couldn't load ${days[i]} — showing the rest.`)));
  let pending = 0;
  let suppDoc: SuppDoc | null = null;
  if (touchesSupp(from, to, today)) {
    // After the range calls, never alongside them; and no new calls at all if any upstream call failed,
    // even one a stale copy covered (0024: a rate limit must not become more calls).
    // 0118: a day the feed has dropped isn't a failure (no rate limit behind it), so it doesn't stop the supplement.
    const doc = await supplement(env, ctx, today, !health.failed && warnings.every(isGoneWarning));
    suppDoc = doc;
    events = mergeSupplement(events, doc, from, to, (d) => loaded.has(d));
    // Not fetched yet here (a cold cache): count them so an absent row never reads as "doesn't report".
    // A progress count, not a warning (0047): nothing failed, so the client mustn't say "busy" or retry.
    pending = unfetched(doc, SUPP_SYMBOLS);
  }
  let fixed = flagClosed(applyToEvents(events, OVERRIDES, from, to, today, (s) => s in U));
  if (from < today) fixed = await preReportMoved(fixed, today, ctx).catch(() => fixed);
  // 0103: remembered ADS decisions, read once for the range and its neighbours (only when it reaches checked days).
  const adsMemo = from < today && to >= addDays(today, -PAST_LOOKBACK_DAYS) ? await readAdsMemo() : undefined;
  if (from < today) fixed = await settlePast(fixed, today, ctx, true, FIGURES_CHECK_MAX, adsMemo).catch(() => fixed);
  // 0041: one report, one row (after the past check, whose `nd` mark picks the twin that happened).
  const near: { rows?: EarningsEvent[] } = {};
  fixed = await oneRowInRange(fixed, from, to, today, ctx, adsMemo, near).catch(() => oneReportOneRow(fixed.filter((e) => e.d >= from && e.d <= to)));
  // 0103: a report Nasdaq confirmed is never missing because the feed (or the supplement) dropped it this time.
  if (adsMemo) fixed = restoreAdsReports(fixed, adsMemo, from, to, (d) => loaded.has(d));
  // 0015: only ranges that reach the next 14 days (or a month past them, for a projected date Nasdaq lists sooner).
  // A Nasdaq failure leaves the events as Finnhub has them. It isn't a calendar failure, so it's not a warning:
  // warnings make the client say "busy" and retry (0047). `unchecked` counts the days that couldn't be compared.
  let unchecked = 0;
  let uncheckedDays: string[] = [];
  let fill = false;
  if (xRange) {
    if (w) fixed = crossCheck(fixed, w);
    // 0083: what this read found is remembered for every colo (real evidence only), and a cold or partial read
    // gets the contests another read saw, so a flagged row stays flagged.
    // 0114: a read with a stale day neither writes nor clears memos (24 h old listings aren't current evidence).
    if (!w?.stale?.length) rememberContests(env, ctx, memos, contestsIn(fixed, windowCovered(w, today)), today);
    fixed = applyMemos(fixed, memos, today, w);
    // 0099: a timeless projection Nasdaq lists on another day with a session sits on Nasdaq's day, still unconfirmed.
    fixed = leadRows(fixed, from, to, today);
    // 0112: and a neighbouring day's row that Nasdaq's day here leads onto this range (cache only), so a one-day read
    // lists what every wider range does.
    fixed = await leadInRange(fixed, from, to, today, w, memos, near.rows, suppDoc).catch(() => fixed);
    // 0104: a session the sheet settled (Nasdaq's, backed by every recent report) reads the same on the calendar.
    fixed = applyLeads(fixed, leads, today);
    unchecked = windowDays(today).length - (w?.loaded.length ?? 0);
    // 0061: the days on screen that haven't been compared yet, so the client says "still checking" and asks again,
    // instead of showing a cold read as if it had been checked.
    const done = new Set(w?.loaded ?? []);
    uncheckedDays = windowDays(today).filter((d) => inRange(d) && !done.has(d));
    // 0114 bounce 1: on a day that couldn't be checked, a feed session with no Nasdaq evidence (no contest, no
    // remembered one, no settled lead) isn't shown as fact: Time TBD until the re-read (30 s), feed's kept in `fh`.
    if (uncheckedDays.length) fixed = holdUnchecked(fixed, new Set(uncheckedDays));
    // 0114 bounce 3: a window day missing or stale asks the reader's browser for the fill (`/api/xcheck/fill`), which
    // runs in an invocation of its own. Same gate as the in-request fill it replaces: ranges that overlap the window.
    fill = from <= windowEnd(today) && windowDays(today).some((d) => !done.has(d) || !!w?.stale?.includes(d));
    // A day no colo has is fetched after the response, so curl readers and unfurls still fill new days (the browser's
    // `/api/xcheck/fill` refreshes stale ones). Last in the invocation: it succeeds when the read left budget (a warm
    // read does) and is simply refused otherwise, which is never remembered as Nasdaq failing.
    const none = windowDays(today).filter((d) => !done.has(d));
    if (from <= windowEnd(today) && none.length) ctx.waitUntil(fillWindow(none, today, ctx, inRange, env, true).catch(() => ({})));
  }
  const body: CalendarResponse = { from, to, events: fixed, asOf: new Date().toISOString(), warnings, ...(pending ? { pending } : {}), ...(unchecked ? { unchecked } : {}), ...(uncheckedDays.length ? { uncheckedDays } : {}), ...(fill ? { fill: 1 as const } : {}) };
  // An unchecked answer must not sit in the browser for 10 minutes: the next read is the checked one.
  return json(body, uncheckedDays.length ? 30 : 600);
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

/** 0096: judged quarters the setup grade needs before it scores a track record. */
const MIN_BEAT_RECORD = 2;

/**
 * The finished sheet, edge-cached for 5 minutes: sheets, share pages and OG cards all read one small JSON.
 * 0043: a sheet that lost its date or history to a rate limit is cached for 30 s only, and the last good copy
 * (`tk:stale:v12:SYM`, 24 h) stands in for it, marked as an earlier read. `ttl` is what both cache layers use. Bumped for 0106 (copies from before it carry Finnhub's raw cap label) and 0073 (the cap scaled to the last close, with `capAt`).
 */
async function tickerEntry(symbol: string, env: Env, ctx: ExecutionContext): Promise<{ data: TickerResponse; ttl: number }> {
  const key = new Request(`https://cache.metaphases.internal/${encodeURIComponent(`tk:v10:${symbol}`)}`);
  const staleKey = new Request(`https://cache.metaphases.internal/${encodeURIComponent(`tk:stale:v12:${symbol}`)}`);
  const hit = await caches.default.match(key);
  if (hit) { const data = (await hit.json()) as TickerResponse; return { data, ttl: sheetTtl(data) }; }
  const built = await buildTicker(symbol, env, ctx);
  const today = iso(todayNY());
  let data = built;
  if (isDegraded(built)) {
    const old = await caches.default.match(staleKey).then((r) => (r ? (r.json() as Promise<StaleSheet>) : null)).catch(() => null);
    const ny = todayNY();
    const nowMin = ny.getHours() * 60 + ny.getMinutes();
    // 0092: a date taken from the calendar (`symbol=` failed) still prefers a usable last good copy of the whole sheet.
    const calDate = built.warnings.includes(CALENDAR_NEXT);
    if ((calDate || built.warnings.includes("Upcoming date unavailable.")) && staleUsable(old, today, nowMin)) data = standIn(old, today);
    // Only the past reports failed (or the date came from the calendar): keep the fresh date and report-day state,
    // borrow the history.
    else if (!built.warnings.includes("Upcoming date unavailable.") && built.warnings.includes("Earnings history unavailable.")) { if (staleUsable(old, today, nowMin, "history")) data = borrowHistory(built, old, today); }
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

  const [profile, quote, metric, recs, surprises, feedUpcoming, nasdaq, chart] = await Promise.all([
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
  for (const e of listOf(feedUpcoming?.earningsCalendar)) { e.epsEstimate = shareEps(symbol, e.epsEstimate); e.epsActual = shareEps(symbol, e.epsActual); }
  // 0092: `symbol=` rate-limited (peak week): the calendar's cached days already list the next report (their per-share
  // figures are in the share's unit already). Overrides apply below as usual. Nothing cached: no date, as before.
  let upcoming = feedUpcoming;
  if (!upcoming) {
    const fromCal = await calendarNext(symbol, today);
    if (fromCal.length) upcoming = { earningsCalendar: fromCal };
    // Only a report still to come is an upcoming date; a row that already has today's figures (NTES) is not.
    const at = warnings.indexOf("Upcoming date unavailable.");
    if (at >= 0 && fromCal.some((e) => e.epsActual == null && e.revenueActual == null)) warnings.splice(at, 1, CALENDAR_NEXT);
  }
  for (const f of listOf(surprises)) { f.estimate = shareEps(symbol, f.estimate); f.actual = shareEps(symbol, f.actual); }
  const epsSeries: unknown = metric?.series?.quarterly?.eps;
  const quarterly = Array.isArray(epsSeries) ? { ...metric.series.quarterly, eps: epsSeries.map((p) => ({ ...p, v: shareEps(symbol, p.v) })) } : metric?.series?.quarterly;
  const cal: any[] = applyToRows(symbol, upcoming?.earningsCalendar ?? [], OVERRIDES, today);
  // 0080: figures on a past day the company's report history says it never reported on (PATH, Nov 12) aren't a
  // report: drop them, so the quarter reads as not reported yet instead of "Just reported · missed by 44%".
  const nqHist = nasdaq ? nqReports(nasdaq) : null;
  // Both of the calendar's signals (0080's `nx` and the history), so the sheet and the calendar agree.
  for (const e of cal) {
    if (e.date < today && (e.epsActual != null || e.revenueActual != null) && phantomReport(e.date, nqHist, today, e.source) && (await nasdaqDayOmits(symbol, e.date, today, ctx))) { e.epsActual = null; e.revenueActual = null; }
  }
  const nextE = cal.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const lastE = cal.filter((e) => e.date < today).sort((a, b) => b.date.localeCompare(a.date))[0];
  // 0015/0059: the calendar's Nasdaq cross-check, from the cached days (folded or not: one slow day must not
  // blind every sheet). A blank session both feeds agree on is filled before the report-day state (0039) is
  // worked out from it.
  // The rows the calendar's crossCheck compares: no company date, no figures in, not projected onto a closed day.
  const xcheck = !!nextE && !nextE.source && nextE.epsActual == null && nextE.revenueActual == null && !closedDay(nextE.date);
  let nqWin = xcheck ? await nasdaqWindow(today, ctx, false, undefined, env).catch(() => null) : null;
  // 0083: the contests any colo has seen (read once, only when a cold window leaves a question open).
  let memosP: Promise<XMemos | null> | null = null;
  const memosOf = () => (memosP ??= readMemos(env));
  const seen: { s: string; d: string; c: Cross | null; clear?: boolean }[] = [];
  // 0057: the habit past reports are measured with. A company-dated row already carries its own session (or
  // none). Unless the window already loaded that day: read the one Nasdaq day the next report is on, on demand (one
  // shared, cached call per day), so the habit never waits for the window to reach that date. 0059: inside the
  // window, that day joins the cross-check too, so the sheet's session matches the calendar's.
  // the window already answered for that day (0114: freshly; a stale day is fetched on demand again)
  const inWin = !!nqWin && nqWin.loaded.includes(nextE?.date ?? "") && !nqWin.stale?.includes(nextE?.date ?? "");
  // 0060: also when Finnhub gives a session, so a session the two calendars disagree on is caught without waiting.
  const nqNextDay = nextE && !nextE.source && nextE.hour !== "dmh" && !inWin ? await nasdaqDayOnDemand(nextE.date, today, ctx, env) : null;
  const nqNextHour = nqNextDay?.[symbol];
  if (xcheck && nqNextDay) nqWin = withDay(nqWin, today, nextE.date, nqNextDay);
  const fhNextHour = nextE?.hour as string | undefined;
  const nqOnNext = nextE && !nextE.source ? nqNextHour ?? (nqWin?.loaded.includes(nextE.date) ? nqWin.idx[symbol]?.find((l) => l.d === nextE.date)?.h : undefined) : undefined;
  if (nqWin && nextE && !nextE.hour) { const c = crossOne(symbol, nextE.date, "", nqWin); if (c?.h) { nextE.hour = c.h; nextE.hs = "n"; } } // 0050: Nasdaq's, not the company's
  // 0108: a company date whose company named no session (nor a call time that settles one) takes Nasdaq's timed
  // listing for that same day, expected, as the calendar's crossCheck does. One shared, cached call per day.
  // Only for a day still ahead and inside the calendar's window, as `companyDayFill`: on the report day the 0039 states
  // would take Nasdaq's guess as the time results are due (review of #193).
  if (nextE?.source && !nextE.hour && nextE.epsActual == null && nextE.revenueActual == null && nextE.date > today && nextE.date <= windowEnd(today)) {
    const h = (await nasdaqDayOnDemand(nextE.date, today, ctx, env))?.[symbol];
    if (h) { nextE.hour = h; nextE.hs = "n"; }
  }
  // Past prints: Nasdaq gives the report dates (newest first).
  const rows: any[] = nasdaq?.data?.earningsSurpriseTable?.rows ?? [];
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
  // 0060: the two calendars give the next report different sessions (and no company notice settles it). Neither
  // feed wins blindly: the stock's own past moves say which day the market reacts on, or the moves read "—".
  // The contest is remembered per company (MS_KEY) past the report day: once the date passes, Finnhub's `symbol=`
  // drops the row and Nasdaq wipes its session, so neither feed can show it again, and a Nasdaq timeout must not
  // bring back one feed's session as fact.
  let contest: ContestMemo | null = nextE && !nextE.source && isContested(fhNextHour, nqOnNext) ? { date: nextE.date, feed: fhNextHour as Session, nasdaq: nqOnNext as Session } : null;
  if (contest) ctx.waitUntil(putJson(MS_KEY(symbol), contest, MS_TTL));
  else {
    const memo = await readJson<ContestMemo>(MS_KEY(symbol));
    // Only while nothing current answers it: the report it was about has passed (and the company didn't date it
    // since), or it's still ahead and Nasdaq can't say right now. A current agreement always wins.
    const settled = !!nextE && nextE.date === memo?.date && (!!nextE.source || (nqOnNext === "bmo" || nqOnNext === "amc"));
    const ov = memo ? activeOverrides(OVERRIDES, today)[symbol] : undefined;
    if (memo && !settled && !(ov && ov.date === memo.date) && memo.date >= addDays(today, -MS_DAYS) && (memo.date < today || memo.date === nextE?.date)) contest = memo;
  }
  const contested = !!contest;
  // 0086: a projected next report whose feed session the company's last dated report contradicts (TGT, TJX: "after
  // close" in March, every report before the open) shows the session the stock's own past moves back, marked as the
  // usual time, or none. Never the feed's guess, and that guess never decides the day past moves are measured on.
  const pastDates = rows.map((r) => nqDate(r.dateReported)).filter((d): d is string => d != null);
  const settleProjected = (row: any, lastHour: string | undefined): Session | null => {
    if (!projectedTimed(row, today)) return null;
    const fix = projectedSession(row.hour, lastHour, pastDates, closeOn);
    if (fix == null) return null;
    // In place, like 0050's fill: from here on the row's session is the one shown (the feed's is in `fhNextHour`).
    row.hour = fix;
    if (fix) row.hs = "h"; else delete row.hs;
    return fix;
  };
  const projectedNext = !contest && projectedTimed(nextE, today);
  const lastHour = projectedNext ? await lastReportedHour(symbol, lastE, today, pastDates) : undefined;
  const nextFix = projectedNext ? settleProjected(nextE, lastHour) : null;
  // 0088: an unsettled projection ("") shows no session, but it is no evidence against the reports the company dated
  // (TJX, JD, XPEV): past moves keep the last dated report's session first (Nasdaq's listing for a far-out projected
  // day is a projection too, so it never outranks a dated report), then Nasdaq's, else unknown.
  let habit: Session = contest
    ? contestedSession(contest.feed, contest.nasdaq, rows.map((r) => nqDate(r.dateReported)).filter((d): d is string => d != null), closeOn)
    : nextFix === "" ? sessionHabit(lastHour ?? lastE?.hour, nqNextHour, undefined) : sessionHabit(nextE?.hour, nqNextHour, lastE?.hour);
  // 0090: any other unknown next session (DELL's date-only notice, a blank feed time) once `symbol=` has dropped the
  // last print: the cached last report (cache only), Nasdaq's, then the stock's own moves (3 of 4), else unknown. A
  // contested session stays as 0060 settled it.
  if (!habit && !contest) habit = pastSession(sessionlessDated(symbol, today) ? undefined : lastHour ?? (await lastReportedHour(symbol, lastE, today, pastDates)), nqNextHour, pastDates, closeOn);
  // The last print's estimate as it stood before the report (0035), when the calendar recorded it.
  const lastSnapRaw = lastE ? (await readSnap(lastE.date))[symbol]?.eE ?? null : null;
  const lastSnap = sameEpsUnit(symbol, lastSnapRaw, lastE?.epsEstimate) ? lastSnapRaw : null;

  // Finnhub's estimates for foreign filers are in the reporting currency; Nasdaq's history is USD.
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
  // 0078: no future feed row at all (the quarter's projected day passed and `symbol=` dropped it): the newest cached
  // row after the last report is the quarter still to come, so the sheet never goes blank before Nasdaq's day.
  const orphan = !nextE && reportedDates.length >= 2 ? await newestRow(symbol, lookbackDays(today, addDays(reportedDates[0], 30))) : null;
  const skip = skippedQuarter(nextE, reportedDates) ?? passedQuarter(orphan, reportedDates);
  let pending: { quarter: number; year: number; passed: string; hour: Session; eE: number | null; rE: number | null } | null = null;
  let skipRow: EarningsEvent | null = null;
  let companyDated = false;
  let skipContested: { date: string; session: Session } | null = null;
  let skipChecking = false;
  if (skip) {
    let row = !nextE && orphan ? orphan : await passedRow(symbol, skip, lookbackDays(today, addDays(reportedDates[0], 45)));
    // 0080: the cached calendar row keeps the feed's figures; the same history check withholds them here.
    if (row && (row.eA != null || row.rA != null) && phantomReport(row.d, nqHist, today, row.o) && (row.nx || (await nasdaqDayOmits(symbol, row.d, today, ctx)))) row = settleFiguresRow(row, nqHist, today);
    skipRow = row;
    // Only call it pending when the calendar shows the quarter's day passed at least two trading days ago with no
    // figures. A fresher row, a row with figures, or no row at all (this colo never cached it) can just be a feed
    // that's a day behind a normal report, and that must not read as a missed report.
    // A company-announced date for this quarter that has passed means it reported on that day (AXON, Nov 5),
    // whatever the cached Finnhub projection (Nov 2) says: the feeds are only behind.
    const ov = activeOverrides(OVERRIDES, today)[symbol];
    companyDated = !!ov && ov.quarter === skip.quarter && ov.year === skip.year;
    // 0078: Nasdaq still lists this quarter on a later day (and the company hasn't dated it): the passed feed day
    // is contested, not missed and not "results expected". Same check as the calendar's row (crossOne's past path).
    // 0083: a cold window is no evidence either way, so the row is "still checking", never "results expected".
    if (!companyDated && row && row.eA == null && row.rA == null && !row.od) {
      const w = nqWin ?? (await nasdaqWindow(today, ctx, false, undefined, env).catch(() => null));
      if (w && !w.stale?.length) seen.push({ s: symbol, d: row.d, c: crossOne(symbol, row.d, (row.h ?? "") as Session, w), clear: windowCovered(w, today) });
      const st = dayStanding(symbol, row.d, (row.h ?? "") as Session, w, windowCovered(w, today) ? null : await memosOf(), today);
      if (st.k === "contested") skipContested = { date: st.c.xd!, session: st.c.xh ?? "" };
      // Positive evidence that's usually cached already (0080's day read): Nasdaq's own calendar lists the company on
      // the feed's day, so that was the report day and the figures are just late.
      else if (st.k === "checking") skipChecking = !(await nasdaqDayLists(symbol, row.d, today, ctx));
    }
    if (!companyDated && !skipContested && row && row.eA == null && row.rA == null && tradingDaysSince(row.d, today) >= 2) {
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
  // 0078: Nasdaq lists the report on another day and the company hasn't dated it: the feed's day coming isn't a
  // report day, so it stays an unconfirmed date (with Nasdaq's day named below), never "results expected".
  // 0083: the same question when the window is cold: a contest another read saw still counts, and a day nothing can
  // rule a contest out for yet is "still checking" once its session passes, not "results expected".
  const todayStanding = !!nextE && nextE.date === today && !nextE.source && nextE.epsActual == null && nextE.revenueActual == null
    ? dayStanding(symbol, today, (nextE.hour || "") as Session, nqWin, nqWin && windowCovered(nqWin, today) ? null : await memosOf(), today)
    : null;
  const todayContested = todayStanding?.k === "contested";
  if (nextE && nextE.date === today && !todayContested) {
    const row = await passedRow(symbol, nextE, [today]);
    const snapRaw = (await readSnap(today))[symbol]?.eE;
    const snapE = sameEpsUnit(symbol, snapRaw, nextE.epsEstimate ?? row?.eE) ? snapRaw : undefined;
    const day: DayRow = {
      // 0084: a company-dated day keeps the company's session, even none (a call time alone isn't one): the raw
      // day row still carries the feed's old session (HP: "after close" on a day the call is at 10 a.m.).
      date: today, hour: (nextE.source ? nextE.hour : nextE.hour || row?.h) || "", quarter: nextE.quarter, year: nextE.year,
      eE: row?.eE ?? snapE ?? nextE.epsEstimate ?? null, eA: nextE.epsActual ?? row?.eA ?? null,
      rE: row?.rE ?? nextE.revenueEstimate ?? null, rA: nextE.revenueActual ?? row?.rA ?? null,
      ...(row?.nE != null ? { nE: row.nE } : {}),
      ...(row && row.nA !== undefined ? { nA: row.nA } : {}),
      ...(row?.pr ? { pr: row.pr } : {}),
    };
    outcome = reportOutcome(day, today, nowMin);
  } else if (skip && skipRow && !pending && !companyDated && !skipContested) {
    outcome = reportOutcome({ date: skipRow.d, hour: skipRow.h ?? "", quarter: skip.quarter, year: skip.year, eE: skipRow.eE ?? null, eA: skipRow.eA ?? null, rE: skipRow.rE ?? null, rA: skipRow.rA ?? null, ...(skipRow.nE != null ? { nE: skipRow.nE } : {}), ...(skipRow.nA !== undefined ? { nA: skipRow.nA } : {}), ...(skipRow.pr ? { pr: skipRow.pr } : {}) }, today, nowMin);
  }
  // 0087: a reported row this colo hasn't judged against the pre-report bar (a cold day cache, so Finnhub's estimate as
  // revised after the print, or a day cached while Nasdaq was down) goes through the calendar's own step, so the sheet,
  // its history row and the unfurl quote the estimate the calendar judges with (TGT $2.05, not $2.09).
  if (outcome?.kind === "reported" && !outcome.row.pr) outcome = { kind: "reported", row: await preReportRow(symbol, outcome.row, today, ctx) };
  // 0083: fail closed. A figure-less feed day whose Nasdaq contest can't be ruled out isn't stated as a missed report.
  let checking: DayRow | null = null;
  if (outcome?.kind === "results-pending" && (outcome.row.date === today ? todayStanding?.k === "checking" : skipChecking)) { checking = outcome.row; outcome = null; }
  const reported = outcome?.kind === "reported" ? outcome.row : null;
  const duePending = outcome?.kind === "results-pending" ? outcome.row : null;
  // What the sheet calls "next": after a same-day report, the following quarter (if the feed lists one).
  const upNext = reported && nextE && reported.date === nextE.date
    ? cal.filter((e) => e.date > today && !(e.quarter === nextE.quarter && e.year === nextE.year)).sort((a, b) => a.date.localeCompare(b.date))[0]
    : duePending || checking ? undefined
    // 0078: the skipped quarter's contested feed day stays the "next" report, with Nasdaq's day named.
    : skipContested && skipRow ? { date: skipRow.d, hour: skipRow.h ?? "", quarter: skip!.quarter, year: skip!.year, epsEstimate: skipRow.eE ?? null, revenueEstimate: skipRow.rE ?? null }
    : nextE;
  // 0086: after a same-day report, the following quarter's projection is checked against the report just out.
  if (reported && upNext && upNext !== nextE) settleProjected(upNext, reported.hour);

  // 0057: a dated row's own session, else the habit. A company-dated row (override) without a session is unknown:
  // never filled from a feed's guess.
  // 0060: under a contested session, a feed row's own session is that same feed's word, so the inferred habit stands.
  const ownSession = (row: { hour?: string; source?: unknown }): Session => row.source ? ((row.hour || "") as Session) : contested ? habit : (row.hour as Session) || habit;
  // Past prints: Nasdaq gives report dates; Finnhub gives estimate/actual. Join on order (both newest-first).
  // Finnhub figures only fill gaps when they're in dollars too.
  const history: Reaction[] = [];
  // 0058: each row's actual as Finnhub reports it (the company's measure, the basis of Finnhub's upcoming estimate).
  const fhActual = new Map<Reaction, number | null>();
  const keep = (h: Reaction, fa: unknown) => { fhActual.set(h, typeof fa === "number" && Number.isFinite(fa) ? fa : null); return h; };
  const reportedOn = (r: any) => { const [mm, dd, yy] = String(r.dateReported).split("/"); return `${yy}-${(mm ?? "").padStart(2, "0")}-${(dd ?? "").padStart(2, "0")}`; };
  const recent = rows.slice(0, 8);
  // 0096: Finnhub's quarter for each row (CRWD "Jul 2026" ↔ "2026-09-30", fiscal Q2 2027), checked against the
  // calendar's own fiscal numbering for this company.
  const anchor = nextE ?? lastE ?? null;
  const fhQuarter = matchQuarters(recent.map((r: any) => ({ key: periodKey(r.fiscalQtrEnd), reported: reportedOn(r) })), surprises, anchor);
  // 0096: rows whose pair is Nasdaq's alone (no Finnhub figure for the quarter), for the basis check below.
  const nasdaqOnly = new Set<Reaction>();
  recent.forEach((r, i) => {
    const date = reportedOn(r);
    // One consensus per quarter: Finnhub's (the calendar's) when we have it for this quarter, else Nasdaq's.
    const f = !usd ? undefined
      : lastE && lastE.date === date && lastE.epsEstimate != null ? { estimate: lastE.epsEstimate, actual: lastE.epsActual }
      // 0096 review: a matched Finnhub quarter whose actual agrees with Nasdaq's is the same basis, so Nasdaq's own
      // pair stands (0094's turnarounds, KSS/M): Finnhub's estimate may have been revised after the print. Finnhub's
      // pair only takes over when the actuals are on different bases (CRWD $0.01 against $0.31).
      : fhQuarter[i] && sameActual(parseFloat(String(r.eps)), typeof fhQuarter[i]!.actual === "number" ? fhQuarter[i]!.actual as number : null) ? undefined
      : fhQuarter[i];
    // That date's own session when the calendar has it, else the habit; unknown stays unknown (move "—").
    const session: Session = lastE && lastE.date === date ? ownSession(lastE) : habit;
    const move = reactionMove(session, date, closeOn);
    const pick = pickConsensus({ estimate: r.consensusForecast, actual: r.eps, surprisePct: r.percentageSurprise }, f, lastE && lastE.date === date ? lastSnap : null);
    // 0049: an actual on another basis from its estimate gets no surprise; Nasdaq's consensus stands in when it matches.
    const nE = typeof r.consensusForecast === "number" ? r.consensusForecast : parseFloat(r.consensusForecast);
    // 0094: Nasdaq's estimate with Nasdaq's own actual is one table's pair: a turnaround is judged, not "basis differs".
    const sameSource = pick.source === "nasdaq" && pick.epsA != null && pick.epsA === parseFloat(String(r.eps));
    const h = keep(judgeReaction({ date, session, period: r.fiscalQtrEnd, epsE: pick.epsE, epsA: pick.epsA, surprisePct: pick.surprisePct, move } as Reaction, Number.isFinite(nE) ? nE : null, reit, undefined, sameSource), f ? f.actual : fhQuarter[i]?.actual);
    if (sameSource && f?.actual == null && fhQuarter[i]?.actual == null) nasdaqOnly.add(h);
    history.push(h);
  });
  // 0096: Nasdaq's own pairs on a GAAP-style basis (SNOW, ZS, CRWD, ASAN) beside an adjusted next estimate: not a
  // beat record. The test reads every Nasdaq actual in the table, also the quarters Finnhub covers, and Finnhub's own actuals where it has them. Those
  // rows read "basis differs" instead of turning real beats into misses.
  const nextEst = duePending ? duePending.eE : checking ? checking.eE : pending ? pending.eE : upNext?.epsEstimate;
  if (usd && !reit && nasdaqOnly.size && nasdaqHistoryOffBasis(recent.map((r: any) => parseFloat(String(r.eps))), nextEst, recent.map((r: any, i) => ({ nq: Number.isFinite(parseFloat(String(r.eps))) ? parseFloat(String(r.eps)) : null, fh: typeof fhQuarter[i]?.actual === "number" ? fhQuarter[i].actual : null })))) {
    for (const h of nasdaqOnly) Object.assign(h, { surprisePct: null, basis: "differs" as const });
  }
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
  // 0087: not the report that's just out: its judged row (below) heads the history instead of the feed's revised estimate.
  if (usd && lastE && lastE.epsActual != null && !history.some((h) => h.date === lastE.date) && !(reported && Math.abs(daysApart(reported.date, lastE.date)) <= 3)) {
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

  // 0100: a non-dollar reporter's newest report takes the calendar's own-currency pair (one report, one answer), and
  // Nasdaq's older dollar pairs count only when its newest actual matches the company's figure in dollars.
  if (!usd && history.length) {
    const top = history.find((h) => h.date.length === 10);
    // The calendar's own cached row (the same pair /api/calendar serves for that day).
    const calRow = top ? await calendarRowNear(symbol, top.date) : null;
    if (top && calRow && calRow.eE != null && calRow.eA != null && !(calRow.ec && calRow.ec !== currency)) {
      // A just-reported row has no Nasdaq actual to test, so no rate is needed (and Yahoo isn't asked).
      const perUsd = top.epsA == null ? null : await fxPerUsd(currency, periodEnd(top.period) ?? top.date, symbol, ctx);
      const next = companyCurrencyPairs(history, calRow, currency, perUsd, (h) => judgeReaction(h, null, reit), symbol);
      next.forEach((h, i) => { if (h !== history[i]) keep(h, h.cur ? null : fhActual.get(history[i]) ?? null); });
      history.splice(0, history.length, ...next);
    }
  }

  const judged = history.filter((h) => h.epsA != null && h.epsE != null && !h.basis);
  const beats = judged.filter((h) => (h.epsA as number) >= (h.epsE as number)).length;
  const beatRate = judged.length ? { beats, total: judged.length } : null;
  // 0096: one judged quarter (CRWD once its GAAP-style rows are set aside) isn't a habit: the setup grade's track
  // record factor waits for two.
  const moves = history.map((h) => h.move).filter((m): m is number => m != null);
  const expectedMove = typicalMove(moves); // 0088: never an average of one or two reports

  // 0098: a quarter Finnhub reports in dollars beside yuan quarters (PDD, BABA) is dropped from the bars, and the TTM
  // growth it skews is unavailable rather than an F.
  const brk = currencyBreak(quarterly, currency);
  // 0101: a newest quarter in another currency also skews the quarterly price-to-book (about the ADS ratio too high).
  const noPb = dropsPb(metric?.metric, brk);
  const ungraded = [brk.growthBroken && "growth", noPb && "price-to-book"].filter(Boolean);
  if (brk.off.length) warnings.push(`${brk.off.length === 1 ? "One quarter" : `${brk.off.length} quarters`} the data feed reported in another currency ${brk.off.length === 1 ? "is" : "are"} left out of the quarterly figures${ungraded.length ? `, and ${ungraded.join(" and ")} ${ungraded.length > 1 ? "aren't" : "isn't"} graded` : ""}.`);
  const compass = metric?.metric ? compassGrade(sanitizeMetric(metric.metric, brk)) : { score: null, grade: null, factors: [] };
  const setup = chart && chart.c.length > 60
    ? setupGrade({ close: chart.c, high: chart.h, low: chart.l, beatRate: beatRate && beatRate.total >= MIN_BEAT_RECORD ? beatRate.beats / beatRate.total : null })
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
  const ffo = reit && reitEstimateOffBasis(history, duePending ? duePending.eE : checking ? checking.eE : pending ? pending.eE : upNext?.epsEstimate);
  const read: string[] = [];
  // A projected date on a closed-market day isn't a date yet (0045): say so instead of stating it.
  const closed = upNext && !upNext.source && !pending ? closedDay(upNext.date) : null;
  const longDay = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
  const out = reported || duePending || checking;
  const projected = !!upNext && !pending && !duePending && !closed && isProjected({ date: upNext.date, session: upNext.hour || "", source: upNext.source }, today);
  // 0015: name Nasdaq's day when it lists the next report elsewhere (the date itself stays the feed's).
  let nqNext: { date: string; session: Session } | undefined = skipContested ?? undefined;
  if (upNext && upNext === nextE && !duePending && !pending && !reported && !upNext.source && !closed) {
    const c = nqWin ? crossOne(symbol, upNext.date, (upNext.hour || "") as Session, nqWin) : null;
    if (c && !nqWin?.stale?.length) seen.push({ s: symbol, d: upNext.date, c, clear: windowCovered(nqWin, today) });
    // 0083: a cold window keeps the day contest an earlier read saw (from any colo).
    const use = c ?? (windowCovered(nqWin, today) ? null : memoCross(await memosOf(), symbol, upNext.date, today));
    if (use?.x === "differs" && use.xd) nqNext = { date: use.xd, session: use.xh ?? "" };
  }
  // 0099: the feed's timeless projection against Nasdaq's timed listing on another day: Nasdaq's day leads, unconfirmed.
  // Also once the feed's day has come or passed with no figures (0078's contest), until Nasdaq's own day passes.
  const leadNq = upNext && nqNext && !pending && !duePending && !checking && !closed && leadsNasdaq({ date: upNext.date, session: upNext.hour || "", source: upNext.source }, nqNext, today) ? nqNext : undefined;
  // 0104: the feed's timed session against Nasdaq's other session on the same day, with every recent report (at least
  // 3 measured) moving on Nasdaq's: Nasdaq's session leads (expected, the company hasn't said), the feed's is named.
  // A company date never gets here (`source`), and a Nasdaq listing on another day isn't this rule (0099/0078).
  // Only for a day still ahead: on the report day the 0039/0083 states follow the feed's session, so the time goes
  // back to "unconfirmed" there rather than headline a session that may already have passed.
  const leadable = !!upNext && upNext === nextE && !upNext.source && !pending && !duePending && !checking && !closed && !projected && !leadNq && upNext.date > today
    && (upNext.hour === "bmo" || upNext.hour === "amc") && (!nqNext || nqNext.date === upNext.date);
  // Review: only Nasdaq's live listing for that day counts as current evidence (never 0060's cached contest): a blank
  // session, or no listing, there drops the verdict, as the calendar's cross-check would.
  const nqLoaded = !!upNext && (!!nqNextDay || !!nqWin?.loaded.includes(upNext.date));
  // 0114: a timeless date inside the window whose Nasdaq day couldn't be read on this request: it is projected only for
  // want of a check, so it's said to be "being checked" (and re-read in 30 s), never "not yet confirmed" on an unfurl.
  const timeUnchecked = projected && upNext === nextE && !upNext.source && !upNext.hour && upNext.date > today && upNext.date <= windowEnd(today) && !nqLoaded && !nqNext;
  const liveContest = leadable && nqLoaded && isContested(upNext!.hour, nqOnNext);
  const leadNow = liveContest && nasdaqSessionLeads(upNext!.hour, nqOnNext, pastDates, closeOn) ? { h: nqOnNext as "bmo" | "amc", f: upNext!.hour as "bmo" | "amc" } : null;
  let sessionLead: { h: "bmo" | "amc"; f: "bmo" | "amc" } | null = leadNow;
  if (leadable) {
    const leads = await readLeads(env);
    const known = leadFor(leads, symbol, upNext!.date, upNext!.hour as string, today);
    // Recorded (or dropped) only on current evidence: Nasdaq's day loaded and, for a live contest, the price history.
    if (nqLoaded && (!liveContest || chart) && (leadNow || known)) rememberLead(env, ctx, leads, symbol, upNext!.date, leadNow, today);
    // Nasdaq's day couldn't be read, or the price history is down mid-contest: the shared verdict stands, as on the calendar.
    if (!leadNow && known && (!nqLoaded || (liveContest && !chart && nqOnNext === known.h))) sessionLead = { h: known.h, f: known.f };
  }
  // Only when there's something a memo could change: a contest, or current evidence against one.
  if (seen.some((x) => x.clear || x.c?.x === "differs" || x.c?.x === "agree")) rememberContests(env, ctx, await memosOf(), seen, today);
  // 0091: an upcoming report with no session (DELL's date-only notice, a blank feed time) says when the company has
  // usually reported, only when the stock's own moves settle it (3 of 4) and agree with the habit past moves use. Not
  // for a projection, a closed day, a Nasdaq disagreement or a contest: those already say why the time is open.
  const usual = upNext && !upNext.hour && !pending && !duePending && !checking && !closed && !projected && !nqNext && !contest ? usualSession(habit, pastDates, closeOn) : null;
  // 0091: the company's call time, from its notice, under a company date (never turned into a session).
  const ovNext = upNext?.source ? activeOverrides(OVERRIDES, today)[symbol] : undefined;
  const call = ovNext && ovNext.date === upNext!.date ? ovNext.call : undefined;
  if (reported) read.push(reportedLine(name, { date: reported.date, session: reported.hour, quarter: reported.quarter, epsE: reported.eE, epsA: reported.eA, nE: usd ? reported.nE : undefined, nA: usd ? reported.nA : undefined, reit }, today, (v) => epsIn(v, currency)));
  if (checking) {
    read.push(`${name}'s Q${checking.quarter} report: our data feed dated it ${longDay(checking.date)}${checking.hour ? ` ${WHEN_LONG[checking.hour as Session] ?? ""}` : ""}, and no results are in our data yet. We're still comparing that date with Nasdaq's calendar, so it may not have been the report day.`);
  } else if (duePending) {
    read.push(pendingLine(name, { date: duePending.date, session: duePending.hour, quarter: duePending.quarter }, today));
    if (duePending.eE != null && !ffo) read.push(`The estimate going in was ${epsIn(duePending.eE, currency)} a share.`);
  } else if (pending) {
    read.push(`${name}'s Q${pending.quarter} report date is not confirmed yet: the data feed expected it on ${longDay(pending.passed)} and has no results yet.`);
  } else if (upNext && closed) {
    read.push(`${name}'s Q${upNext.quarter} report date is not confirmed yet: the data feed projects ${longDay(upNext.date)}, when the market is closed (${closed}).`);
  } else if (upNext && projected && !nqNext) {
    // 0007: the feed's projection, not the company's date: "expected around", and no session stated as fact.
    read.push(`${name}${reported ? "'s next report" : `'s Q${upNext.quarter} report`} is expected around ${longDay(upNext.date)}, but we haven't found the company's announcement of the date yet.`);
  } else if (upNext && leadNq) {
    read.push(`Nasdaq's calendar lists ${name}${reported ? "'s next report" : `'s Q${upNext.quarter} report`} on ${longDay(leadNq.date)} ${WHEN_LONG[leadNq.session]}, but that's unconfirmed: our data feed projects ${longDay(upNext.date)}, and we haven't found a company announcement of the date.`);
  } else if (upNext && nqNext && nqNext.date !== upNext.date && upNext.date <= today) {
    // 0078: the feed's day has come, Nasdaq lists another, the company hasn't said: no "reports today", no "expected".
    read.push(`${name}'s Q${upNext.quarter} report date isn't confirmed: our data feed put it on ${longDay(upNext.date)}, but Nasdaq's calendar lists ${longDay(nqNext.date)}${nqNext.session ? ` ${WHEN_LONG[nqNext.session]}` : ""}, and no results are in our data yet.`);
  } else if (upNext && sessionLead) {
    // 0104: Nasdaq's session leads; the feed's is named as the disagreement, and nothing reads as the company's word.
    read.push(`${name}${reported ? "'s next report is" : " reports"} Q${upNext.quarter} on ${longDay(upNext.date)} ${WHEN_LONG[sessionLead.h]} (expected; we haven't found a company announcement yet): that's when Nasdaq's calendar lists it, and the stock's moves after its recent reports all fit that time. Our data feed says ${WHEN_LONG[sessionLead.f]}.`);
  } else if (upNext) {
    const when = upNext.hour ? `${WHEN_LONG[upNext.hour as Session] ?? ""}${upNext.hs === "n" && !nqNext ? " (expected; we haven't found a company announcement yet)" : ""}` : nqNext ? "" : usual ? `(time not announced; going by its last reports, it usually reports ${WHEN_LONG[usual]})` : timeUnchecked ? "(the time is still being checked against Nasdaq's calendar)" : "(time not yet confirmed)";
    // 0059: a date Nasdaq lists elsewhere is said to be unconfirmed, as on the calendar.
    const nqWhen = nqNext ? (nqNext.date === upNext.date ? (nqNext.session ? `it ${WHEN_LONG[nqNext.session]} that day` : "it at another time that day") : `${longDay(nqNext.date)}${nqNext.session ? ` ${WHEN_LONG[nqNext.session]}` : ""}`) : "";
    // 0062: same day, other session: lead with the day and call the time unconfirmed, as the sheet's headline does.
    if (nqNext && nqNext.date === upNext.date && nqNext.session && upNext.hour && nqNext.session !== upNext.hour)
      read.push(`${name}${reported ? "'s next report is" : " reports"} Q${upNext.quarter} on ${longDay(upNext.date)}, time unconfirmed: our data feed says ${WHEN_LONG[upNext.hour as Session]}, Nasdaq's calendar ${WHEN_LONG[nqNext.session]}.`);
    else read.push(`${name}${reported ? "'s next report is" : " reports"} Q${upNext.quarter} on ${longDay(upNext.date)} ${when}${nqNext ? `, but that's unconfirmed: Nasdaq's calendar lists ${nqWhen}` : ""}.`.replace(" .", ".").replace(" ,", ","));
  }
  const estLine = duePending || checking ? null
    : ffo ? ((pending ? pending.eE : upNext?.epsEstimate) != null ? `${name} is a REIT whose recent results came in on a different measure from the feed's estimate (usually funds from operations against net income a share), so we don't quote the estimate as the bar.` : null)
    // 0058: last quarter's actual on the upcoming estimate's basis (Finnhub's), never Nasdaq's ($2.95 vs $1.84 for AMD).
    : readEstimate(name, pending ? pending.eE : upNext?.epsEstimate, currency, history[0] ? fhActual.get(history[0]) ?? null : null);
  if (estLine) read.push(estLine);
  if (beatRate) read.push(`It has beaten the estimate in ${beats} of its last ${judged.length} reports.`);
  // 0060: say how past moves were measured when the two calendars disagree on the time.
  if (contested && chart && history.length) read.push(habit
    ? `The two calendars disagree on the time, so past moves are measured on the day the stock has usually moved: ${habit === "bmo" ? "the report day, as for a report before the open" : "the day after, as for a report after the close"}.`
    : "The two calendars disagree on the time, and the stock's past moves don't settle it, so we can't tell which day the market reacted.");
  if (expectedMove != null) read.push(`The stock has moved about ±${expectedMove.toFixed(1)}% on a typical report${out ? "." : " — that's the size of swing to be ready for."}`);
  // 0044: an overdue quarter (pending) may already have reported, so it isn't "going into the report".
  const trendRead = setup.grade && !out ? trendLine(setup.trend, !!upNext && !pending) : null;
  if (trendRead) { read.push(trendRead); const r = rsiLine(setup.rsi); if (r) read.push(r); }
  if (compass.grade) read.push(`As a long-term holding it grades ${compass.grade} on Compass quality.`);


  const body: TickerResponse = {
    symbol,
    profile: profile?.name ? { name: profile.name, logo: profile.logo, industry: profile.finnhubIndustry, country: profile.country, web: profile.weburl, ...profileCap(U[symbol], profile, chart), exchange: profile.exchange, ipo: profile.ipo } : null,
    quote: quote?.c ? { price: quote.c, change: quote.d, changePct: quote.dp, prevClose: quote.pc, asOf: quote.t } : null,
    next: checking ? { date: checking.date, session: checking.hour as Session, quarter: checking.quarter, year: checking.year, epsE: checking.eE, revE: checking.rE, currency, status: "checking" }
      : duePending ? { date: duePending.date, session: duePending.hour as Session, quarter: duePending.quarter, year: duePending.year, epsE: duePending.eE, revE: duePending.rE, currency, status: "results-pending" }
      : pending ? { date: pending.passed, session: pending.hour, quarter: pending.quarter, year: pending.year, epsE: pending.eE, revE: pending.rE, currency, overdue: true }
      : upNext && leadNq ? { date: leadNq.date, session: leadNq.session, quarter: upNext.quarter, year: upNext.year, epsE: upNext.epsEstimate, revE: upNext.revenueEstimate, currency, hs: "n", feedDay: upNext.date }
      : upNext && sessionLead ? { date: upNext.date, session: sessionLead.h, quarter: upNext.quarter, year: upNext.year, epsE: upNext.epsEstimate, revE: upNext.revenueEstimate, currency, hs: "n", feedSession: sessionLead.f }
      : upNext ? { date: upNext.date, session: (upNext.hour || "") as Session, quarter: upNext.quarter, year: upNext.year, epsE: upNext.epsEstimate, revE: upNext.revenueEstimate, currency, ...(upNext.source ? { confirmed: upNext.source } : {}), ...((upNext.hs === "n" || (upNext.hs === "h" && !upNext.source)) && upNext.hour ? { hs: upNext.hs as "n" | "h" } : {}), ...(closed ? { closed } : {}), ...(nqNext ? { nasdaq: nqNext } : {}), ...(projected ? { projected: true as const } : {}), ...(timeUnchecked ? { unchecked: true as const } : {}), ...(usual ? { usual } : {}), ...(call ? { call } : {}) } : null,
    ...(reported && tradingDaysSince(reported.date, today) <= JUST_DAYS ? { justReported: { date: reported.date, session: reported.hour as Session, quarter: reported.quarter, year: reported.year, epsE: reported.eE, epsA: reported.eA, currency, ...(usd && reported.nE != null ? { nE: reported.nE } : {}), ...(usd && reported.nA !== undefined ? { nA: reported.nA } : {}), ...(reit ? { reit: true as const } : {}) } } : {}),
    compass, setup, history, expectedMove, beatRate, street,
    ...(contest && chart ? { moveSession: { feed: contest.feed, nasdaq: contest.nasdaq, session: habit } } : {}),
    spark: chart ? chart.c.slice(-126) : [],
    chart: chart ? shapeChart(chart.t, chart.c) : null,
    quarters: quartersFrom(withoutOff(quarterly, brk.off), profile?.shareOutstanding ?? null),
    read, warnings,
  };
  if (ffo && body.next) body.next.epsBasis = "ffo";
  return body;
}

/** 0100: the calendar's cached row for `symbol`'s report on `day`, or a day either side (the feed's day can be one off
 *  Nasdaq's). Cache only, read in order and stopping at the first row with figures: only non-dollar sheets ask. The
 *  last good copy only for the day itself, so a cold sheet costs at most 4 cache reads (the 50-per-request cap). */
async function calendarRowNear(symbol: string, day: string): Promise<{ d: string; eE: number | null; eA: number | null; ec?: string } | null> {
  // 0103: the report the calendar confirmed on Nasdaq's day comes first: a twin cached next door (another basis, a
  // day off) must never stand in for it on the sheet (review of #188).
  if (symbol in ADS_SHARES) {
    const memo = await readAdsMemo();
    for (const d of [day, addDays(day, -1), addDays(day, 1)]) {
      const r = memo[adsMemoKey(symbol, d)]?.row;
      if (r && r.eA != null) return { d, eE: r.eE ?? null, eA: r.eA ?? null, ...(r.ec ? { ec: r.ec } : {}) };
    }
  }
  for (const d of [day, addDays(day, -1), addDays(day, 1)]) {
    try {
      const hit = (await caches.default.match(CAL_DAY(d))) ?? (d === day ? await caches.default.match(CAL(`cal:stale:v3:${d}`)) : undefined);
      const e = hit ? ((await hit.json()) as EarningsEvent[]).find((x) => x.s === symbol && x.eA != null) : undefined;
      if (e) return { d, eE: e.eE ?? null, eA: e.eA ?? null, ...(e.ec ? { ec: e.ec } : {}) };
    } catch { /* an unreadable day says nothing */ }
  }
  return null;
}

/** 0100: units of `cur` per US dollar on `day` (Yahoo's `CNY=X` close on or before it), else the universe's refreshed
 *  rate, else null (then nothing is shown to agree). */
async function fxPerUsd(cur: string, day: string, symbol: string, ctx: ExecutionContext): Promise<number | null> {
  if (/^[A-Z]{3}$/.test(cur)) {
    try {
      const fx = await candles(`${cur}=X`, "1y", ctx);
      const rate = rateOn(fx.t, fx.c, day);
      if (rate != null) return rate;
    } catch { /* fall through */ }
  }
  const usdPer = (U[symbol] as { fx?: number; mcCur?: string } | undefined);
  return usdPer?.fx && usdPer.fx > 0 && usdPer.mcCur === cur ? 1 / usdPer.fx : null;
}

/** The newest cached calendar row for `symbol` on `days` (newest first), whatever its quarter. */
async function newestRow(symbol: string, days: string[]): Promise<EarningsEvent | null> {
  const found = await Promise.all(days.map(async (d) => {
    try {
      const hit = (await caches.default.match(CAL_DAY(d))) ?? (await caches.default.match(CAL(`cal:stale:v3:${d}`)));
      return hit ? ((await hit.json()) as EarningsEvent[]).find((x) => x.s === symbol) ?? null : null;
    } catch { return null; } // an unreadable day says nothing
  }));
  return found.find((e) => e != null) ?? null;
}

/** 0092: how many weekdays ahead (today first) the calendar's cached days are read for a sheet whose `symbol=` failed,
 *  and for how many of them a cold day falls back to the last good copy (the nearest days, where peak week is). */
const CAL_NEXT_DAYS = 10;
const CAL_NEXT_STALE_DAYS = 5;
/**
 * 0092: the next report as the calendar's cached days list it (fresh, else the last good copy for the nearest days), in
 * `symbol=`'s shape. Cache only, read in order and stopping at the first upcoming row: a reporter this week costs a few
 * reads, a company nothing lists at most CAL_NEXT_DAYS + CAL_NEXT_STALE_DAYS. The sheet was already near the 0085
 * per-request cache-read budget, so don't widen this. A row with today's figures is kept and the scan goes on for the
 * report after it.
 */
async function calendarNext(symbol: string, today: string): Promise<any[]> {
  const days: string[] = [];
  for (let i = 0; days.length < CAL_NEXT_DAYS; i++) {
    const d = addDays(today, i);
    const wd = new Date(d + "T12:00:00Z").getUTCDay();
    if (wd !== 0 && wd !== 6) days.push(d);
  }
  const out: any[] = [];
  for (const [i, d] of days.entries()) {
    try {
      const hit = (await caches.default.match(CAL_DAY(d))) ?? (i < CAL_NEXT_STALE_DAYS ? await caches.default.match(CAL(`cal:stale:v3:${d}`)) : undefined);
      const e = hit ? ((await hit.json()) as EarningsEvent[]).find((x) => x.s === symbol && x.d >= today) : undefined;
      if (!e) continue;
      out.push({ symbol, date: e.d, hour: e.h ?? "", quarter: e.q, year: e.y, epsEstimate: e.eE ?? null, epsActual: e.eA ?? null, revenueEstimate: e.rE ?? null, revenueActual: e.rA ?? null });
      if (e.eA == null && e.rA == null) break;
    } catch { /* an unreadable day says nothing */ }
  }
  return out;
}

/** 0086: a report the feed projects (no company date, not on a closed day) with a timed session the last report could contradict. */
function projectedTimed(row: any, today: string): boolean {
  return !!row && !row.source && (row.hour === "bmo" || row.hour === "amc") && !closedDay(row.date) && isProjected({ date: row.date, session: row.hour, source: row.source }, today);
}

/**
 * 0090: the company dated its latest report without a session (HP, ROAD: a call time isn't a session). The calendar's
 * cached day rows are the raw feed's, so their session for that report is the feed's guess, never evidence for the
 * day past moves are measured on.
 */
function sessionlessDated(symbol: string, today: string): boolean {
  const o = activeOverrides(OVERRIDES, today)[symbol];
  return !!o && !overrideSession(o) && o.date < today;
}

/**
 * 0086: the session of the company's last dated report: the feed's row while `symbol=` still lists it, else the
 * calendar route's cached days. `symbol=` returns future dates only, so it drops the row the day after the print.
 * The cached days are the last two weeks plus Nasdaq's newest report date: cache only, about a dozen reads.
 */
async function lastReportedHour(symbol: string, lastE: any, today: string, pastDates: string[]): Promise<string | undefined> {
  if (lastE && (lastE.epsActual != null || lastE.revenueActual != null)) return lastE.hour;
  const days = Array.from(new Set([...lookbackDays(today, addDays(today, -14), 14), ...pastDates.slice(0, 1).filter((d) => d < today)])).sort().reverse();
  const found = await Promise.all(days.map(async (d) => {
    try {
      const hit = (await caches.default.match(CAL_DAY(d))) ?? (await caches.default.match(CAL(`cal:stale:v3:${d}`)));
      return hit ? ((await hit.json()) as EarningsEvent[]).find((x) => x.s === symbol && (x.eA != null || x.rA != null)) ?? null : null;
    } catch { return null; }
  }));
  return found.find((e) => e != null)?.h || undefined;
}

/**
 * 0087: one reported row through the calendar's pre-report step (`preReportDay`'s `applyPreReport`): the snapshot, else
 * Nasdaq's same-basis consensus and actual, from the same cached day read the calendar makes. Only rows that step could
 * change (an estimate to swap, in dollars or with a snapshot): non-USD and estimate-less rows never wait on Nasdaq. A
 * failed Nasdaq read leaves the row as the calendar would (Finnhub's figures).
 */
async function preReportRow(symbol: string, row: DayRow, today: string, ctx: ExecutionContext): Promise<DayRow> {
  const snap = await readSnap(row.date);
  if (row.eE == null && row.rE == null) return row;
  if (!snap[symbol] && (!usdEstimates(symbol) || row.eE == null)) return row;
  const nq = await nasdaqDay(row.date, today, ctx).catch(() => null);
  const ev: EarningsEvent = { s: symbol, d: row.date, h: row.hour as Session, q: row.quarter, y: row.year, eE: row.eE, eA: row.eA, rE: row.rE, rA: row.rA, t: 1 } as EarningsEvent;
  const [e] = applyPreReport([ev], snap, nq?.e ?? {}, usdEstimates, false, nq?.a).events;
  // Nasdaq's fields come from this pass only, never left over from the row's earlier one.
  const { nE: _nE, nA: _nA, pr: _pr, ...base } = row;
  return { ...base, eE: e.eE, rE: e.rE, ...(e.nE != null ? { nE: e.nE } : {}), ...(e.nA !== undefined ? { nA: e.nA } : {}), ...(e.pr ? { pr: e.pr } : {}) };
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
      const withSupp = mergeSupplement(await calendarDay(day, env, ctx), await readSuppShared(env, ctx, iso(todayNY())), day, day, () => true); // no Finnhub calls (0024); may read KV (0111)
      const today = iso(todayNY());
      // 0072 (and 0064): a projection that never happened, or one on a holiday, isn't counted. Cache only here.
      const moved = flagClosed(applyToEvents(withSupp, OVERRIDES, day, day, today, (s) => s in U));
      const base = await preReportMoved(moved, today, ctx, false).catch(() => moved);
      const past = await settlePast(base, today, ctx, false).catch(() => base);
      const settled = await oneRowInRange(past, day, day, today, ctx).catch(() => oneReportOneRow(past.filter((e) => e.d === day)));
      const byCap = (a: EarningsEvent, b: EarningsEvent) => (U[b.s]?.mc ?? 0) - (U[a.s]?.mc ?? 0);
      // 0109: every dated row counts, popular ones named first, so the unfurl's total is the drawer's "in all".
      const evs = settled.filter((e) => !unconfirmedRow(e, today)).sort((a, b) => (b.t ? 1 : 0) - (a.t ? 1 : 0) || byCap(a, b));
      // 0067: on a holiday the title says the market is closed and the feed's rows there are named as unconfirmed.
      const unconfirmed = settled.filter((e) => e.t && e.c).sort(byCap).map((e) => e.s);
      return dayShareText(label, closedDay(day), evs.map((e) => e.s), unconfirmed);
    } catch { const h = closedDay(day); return h ? dayShareText(label, h, [], []) : { title: `Earnings on ${label} · Metaphases`, desc: PAGES["/"].desc }; }
  }
  if (path.startsWith("/kids/")) {
    const pre = ["/kids/school/", "/kids/league/", "/kids/pack/"].find((x) => path.startsWith(x));
    return PAGES[path] ?? (pre ? PAGES[pre.slice(0, -1)] : PAGES["/kids"]);
  }
  return PAGES[path] ?? null;
}

/** Box Office analytics: the loader, last in <body>, on grown-up pages only. Never on the kids area (Moon Club). */
export function withInsights(res: Response, p: string): Response {
  if (isKidsPath(p) || typeof HTMLRewriter === "undefined" || !(res.headers.get("Content-Type") ?? "").toLowerCase().includes("text/html")) return res;
  return new HTMLRewriter().on("body", { element(el) { el.append(INSIGHTS_TAG, { html: true }); } }).transform(res);
}

async function page(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  // Fetch the directory URL, not index.html: the asset layer 307s "index.html" to its directory.
  // 0036: unconditionally (no If-None-Match), so the shell is always a full 200 HTML response that carries the
  // CSP. A 304 has no Content-Type, and would let a pre-CSP cached copy keep running without the policy.
  const res = await env.ASSETS.fetch(new Request(new URL(`${BASE}/`, url), { method: "GET" }));
  const meta = await shareMeta(url, env, ctx);
  const p = url.pathname.slice(BASE.length) || "/";
  if (!meta) return withInsights(res, p);
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
    // Box Office analytics, last in <body>: grown-up pages only, never the kids area.
    .on("body", { element(el) { if (!meta.kids && !isKidsPath(p)) el.append(INSIGHTS_TAG, { html: true }); } })
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
  const nqUp = up && !up.source && up.hour !== "dmh" ? (await nasdaqDayOnDemand(up.date, today, ctx, env))?.[s] : undefined;
  const nqRows = (nq?.data?.earningsSurpriseTable?.rows ?? []) as any[];
  // 0060: a session the two calendars disagree on is settled by the stock's own past moves, as on the sheet, or left unknown.
  const contested = !!up && !up.source && isContested(up.hour, nqUp);
  const closeOn = (day: string, off: number) => { const d = stock?.d ?? [], i = d.indexOf(day); return i < 0 ? null : stock?.c[i + off] ?? null; };
  const nqDates = nqRows.map((r) => nqDate(r.dateReported)).filter((d): d is string => d != null);
  // 0086: a projected session the last dated report contradicts is settled the same way as on the sheet.
  const upLast = !contested && projectedTimed(up, today) ? await lastReportedHour(s, last, today, nqDates) : undefined;
  const upFix = !contested && projectedTimed(up, today) ? projectedSession(up.hour, upLast, nqDates, closeOn) : null;
  // 0088: an unsettled projection never blanks the sessions of past dated reports.
  let habit: Session = contested
    ? contestedSession(up.hour as Session, nqUp as Session, nqDates, closeOn)
    : upFix === "" ? sessionHabit(upLast ?? last?.hour, nqUp, undefined) : sessionHabit(upFix ?? up?.hour, nqUp, last?.hour);
  // 0090: the same fallback as the sheet when the next session is unknown for any other reason.
  if (!habit && !contested) habit = pastSession(sessionlessDated(s, today) ? undefined : upLast ?? (await lastReportedHour(s, last, today, nqDates)), nqUp, nqDates, closeOn);
  const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,]/g, "")); return Number.isFinite(n) ? n : null; };
  const reports = nqRows.map((r) => {
    const [mm, dd, yy] = String(r.dateReported).split("/");
    const date = `${yy}-${(mm ?? "").padStart(2, "0")}-${(dd ?? "").padStart(2, "0")}`;
    const row = cal.find((e) => e.date === date);
    const hour = row?.source ? row.hour || "" : contested ? habit : row?.hour || habit;
    return { date, eA: num(r.eps), eE: num(r.consensusForecast), hour: (hour || "") as "bmo" | "amc" | "dmh" | "" };
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
  // 0062: the cached 0015 window (no new upstream calls). A session Nasdaq lists differently on the same day isn't
  // stated in the summary.
  const nqWin = await nasdaqWindow(today, ctx, false, undefined, env).catch(() => null);
  // 0104: the sheet's session verdicts, so a session Nasdaq leads on reads the same as on the calendar and the sheet.
  const leads = syms.length ? await readLeads(env) : null;
  const items: IcsItem[] = [];
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    const sym = syms[i];
    for (const e of applyToRows(sym, r.value?.earningsCalendar ?? [], OVERRIDES, today)) {
      if (e.date < today) continue;
      let feedH = (e.hour || "") as Session;
      // 0108: a company date with no session (nor one its call time settles) takes Nasdaq's timed listing that day, expected.
      const nqFill = nqWin && e.source && !feedH && e.date > today ? companyDayFill({ s: sym, d: e.date, h: "" } as EarningsEvent, nqWin).h : "";
      if (nqFill) feedH = nqFill;
      const c = nqWin && !e.source ? crossOne(sym, e.date, feedH, nqWin) : null;
      const sl = !e.source && !closedDay(e.date) ? leadFor(leads, sym, e.date, feedH, today, c) : null;
      const contestedH = c?.x === "differs" && c.xd === e.date && !!c.xh;
      // 0099: the feed's timeless projection against Nasdaq's timed listing elsewhere: Nasdaq's day, still tentative.
      const lead = c?.x === "differs" && c.xd && !closedDay(e.date) && leadsNasdaq({ date: e.date, session: feedH, source: e.source }, { date: c.xd, session: c.xh ?? "" }, today) ? { date: c.xd, session: c.xh! } : null;
      items.push({ symbol: sym, name: U[sym]?.n ?? sym, date: lead?.date ?? e.date, session: lead ? "" : sl ? sl.h : contestedH ? "" : feedH, ...((sl || nqFill) && !lead ? { expected: true } : {}), quarter: e.quarter, year: e.year, epsE: shareEps(sym, e.epsEstimate ?? null), cur: U[sym]?.ec, url: `${SITE}${BASE}/t/${sym}`, ...(!e.source && closedDay(e.date) ? { closed: closedDay(e.date)! } : {}), ...(lead || isProjected({ date: e.date, session: e.hour || "", source: e.source }, today) ? { projected: true } : {}) });
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
  // 0099: Nasdaq's day leads over the feed's timeless projection: drawn as unconfirmed, no session glyph.
  const contested = !rc && when && d.next?.feedDay ? { headline: `Reports ${when}, date unconfirmed`, session: "" as Session }
    : nq ? { headline: `Reports ${when}, ${nq.date === d.next!.date ? "time" : "date"} unconfirmed`, session: "" as Session }
    // 0007: a projected date is "expected around", with no session glyph.
    : !rc && when && d.next?.projected ? { headline: `Around ${when} · unconfirmed`, session: "" as Session }
    // 0050: a time only Nasdaq's calendar gives is expected, not the company's.
    : !rc && !d.justReported && when && d.next?.hs === "n" && d.next.session ? { headline: `Reports ${when}, expected ${SESSION_PLAIN[d.next.session]}` } : {};
  return cardSvg({ symbol: sym, name: d.profile?.name ?? U[sym]?.n ?? sym, when, session: d.justReported?.session ?? d.next?.session ?? "", ...contested, move: d.expectedMove, beats: d.beatRate?.beats ?? null, total: d.beatRate?.total ?? null, epsE: d.next?.epsBasis ? null : d.next?.epsE ?? null, cur: d.next?.currency, ...(rc ?? {}) });
}

async function ogCard(sym: string, fmt: "svg" | "png", req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const fallback = () => env.ASSETS.fetch(new Request(new URL(`${BASE}/og.png`, req.url), req));
  try {
    const day = iso(todayNY());
    const key = new Request(`https://cache.metaphases.internal/og-png-v8-${sym}-${day}`);
    // A card drawn while degraded is kept 30 s under its own key, so an unfurl burst renders it once, not per request.
    const shortKey = new Request(`https://cache.metaphases.internal/og-png-v8-${sym}-${day}-d`);
    if (fmt === "png") { const hit = (await caches.default.match(key)) ?? (await caches.default.match(shortKey)); if (hit) return hit; }
    // 0043: a card drawn while the sheet's date or history failed to load is served briefly and never cached.
    const svgKey = new Request(`https://cache.metaphases.internal/${encodeURIComponent(`og:svg:v8:${sym}:${day}`)}`);
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
    const svg = await cached(`story:svg:v5:${kind}:${day}`, 21600, ctx, async () => {
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
          // 0007: a projected date is "expected around", with no session glyph.
          // 0099: Nasdaq's day leading over the feed's projection is never drawn as settled.
          when: isDated(d.next) ? (d.next.feedDay ? `${new Date(d.next.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })} (date not confirmed)` : d.next.projected && !d.next.nasdaq ? `expected around ${new Date(d.next.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })} (not yet confirmed)` : `${whenPlain(d.next.date, shownSession(d.next), day)}${d.next.hs === "n" && shownSession(d.next) ? " (expected)" : ""}`) : d.next ? "date not confirmed yet" : "date not announced yet",
          // 0062: a session the two calendars contest is drawn as unknown.
          session: isDated(d.next) && ((d.next.projected && !d.next.nasdaq) || d.next.feedDay) ? "" : shownSession(d.next), epsE: d.next?.epsBasis ? null : d.next?.epsE ?? null, cur: d.next?.currency, move: d.expectedMove, grade: d.compass.grade,
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
    const key = new Request(`https://cache.metaphases.internal/story-png-v3-${encodeURIComponent(kind)}-${day}`);
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
      if (p === "/api/xcheck/fill") return await xcheckFill(url, env, ctx);
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
      if (p === "/guide/") return secureHtml(withInsights(await env.ASSETS.fetch(new Request(new URL(`${BASE}/guide/`, url), { method: "GET" })), p));
      // The Moon Club app page is a static parallax page too (public/app/index.html). No analytics: it's Moon Club's.
      if (p === "/app" || p === "/app/index.html") return Response.redirect(`${url.origin}${BASE}/app/`, 301);
      if (p === "/app/") return secureHtml(await env.ASSETS.fetch(new Request(new URL(`${BASE}/app/`, url), { method: "GET" })));
      const isPage = req.method === "GET" && !/\.[a-z0-9]{2,12}$/i.test(p);
      // 0036: every HTML response carries the CSP that blocks Cloudflare's edge-injected analytics beacon.
      if (isPage) return secureHtml(await page(req, env, ctx));
      return secureHtml(await env.ASSETS.fetch(req));
    } catch (e) {
      return new Response(JSON.stringify({ error: "We couldn't reach the market data service. Try again in a moment.", detail: String(e) }), { status: 502, headers: { "Content-Type": "application/json" } });
    }
  },
} satisfies ExportedHandler<Env>;
