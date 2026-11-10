import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { applyPreReport, sameEpsUnit } from "../../shared/compare";
import { dropUnscaled, refreshEntry, rowToEvent, supplementSymbols, type Universe } from "../../shared/calendarSupplement";
import universe from "../../data/universe.json" with { type: "json" };
import { SHARE_CLASS, shareEps, yahooSymbol } from "../../shared/shareClass";

// 0046: Finnhub reports Berkshire's EPS per Class A share; the tracked BRK.B is 1/1,500th of that (Berkshire 8-K).
// Recorded from production on 2026-11-10: next Q4 Feb 26 at $8,202.91, Q3 (Sat Nov 7) $8,909.54 vs $9,253.77.

describe("shareEps / yahooSymbol", () => {
  it("scales BRK.B by Berkshire's published 1,500 and leaves everything else alone", () => {
    expect(SHARE_CLASS["BRK.B"].div).toBe(1500);
    expect(SHARE_CLASS["BRK.B"].source).toMatch(/^https:\/\/www\.sec\.gov\//);
    expect(shareEps("BRK.B", 8202.9125)).toBeCloseTo(5.4686, 4);
    expect(shareEps("BRK.B", null)).toBeNull();
    expect(shareEps("BRK.B", undefined)).toBeUndefined();
    expect(shareEps("AAPL", 1.85)).toBe(1.85);
    expect(shareEps("GOOGL", 2.1)).toBe(2.1);
  });
  it("spells share classes Yahoo's way", () => {
    expect(yahooSymbol("BRK.B")).toBe("BRK-B");
    expect(yahooSymbol("BF.B")).toBe("BF-B");
    expect(yahooSymbol("AAPL")).toBe("AAPL");
  });
});

describe("applyPreReport ignores a snapshot in another unit", () => {
  it("a Class A-scale snapshot never judges a B-scale actual", () => {
    const row = { s: "BRK.B", d: "2026-11-06", h: "bmo" as const, q: 3, y: 2026, eE: 6.17, eA: 5.94, rE: null, rA: null, t: 1 as const };
    const { events } = applyPreReport([row], { "BRK.B": { eE: 9253.77, rE: null } });
    expect(events[0].eE).toBe(6.17);
    expect(events[0].pr).toBeUndefined();
  });
  it("only share classes are checked: a tiny EPS revised 0.01 → 0.12 elsewhere is still the bar", () => {
    expect(sameEpsUnit("ZZZS", 0.01, 0.12)).toBe(true);
    expect(sameEpsUnit("BRK.B", 9253.77, 6.17)).toBe(false);
    expect(sameEpsUnit("BRK.B", 6.0, 6.17)).toBe(true);
    expect(sameEpsUnit("BRK.B", null, 6.17)).toBe(true);
    const row = { s: "ZZZS", d: "2026-11-04", h: "amc" as const, q: 3, y: 2026, eE: 0.12, eA: 0.05, rE: null, rA: null, t: 1 as const };
    expect(applyPreReport([row], { ZZZS: { eE: 0.01, rE: null } }).events[0]).toMatchObject({ eE: 0.01, pr: "s" });
  });
  it("an ordinary drifted snapshot still wins", () => {
    const row = { s: "V", d: "2026-10-27", h: "amc" as const, q: 4, y: 2026, eE: 3.5055, eA: 3.48, rE: null, rA: null, t: 1 as const };
    expect(applyPreReport([row], { V: { eE: 3.43, rE: null } }).events[0]).toMatchObject({ eE: 3.43, pr: "s" });
  });
});

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as any;

const q3 = { symbol: "BRK.B", date: "2026-11-07", hour: "bmo", quarter: 3, year: 2026, epsEstimate: 9253.7737, epsActual: 8909.54, revenueEstimate: 96000000000, revenueActual: 97100000000 };
const q4 = { symbol: "BRK.B", date: "2027-02-26", hour: "", quarter: 4, year: 2026, epsEstimate: 8202.9125, epsActual: null, revenueEstimate: 99243363400, revenueActual: null };
const surprises = [
  { period: "2026-09-30", quarter: 3, year: 2026, estimate: 9253.7737, actual: 8909.54, surprisePercent: -3.7199 },
  { period: "2026-06-30", quarter: 2, year: 2026, estimate: 7594.5732, actual: 9038.3, surprisePercent: 19.01 },
  { period: "2026-03-31", quarter: 1, year: 2026, estimate: 8078.5176, actual: 7889.445, surprisePercent: -2.3404 },
  { period: "2025-12-31", quarter: 4, year: 2025, estimate: 8431.7647, actual: 7093.185, surprisePercent: -15.8754 },
];
const metric = { metric: { peTTM: 14.2 }, series: { quarterly: { eps: [{ period: "2026-06-30", v: 17873.9554 }, { period: "2026-03-31", v: 7027.8164 }] } } };
// 300 weekday bars ending Fri Nov 6, 2026, stamped at the 9:30 ET open.
const bars = (() => {
  const t: number[] = [];
  for (let d = new Date("2026-11-06T14:30:00Z"); t.length < 300; d.setUTCDate(d.getUTCDate() - 1)) if (d.getUTCDay() % 6) t.unshift(d.getTime() / 1000);
  const c = t.map((_, i) => 500 + i * 0.25);
  return { chart: { result: [{ timestamp: t, indicators: { quote: [{ open: c, high: c.map((x) => x + 2), low: c.map((x) => x - 2), close: c }] } }] } };
})();
let yahooUrls: string[] = [];

beforeEach(() => {
  pending = []; yahooUrls = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-10T15:00:00Z"));
  (globalThis as any).caches = { default: new MemCache() };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname.endsWith("finance.yahoo.com")) {
      yahooUrls.push(u);
      return url.pathname.endsWith("/BRK-B") ? new Response(JSON.stringify(bars)) : new Response("Not Found", { status: 404 });
    }
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: null, status: { rCode: 200, bCodeMessage: [{ code: 1002, errorMessage: "No record found." }] } }));
    if (url.pathname.endsWith("/calendar/earnings")) {
      const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
      return new Response(JSON.stringify({ earningsCalendar: [q3, q4].filter((r) => url.searchParams.get("symbol") === "BRK.B" || (r.date >= from && r.date <= to)) }));
    }
    if (url.pathname.endsWith("/stock/earnings")) return new Response(JSON.stringify(surprises));
    if (url.pathname.endsWith("/stock/metric")) return new Response(JSON.stringify(metric));
    if (url.pathname.endsWith("/stock/profile2")) return new Response(JSON.stringify({ name: "Berkshire Hathaway Inc", country: "US", currency: "USD", marketCapitalization: 1217805, shareOutstanding: 2156 }));
    if (url.pathname.endsWith("/quote")) return new Response(JSON.stringify({ c: 575.25, d: 4.36, dp: 0.76, pc: 570.89, t: 1794258000 }));
    return new Response("{}", { status: 404 });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(pending); pending = [];
  return r.json() as Promise<any>;
};

