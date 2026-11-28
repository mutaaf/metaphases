import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { feedGoneDays, goneDaysOf, goneWarning, isGoneWarning } from "../../shared/feedHorizon";
import { missingDays, needsRetry, retryDelay } from "../../src/lib/partial";
import worker from "../../worker/index";

// 0118 (critic 2026-11-27): Finnhub's free calendar reaches back about a month. Before Oct 28 it returned an empty
// list with a 200, so Oct 21 (META, TSLA, IBM) read "None of the companies we follow report" and "A quiet week", and
// the season strip said a bare 61%. Made-up symbols (LESSONS 2026-11-06).

describe("feedGoneDays", () => {
  const week = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];
  it("a past trading day with no feed row at all is dropped, not quiet", () => {
    expect(feedGoneDays(week, [], "2026-11-27")).toEqual(week);
    expect(feedGoneDays(week, ["2026-10-21"], "2026-11-27")).toEqual(["2026-10-19", "2026-10-20", "2026-10-22", "2026-10-23"]);
  });
  it("recent days (inside the feed's month), weekends and NYSE holidays never count", () => {
    expect(feedGoneDays(["2026-11-27", "2026-11-30", "2026-11-20", "2026-11-06"], [], "2026-11-27")).toEqual([]);
    expect(feedGoneDays(["2026-10-24", "2026-11-26"], [], "2026-12-28")).toEqual([]); // Saturday, Thanksgiving
    expect(feedGoneDays(["2026-11-05"], [], "2026-11-27")).toEqual(["2026-11-05"]); // 22 days back
  });
});

describe("client reading of a dropped day", () => {
  const w = [goneWarning("2026-10-21"), goneWarning("2026-10-22")];
  it("counts as a day that didn't load (so floors say 'at least')", () => {
    expect(missingDays(w, "2026-10-16", "2026-11-27")).toEqual(["2026-10-21", "2026-10-22"]);
    expect(goneDaysOf([...w, "Couldn't load 2026-11-02 — showing the rest."])).toEqual(["2026-10-21", "2026-10-22"]);
    expect(isGoneWarning("Couldn't load 2026-11-02 — showing the rest.")).toBe(false);
  });
  it("isn't retried: asking again can't bring it back", () => {
    expect(needsRetry({ warnings: w })).toBe(false);
    expect(retryDelay({ warnings: w }, 0)).toBeNull();
    expect(needsRetry({ warnings: [...w, "Couldn't load 2026-11-02 — showing the rest."] })).toBe(true);
  });
});

class MemCache {
  store = new Map<string, { body: string; exp: number; headers: [string, string][] }>();
  async match(req: Request) {
    const v = this.store.get(req.url);
    return v === undefined || v.exp <= Date.now() ? undefined : new Response(v.body, { headers: v.headers });
  }
  async put(req: Request, res: Response) {
    const age = Number(/max-age=(\d+)/.exec(res.headers.get("Cache-Control") ?? "")?.[1] ?? 86400);
    this.store.set(req.url, { body: await res.text(), exp: Date.now() + age * 1000, headers: [...res.headers.entries()] });
  }
}
const fh = (symbol: string, date: string, revenueEstimate = 5e10) => ({ symbol, date, hour: "amc", quarter: 3, year: 2026, epsEstimate: 1, epsActual: 1.1, revenueEstimate, revenueActual: revenueEstimate });
const ROWS = [
  fh("QQMT", "2026-10-21"), fh("QQTS", "2026-10-21"),
  fh("QQVI", "2026-10-28"),
  fh("QQSM", "2026-10-30", 1e6), // a tiny company: the feed has the day, none of it is shown
];
let horizon = "2026-10-28";
let extra: ReturnType<typeof fh>[] = [];
let fhCalls = 0;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
const env: any = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") }, SUPPORT: { get: async () => null, put: async () => {} } };
const call = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.allSettled(waits); waits = [];
  return r.json() as Promise<any>;
};
const later = (s: number) => vi.setSystemTime(new Date(Date.now() + s * 1000));

