import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { needsPastCheck, nqReports, settlePastRow } from "../../shared/pastRows";
import { splitClosed } from "../../shared/closedRows";
import { epsVerdict } from "../../shared/compare";
import { buildBrief } from "../../src/lib/brief";
import type { EarningsEvent } from "../../shared/types";
import worker from "../../worker/index";

// 0072: a past day never states a report as fact one way or the other. AMCR and ATO reported on Nov 4 (Nasdaq's
// history has the pairs), so they're filled and judged; NIO's projected Nov 11 passed with nothing anywhere and its
// last report was Sep 2, so it's flagged and not counted as reporting.

const ev = (s: string, d: string, extra: Partial<EarningsEvent> = {}): EarningsEvent => ({ s, d, h: "amc", q: 1, y: 2027, eE: 0.96, eA: null, rE: 5.9e9, rA: null, t: 1, ...extra });
const surprise = (rows: [string, number | string, number | string][]) => ({
  data: { earningsSurpriseTable: { rows: rows.map(([dateReported, eps, consensusForecast]) => ({ fiscalQtrEnd: "Sep 2026", dateReported, eps, consensusForecast, percentageSurprise: 0 })) } },
});
const TODAY = "2026-11-14";

describe("0072 settlePastRow", () => {
  it("parses Nasdaq's table, newest first, skipping rows with no date", () => {
    const r = nqReports(surprise([["8/14/2026", 0.71, 0.7], ["11/4/2026", "0.95", "$0.96"], ["n/a", 1, 1]]));
    expect(r).toEqual([{ date: "2026-11-04", eps: 0.95, est: 0.96 }, { date: "2026-08-14", eps: 0.71, est: 0.7 }]);
  });

  it("checks only past rows two or more trading days old with no figures, no holiday flag", () => {
    expect(needsPastCheck(ev("AMCR", "2026-11-04"), TODAY)).toBe(true);
    expect(needsPastCheck(ev("X", "2026-11-12"), TODAY)).toBe(false); // Thu: only Fri has passed
    expect(needsPastCheck(ev("X", "2026-11-04", { eA: 1 }), TODAY)).toBe(false);
    expect(needsPastCheck(ev("X", "2026-11-04", { c: "Thanksgiving" }), TODAY)).toBe(false);
    expect(needsPastCheck(ev("X", "2026-09-01"), TODAY)).toBe(false); // beyond the lookback
    expect(needsPastCheck(ev("X", "2026-11-16"), TODAY)).toBe(false);
  });

  it("did report (AMCR, Nov 4): fills Nasdaq's pair, and the row judges as a miss", () => {
    const out = settlePastRow(ev("AMCR", "2026-11-04"), nqReports(surprise([["11/4/2026", 0.95, 0.96], ["8/14/2026", 0.71, 0.7]])), true);
    expect(out).toMatchObject({ eA: 0.95, eE: 0.96, pr: "n" });
    expect(out.od).toBeUndefined();
    expect(epsVerdict(out).v).toBe("miss");
  });

  it("an after-close report Nasdaq dates the next morning still matches (one trading day)", () => {
    const out = settlePastRow(ev("ATO", "2026-11-04"), nqReports(surprise([["11/5/2026", 1.17, 1.14]])), true);
    expect(out).toMatchObject({ eA: 1.17, eE: 1.14 });
    expect(epsVerdict(out).v).toBe("beat");
    // Over a weekend: Fri row, Mon report.
    expect(settlePastRow(ev("Y", "2026-11-06"), nqReports(surprise([["11/9/2026", 1, 1]])), true).eA).toBe(1);
  });

  it("didn't report (NIO, Nov 11): last report a quarter back, so the row is flagged and leaves the count", () => {
    const nio = settlePastRow(ev("NIO", "2026-11-11", { h: "" }), nqReports(surprise([["9/2/2026", -0.3, -0.35], ["6/3/2026", -0.4, -0.4]])), false);
    expect(nio.od).toBe(true);
    expect(nio.eA).toBeNull();
    const { dated, unconfirmed } = splitClosed([nio, ev("AAPL", "2026-11-11")]);
    expect(dated.map((e) => e.s)).toEqual(["AAPL"]);
    expect(unconfirmed.map((e) => e.s)).toEqual(["NIO"]);
  });

  it("leaves a row alone when it can't tell", () => {
    const row = ev("Z", "2026-11-04");
    expect(settlePastRow(row, null, true)).toBe(row); // history unreadable
    expect(settlePastRow(row, [], true)).toBe(row); // no history
    expect(settlePastRow(row, nqReports(surprise([["11/10/2026", 1, 1]])), true)).toBe(row); // reported on another day since
    expect(settlePastRow(row, nqReports(surprise([["10/1/2026", 1, 1]])), true)).toBe(row); // a report weeks before: dated elsewhere
    expect(settlePastRow({ ...row, o: "https://example.com" }, nqReports(surprise([["6/1/2026", 1, 1]])), true).od).toBeUndefined(); // company-dated
    // A matching report in another currency's unit isn't filled into a non-dollar row.
    expect(settlePastRow(row, nqReports(surprise([["11/4/2026", 1, 1]])), false)).toBe(row);
  });

  it("the week brief doesn't count or rank a row that never happened", () => {
    const week = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];
    const U = { NIO: { n: "NIO Inc.", mc: 7609 }, AAPL: { n: "Apple", mc: 4e6 } } as any;
    const b = buildBrief(week, [ev("NIO", "2026-11-11", { od: true }), ev("AAPL", "2026-11-12")], [], null, U, TODAY);
    expect(b.total).toBe(1);
    expect(b.top.map((t) => t.s)).toEqual(["AAPL"]);
  });
});

