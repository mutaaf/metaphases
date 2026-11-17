import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIGURES_CHECK_MAX, needsFiguresCheck, nqReports, phantomReport, settleFiguresRow } from "../../shared/pastRows";
import { splitClosed } from "../../shared/closedRows";
import { tickerShareTitle } from "../../shared/pending";
import type { EarningsEvent } from "../../shared/types";
import worker from "../../worker/index";

// 0080 (critic 2026-11-17 07:00): the feed had a UiPath row on Thu Nov 12 WITH figures (EPS $0.11 vs $0.20, revenue
// $354.7M), and every surface stated it as a report ("Just reported · Missed by 44%"). UiPath didn't report then:
// its Q3 is Dec 3, and Nasdaq's history ends Sep 3. A row with figures that the company's own history says never
// came out is withheld and filed under "Date not confirmed", like 0072's rows. Made-up symbols (QQPH…), so no live
// date override can touch them (LESSONS 2026-11-13).

const TODAY = "2026-11-17"; // Tue: Nov 12 (Thu) is 3 trading days back
const surprise = (rows: [string, number, number, string?][]) => ({
  data: { earningsSurpriseTable: { rows: rows.map(([dateReported, eps, consensusForecast, fiscalQtrEnd = "Jul 2026"]) => ({ fiscalQtrEnd, dateReported, eps, consensusForecast, percentageSurprise: 0 })) } },
});
const PATH_HIST = [["9/3/2026", 0.09, 0.04], ["5/28/2026", 0.06, 0.04, "Apr 2026"], ["3/11/2026", 0.18, 0.12, "Jan 2026"]] as [string, number, number, string?][];
const row = (s: string, d: string, extra: Partial<EarningsEvent> = {}): EarningsEvent =>
  ({ s, d, h: "dmh", q: 3, y: 2027, eE: 0.1954, eA: 0.11, rE: 451950780, rA: 354653000, t: 1, nx: 1, ...extra });

describe("0080 phantomReport / settleFiguresRow", () => {
  const hist = nqReports(surprise(PATH_HIST));

  it("a PATH-shaped row (figures on Nov 12, history newest Sep 3, today Nov 17) is withheld and flagged", () => {
    expect(phantomReport("2026-11-12", hist, TODAY)).toBe(true);
    const out = settleFiguresRow(row("PATH", "2026-11-12", { nA: 0.12, nE: 0.2 }), hist, TODAY);
    expect(out).toMatchObject({ s: "PATH", d: "2026-11-12", eA: null, rA: null, eE: 0.1954, rE: 451950780, od: true, pf: 1 });
    expect(out.nA).toBeUndefined();
    expect(out.nE).toBeUndefined();
    expect(out.nx).toBeUndefined();
    // It isn't a dated report anywhere the calendar splits days.
    expect(splitClosed([out]).unconfirmed).toHaveLength(1);
  });

  it("the same row with a history entry on Nov 12 or Nov 13 is unchanged", () => {
    for (const d of ["11/12/2026", "11/13/2026", "11/11/2026"]) {
      const h = nqReports(surprise([[d, 0.11, 0.2, "Oct 2026"], ...PATH_HIST]));
      expect(phantomReport("2026-11-12", h, TODAY)).toBe(false);
      const r = row("PATH", "2026-11-12");
      expect(settleFiguresRow(r, h, TODAY)).toBe(r);
    }
  });

  it("a row only 2 trading days old is unchanged (Nasdaq may not have posted it yet)", () => {
    expect(phantomReport("2026-11-13", hist, TODAY)).toBe(false);
    expect(phantomReport("2026-11-12", hist, "2026-11-16")).toBe(false);
  });

  it("no readable history, an empty table, a company-dated row, a later report or a recent one: unchanged", () => {
    expect(phantomReport("2026-11-12", null, TODAY)).toBe(false);
    expect(phantomReport("2026-11-12", [], TODAY)).toBe(false);
    expect(phantomReport("2026-11-12", hist, TODAY, "https://example.com")).toBe(false);
    expect(phantomReport("2026-11-12", nqReports(surprise([["11/16/2026", 1, 1]])), TODAY)).toBe(false); // reported since
    expect(phantomReport("2026-11-12", nqReports(surprise([["10/1/2026", 1, 1]])), TODAY)).toBe(false); // weeks before
  });

  it("only Nasdaq-unlisted (`nx`) rows with figures, old enough and inside the lookback, are worth a read", () => {
    expect(needsFiguresCheck(row("PATH", "2026-11-12"), TODAY)).toBe(true);
    expect(needsFiguresCheck(row("PATH", "2026-11-12", { nx: undefined }), TODAY)).toBe(false); // Nasdaq listed it
    expect(needsFiguresCheck(row("PATH", "2026-11-12", { eA: null, rA: null }), TODAY)).toBe(false); // 0072's path
    expect(needsFiguresCheck(row("PATH", "2026-11-13"), TODAY)).toBe(false); // 2 trading days
    expect(needsFiguresCheck(row("PATH", "2026-11-12", { o: "https://example.com" }), TODAY)).toBe(false);
    expect(needsFiguresCheck(row("PATH", "2026-09-01"), TODAY)).toBe(false); // beyond the lookback
    expect(needsFiguresCheck(row("PATH", "2026-11-12", { od: true }), TODAY)).toBe(false);
  });
});