beforeEach(() => {
  waits = []; fhCalls = 0; horizon = "2026-10-28"; extra = [];
  (globalThis as any).caches = { default: new MemCache() };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T18:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") return new Response(JSON.stringify({ data: { rows: [] } }));
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: [] } } }));
    if (url.pathname.endsWith("/calendar/earnings")) {
      const sym = url.searchParams.get("symbol");
      if (sym) return new Response(JSON.stringify({ earningsCalendar: [] }));
      fhCalls++;
      const from = url.searchParams.get("from")!, to = url.searchParams.get("to")!;
      return new Response(JSON.stringify({ earningsCalendar: [...ROWS, ...extra].filter((r) => r.date >= from && r.date <= to && r.date >= horizon) }));
    }
    if (url.pathname.endsWith("/stock/earnings")) return new Response("[]");
    return new Response(JSON.stringify({}), { status: 200 });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("0118: /api/calendar before the feed's horizon", () => {
  it("flags every dropped day instead of answering 0 events with no warning", async () => {
    const r = await call("/api/calendar?from=2026-10-19&to=2026-10-23");
    expect(r.events).toEqual([]);
    expect(goneDaysOf(r.warnings)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
    expect(missingDays(r.warnings, "2026-10-19", "2026-10-23")).toHaveLength(5);
  });

  it("remembers the verdict for the day's cache life: a re-read costs no Finnhub call", async () => {
    await call("/api/calendar?from=2026-10-19&to=2026-10-23");
    const before = fhCalls;
    const r = await call("/api/calendar?from=2026-10-19&to=2026-10-23");
    expect(fhCalls).toBe(before);
    expect(goneDaysOf(r.warnings)).toHaveLength(5);
  });

  it("a covered week is unchanged: a day with only tiny companies is empty, not dropped", async () => {
    const r = await call("/api/calendar?from=2026-10-26&to=2026-10-30");
    expect((r.events as any[]).map((e) => e.s)).toEqual(["QQVI"]);
    // Oct 26/27/29 have no feed rows at all in this stub, so they are flagged; Oct 30 has a (hidden) row.
    expect(goneDaysOf(r.warnings)).toEqual(["2026-10-26", "2026-10-27", "2026-10-29"]);
  });

  it("a week too busy for one range call (day-by-day path) flags its dropped days too (review)", async () => {
    horizon = "2026-10-22";
    extra = Array.from({ length: 1500 }, (_, i) => fh(`QZ${i}`, i % 2 ? "2026-10-22" : "2026-10-23", 1e6));
    const r = await call("/api/calendar?from=2026-10-19&to=2026-10-23");
    expect(goneDaysOf(r.warnings)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
    expect(r.warnings.every(isGoneWarning)).toBe(true);
  });

  it("a day read while the feed had it is kept once the feed drops it", async () => {
    horizon = "2026-10-21";
    const first = await call("/api/calendar?from=2026-10-21&to=2026-10-21");
    expect((first.events as any[]).map((e) => e.s).sort()).toEqual(["QQMT", "QQTS"]);
    horizon = "2026-10-28";
    later(8 * 86400); // well past the 6 h day cache and the old 7-day stale copy
    const r = await call("/api/calendar?from=2026-10-21&to=2026-10-21");
    expect((r.events as any[]).map((e) => e.s).sort()).toEqual(["QQMT", "QQTS"]);
    expect(r.warnings).toEqual([]);
  });
});

describe("coveredSince", () => {
  it("is the next trading day after the last dropped one", async () => {
    const { coveredSince } = await import("../../shared/feedHorizon");
    expect(coveredSince(["2026-10-21", "2026-10-23"])).toBe("2026-10-26");
    expect(coveredSince(["2026-11-25"])).toBe("2026-11-27"); // over Thanksgiving
    expect(coveredSince([])).toBeNull();
  });
});
