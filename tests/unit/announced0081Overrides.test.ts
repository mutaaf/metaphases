import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToEvents, applyToRows, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import worker from "../../worker/index";

// 0081: PDD (Nov 12: "before U.S. markets open on Thursday, November 19") and UiPath (Nov 5: "after the market
// closes on Thursday, December 3") state their session. Intuit's IR events list gives Nov 19 and a 4:30 PM ET call,
// and Deere's notice (Nov 11) a 9:00 a.m. CT call on Nov 25: a call time alone isn't a session, so both are
// date-only. Finnhub's feed: PDD Mon Nov 16; INTU Nov 19 after the close; DE Nov 25 after the close; PATH a
// phantom Q3 row on Nov 12 *with figures* (0080) and a projected Q4 row on Mar 9.

const FILE = overridesFile as unknown as DateOverrides;
const today = "2026-11-17";
const feed = [
  { symbol: "PDD", date: "2026-11-16", hour: "bmo", quarter: 3, year: 2026, epsEstimate: 19.213, epsActual: null, revenueEstimate: 117133197205, revenueActual: null },
  { symbol: "INTU", date: "2026-11-19", hour: "amc", quarter: 1, year: 2027, epsEstimate: 2.7497, epsActual: null, revenueEstimate: 4391554665, revenueActual: null },
  { symbol: "DE", date: "2026-11-25", hour: "amc", quarter: 4, year: 2026, epsEstimate: 4.1688, epsActual: null, revenueEstimate: 10677445374, revenueActual: null },
  { symbol: "PATH", date: "2026-11-12", hour: "dmh", quarter: 3, year: 2027, epsEstimate: 0.1954, epsActual: 0.11, revenueEstimate: 451950780, revenueActual: 354653000 },
  { symbol: "PATH", date: "2027-03-09", hour: "amc", quarter: 4, year: 2027, epsEstimate: 0.3043, epsActual: null, revenueEstimate: 530914080, revenueActual: null },
];
const WANT: Record<string, { date: string; hour: string; quarter: number; year: number }> = {
  PDD: { date: "2026-11-19", hour: "bmo", quarter: 3, year: 2026 },
  INTU: { date: "2026-11-19", hour: "", quarter: 1, year: 2027 },
  DE: { date: "2026-11-25", hour: "", quarter: 4, year: 2026 },
  PATH: { date: "2026-12-03", hour: "amc", quarter: 3, year: 2027 },
};
const SYMS = Object.keys(WANT);
// 0108: the session shown. Neither INTU nor DE names one (nor a call time that settles one: DE's 10 a.m. ET call is in
// market hours, INTU's entry has no `call`), so Nasdaq's timed listing for the company's own day fills it, expected.
const SHOWN: Record<string, { h: string; hs?: "n" }> = { PDD: { h: "bmo" }, INTU: { h: "amc", hs: "n" }, DE: { h: "bmo", hs: "n" }, PATH: { h: "amc" } };
const SOURCE: Record<string, string> = {
  PDD: "https://www.quiverquant.com/news/PDD+Holdings+to+Report+Third+Quarter+2026+Financial+Results+on+November+19",
  INTU: "https://investors.intuit.com/",
  DE: "https://www.placera.se/pressmeddelanden/deere-to-announce-fourth-quarter-2026-financial-results-20261111-1",
  PATH: "https://investingnews.com/uipath-announces-third-quarter-fiscal-2027-financial-results-conference-call/",
};

