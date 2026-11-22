import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { currencyBreak, sanitizeMetric, withoutOff } from "../../shared/currencyBreak";
import { compassGrade } from "../../shared/grades";
import { quartersFrom, yearAgoOf } from "../../shared/depth";
import type { TickerResponse } from "../../shared/types";

vi.mock("../../worker/og", () => ({ renderPng: async () => new Uint8Array([137, 80, 78, 71]) }));

// 0098: Finnhub's quarterly series for some Chinese ADRs carries the newest quarter in US dollars per share beside
// yuan quarters. Points from production `/api/ticker/<SYM>` `quarters` on 2026-11-22 (rev ÷ 1e9 stands in for sales
// per share: the shares are the same for every quarter, so the ratios are the live ones).
const pts = (xs: [string, number | null][]) => xs.filter((x): x is [string, number] => x[1] != null).map(([period, v]) => ({ period, v }));
const PDD = {
  salesPerShare: pts([["2024-12-31", 106.283], ["2025-03-31", 91.822], ["2025-06-30", 99.876], ["2025-09-30", 103.544], ["2025-12-31", 119.526], ["2026-03-31", 102.166], ["2026-06-30", 108.537], ["2026-09-30", 15.602]]),
  eps: pts([["2024-12-31", 4.6321], ["2025-03-31", 2.485], ["2025-06-30", 5.188], ["2025-09-30", 4.926], ["2025-12-31", 3.8999], ["2026-03-31", 2.1194], ["2026-06-30", 4.6118], ["2026-09-30", 0.747]]),
};
// LI: one quarter in dollars in the middle (×0.13, then ×6.58), and a real 42% drop a year earlier.
const LI = { salesPerShare: pts([["2024-09-30", 41.579], ["2024-12-31", 42.732], ["2025-03-31", 24.993], ["2025-06-30", 29.098], ["2025-09-30", 27.939], ["2025-12-31", 3.553], ["2026-03-31", 23.364], ["2026-06-30", 26.267]]) };
// YMM: two quarters missing, then the newest in dollars.
const YMM = { salesPerShare: pts([["2024-12-31", 3.15], ["2025-03-31", 2.673], ["2025-06-30", null], ["2025-09-30", null], ["2025-12-31", 3.169], ["2026-03-31", 2.83], ["2026-06-30", 3.37], ["2026-09-30", 0.533]]) };
// TSM reports in Taiwan dollars throughout: no break.
const TSM = { salesPerShare: pts([["2024-12-31", 868.558], ["2025-03-31", 839.369], ["2025-06-30", 933.918], ["2025-09-30", 990.007], ["2025-12-31", 1046.078], ["2026-03-31", 1134.15], ["2026-06-30", 1270.409], ["2026-09-30", 1494.265]]) };
// A real 60% one-quarter fall (×0.4) is a business change, not a currency switch.
const DROP = { salesPerShare: pts([["2025-12-31", 10], ["2026-03-31", 10.5], ["2026-06-30", 4.2], ["2026-09-30", 4.4]]) };

describe("currencyBreak", () => {
  it("finds PDD's newest quarter reported in dollars beside yuan quarters", () => {
    expect(currencyBreak(PDD, "CNY")).toEqual({ off: ["2026-09-30"], growthBroken: true });
  });
  it("finds LI's one dollar quarter in the middle, and keeps the yuan quarters on both sides of it", () => {
    expect(currencyBreak(LI, "CNY")).toEqual({ off: ["2025-12-31"], growthBroken: true });
  });
  it("skips missing quarters (YMM) and still finds the newest one in dollars", () => {
    expect(currencyBreak(YMM, "CNY").off).toEqual(["2026-09-30"]);
  });
  it("leaves a clean home-currency series alone (TSM)", () => {
    expect(currencyBreak(TSM, "TWD")).toEqual({ off: [], growthBroken: false });
  });
  it("leaves a real 60% one-quarter fall alone", () => {
    expect(currencyBreak(DROP, "EUR").off).toEqual([]);
  });
  it("never touches a dollar reporter, whatever its series does", () => {
    expect(currencyBreak(PDD, "USD").off).toEqual([]);
    expect(currencyBreak(PDD, null).off).toEqual([]);
  });
  it("a break older than the TTM window drops the quarter but keeps the growth metrics", () => {
    const old = { salesPerShare: [{ period: "2023-09-30", v: 14 }, ...pts([["2023-12-31", 100], ["2024-03-31", 101]]), ...PDD.salesPerShare.slice(0, 7)] };
    expect(currencyBreak(old, "CNY")).toEqual({ off: ["2023-09-30"], growthBroken: false });
  });
});

