import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { isDated, lookbackDays, noResultYet, nqDate, skippedQuarter, tickerShareTitle, tradingDaysSince } from "../../shared/pending";

// 0038: a quarter whose projected date passed without a result must not vanish from the sheet.

describe("skippedQuarter", () => {
  const q4 = { date: "2027-02-22", quarter: 4, year: 2026 };
  it("AXON on Nov 3: last report Aug 4, next listed Feb 22 → Q3 2026 is still pending", () => {
    expect(skippedQuarter(q4, ["2026-08-04", "2026-05-07"])).toEqual({ quarter: 3, year: 2026 });
  });
  it("wraps Q1 back to Q4 of the year before (UI: Q2 FY27 listed → Q1 FY27 pending)", () => {
    expect(skippedQuarter({ date: "2027-02-04", quarter: 1, year: 2027 }, ["2026-08-21", "2026-05-08"])).toEqual({ quarter: 4, year: 2026 });
  });
  it("keeps the listed quarter when it's the very next one (AES reported Nov 3, next Feb 24)", () => {
    expect(skippedQuarter({ date: "2027-02-24", quarter: 4, year: 2026 }, ["2026-11-03", "2026-08-04"])).toBeNull();
  });
  it("a long Q4 gap (Nov 5 → Mar 16; Oct 14 → Mar 12, 149 days) is not a skip", () => {
    expect(skippedQuarter({ date: "2027-03-16", quarter: 4, year: 2026 }, ["2026-11-05", "2026-08-06"])).toBeNull();
    expect(skippedQuarter({ date: "2027-03-12", quarter: 4, year: 2026 }, ["2026-10-14", "2026-07-15"])).toBeNull();
  });
  it("can't tell for semiannual reporters, and trusts company-confirmed dates", () => {
    expect(skippedQuarter(q4, ["2026-08-04", "2026-02-10"])).toBeNull();
    expect(skippedQuarter({ ...q4, source: "https://example.com" }, ["2026-08-04", "2026-05-07"])).toBeNull();
    expect(skippedQuarter(q4, ["2026-08-04"])).toBeNull();
    expect(skippedQuarter(undefined, ["2026-08-04", "2026-05-07"])).toBeNull();
  });
});

describe("helpers", () => {
  it("nqDate parses Nasdaq's M/D/YYYY", () => {
    expect(nqDate("8/4/2026")).toBe("2026-08-04");
    expect(nqDate("N/A")).toBeNull();
  });
  it("lookbackDays: weekdays before today, newest first, bounded", () => {
    expect(lookbackDays("2026-11-03", "2026-10-29")).toEqual(["2026-11-02", "2026-10-30", "2026-10-29"]);
  });
  it("tradingDaysSince skips weekends and holidays", () => {
    expect(tradingDaysSince("2026-11-06", "2026-11-09")).toBe(1); // Fri → Mon
    expect(tradingDaysSince("2026-11-25", "2026-11-30")).toBe(2); // Thanksgiving skipped
  });
  it("noResultYet: only past rows with no figures, after a full trading day of grace", () => {
    const row = { d: "2026-11-02", eA: null, rA: null };
    expect(noResultYet(row, "2026-11-03")).toBe(false); // the feed is often a day late
    expect(noResultYet(row, "2026-11-04")).toBe(true);
    expect(noResultYet({ ...row, eA: 1.2 }, "2026-11-04")).toBe(false);
    expect(noResultYet({ ...row, d: "2026-11-05" }, "2026-11-04")).toBe(false);
  });
  it("tickerShareTitle never states a date for an overdue quarter or a closed day", () => {
    const base = { date: "2026-11-02", session: "", quarter: 3 };
    expect(tickerShareTitle("AXON", "Axon", { ...base, overdue: true })).toBe("AXON's Q3 report: date not confirmed yet · Metaphases");
    expect(tickerShareTitle("AXON", "Axon", { ...base, date: "2026-11-05", session: "amc" })).toBe("AXON reports Thu, Nov 5 after the close · Metaphases");
    expect(tickerShareTitle("AXON", "Axon", { ...base, closed: "Thanksgiving" })).toBe("AXON earnings: date not confirmed yet · Metaphases");
    expect(tickerShareTitle("AXON", "Axon", null)).toBe("Axon (AXON) earnings · Metaphases");
    expect(isDated({ date: "", overdue: true })).toBe(false);
  });
});

