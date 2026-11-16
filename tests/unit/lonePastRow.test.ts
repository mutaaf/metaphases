import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nqPeriodEnd, nqReports, settlePastRow } from "../../shared/pastRows";
import type { EarningsEvent } from "../../shared/types";
import worker from "../../worker/index";

// 0076: a lone past row on the wrong day moves to the day the company's report history gives, when that's
// unambiguous. ROKU's feed row sat on Tue Nov 3 after close while its history said Mon Nov 2.

const ev = (s: string, d: string, extra: Partial<EarningsEvent> = {}): EarningsEvent => ({ s, d, h: "amc", q: 3, y: 2026, eE: 0.53, eA: null, rE: 1.4e9, rA: null, t: 1, ...extra });
const surprise = (rows: [string, number, number, string][]) => ({
  data: { earningsSurpriseTable: { rows: rows.map(([dateReported, eps, consensusForecast, fiscalQtrEnd]) => ({ fiscalQtrEnd, dateReported, eps, consensusForecast, percentageSurprise: 0 })) } },
});
const TODAY = "2026-11-16";

describe("0076 settlePastRow moves a lone row", () => {
  it("reads Nasdaq's fiscal quarter end", () => {
    expect(nqPeriodEnd("Sep 2026")).toBe("2026-09-30");
    expect(nqPeriodEnd("Feb 2028")).toBe("2028-02-29");
    expect(nqPeriodEnd("Q3 2026")).toBeNull();
    expect(nqPeriodEnd(undefined)).toBeNull();
  });

  it("ROKU: history the day BEFORE the row moves it there, with the figures, whatever the session", () => {
    const hist = nqReports(surprise([["11/2/2026", 1.35, 0.55, "Sep 2026"], ["7/31/2026", 1.2, 0.61, "Jun 2026"]]));
    const out = settlePastRow(ev("ROKU", "2026-11-03"), hist, true, TODAY);
    expect(out).toMatchObject({ d: "2026-11-02", fd: "2026-11-03", eA: 1.35, eE: 0.55, pr: "n", nd: 1 });
    expect(out.h).toBe(""); // the history gives a day, not a time
    expect(settlePastRow(ev("X", "2026-11-03", { h: "bmo" }), hist, true, TODAY).d).toBe("2026-11-02");
    expect(settlePastRow(ev("X", "2026-11-03", { h: "" }), hist, true, TODAY).d).toBe("2026-11-02");
    // Over a weekend: Mon row, Fri history.
    const fri = nqReports(surprise([["11/6/2026", 1, 1, "Sep 2026"]]));
    expect(settlePastRow(ev("X", "2026-11-09", { h: "bmo" }), fri, true, TODAY).d).toBe("2026-11-06");
  });

  it("history the day AFTER an after-close row is Nasdaq's next-morning habit: the row keeps its day", () => {
    const out = settlePastRow(ev("ATO", "2026-11-04"), nqReports(surprise([["11/5/2026", 1.17, 1.14, "Sep 2026"]])), true, TODAY);
    expect(out.d).toBe("2026-11-04");
    expect(out.fd).toBeUndefined();
    expect(out.eA).toBe(1.17);
  });

  it("a same-quarter report 2 to 10 trading days away moves the row; the quarter before does not", () => {
    const row = ev("Z", "2026-11-04");
    // 4 trading days later, for the Sep quarter the row stands for.
    const later = settlePastRow(row, nqReports(surprise([["11/10/2026", 1, 0.9, "Sep 2026"]])), true, TODAY);
    expect(later).toMatchObject({ d: "2026-11-10", fd: "2026-11-04", h: "", eA: 1 });
    // 10 trading days earlier (Oct 21) moves; 11 (Oct 20) is too far to call.
    expect(settlePastRow(row, nqReports(surprise([["10/21/2026", 1, 1, "Sep 2026"]])), true, TODAY).d).toBe("2026-10-21");
    expect(settlePastRow(row, nqReports(surprise([["10/20/2026", 1, 1, "Sep 2026"]])), true, TODAY)).toBe(row);
    // A late filer's previous quarter (Jun) a few days off is a different report.
    expect(settlePastRow(row, nqReports(surprise([["11/10/2026", 1, 1, "Jun 2026"]])), true, TODAY)).toBe(row);
    expect(settlePastRow(row, nqReports(surprise([["10/29/2026", 1, 1, "Jun 2026"]])), true, TODAY)).toBe(row);
    // No quarter given: can't tell.
    const noPe = nqReports({ data: { earningsSurpriseTable: { rows: [{ dateReported: "11/10/2026", eps: 1, consensusForecast: 1 }] } } });
    expect(settlePastRow(row, noPe, true, TODAY)).toBe(row);
  });

  it("never moves a company-dated row, and a moved non-dollar row keeps the feed's figures", () => {
    const hist = nqReports(surprise([["11/2/2026", 1.35, 0.55, "Sep 2026"]]));
    const dated = settlePastRow(ev("X", "2026-11-03", { o: "https://example.com" }), hist, true, TODAY);
    expect(dated.d).toBe("2026-11-03");
    expect(dated.eA).toBe(1.35); // still filled, as 0072 did
    const fx = settlePastRow(ev("X", "2026-11-03"), hist, false, TODAY);
    expect(fx).toMatchObject({ d: "2026-11-02", fd: "2026-11-03", eA: null, eE: 0.53, nd: 1 });
  });
});

