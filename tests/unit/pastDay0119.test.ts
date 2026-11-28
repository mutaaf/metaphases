import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToEvents, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { nqReports, reportDayRow, settlePastRow } from "../../shared/pastRows";
import type { EarningsEvent } from "../../shared/types";
import worker from "../../worker/index";

// 0119: past rows a day off the company's own date, with no session. Kohl's (stock +19.5%) sat on Mon Nov 23 while
// its 8-K and Nasdaq both say Tue Nov 24 (9 a.m. call that morning); Urban Outfitters on Nov 23 against Nasdaq's
// Nov 24; Helmerich & Payne on Nov 19 (its entry used the call day) while its 8-K release is dated Nov 18.
// - A feed row Nasdaq's history dates one trading day LATER moves there unless the feed says "after the close" (that
//   is Nasdaq's next-morning habit, QQAM in 0080, ATO in 0076). A blank or before-open row a day early is the feed's
//   mistake; and if it was an evening report, the market reacts on Nasdaq's day either way, so the row never ends up
//   measured from the wrong close.
// - This now covers rows WITH figures too (0080's `nx` suspects: Nasdaq's day calendar didn't list them on the feed's
//   day), using the history read those suspects already make, so it adds no Nasdaq calls.

const ev = (s: string, d: string, extra: Partial<EarningsEvent> = {}): EarningsEvent => ({ s, d, h: "", q: 3, y: 2027, eE: -0.01, eA: null, rE: 3.4e9, rA: null, t: 0, ...extra });
const surprise = (rows: [string, number, number, string][]) => ({
  data: { earningsSurpriseTable: { rows: rows.map(([dateReported, eps, consensusForecast, fiscalQtrEnd]) => ({ fiscalQtrEnd, dateReported, eps, consensusForecast, percentageSurprise: 0 })) } },
});
const TODAY = "2026-11-28";
const KSS_HIST = nqReports(surprise([["11/24/2026", 0.32, -0.01, "Oct 2026"], ["8/26/2026", 1.28, 0.55, "Jul 2026"]]));

describe("0119 a past row with figures moves to the day Nasdaq dates it", () => {
  it("KSS shape: blank session, figures on Nov 23, history Nov 24 → Nov 24, the feed's day kept as fd", () => {
    const out = reportDayRow(ev("KSS", "2026-11-23", { eA: 0.32, pr: "n", nx: 1 }), KSS_HIST);
    expect(out).toMatchObject({ d: "2026-11-24", h: "", fd: "2026-11-23", nd: 1, eA: 0.32, eE: -0.01 });
  });

  it("a before-open row a day early moves too; history the day before moves whatever the session", () => {
    expect(reportDayRow(ev("X", "2026-11-23", { h: "bmo", eA: 1, nx: 1 }), KSS_HIST).d).toBe("2026-11-24");
    const hp = nqReports(surprise([["11/18/2026", 0.36, 0.22, "Sep 2026"]]));
    expect(reportDayRow(ev("X", "2026-11-19", { h: "amc", eA: 0.36, nx: 1 }), hp)).toMatchObject({ d: "2026-11-18", fd: "2026-11-19", h: "" });
  });

  it("unchanged: an after-close row Nasdaq dates the next morning, a same-day report, a company date, no history, far reports", () => {
    const amc = ev("QQAM", "2026-11-23", { h: "amc", eA: 0.5, nx: 1 });
    expect(reportDayRow(amc, KSS_HIST)).toBe(amc);
    const same = ev("X", "2026-11-24", { eA: 0.32, nx: 1 });
    expect(reportDayRow(same, KSS_HIST)).toBe(same);
    const dated = ev("X", "2026-11-23", { eA: 0.32, nx: 1, o: "https://example.com" });
    expect(reportDayRow(dated, KSS_HIST)).toBe(dated);
    const row = ev("X", "2026-11-23", { eA: 0.32, nx: 1 });
    expect(reportDayRow(row, null)).toBe(row);
    expect(reportDayRow(row, [])).toBe(row);
    expect(reportDayRow(row, nqReports(surprise([["11/27/2026", 0.32, 0.3, "Oct 2026"]])))).toBe(row); // 4 days: not this rule
    // Never onto a market holiday: Wed Nov 25 row, history dated Thanksgiving.
    const wed = ev("X", "2026-11-25", { eA: 1, nx: 1 });
    expect(reportDayRow(wed, nqReports(surprise([["11/26/2026", 1, 1, "Oct 2026"]])))).toBe(wed);
  });
});

