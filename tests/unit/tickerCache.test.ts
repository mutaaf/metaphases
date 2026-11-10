import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { isDegraded, sheetTtl, staleUsable, standIn, SHEET_DEGRADED_TTL, SHEET_TTL, type StaleSheet } from "../../shared/sheetCache";
import type { TickerResponse } from "../../shared/types";

// 0043: a sheet that lost its upcoming date or its earnings history to a Finnhub rate limit is never edge-cached
// for 5 minutes or used for a share card. Shape recorded from production on 2026-11-10 06:56 UTC (NVDA, a week
// before its print): `next: null` with "Upcoming date unavailable. · Earnings history unavailable." for minutes.
// A made-up symbol, so no live entry in data/date-overrides.json can win over the feed (LESSONS 2026-11-06).

const SYM = "ZZTK";
const KEY = (k: string) => `https://cache.metaphases.internal/${encodeURIComponent(k)}`;

class MemCache {
  store = new Map<string, { body: string; cc: string }>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v.body); }
  async put(req: Request, res: Response) { this.store.set(req.url, { body: await res.text(), cc: res.headers.get("Cache-Control") ?? "" }); }
  maxAge(k: string) { const cc = this.store.get(KEY(k))?.cc ?? ""; return Number(cc.match(/max-age=(\d+)/)?.[1] ?? NaN); }
  /** Drop the 5-minute and 30-second copies, as the edge would once they expire. */
  expire() { for (const k of [...this.store.keys()]) if (!k.includes("stale")) this.store.delete(k); }
}
let cache: MemCache;
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("<html><head><title>Metaphases</title></head></html>", { headers: { "Content-Type": "text/html" } }) } } as any;
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as any;

const next = { symbol: SYM, date: "2026-11-18", hour: "amc", quarter: 3, year: 2027, epsEstimate: 1.25, epsActual: null, revenueEstimate: 54000000000, revenueActual: null };
const surprises = [
  { period: "2026-07-31", quarter: 2, year: 2027, estimate: 1.01, actual: 1.05, surprisePercent: 3.96 },
  { period: "2026-04-30", quarter: 1, year: 2027, estimate: 0.93, actual: 0.96, surprisePercent: 3.2 },
];
const nasdaqRows = [
  { fiscalQtrEnd: "Jul 2026", dateReported: "8/26/2026", eps: 1.05, consensusForecast: "1.01", percentageSurprise: "3.96" },
  { fiscalQtrEnd: "Apr 2026", dateReported: "5/27/2026", eps: 0.96, consensusForecast: "0.93", percentageSurprise: "3.2" },
];
/** Which Finnhub paths answer 429 right now (every retry). */
let limited = new Set<string>();
let finnhubCalls = 0;