// Through the worker: a made-up symbol (no live override can touch it) whose feed row is on Tue Nov 3 while its
// history says Mon Nov 2 (ZZROK), and one 6 trading days off across a week edge (ZZFAR: feed Fri Oct 30, history
// Mon Nov 9, same quarter).
class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as any;
const fhRow = (symbol: string, date: string, hour = "amc") => ({ symbol, date, hour, quarter: 3, year: 2026, epsEstimate: 0.5, epsActual: null, revenueEstimate: 9e9, revenueActual: null });
const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(pending); pending = [];
  return r.json() as Promise<any>;
};
const rows = (b: any, s: string) => (b.events as EarningsEvent[]).filter((e) => e.s === s);

describe("0076 through /api/calendar", () => {
  beforeEach(() => {
    pending = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T15:00:00Z"));
    (globalThis as any).caches = { default: new MemCache() };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.hostname === "finnhub.io" && url.searchParams.get("symbol")) return new Response(JSON.stringify({ earningsCalendar: [] }));
      if (url.hostname === "finnhub.io" && url.pathname.endsWith("/calendar/earnings")) {
        const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
        const all = [fhRow("ZZROK", "2026-11-03"), fhRow("ZZFAR", "2026-10-30", "bmo")].filter((r) => r.date >= from && r.date <= to);
        return new Response(JSON.stringify({ earningsCalendar: all }));
      }
      const m = /\/api\/company\/([A-Z]+)\/earnings-surprise/.exec(url.pathname);
      if (m?.[1] === "ZZROK") return new Response(JSON.stringify(surprise([["11/2/2026", 1.35, 0.55, "Sep 2026"], ["7/31/2026", 1.2, 0.61, "Jun 2026"]])));
      if (m?.[1] === "ZZFAR") return new Response(JSON.stringify(surprise([["11/9/2026", 0.8, 0.7, "Sep 2026"]])));
      return new Response("{}", { status: 404 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("one ZZROK row, on Nov 2 with its actual; the Nov 3 day alone no longer lists it", async () => {
    const week = await get("/api/calendar?from=2026-11-02&to=2026-11-06");
    expect(rows(week, "ZZROK")).toEqual([expect.objectContaining({ d: "2026-11-02", eA: 1.35, fd: "2026-11-03" })]);
    expect(week.warnings).toEqual([]);
    expect(rows(await get("/api/calendar?from=2026-11-03&to=2026-11-03"), "ZZROK")).toEqual([]);
    expect(rows(await get("/api/calendar?from=2026-11-02&to=2026-11-02"), "ZZROK")).toEqual([expect.objectContaining({ d: "2026-11-02", eA: 1.35 })]);
  });

  it("a row moving across a week edge leaves its week and joins the week it moved to", async () => {
    const before = await get("/api/calendar?from=2026-10-26&to=2026-10-30");
    expect(rows(before, "ZZFAR")).toEqual([]);
    const after = await get("/api/calendar?from=2026-11-09&to=2026-11-13");
    expect(rows(after, "ZZFAR")).toEqual([expect.objectContaining({ d: "2026-11-09", fd: "2026-10-30", eA: 0.8, h: "" })]);
  });
});