describe("/api/ticker/BRK.B (production shape, Nov 10)", () => {
  it("every EPS is per B share", async () => {
    const r = await get("/api/ticker/BRK.B");
    expect(r.next).toMatchObject({ quarter: 4, year: 2026, date: "2027-02-26" });
    expect(r.next.epsE).toBeCloseTo(8202.9125 / 1500, 6);
    for (const h of r.history) {
      if (h.epsE != null) expect(Math.abs(h.epsE)).toBeLessThan(20);
      if (h.epsA != null) expect(Math.abs(h.epsA)).toBeLessThan(20);
    }
    expect(r.history[0]).toMatchObject({ date: "2026-11-07", session: "bmo" });
    expect(r.history[0].epsA).toBeCloseTo(8909.54 / 1500, 6);
    expect(r.history[0].surprisePct).toBeCloseTo(-3.72, 1); // a ratio, so the scale leaves it alone
    for (const q of r.quarters) if (q.eps != null) expect(Math.abs(q.eps)).toBeLessThan(20);
    expect(r.read.join(" ")).not.toMatch(/\$\d{1,3},?\d{3}\.\d{2}/); // no four-digit EPS in The Read
    expect(r.read.join(" ")).toContain("$5.47 a share");
  });

  it("one row per quarter, and no quarter-end presented as a report date", async () => {
    const r = await get("/api/ticker/BRK.B");
    const periods = r.history.map((h: any) => h.period);
    expect(new Set(periods).size).toBe(periods.length);
    expect(r.history.filter((h: any) => /Q3 2026|2026-09-30/.test(h.period))).toHaveLength(1);
    for (const h of r.history) expect(h.date).not.toMatch(/^\d{4}-(03-31|06-30|09-30|12-31)$/);
    expect(r.history.slice(1).map((h: any) => h.period)).toEqual(["Q2 2026", "Q1 2026", "Q4 2025"]);
  });

  it("asks Yahoo for BRK-B, so the price history and setup are there", async () => {
    const r = await get("/api/ticker/BRK.B");
    expect(yahooUrls.length).toBeGreaterThan(0);
    for (const u of yahooUrls) expect(u).toContain("/chart/BRK-B?");
    expect(r.warnings).not.toContain("Price history unavailable — setup grade skipped.");
    expect(r.spark.length).toBeGreaterThan(0);
    expect(r.setup.grade).not.toBeNull();
  });
});