// Through the worker: /api/calendar fills AMCR from Nasdaq and flags a made-up projection that never happened.
// ZZNOR is a made-up untracked big reporter, so no live override can touch it (LESSONS 2026-11-13).
class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as any;
const fhRow = (symbol: string, date: string, hour = "amc") => ({ symbol, date, hour, quarter: 1, year: 2027, epsEstimate: 0.96, epsActual: null, revenueEstimate: 9e9, revenueActual: null });
const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(pending); pending = [];
  return r.json() as Promise<any>;
};
let nqCalls: string[] = [];

describe("0072 through /api/calendar", () => {
  beforeEach(() => {
    pending = []; nqCalls = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T15:00:00Z"));
    (globalThis as any).caches = { default: new MemCache() };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.hostname === "finnhub.io" && url.searchParams.get("symbol")) return new Response(JSON.stringify({ earningsCalendar: [] }));
      if (url.hostname === "finnhub.io" && url.pathname.endsWith("/calendar/earnings")) {
        const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
        const rows = [fhRow("AMCR", "2026-11-04"), fhRow("ZZNOR", "2026-11-11", ""), { ...fhRow("ATO", "2026-11-04"), epsActual: 1.17 }].filter((r) => r.date >= from && r.date <= to);
        return new Response(JSON.stringify({ earningsCalendar: rows }));
      }
      const m = /\/api\/company\/([A-Z]+)\/earnings-surprise/.exec(url.pathname);
      if (m) {
        nqCalls.push(m[1]);
        if (m[1] === "AMCR") return new Response(JSON.stringify(surprise([["11/4/2026", 0.95, 0.96], ["8/14/2026", 0.71, 0.7]])));
        if (m[1] === "ZZNOR") return new Response(JSON.stringify(surprise([["8/20/2026", 1, 1]])));
      }
      return new Response("{}", { status: 404 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("fills AMCR's Nov 4 figures and flags ZZNOR's Nov 11 projection; a reported row costs no call", async () => {
    const body = await get("/api/calendar?from=2026-11-02&to=2026-11-13");
    const by = (s: string) => body.events.find((e: EarningsEvent) => e.s === s);
    expect(by("AMCR")).toMatchObject({ d: "2026-11-04", eA: 0.95, eE: 0.96, pr: "n" });
    expect(by("ZZNOR")).toMatchObject({ d: "2026-11-11", od: true, eA: null });
    expect(by("ATO").od).toBeUndefined();
    // Company-dated rows from data/date-overrides.json in these weeks are checked too; ATO (reported) never is.
    expect(nqCalls).toEqual(expect.arrayContaining(["AMCR", "ZZNOR"]));
    expect(nqCalls).not.toContain("ATO");
    expect(nqCalls.length).toBeLessThanOrEqual(12);
    // A second read uses the cached history (shared with the ticker sheet's key): no new Nasdaq calls.
    nqCalls = [];
    const again = await get("/api/calendar?from=2026-11-02&to=2026-11-13");
    expect(again.events.find((e: EarningsEvent) => e.s === "AMCR").eA).toBe(0.95);
    expect(nqCalls).toEqual([]);
  });

  it("a Nasdaq failure leaves the rows as they were, with no warning", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.hostname === "finnhub.io") {
        const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
        return new Response(JSON.stringify({ earningsCalendar: [fhRow("AMCR", "2026-11-04"), fhRow("ZZNOR", "2026-11-11", "")].filter((r) => r.date >= from && r.date <= to) }));
      }
      return new Response("busy", { status: 503 });
    }));
    const body = await get("/api/calendar?from=2026-11-02&to=2026-11-13");
    expect(body.warnings).toEqual([]);
    expect(body.events.find((e: EarningsEvent) => e.s === "AMCR")).toMatchObject({ eA: null });
    expect(body.events.find((e: EarningsEvent) => e.s === "ZZNOR").od).toBeUndefined();
  });
});