// Through the worker. The feed's Nov 9–13 week has QQPH (figures, Nasdaq's Nov 12 calendar doesn't list it, history
// ends Sep 3), QQAM (figures, not listed on Nov 12 because Nasdaq dated it the next morning: history Nov 13) and QQOK
// (figures, listed by Nasdaq that day: never costs a history read).
class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(waits); waits = [];
  return { status: r.status, body: (await r.json()) as any };
};
const fh = (symbol: string, date: string, epsActual: number | null, revenueActual: number | null, hour = "amc") =>
  ({ symbol, date, hour, quarter: 3, year: 2027, epsEstimate: 0.1954, epsActual, revenueEstimate: 4.5e9, revenueActual });
const FEED = [
  fh("QQPH", "2026-11-12", 0.11, 3.5e9, "dmh"),
  fh("QQAM", "2026-11-12", 0.5, 4.6e9),
  fh("QQOK", "2026-11-12", 0.3, 4.4e9),
];
let nqHist: Record<string, unknown>;
let nqDayRows: (d: string) => unknown[] | null;
let histCalls: string[] = [];
let upcoming: unknown[] = [];

beforeEach(() => {
  waits = []; histCalls = []; upcoming = [];
  nqHist = {
    QQPH: surprise(PATH_HIST),
    QQAM: surprise([["11/13/2026", 0.5, 0.45, "Sep 2026"], ["8/13/2026", 0.4, 0.4, "Jun 2026"]]),
    QQOK: surprise([["11/12/2026", 0.3, 0.25, "Sep 2026"]]),
  };
  nqDayRows = (d) => d === "2026-11-12" ? [{ symbol: "QQOK", epsForecast: "$0.25", eps: "$0.30", time: "time-after-hours" }, { symbol: "FILLER", epsForecast: "$1.00", eps: "$1.10" }] : [{ symbol: "FILLER", epsForecast: "$1.00" }];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T19:00:00Z"));
  (globalThis as any).caches = { default: new MemCache() };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") {
      const rows = nqDayRows(url.searchParams.get("date")!);
      return rows ? new Response(JSON.stringify({ data: { rows } })) : new Response("busy", { status: 503 });
    }
    const m = /\/api\/company\/([A-Z]+)\/earnings-surprise/.exec(url.pathname);
    if (m) { histCalls.push(m[1]); return nqHist[m[1]] ? new Response(JSON.stringify(nqHist[m[1]])) : new Response("busy", { status: 503 }); }
    if (url.hostname === "finnhub.io" && url.pathname.endsWith("/calendar/earnings")) {
      if (url.searchParams.get("symbol")) return new Response(JSON.stringify({ earningsCalendar: url.searchParams.get("symbol") === "QQPH" ? upcoming : [] }));
      const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
      return new Response(JSON.stringify({ earningsCalendar: FEED.filter((r) => r.date >= from && r.date <= to) }));
    }
    if (url.pathname.endsWith("/stock/earnings")) return new Response("[]");
    return new Response("{}", { status: 200 });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("0080 through /api/calendar", () => {
  it("withholds QQPH's Nov 12 figures and files it as no report; QQAM and QQOK stay judged", async () => {
    const { status, body } = await get("/api/calendar?from=2026-11-09&to=2026-11-13");
    expect(status).toBe(200);
    const by = (s: string) => body.events.find((e: EarningsEvent) => e.s === s);
    expect(by("QQPH")).toMatchObject({ d: "2026-11-12", eA: null, rA: null, od: true, pf: 1 });
    expect(by("QQAM")).toMatchObject({ d: "2026-11-12", eA: 0.5 });
    expect(by("QQAM").od).toBeUndefined();
    expect(by("QQOK")).toMatchObject({ eA: 0.3 });
    expect(by("QQOK").nx).toBeUndefined();
    // Only the unlisted suspects cost a history read.
    expect(histCalls.filter((s) => s.startsWith("QQ")).sort()).toEqual(["QQAM", "QQPH"]); // live override rows are 0072's
    // The Nov 12 drawer counts 2 dated reports; QQPH is unconfirmed.
    const { dated, unconfirmed } = splitClosed(body.events.filter((e: EarningsEvent) => e.d === "2026-11-12" && e.s.startsWith("QQ"))); // live overrides add real rows
    expect(dated.map((e: EarningsEvent) => e.s).sort()).toEqual(["QQAM", "QQOK"]);
    expect(unconfirmed.map((e: EarningsEvent) => e.s)).toEqual(["QQPH"]);
    // The same answer for the single day (a share card's or drawer's range).
    const one = await get("/api/calendar?from=2026-11-12&to=2026-11-12");
    expect(one.body.events.find((e: EarningsEvent) => e.s === "QQPH")).toMatchObject({ eA: null, od: true, pf: 1 });
  });

  it("a failed history read or a failed Nasdaq day leaves the row as it was, never a 500", async () => {
    delete nqHist.QQPH;
    let r = await get("/api/calendar?from=2026-11-09&to=2026-11-13");
    expect(r.status).toBe(200);
    expect(r.body.events.find((e: EarningsEvent) => e.s === "QQPH")).toMatchObject({ eA: 0.11 });
    expect(r.body.warnings).toEqual([]);

    (globalThis as any).caches = { default: new MemCache() };
    nqHist.QQPH = surprise(PATH_HIST);
    nqDayRows = () => null; // Nasdaq's day calendar down: no suspects at all
    histCalls = [];
    r = await get("/api/calendar?from=2026-11-09&to=2026-11-13");
    expect(r.status).toBe(200);
    expect(r.body.events.find((e: EarningsEvent) => e.s === "QQPH")).toMatchObject({ eA: 0.11 });
    expect(histCalls.filter((s) => s.startsWith("QQ"))).toEqual([]);
  });

  it("caps the history reads for suspects with figures per request", async () => {
    expect(FIGURES_CHECK_MAX).toBeLessThanOrEqual(8);
    const many = Array.from({ length: 12 }, (_, i) => fh(`QQX${String.fromCharCode(65 + i)}`, "2026-11-10", 1, 4.5e9));
    FEED.push(...many);
    try {
      await get("/api/calendar?from=2026-11-09&to=2026-11-13");
      expect(histCalls.filter((s) => s.startsWith("QQX")).length).toBeLessThanOrEqual(FIGURES_CHECK_MAX);
    } finally { FEED.splice(3); }
  });
});

describe("0080 through /api/ticker", () => {
  const sheet = async () => (await get("/api/ticker/QQPH")).body;

  it("no Nov 12 history entry, no 'Just reported'; the quarter reads as not reported yet", async () => {
    // Finnhub's symbol= answer carries the past row with figures, plus the following quarter.
    upcoming = [fh("QQPH", "2026-11-12", 0.11, 3.5e9, "dmh"), { ...fh("QQPH", "2027-03-09", null, null), quarter: 4 }];
    await get("/api/calendar?from=2026-11-09&to=2026-11-13"); // the calendar caches the Nov 12 day, as in production
    const t = await sheet();
    expect(t.history.find((h: any) => h.date === "2026-11-12")).toBeUndefined();
    expect(t.justReported ?? null).toBeNull();
    expect(t.next).toMatchObject({ date: "2026-11-12", quarter: 3, year: 2027, overdue: true });
    expect(tickerShareTitle("QQPH", "Qqph Inc", t.next, t.justReported)).not.toMatch(/reported Q3/);
    expect(t.read.join(" ")).not.toMatch(/miss/i);
  });

  it("with only the past row in the feed (no future row), the sheet still never says it reported", async () => {
    upcoming = [];
    await get("/api/calendar?from=2026-11-09&to=2026-11-13");
    const t = await sheet();
    expect(t.history.find((h: any) => h.date === "2026-11-12")).toBeUndefined();
    expect(t.justReported ?? null).toBeNull();
  });

  it("a real report (history has Nov 13) keeps its figures in the sheet", async () => {
    nqHist.QQPH = surprise([["11/13/2026", 0.11, 0.2, "Oct 2026"], ...PATH_HIST]);
    upcoming = [fh("QQPH", "2026-11-12", 0.11, 3.5e9, "dmh"), { ...fh("QQPH", "2027-03-09", null, null), quarter: 4 }];
    const t = await sheet();
    expect(t.history.some((h: any) => h.date === "2026-11-12" || h.date === "2026-11-13")).toBe(true);
  });
});