describe("/api/calendar scales BRK.B too (Retrace, the grid, the brief)", () => {
  it("the Feb 26 row is per B share", async () => {
    const r = await get("/api/calendar?from=2027-02-22&to=2027-02-26");
    const row = r.events.find((e: any) => e.s === "BRK.B");
    expect(row).toBeTruthy();
    expect(row.eE).toBeCloseTo(8202.9125 / 1500, 6);
  });
});

describe("the calendar supplement (BRK.B is a dotted share class, so it's a supplement symbol)", () => {
  it("rows are scaled as they enter, and entries are marked as scaled", () => {
    expect(rowToEvent(q4, "BRK.B").eE).toBeCloseTo(8202.9125 / 1500, 6);
    expect(rowToEvent({ ...q4, symbol: "AAPL", epsEstimate: 1.85 }, "AAPL").eE).toBe(1.85);
    expect(refreshEntry(undefined, [rowToEvent(q4, "BRK.B")], "2026-11-10", 0).u).toBe(1);
  });
  it("a cached BRK.B entry from before the rescale is dropped (and so fetched again first); others are kept", () => {
    const old = { at: 1, rows: [{ ...rowToEvent(q4, "BRK.B"), eE: 8202.9125 }] };
    const doc = dropUnscaled({ "BRK.B": old, TM: { at: 1, rows: [] } });
    expect(doc["BRK.B"]).toBeUndefined();
    expect(doc.TM).toBeDefined();
    const fresh = { "BRK.B": { ...old, u: 1 as const } };
    expect(dropUnscaled(fresh)).toBe(fresh);
  });
  it("/api/calendar: the range feed drops BRK.B and the supplement's row is per B share", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.pathname.endsWith("/calendar/earnings")) {
        return new Response(JSON.stringify({ earningsCalendar: url.searchParams.get("symbol") === "BRK.B" ? [q3, q4] : [] }));
      }
      return new Response("{}", { status: 404 });
    }));
    vi.setSystemTime(new Date("2027-02-22T15:00:00Z"));
    // Every other supplement name fresh, and BRK.B's entry from before the rescale (Class A figures, no `u`).
    const doc: Record<string, unknown> = Object.fromEntries(supplementSymbols(universe as Universe).map((x) => [x, { at: Date.now(), rows: [], u: 1 }]));
    doc["BRK.B"] = { at: Date.now(), rows: [{ s: "BRK.B", d: "2027-02-26", h: "", q: 4, y: 2026, eE: 8202.9125, eA: null, rE: null, rA: null, t: 1 }] };
    await (globalThis as any).caches.default.put(new Request(`https://cache.metaphases.internal/${encodeURIComponent("cal:supp:v2")}`), new Response(JSON.stringify(doc)));
    const r = await get("/api/calendar?from=2027-02-22&to=2027-02-26");
    const row = r.events.find((e: any) => e.s === "BRK.B");
    expect(row).toBeTruthy();
    expect(row.eE).toBeCloseTo(8202.9125 / 1500, 6);
  });
});

describe("/api/ics", () => {
  it("a BRK.B subscription quotes the B-share estimate", async () => {
    const r = await worker.fetch(new Request("https://mutaafaziz.com/metaphases/api/ics?s=BRK.B"), env, ctx);
    const text = (await r.text()).replace(/\r?\n /g, "");
    expect(text).toContain("$5.47");
    expect(text).not.toMatch(/8,?202/);
  });
});
