import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oneReportOneRow, SAME_REPORT_DAYS } from "../../shared/oneRow";
import { seasonScore } from "../../shared/depth";
import type { EarningsEvent } from "../../shared/types";
import worker from "../../worker/index";

// 0041: one report, one row. The rows below are recorded from production /api/calendar on 2026-11-14
// (after 0072 filled the twins from Nasdaq's history, which made all three FDXF rows look reported).
const ev = (s: string, d: string, extra: Partial<EarningsEvent> = {}): EarningsEvent => ({ s, d, h: "amc", q: 3, y: 2026, eE: 1, eA: null, rE: 1e9, rA: null, t: 1, ...extra });
const FDXF: EarningsEvent[] = [
  ev("FDXF", "2026-10-28", { h: "", q: 1, y: 2027, eE: 1.38, eA: 1.49, rE: 2369095421, rA: null, pr: "n" }),
  ev("FDXF", "2026-10-29", { q: 3, y: 2026, eE: 1.38, eA: 1.49, rE: 2419092180, rA: 2442000000, pr: "n" }),
  ev("FDXF", "2026-10-29", { q: 4, y: 2026, eE: 1.38, eA: 1.49, rE: 2375121408, rA: null, pr: "n" }),
];
// The feed's own rows before 0072 filled them (the ticket's evidence): only the Oct 29 Q3 row has an actual.
const FDXF_RAW: EarningsEvent[] = [
  ev("FDXF", "2026-10-28", { h: "", q: 3, y: 2026 }),
  ev("FDXF", "2026-10-29", { eA: 1.49, rA: 2442000000 }),
  ev("FDXF", "2026-10-29"),
];
const FDX = ev("FDX", "2026-10-28", { eE: 3.24, eA: 3.74, rE: 22641177070, rA: 22855000000 });

describe("0041 oneReportOneRow", () => {
  it("FedEx Freight's three rows for one report become one: Oct 29 with the actual", () => {
    for (const rows of [FDXF, FDXF_RAW]) {
      const out = oneReportOneRow([FDX, ...rows]).filter((e) => e.s === "FDXF");
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ d: "2026-10-29", h: "amc", eA: 1.49, rA: 2442000000 });
    }
  });

  it("leaves other symbols and their order alone", () => {
    const out = oneReportOneRow([FDX, ...FDXF, ev("AAPL", "2026-10-29")]);
    expect(out.map((e) => e.s)).toEqual(["FDX", "FDXF", "AAPL"]);
    expect(out[0]).toBe(FDX);
  });

  it("a ROKU-shaped stale row (Nov 3, no actual) gives way to the reported Nov 2 row", () => {
    const out = oneReportOneRow([ev("ROKU", "2026-11-03"), ev("ROKU", "2026-11-02", { eA: 1.2, rA: 1502e6 })]);
    expect(out).toEqual([expect.objectContaining({ d: "2026-11-02", eA: 1.2 })]);
  });

  it("Amcor's Nov 4 twins (Q3 2026 and Q1 2027 labels) are one row: the one with revenue", () => {
    const out = oneReportOneRow([ev("AMCR", "2026-11-04", { eA: 0.95, rA: 6129e6, pr: "n" }), ev("AMCR", "2026-11-04", { q: 1, y: 2027, eA: 0.95, pr: "n" })]);
    expect(out).toEqual([expect.objectContaining({ q: 3, y: 2026, rA: 6129e6 })]);
  });

  it("with no figures anywhere, a company date beats the feed's, a real date beats a holiday projection or a passed one", () => {
    expect(oneReportOneRow([ev("X", "2026-11-23"), ev("X", "2026-11-24", { o: "https://ir.example.com" })])).toEqual([expect.objectContaining({ d: "2026-11-24" })]);
    expect(oneReportOneRow([ev("X", "2026-11-26", { c: "Thanksgiving" }), ev("X", "2026-11-24")])).toEqual([expect.objectContaining({ d: "2026-11-24" })]);
    expect(oneReportOneRow([ev("X", "2026-11-05", { od: true }), ev("X", "2026-11-10")])).toEqual([expect.objectContaining({ d: "2026-11-10" })]);
  });

  it("a same-day twin lends its session to the row kept", () => {
    const out = oneReportOneRow([ev("X", "2026-11-04", { h: "", eA: 1, rA: 2 }), ev("X", "2026-11-04", { h: "bmo" })]);
    expect(out).toEqual([expect.objectContaining({ h: "bmo", eA: 1 })]);
  });

  it("two reports more than a week apart stay two rows", () => {
    const a = ev("X", "2026-08-05", { eA: 1, rA: 1 }), b = ev("X", "2026-11-04");
    expect(oneReportOneRow([a, b])).toEqual([a, b]);
    const c = ev("Y", "2026-11-02"), d = ev("Y", `2026-11-${String(2 + SAME_REPORT_DAYS + 1).padStart(2, "0")}`);
    expect(oneReportOneRow([c, d])).toHaveLength(2);
  });

  it("returns the same array when nothing collapses", () => {
    const rows = [FDX, ev("AAPL", "2026-10-29")];
    expect(oneReportOneRow(rows)).toBe(rows);
  });

  it("the season scoreboard counts the report once, with its revenue judged", () => {
    const evs = oneReportOneRow([FDX, ...FDXF]);
    const s = seasonScore(evs, () => true, 2, "2026-10-01", "2026-10-31");
    expect(s.reported).toBe(2);
    expect(s.revExcluded).toBe(0);
    expect(s.revBeatPct).toBe(100);
  });
});

// Through the worker. ZZFRT is a made-up symbol, so no live date override can touch it (LESSONS 2026-11-13).
class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as any;
const fhRow = (date: string, hour: string, quarter: number, year: number, epsActual: number | null, revenueActual: number | null) =>
  ({ symbol: "ZZFRT", date, hour, quarter, year, epsEstimate: 1.38, epsActual, revenueEstimate: 2.4e9, revenueActual });
const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(pending); pending = [];
  return r.json() as Promise<any>;
};

describe("0041 through /api/calendar", () => {
  beforeEach(() => {
    pending = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T15:00:00Z"));
    (globalThis as any).caches = { default: new MemCache() };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.hostname === "finnhub.io" && url.searchParams.get("symbol")) return new Response(JSON.stringify({ earningsCalendar: [] }));
      if (url.hostname === "finnhub.io" && url.pathname.endsWith("/calendar/earnings")) {
        const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
        const rows = [fhRow("2026-10-28", "", 1, 2027, null, null), fhRow("2026-10-29", "amc", 3, 2026, 1.49, 2442000000), fhRow("2026-10-29", "amc", 4, 2026, null, null)]
          .filter((r) => r.date >= from && r.date <= to);
        return new Response(JSON.stringify({ earningsCalendar: rows }));
      }
      // Nasdaq's history says the report was Oct 29 (what 0072 would fill every twin from).
      if (/\/api\/company\/ZZFRT\/earnings-surprise/.test(url.pathname))
        return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: [{ fiscalQtrEnd: "Sep 2026", dateReported: "10/29/2026", eps: 1.49, consensusForecast: 1.38 }] } } }));
      return new Response("{}", { status: 404 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("lists the report once, on Oct 29 with its figures", async () => {
    const body = await get("/api/calendar?from=2026-10-26&to=2026-10-30");
    const rows = body.events.filter((e: EarningsEvent) => e.s === "ZZFRT");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ d: "2026-10-29", h: "amc", eA: 1.49, rA: 2442000000 });
    expect(body.warnings).toEqual([]);
  });
});