describe("0081 PDD, INTU, DE and PATH on their announced date", () => {
  for (const s of SYMS) {
    it(`${s}: the entry passes the gate, ${WANT[s].date}${WANT[s].hour ? ` ${WANT[s].hour}` : ", no session"}`, () => {
      expect(FILE[s]).toMatchObject({ date: WANT[s].date, quarter: WANT[s].quarter, year: WANT[s].year, source: SOURCE[s] });
      expect(FILE[s]?.hour ?? "").toBe(WANT[s].hour);
      expect(validateOverrides({ [s]: FILE[s] }, today)).toEqual([]);
    });
  }

  it("a future company date never carries figures from a misfiled feed row (PATH's phantom Nov 12 'miss')", () => {
    const rows = applyToRows("PATH", feed.filter((r) => r.symbol === "PATH"), FILE, today);
    const dec = rows.find((r) => r.date === "2026-12-03");
    expect(dec).toMatchObject({ hour: "amc", epsEstimate: 0.1954, epsActual: null, revenueActual: null, source: SOURCE.PATH });
    const ev = applyToEvents([{ s: "PATH", d: "2026-11-12", h: "dmh", q: 3, y: 2027, eE: 0.1954, eA: 0.11, rE: 451950780, rA: 354653000, t: 1 }], FILE, "2026-11-30", "2026-12-04", today);
    expect(ev.filter((e) => e.s === "PATH")).toEqual([expect.objectContaining({ d: "2026-12-03", h: "amc", eE: 0.1954, eA: null, rA: null, o: SOURCE.PATH })]);
  });

  for (const day of ["2026-12-03", "2026-12-04", "2026-12-17"]) {
    it(`on ${day} the phantom figures still don't land on Dec 3 (the row is weeks early for that report)`, () => {
      const rows = applyToRows("PATH", feed.filter((r) => r.symbol === "PATH"), FILE, day);
      expect(rows.find((r) => r.date === "2026-12-03")).toMatchObject({ epsEstimate: 0.1954, epsActual: null, revenueActual: null });
      const ev = applyToEvents([{ s: "PATH", d: "2026-11-12", h: "dmh", q: 3, y: 2027, eE: 0.1954, eA: 0.11, rE: 451950780, rA: 354653000, t: 1 }], FILE, "2026-11-30", "2026-12-04", day);
      expect(ev.filter((e) => e.s === "PATH")).toEqual([expect.objectContaining({ d: "2026-12-03", eA: null, rA: null })]);
    });
  }

  it("real results on a row the feed dated near the company's day still carry once that day has come (FIS-style)", () => {
    const O: DateOverrides = { X: { date: "2026-11-19", hour: "amc", quarter: 3, year: 2026, source: "https://example.com/x", checked: "2026-11-17" } };
    const early = { s: "X", d: "2026-11-18", h: "", q: 3, y: 2026, eE: 1, eA: 1.2, rE: 10, rA: 11, t: 1 };
    expect(applyToEvents([early], O, "2026-11-16", "2026-11-20", "2026-11-20")).toEqual([expect.objectContaining({ d: "2026-11-19", eA: 1.2, rA: 11 })]);
    expect(applyToEvents([early], O, "2026-11-16", "2026-11-20", "2026-11-18")).toEqual([expect.objectContaining({ d: "2026-11-19", eA: null, rA: null })]);
    const late = { symbol: "X", date: "2026-11-20", hour: "", quarter: 3, year: 2026, epsEstimate: 1, epsActual: 1.2, revenueEstimate: 10, revenueActual: 11 };
    expect(applyToRows("X", [late], O, "2026-11-20")).toEqual([expect.objectContaining({ date: "2026-11-19", epsActual: 1.2 })]);
  });

  it("the phantom Nov 12 PATH row leaves the week it was misfiled in", () => {
    const ev = applyToEvents([{ s: "PATH", d: "2026-11-12", h: "dmh", q: 3, y: 2027, eE: 0.1954, eA: 0.11, rE: 451950780, rA: 354653000, t: 1 }], FILE, "2026-11-09", "2026-11-13", today);
    expect(ev.filter((e) => e.s === "PATH")).toEqual([]);
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
const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(pending); pending = [];
  return r.json() as Promise<any>;
};

describe("0081 the companies' dates through the worker", () => {
  beforeEach(() => {
    pending = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T21:00:00Z"));
    const cache = new MemCache();
    // Nasdaq's day calendar: the company's stated session wins; its silence takes Nasdaq's timed listing, expected (0108).
    cache.store.set(`https://cache.metaphases.internal/${encodeURIComponent("nq:x:v1:2026-11-19")}`, JSON.stringify({ PDD: "bmo", INTU: "amc" }));
    cache.store.set(`https://cache.metaphases.internal/${encodeURIComponent("nq:x:v1:2026-11-25")}`, JSON.stringify({ DE: "bmo" }));
    (globalThis as any).caches = { default: cache };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.pathname.endsWith("/calendar/earnings")) {
        const from = url.searchParams.get("from") ?? "0000", to = url.searchParams.get("to") ?? "9999";
        const sym = url.searchParams.get("symbol");
        // symbol= returns future rows only (PDD: none at all after its projected day passed).
        const rows = feed.filter((r) => sym ? r.symbol === sym && r.date >= today && r.symbol !== "PDD" : r.date >= from && r.date <= to);
        return new Response(JSON.stringify({ earningsCalendar: rows }));
      }
      if (url.pathname.endsWith("/stock/earnings")) return new Response("[]");
      return new Response("{}", { status: 404 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  for (const [from, to] of [["2026-11-16", "2026-11-22"], ["2026-11-19", "2026-11-19"], ["2026-11-23", "2026-11-27"], ["2026-11-30", "2026-12-04"], ["2026-11-18", "2026-12-04"]]) {
    it(`/api/calendar ${from}..${to}: each row sits on the company's day with its session, no figures`, async () => {
      const r = await get(`/api/calendar?from=${from}&to=${to}`);
      for (const s of SYMS) {
        const rows = r.events.filter((e: any) => e.s === s);
        const inRange = WANT[s].date >= from && WANT[s].date <= to;
        expect(rows, s).toHaveLength(inRange ? 1 : 0);
        if (!inRange) continue;
        expect(rows[0]).toMatchObject({ d: WANT[s].date, h: SHOWN[s].h, o: SOURCE[s], eA: null, rA: null });
        expect(rows[0].c).toBeUndefined();
        expect(rows[0].hs).toBe(SHOWN[s].hs);
        expect(rows[0].x).toBeUndefined();
      }
    });
  }

  for (const s of SYMS) {
    it(`/api/ticker/${s}: next is the company's date and session, confirmed`, async () => {
      const r = await get(`/api/ticker/${s}`);
      expect(r.next).toMatchObject({ date: WANT[s].date, session: SHOWN[s].h, confirmed: SOURCE[s] });
      expect(r.next.hs).toBe(SHOWN[s].hs);
      expect(r.next.projected).toBeUndefined();
      expect(r.next.nasdaq).toBeUndefined();
      expect(r.next.status).toBeUndefined();
    });
  }
});