beforeEach(() => {
  pending = []; limited = new Set(); finnhubCalls = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-10T14:00:00Z"));
  cache = new MemCache();
  (globalThis as any).caches = { default: cache };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname.endsWith("finance.yahoo.com")) return new Response("Not Found", { status: 404 });
    if (url.hostname === "api.nasdaq.com") {
      if (url.pathname.includes("/calendar/")) return new Response(JSON.stringify({ data: { rows: null } }));
      return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nasdaqRows } } }));
    }
    finnhubCalls++;
    const path = url.pathname.replace("/api/v1/", "");
    if (limited.has(path)) return new Response("API limit reached", { status: 429 });
    if (path === "calendar/earnings") return new Response(JSON.stringify({ earningsCalendar: url.searchParams.get("symbol") === SYM ? [next] : [] }));
    if (path === "stock/earnings") return new Response(JSON.stringify(surprises));
    if (path === "stock/profile2") return new Response(JSON.stringify({ name: "Zeta Tensor Corp", country: "US", currency: "USD", marketCapitalization: 4400000 }));
    if (path === "quote") return new Response(JSON.stringify({ c: 190.1, d: 1.2, dp: 0.64, pc: 188.9, t: 1794319200 }));
    if (path === "stock/recommendation") return new Response(JSON.stringify([{ buy: 50, hold: 5, sell: 1, strongBuy: 10, strongSell: 0, period: "2026-11-01" }]));
    if (path === "stock/metric") return new Response(JSON.stringify({ metric: {}, series: { quarterly: {} } }));
    return new Response("{}", { status: 404 });
  }));
  // A tiny HTMLRewriter (Workers-only) that records what the share page sets, so /t/SYM can be checked in Node.
  vi.stubGlobal("HTMLRewriter", class {
    hs: [string, any][] = [];
    on(sel: string, h: any) { this.hs.push([sel, h]); return this; }
    transform(res: Response) {
      const out: Record<string, string> = {};
      for (const [sel, h] of this.hs) h.element?.({ setInnerContent: (v: string) => { out[sel] = v; }, setAttribute: (_a: string, v: string) => { out[sel] = v; }, getAttribute: (a: string) => (sel.includes("og:title") && a === "property" ? "og:title" : null) });
      return new Response(JSON.stringify(out), { status: res.status, headers: res.headers });
    }
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const call = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(pending); pending = [];
  return r;
};
const sheet = async () => { const r = await call(`/api/ticker/${SYM}`); return { r, d: (await r.json()) as TickerResponse }; };
const maxAge = (r: Response) => Number(r.headers.get("Cache-Control")?.match(/max-age=(\d+)/)?.[1] ?? NaN);
const shareTitle = async () => { const r = await call(`/t/${SYM}`); return { r, title: ((await r.json()) as Record<string, string>).title }; };

describe("a healthy sheet (no regression in upstream call volume)", () => {
  it("is cached 300 s at the edge and in the response, and leaves a 24 h last good copy", async () => {
    const { r, d } = await sheet();
    expect(isDegraded(d)).toBe(false); // Yahoo 404s here, so only "Price history unavailable" remains
    expect(d.next).toMatchObject({ date: "2026-11-18", session: "amc" });
    expect(maxAge(r)).toBe(300);
    expect(cache.maxAge(`tk:v3:${SYM}`)).toBe(300);
    expect(cache.maxAge(`tk:stale:v2:${SYM}`)).toBe(86400);
    const calls = finnhubCalls;
    await sheet();
    expect(finnhubCalls).toBe(calls); // the second open is a cache hit
  });
});

describe("a rate-limited build", () => {
  it("with no good copy: cached ≤ 30 s in both layers, and the sheet says what's missing", async () => {
    limited = new Set(["calendar/earnings", "stock/earnings"]);
    const { r, d } = await sheet();
    expect(d.next).toBeNull();
    expect(d.warnings).toEqual(expect.arrayContaining(["Upcoming date unavailable.", "Earnings history unavailable."]));
    expect(maxAge(r)).toBeLessThanOrEqual(30);
    expect(cache.maxAge(`tk:v3:${SYM}`)).toBeLessThanOrEqual(30);
    expect(cache.store.has(KEY(`tk:stale:v2:${SYM}`))).toBe(false); // a degraded sheet is never the last good copy
  }, 20000);

  it("with a good copy from earlier today: next and history come from it, and warnings name it as an earlier read", async () => {
    await sheet(); // 9:00 AM ET, healthy
    vi.setSystemTime(new Date("2026-11-10T14:20:00Z"));
    cache.expire();
    limited = new Set(["calendar/earnings"]);
    const { r, d } = await sheet();
    expect(d.next).toMatchObject({ date: "2026-11-18", session: "amc", epsE: 1.25 });
    expect(d.history.length).toBe(2);
    expect(d.warnings[0]).toBe("This is an earlier read from 9:00 AM ET; the market data service is busy right now.");
    expect(d.warnings).not.toContain("Upcoming date unavailable.");
    expect(maxAge(r)).toBe(SHEET_DEGRADED_TTL);
    expect(cache.maxAge(`tk:v3:${SYM}`)).toBe(SHEET_DEGRADED_TTL);
    // …and once Finnhub answers again (30 s later), the full sheet is back.
    cache.expire(); limited = new Set();
    const back = await sheet();
    expect(isDegraded(back.d)).toBe(false);
    expect(back.d.warnings.join(" ")).not.toMatch(/earlier read/);
    expect(maxAge(back.r)).toBe(300);
  }, 20000);

  it("the share page never unfurls as the bare '(SYM) earnings' while a good copy exists, and is cached ≤ 30 s", async () => {
    await sheet();
    cache.expire();
    limited = new Set(["calendar/earnings", "stock/earnings"]);
    const { r, title } = await shareTitle();
    expect(title).toBe(`${SYM} reports Wed, Nov 18 after the close · Metaphases`);
    expect(title).not.toMatch(/\(ZZTK\) earnings/);
    expect(maxAge(r)).toBeLessThanOrEqual(30);
  }, 20000);

  it("a share page from a degraded sheet with no good copy is cached ≤ 30 s, a healthy one 300 s", async () => {
    limited = new Set(["calendar/earnings"]);
    const bad = await shareTitle();
    expect(bad.title).toBe("Zeta Tensor Corp (ZZTK) earnings · Metaphases");
    expect(maxAge(bad.r)).toBeLessThanOrEqual(30);
    cache.expire(); limited = new Set();
    const good = await shareTitle();
    expect(good.title).toMatch(/reports Wed, Nov 18/);
    expect(maxAge(good.r)).toBe(300);
  }, 20000);

  it("the share card drawn from a degraded sheet is served briefly and never kept for 6 hours", async () => {
    limited = new Set(["calendar/earnings"]);
    const bad = await call(`/og/t/${SYM}.svg`);
    expect(maxAge(bad)).toBeLessThanOrEqual(30);
    expect([...cache.store.keys()].some((k) => k.includes("og%3Asvg"))).toBe(false);
    cache.expire(); limited = new Set();
    const good = await call(`/og/t/${SYM}.svg`);
    expect(maxAge(good)).toBe(21600);
    expect(await good.text()).toContain("Nov 18");
  }, 20000);
});

describe("sheetCache rules", () => {
  const base = { warnings: [], next: { date: "2026-11-18", session: "amc", quarter: 3, year: 2027, epsE: 1.25, revE: null } } as unknown as TickerResponse;
  const copy = (day: string, data: Partial<TickerResponse> = {}): StaleSheet => ({ at: Date.parse(`${day}T14:00:00Z`), day, data: { ...base, ...data } });

  it("only the date and history warnings make a sheet degraded", () => {
    expect(isDegraded({ warnings: ["Live quote unavailable."] })).toBe(false);
    expect(isDegraded({ warnings: ["Upcoming date unavailable."] })).toBe(true);
    expect(isDegraded({ warnings: ["Earnings history unavailable."] })).toBe(true);
    expect(sheetTtl({ warnings: ["Analyst ratings unavailable."] })).toBe(SHEET_TTL);
    expect(sheetTtl(standIn(copy("2026-11-10"), "2026-11-10"))).toBe(SHEET_DEGRADED_TTL);
  });
  it("a copy from today stands in; an older one only while its report is still ahead", () => {
    expect(staleUsable(copy("2026-11-10"), "2026-11-10")).toBe(true);
    expect(staleUsable(copy("2026-11-09"), "2026-11-10")).toBe(true);
    // Yesterday's copy said "reports today": it predates the report-day state, so it can't stand in.
    expect(staleUsable(copy("2026-11-09", { next: { ...base.next!, date: "2026-11-10" } }), "2026-11-10")).toBe(false);
    expect(staleUsable(copy("2026-11-09", { next: null }), "2026-11-10")).toBe(false);
    expect(staleUsable(copy("2026-11-10", { warnings: ["Upcoming date unavailable."] }), "2026-11-10")).toBe(false);
    expect(staleUsable(null, "2026-11-10")).toBe(false);
  });
  it("an earlier day's copy says which day", () => {
    expect(standIn(copy("2026-11-09"), "2026-11-10").warnings[0]).toBe("This is an earlier read from 2026-11-09, 9:00 AM ET; the market data service is busy right now.");
  });
});