describe("the sanitized quarters and Compass growth", () => {
  it("drops the dollar quarter from every series, so no neighbours differ 4× and no fake collapse shows", () => {
    const q = quartersFrom(withoutOff(PDD, currencyBreak(PDD, "CNY").off), 1);
    expect(q.map((x) => x.period)).not.toContain("2026-09-30");
    for (let i = 1; i < q.length; i++) expect((q[i].rev as number) / (q[i - 1].rev as number)).toBeGreaterThan(0.25);
    const last = q[q.length - 1], ago = yearAgoOf(q, last);
    expect(ago?.period).toBe("2025-06-30");
  });
  it("grades growth as unavailable, never F, on a break inside the TTM window", () => {
    const m = { revenueGrowthTTMYoy: -14.3, epsGrowthTTMYoy: -34.0, grossMarginTTM: 56 };
    const g = compassGrade(sanitizeMetric(m, currencyBreak(PDD, "CNY"))).factors.find((f) => f.key === "growth")!;
    expect(g.grade).toBeNull();
    expect(g.why).toBe("Growth history unavailable.");
    expect(g.inputs.map((i) => i.value)).toEqual(["—", "—"]);
    // A clean series keeps the feed's growth metrics.
    expect(sanitizeMetric(m, currencyBreak(TSM, "TWD"))).toBe(m);
  });
  it("yearAgoOf finds the year-ago quarter by date, across a dropped quarter and 52/53-week drift", () => {
    const rows = [{ period: "2024-09-28" }, { period: "2025-03-29" }, { period: "2025-06-28" }, { period: "2025-09-27" }];
    expect(yearAgoOf(rows, rows[3])?.period).toBe("2024-09-28");
    expect(yearAgoOf(rows.slice(1), rows[3])).toBeNull();
  });
});

// The worker: a made-up yuan reporter (no live override can win, LESSONS 2026-11-06) and a dollar control.
const CN = "ZZCN", US = "ZZUS";
class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as any;
const metricFor = (series: Record<string, { period: string; v: number }[]>) => ({
  metric: { revenueGrowthTTMYoy: -14.3, epsGrowthTTMYoy: -34.0, grossMarginTTM: 56, operatingMarginTTM: 24 },
  series: { quarterly: series },
});

beforeEach(() => {
  pending = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-22T14:00:00Z"));
  (globalThis as any).caches = { default: new MemCache() };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname !== "finnhub.io") return new Response("Not Found", { status: 404 });
    const path = url.pathname.replace("/api/v1/", "");
    const sym = url.searchParams.get("symbol");
    const cn = sym === CN;
    if (path === "calendar/earnings") return new Response(JSON.stringify({ earningsCalendar: [] }));
    if (path === "stock/earnings") return new Response(JSON.stringify([]));
    if (path === "stock/profile2") return new Response(JSON.stringify(cn
      ? { name: "Zeta China Holdings", country: "CN", currency: "CNY", estimateCurrency: "CNY", marketCapitalization: 150000, shareOutstanding: 1000 }
      : { name: "Zeta Dollar Corp", country: "US", currency: "USD", estimateCurrency: "USD", marketCapitalization: 150000, shareOutstanding: 1000 }));
    if (path === "quote") return new Response(JSON.stringify({ c: 100, d: 1, dp: 1, pc: 99, t: 1795000000 }));
    if (path === "stock/recommendation") return new Response(JSON.stringify([]));
    if (path === "stock/metric") return new Response(JSON.stringify(metricFor(PDD)));
    return new Response("{}", { status: 404 });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const sheet = async (sym: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases/api/ticker/${sym}`), env, ctx);
  await Promise.all(pending); pending = [];
  return (await r.json()) as TickerResponse;
};

describe("/api/ticker on a currency-mixed series", () => {
  it("a yuan reporter: no dollar quarter in the bars, and Growth reads unavailable instead of F", async () => {
    const d = await sheet(CN);
    expect(d.quarters.map((q) => q.period)).not.toContain("2026-09-30");
    expect(d.quarters.length).toBe(7);
    const g = d.compass.factors.find((f) => f.key === "growth")!;
    expect(g.grade).toBeNull();
    expect(g.why).toBe("Growth history unavailable.");
    expect(d.compass.factors.find((f) => f.key === "profitability")!.grade).not.toBeNull();
  });
  it("a dollar reporter with the same numbers is graded on the feed's metrics, unchanged", async () => {
    const d = await sheet(US);
    expect(d.quarters.length).toBe(8);
    expect(d.compass.factors.find((f) => f.key === "growth")!.grade).toBe("F");
  });
});
