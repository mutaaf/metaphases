import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { currencyBreak, sanitizeMetric } from "../../shared/currencyBreak";
import { compassGrade } from "../../shared/grades";
import type { TickerResponse } from "../../shared/types";

vi.mock("../../worker/og", () => ({ renderPng: async () => new Uint8Array([137, 80, 78, 71]) }));

// 0101: when the feed's newest quarter is in another currency (dollars per ordinary share beside yuan quarters),
// Finnhub's quarterly price-to-book is that quarter's book against the ADS price: about the ADS ratio too high
// (BABA 9.7× vs ~1.6×, NTES 19.5× vs ~3.1×, PDD 10.4×). The sheet shows "—" instead of grading it.
const pts = (xs: [string, number][]) => xs.map(([period, v]) => ({ period, v }));
// Production `/api/ticker/PDD` quarters (rev ÷ 1e9 stands in for sales per share), newest quarter in dollars.
const PDD = { salesPerShare: pts([["2024-12-31", 106.283], ["2025-03-31", 91.822], ["2025-06-30", 99.876], ["2025-09-30", 103.544], ["2025-12-31", 119.526], ["2026-03-31", 102.166], ["2026-06-30", 108.537], ["2026-09-30", 15.602]]) };
// LI: the dollar quarter sits in the middle; the newest quarter (and its book) is in yuan.
const LI = { salesPerShare: pts([["2024-09-30", 41.579], ["2024-12-31", 42.732], ["2025-03-31", 24.993], ["2025-06-30", 29.098], ["2025-09-30", 27.939], ["2025-12-31", 3.553], ["2026-03-31", 23.364], ["2026-06-30", 26.267]]) };
// TSM: Taiwan dollars throughout.
const TSM = { salesPerShare: pts([["2024-12-31", 868.558], ["2025-03-31", 839.369], ["2025-06-30", 933.918], ["2025-09-30", 990.007], ["2025-12-31", 1046.078], ["2026-03-31", 1134.15], ["2026-06-30", 1270.409], ["2026-09-30", 1494.265]]) };

// BABA's live metric map on 2026-11-22 (the keys Compass reads).
const BABA_METRIC = { peTTM: 22.0, pbQuarterly: 9.7, pbAnnual: 9.1, evEbitdaTTM: 38.2, grossMarginTTM: 37.9, operatingMarginTTM: 3.5, roeTTM: 7.4, roaTTM: 4.1, revenueGrowthTTMYoy: -30, epsGrowthTTMYoy: -50 };
const valuationOf = (m: Record<string, unknown>) => compassGrade(m as any).factors.find((f) => f.key === "valuation")!;
const pbOf = (m: Record<string, unknown>) => valuationOf(m).inputs.find((i) => i.label === "P/B")!.value;

describe("0101 price-to-book on a currency-mixed series", () => {
  it("a newest quarter in another currency: P/B reads — and Valuation averages P/E and EV/EBITDA only", () => {
    const m = sanitizeMetric(BABA_METRIC, currencyBreak(PDD, "CNY"));
    expect(pbOf(m)).toBe("—");
    expect(m).not.toHaveProperty("pbQuarterly");
    expect(m).not.toHaveProperty("pb");
    // P/E 22 → 50, EV/EBITDA 38.2 → 30: 40 (D), not the F a 9.7× P/B dragged it to.
    expect(valuationOf(m).score).toBe(40);
    expect(valuationOf(BABA_METRIC).score).toBeCloseTo(36.7, 1);
  });
  it("the fallback key `pb` goes too, so the grade can't pick the same broken figure up", () => {
    const m = sanitizeMetric({ pb: 19.5, peTTM: 20.1 }, currencyBreak(PDD, "CNY"));
    expect(pbOf(m)).toBe("—");
  });
  it("a dollar quarter in the middle (LI) leaves the newest book, and P/B, alone", () => {
    const m = sanitizeMetric({ pbQuarterly: 1.4, revenueGrowthTTMYoy: 5 }, currencyBreak(LI, "CNY"));
    expect(pbOf(m)).toBe("1.4×");
  });
  it("names with no break keep exactly the feed's P/B (TSM, and any dollar reporter)", () => {
    const tsm = { pbQuarterly: 7.2, peTTM: 24 };
    expect(sanitizeMetric(tsm, currencyBreak(TSM, "TWD"))).toBe(tsm);
    const jd = { pbQuarterly: 1.1, peTTM: 12.6 };
    expect(sanitizeMetric(jd, currencyBreak(PDD, "USD"))).toBe(jd);
  });
});

const CN = "ZZCN";
class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as any;
let series: Record<string, { period: string; v: number }[]> = PDD;

beforeEach(() => {
  pending = [];
  series = PDD;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-22T14:00:00Z"));
  (globalThis as any).caches = { default: new MemCache() };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname !== "finnhub.io") return new Response("Not Found", { status: 404 });
    const path = url.pathname.replace("/api/v1/", "");
    if (path === "calendar/earnings") return new Response(JSON.stringify({ earningsCalendar: [] }));
    if (path === "stock/earnings") return new Response(JSON.stringify([]));
    if (path === "stock/profile2") return new Response(JSON.stringify({ name: "Zeta China Holdings", country: "CN", currency: "CNY", estimateCurrency: "CNY", marketCapitalization: 150000, shareOutstanding: 1000 }));
    if (path === "quote") return new Response(JSON.stringify({ c: 100, d: 1, dp: 1, pc: 99, t: 1795000000 }));
    if (path === "stock/recommendation") return new Response(JSON.stringify([]));
    if (path === "stock/metric") return new Response(JSON.stringify({ metric: BABA_METRIC, series: { quarterly: series } }));
    return new Response("{}", { status: 404 });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const sheet = async (sym: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases/api/ticker/${sym}`), env, ctx);
  await Promise.all(pending); pending = [];
  return (await r.json()) as TickerResponse;
};

describe("/api/ticker: 0101", () => {
  it("the sheet shows P/B —, keeps P/E and EV/EBITDA, and the warning says price-to-book isn't graded", async () => {
    const d = await sheet(CN);
    const v = d.compass.factors.find((f) => f.key === "valuation")!;
    expect(v.inputs.map((i) => i.value)).toEqual(["22.0×", "—", "38.2×"]);
    expect(v.grade).toBe("D");
    expect(d.warnings).toContain("One quarter the data feed reported in another currency is left out of the quarterly figures, and growth and price-to-book aren't graded.");
  });
  it("a dollar quarter in the middle keeps P/B and the 0098 wording", async () => {
    series = LI;
    const d = await sheet(CN);
    expect(d.compass.factors.find((f) => f.key === "valuation")!.inputs[1].value).toBe("9.7×");
    expect(d.warnings).toContain("One quarter the data feed reported in another currency is left out of the quarterly figures, and growth isn't graded.");
  });
});