// End to end through the worker, with AXON-shaped rows from Nov 3 under a made-up symbol (AXON itself now has a
// company override for Nov 5, which is trusted as is).
class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as any;
const CAL = (k: string) => `https://cache.metaphases.internal/${encodeURIComponent(k)}`;

const axonQ4 = { symbol: "ZZZT", date: "2027-02-22", hour: "amc", quarter: 4, year: 2026, epsEstimate: 2.41, epsActual: null, revenueEstimate: 790000000, revenueActual: null };
const axonQ3Day = { s: "ZZZT", d: "2026-11-02", h: "", q: 3, y: 2026, eE: 1.87, eA: null, rE: 705000000, rA: null, t: 1 };
const nasdaqRows = [
  { fiscalQtrEnd: "Jun 2026", dateReported: "8/4/2026", eps: 2.1, consensusForecast: "1.9", percentageSurprise: "10.5" },
  { fiscalQtrEnd: "Mar 2026", dateReported: "5/7/2026", eps: 1.8, consensusForecast: "1.6", percentageSurprise: "12.5" },
];
let cache: MemCache;

beforeEach(() => {
  pending = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T15:00:00Z"));
  cache = new MemCache();
  (globalThis as any).caches = { default: cache };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nasdaqRows } } }));
    if (url.pathname.endsWith("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: [axonQ4] }));
    return new Response("{}", { status: 404 });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(pending); pending = [];
  return r.json() as Promise<any>;
};

describe("/api/ticker keeps an unreported quarter as next (AXON shape, Nov 4)", () => {
  it("with the calendar's passed row: Q3, the passed date, its estimates, flagged overdue", async () => {
    cache.store.set(CAL("cal:v3:2026-11-02"), JSON.stringify([axonQ3Day]));
    const r = await get("/api/ticker/ZZZT");
    expect(r.next).toMatchObject({ quarter: 3, year: 2026, date: "2026-11-02", epsE: 1.87, revE: 705000000, overdue: true });
    expect(r.read[0]).toContain("Q3 report date is not confirmed yet");
    expect(r.read[0]).toContain("Monday, Nov 2");
    expect(r.read.join(" ")).not.toMatch(/Feb(ruary)? 22/);
    expect(tickerShareTitle("ZZZT", "Zzzt", r.next)).not.toContain("Feb");
  });

  it("no cached row (a cold colo): no overdue claim, since it may just have reported and the feeds lag", async () => {
    const r = await get("/api/ticker/ZZZT");
    expect(r.next.overdue).toBeUndefined();
  });

  it("a row from yesterday is inside the grace day: a normal report the feeds haven't caught up with", async () => {
    cache.store.set(CAL("cal:v3:2026-11-03"), JSON.stringify([{ ...axonQ3Day, d: "2026-11-03" }]));
    const r = await get("/api/ticker/ZZZT");
    expect(r.next.overdue).toBeUndefined();
  });

  it("a passed row with figures means it reported and Nasdaq is behind: no overdue flag", async () => {
    cache.store.set(CAL("cal:v3:2026-11-02"), JSON.stringify([{ ...axonQ3Day, eA: 2.0 }]));
    const r = await get("/api/ticker/ZZZT");
    expect(r.next.overdue).toBeUndefined();
  });
});

// Live regression, 2026-11-06 10:07 UTC: AXON reported on its announced date (Nov 5, data/date-overrides.json),
// but the cached Finnhub day still held the Nov 2 projection with no figures and Nasdaq hadn't caught up,
// so the sheet said "expected it on Monday, Nov 2 and has no results yet".
describe("a company-announced date that has passed is a report, not an overdue quarter", () => {
  it("AXON on Nov 6: no overdue flag", async () => {
    vi.setSystemTime(new Date("2026-11-06T10:00:00Z"));
    cache.store.set(CAL("cal:v3:2026-11-02"), JSON.stringify([{ ...axonQ3Day, s: "AXON" }]));
    const r = await get("/api/ticker/AXON");
    expect(r.next?.overdue).toBeUndefined();
    expect(r.read.join(" ")).not.toContain("expected it on Monday, Nov 2");
  });
});