describe("0119 a past row without figures (URBN shape)", () => {
  const hist = nqReports(surprise([["11/24/2026", 1.54, 1.53, "Oct 2026"]]));
  it("blank session on Nov 23, history Nov 24: moves to Nov 24 with Nasdaq's pair", () => {
    expect(settlePastRow(ev("URBN", "2026-11-23", { eE: 1.5566 }), hist, true, TODAY)).toMatchObject({ d: "2026-11-24", fd: "2026-11-23", h: "", eA: 1.54, eE: 1.53, pr: "n", nd: 1 });
  });
  it("an after-close row keeps its day (0076's next-morning habit), a same-day row too", () => {
    expect(settlePastRow(ev("URBN", "2026-11-23", { h: "amc" }), hist, true, TODAY)).toMatchObject({ d: "2026-11-23", eA: 1.54 });
    expect(settlePastRow(ev("URBN", "2026-11-24", { h: "amc" }), hist, true, TODAY)).toMatchObject({ d: "2026-11-24", nd: 1 });
  });
});

describe("0119 the companies' own dates: KSS and HP", () => {
  const FILE = overridesFile as unknown as DateOverrides;
  it("KSS: Nov 24 before the open (8-K: call 9 a.m. that morning); HP: Nov 18, no session (8-K names no time)", () => {
    expect(FILE.KSS).toMatchObject({ date: "2026-11-24", call: "9:00 a.m. ET", quarter: 3, year: 2027, source: expect.stringMatching(/^https:\/\/www\.sec\.gov\//) });
    expect(FILE.HP).toMatchObject({ date: "2026-11-18", quarter: 4, year: 2026, source: expect.stringMatching(/^https:\/\/www\.sec\.gov\//) });
    expect(FILE.HP.hour).toBeUndefined();
    expect(FILE.KSS.hour).toBeUndefined(); // the release states no time; the call settles it (0108)
    expect(validateOverrides({ KSS: FILE.KSS, HP: FILE.HP }, TODAY)).toEqual([]);
  });
  it("the feed's rows land on the companies' days", () => {
    const feed = [ev("KSS", "2026-11-23", { eA: 0.32, pr: "n" }), ev("HP", "2026-11-19", { h: "amc", q: 4, y: 2026, eA: 0.36 })];
    const out = applyToEvents(feed, FILE, "2026-11-16", "2026-11-27", TODAY);
    expect(out.find((e) => e.s === "KSS")).toMatchObject({ d: "2026-11-24", h: "bmo", eA: 0.32 });
    expect(out.find((e) => e.s === "HP")).toMatchObject({ d: "2026-11-18", h: "", eA: 0.36 });
  });
});

// Through the worker, with made-up symbols no live override touches. The feed dates QQKS (figures, blank session)
// and QQUR (no figures, blank) on Mon Nov 23; Nasdaq's Nov 23 calendar doesn't list them, its history says Nov 24.
// QQAM (after close, figures) and QQOK (listed by Nasdaq on its day) stay put.
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
  return (await r.json()) as any;
};
const fh = (symbol: string, date: string, epsActual: number | null, hour = "") =>
  ({ symbol, date, hour, quarter: 3, year: 2027, epsEstimate: 0.3, epsActual, revenueEstimate: 4.5e9, revenueActual: null });
const FEED = [fh("QQKS", "2026-11-23", 0.32), fh("QQUR", "2026-11-23", null), fh("QQAM", "2026-11-23", 0.5, "amc"), fh("QQOK", "2026-11-23", 0.3, "bmo")];
const HIST: Record<string, unknown> = {
  QQKS: surprise([["11/24/2026", 0.32, -0.01, "Oct 2026"], ["8/26/2026", 1.28, 0.55, "Jul 2026"]]),
  QQUR: surprise([["11/24/2026", 1.54, 1.53, "Oct 2026"], ["8/26/2026", 1.72, 1.72, "Jul 2026"]]),
  QQAM: surprise([["11/24/2026", 0.5, 0.45, "Oct 2026"]]),
  QQOK: surprise([["11/23/2026", 0.3, 0.25, "Oct 2026"]]),
};
let histCalls: string[] = [];

describe("0119 through /api/calendar", () => {
  beforeEach(() => {
    waits = []; histCalls = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-28T14:00:00Z"));
    (globalThis as any).caches = { default: new MemCache() };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") {
        const d = url.searchParams.get("date");
        const rows = d === "2026-11-23" ? [{ symbol: "QQOK", epsForecast: "$0.25", eps: "$0.30" }, { symbol: "FILLER", epsForecast: "$1.00", eps: "$1.10" }] : [{ symbol: "FILLER", epsForecast: "$1.00", eps: "$1.10" }];
        return new Response(JSON.stringify({ data: { rows } }));
      }
      const m = /\/api\/company\/([A-Z]+)\/earnings-surprise/.exec(url.pathname);
      if (m) { histCalls.push(m[1]); return HIST[m[1]] ? new Response(JSON.stringify(HIST[m[1]])) : new Response("{}", { status: 404 }); }
      if (url.hostname === "finnhub.io" && url.pathname.endsWith("/calendar/earnings")) {
        if (url.searchParams.get("symbol")) return new Response(JSON.stringify({ earningsCalendar: [] }));
        const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
        return new Response(JSON.stringify({ earningsCalendar: FEED.filter((r) => r.date >= from && r.date <= to) }));
      }
      if (url.pathname.endsWith("/stock/earnings")) return new Response("[]");
      return new Response("{}", { status: 200 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  const qq = (b: any) => Object.fromEntries((b.events as EarningsEvent[]).filter((e) => e.s.startsWith("QQ")).map((e) => [e.s, e]));

  it("the week: QQKS and QQUR on Nov 24 (none on Nov 23); QQAM and QQOK where the feed put them", async () => {
    // A cold colo's first read spends its PAST_FETCH_MAX history fetches on the live override rows of that week (real
    // symbols, no figures in this stub) before the suspects; the histories are cached 12 h, so the next read has them.
    await get("/api/calendar?from=2026-11-23&to=2026-11-27");
    const week = await get("/api/calendar?from=2026-11-23&to=2026-11-27");
    const by = qq(week);
    expect(by.QQKS).toMatchObject({ d: "2026-11-24", h: "", eA: 0.32 });
    expect(by.QQUR).toMatchObject({ d: "2026-11-24", h: "", eA: 1.54 });
    expect(by.QQAM).toMatchObject({ d: "2026-11-23", h: "amc", eA: 0.5 });
    expect(by.QQOK).toMatchObject({ d: "2026-11-23", h: "bmo", eA: 0.3 });
    expect(week.events.filter((e: EarningsEvent) => e.s.startsWith("QQ")).length).toBe(4); // one row each
    expect(by.QQKS.nx).toBeUndefined();
    expect(histCalls).not.toContain("QQOK"); // listed by Nasdaq on its day: no history read, as 0080
    expect(week.warnings).toEqual([]);
  });

  it("the single days agree (a drawer's or share card's range): Nov 24 has them, Nov 23 doesn't", async () => {
    await get("/api/calendar?from=2026-11-23&to=2026-11-27"); // settles and caches the days and the histories
    const mon = qq(await get("/api/calendar?from=2026-11-23&to=2026-11-23"));
    expect(Object.keys(mon).sort()).toEqual(["QQAM", "QQOK"]);
    const tue = qq(await get("/api/calendar?from=2026-11-24&to=2026-11-24"));
    expect(Object.keys(tue).sort()).toEqual(["QQKS", "QQUR"]);
    expect(tue.QQKS).toMatchObject({ d: "2026-11-24", eA: 0.32 });
  });
});
