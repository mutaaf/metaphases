import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildIndex, crossCheck, crossOne, nasdaqDaySessions, windowDays, windowEnd, type NqWindow } from "../../shared/crossCheck";
import type { EarningsEvent } from "../../shared/types";
import worker from "../../worker/index";

// 0015: Finnhub's blank-session dates are often projections. Nasdaq's per-day calendar is a second opinion:
// we say when the two disagree (naming Nasdaq's date), fill a blank session when they agree, and never
// replace either date.

// Shaped like a recorded `api.nasdaq.com/api/calendar/earnings?date=` answer (2026-11-11, trimmed).
const nqDay = (rows: { symbol: string; time: string; marketCap?: string }[]) => ({
  data: { asOf: "Wed, Nov 11, 2026", headers: {}, rows: rows.map((r) => ({ lastYearRptDt: "11/12/2025", lastYearEPS: "$1.00", name: r.symbol, fiscalQuarterEnding: "Oct/2026", epsForecast: "$1.15", noOfEsts: "9", marketCap: r.marketCap ?? "$250,000,000,000", ...r })) },
});

const ev = (s: string, d: string, h: EarningsEvent["h"] = "", extra: Partial<EarningsEvent> = {}): EarningsEvent =>
  ({ s, d, h, q: 1, y: 2027, eE: 1, eA: null, rE: 1e9, rA: null, t: 1, ...extra });

const TODAY = "2026-11-09"; // a Monday
const win = (days: Record<string, Record<string, EarningsEvent["h"]>>, loaded = windowDays(TODAY)): NqWindow => {
  const got = Object.fromEntries(loaded.map((d) => [d, days[d] ?? {}]));
  return { from: TODAY, to: windowEnd(TODAY), loaded, idx: buildIndex(got) };
};

describe("nasdaqDaySessions", () => {
  it("maps Nasdaq's time labels to sessions and keeps only the rows asked for", () => {
    const body = nqDay([
      { symbol: "CSCO", time: "time-after-hours" },
      { symbol: "TJX", time: "time-pre-market" },
      { symbol: "CEG", time: "time-not-supplied" },
      { symbol: "TINY", time: "time-pre-market", marketCap: "$12,000,000" },
      { symbol: "MOG/A", time: "time-pre-market" },
    ]);
    expect(nasdaqDaySessions(body, (_s, cap) => cap >= 1e9)).toEqual({ CSCO: "amc", TJX: "bmo", CEG: "", "MOG.A": "bmo" });
  });

  it("is empty, not a crash, for an odd payload", () => {
    expect(nasdaqDaySessions({ data: { rows: null } })).toEqual({});
    expect(nasdaqDaySessions(null)).toEqual({});
  });
});

describe("crossOne", () => {
  it("agrees when Nasdaq lists the company the same day, and fills a blank session from it", () => {
    const w = win({ "2026-11-11": { CSCO: "amc" } });
    expect(crossOne("CSCO", "2026-11-11", "", w)).toEqual({ x: "agree", xh: "amc", h: "amc" });
    expect(crossOne("CSCO", "2026-11-11", "amc", w)).toEqual({ x: "agree", xh: "amc" });
  });

  it("never fills a session Nasdaq doesn't give", () => {
    const w = win({ "2026-11-11": { CEG: "" } });
    expect(crossOne("CEG", "2026-11-11", "", w)).toEqual({ x: "agree" });
  });

  it("differs, naming Nasdaq's day, when Nasdaq lists it on another day", () => {
    const w = win({ "2026-11-12": { CSCO: "amc" } });
    expect(crossOne("CSCO", "2026-11-18", "", w)).toEqual({ x: "differs", xd: "2026-11-12", xh: "amc" });
  });

  it("differs on the same day when the sessions disagree, but not for a during-hours report", () => {
    const w = win({ "2026-11-11": { HP: "amc", XYZ: "bmo" } });
    expect(crossOne("HP", "2026-11-11", "bmo", w)).toEqual({ x: "differs", xd: "2026-11-11", xh: "amc" });
    expect(crossOne("XYZ", "2026-11-11", "dmh", w)).toEqual({ x: "agree", xh: "bmo" });
  });

  it("is unknown only when every day in the window was checked", () => {
    expect(crossOne("NOPE", "2026-11-11", "", win({}))).toEqual({ x: "unknown" });
    const partial = windowDays(TODAY).filter((d) => d !== "2026-11-17");
    expect(crossOne("NOPE", "2026-11-11", "", win({}, partial))).toBeNull();
  });

  it("says nothing about a day whose Nasdaq answer failed", () => {
    const loaded = windowDays(TODAY).filter((d) => d !== "2026-11-11");
    expect(crossOne("CSCO", "2026-11-11", "", win({ "2026-11-12": { CSCO: "amc" } }, loaded))).toBeNull();
  });

  it("flags a projected date past the window when Nasdaq lists the company inside it, within a month", () => {
    const w = win({ "2026-11-20": { ROST: "amc" } });
    expect(crossOne("ROST", "2026-11-30", "", w)).toEqual({ x: "differs", xd: "2026-11-20", xh: "amc" });
    expect(crossOne("ROST", "2027-02-25", "", w)).toBeNull(); // a later quarter: not the same report
    expect(crossOne("OTHER", "2026-11-30", "", w)).toBeNull();
  });

  it("ignores past days and an empty window", () => {
    const w = win({ "2026-11-11": { CSCO: "amc" } });
    expect(crossOne("CSCO", "2026-11-06", "", w)).toBeNull();
    expect(crossOne("CSCO", "2026-11-11", "", { ...w, loaded: [] })).toBeNull();
  });
});

describe("crossCheck", () => {
  it("marks events, keeps both dates, and leaves company-dated and closed-day rows alone", () => {
    const w = win({ "2026-11-11": { CSCO: "amc", AAPL: "bmo" }, "2026-11-19": { ROST: "amc" } });
    const out = crossCheck([
      ev("CSCO", "2026-11-11"),
      ev("ROST", "2026-11-18"),
      ev("AXON", "2026-11-12", "amc", { o: "https://investors.axon.com/" }),
      ev("AAPL", "2026-11-26", "", { c: "Thanksgiving" }),
      ev("ZZZZ", "2026-11-13"),
    ], w);
    expect(out[0]).toMatchObject({ s: "CSCO", d: "2026-11-11", h: "amc", x: "agree" });
    expect(out[1]).toMatchObject({ s: "ROST", d: "2026-11-18", h: "", x: "differs", xd: "2026-11-19", xh: "amc" });
    expect(out[2].x).toBeUndefined();
    expect(out[3].x).toBeUndefined();
    expect(out[4]).toMatchObject({ x: "unknown" });
  });
});

// ── the worker: /api/calendar and /api/ticker ───────────────────────────
class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
let nqCalls: string[] = [];
let nqInFlight = 0, nqPeak = 0;
let nasdaq: (day: string) => Response | Promise<Response>;
const fhRow = (symbol: string, date: string, hour = "") => ({ symbol, date, hour, quarter: 1, year: 2027, epsEstimate: 1, epsActual: null, revenueEstimate: 5e9, revenueActual: null });
// Made-up symbols, so no live entry in data/date-overrides.json can win (LESSONS 2026-11-06).
const FH_ROWS = [fhRow("QQXA", "2026-11-11"), fhRow("QQXB", "2026-11-18", "bmo"), fhRow("QQXC", "2026-11-12")];

beforeEach(() => {
  waits = []; nqCalls = []; nqInFlight = 0; nqPeak = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T15:00:00Z")); // Monday 10 AM ET
  (globalThis as any).caches = { default: new MemCache() };
  nasdaq = (day) => new Response(JSON.stringify(nqDay(
    day === "2026-11-11" ? [{ symbol: "QQXA", time: "time-after-hours" }] :
    day === "2026-11-17" ? [{ symbol: "QQXB", time: "time-pre-market" }] :
    [{ symbol: "FILLER", time: "time-not-supplied" }],
  )));
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") {
      nqCalls.push(url.searchParams.get("date")!);
      nqInFlight++; nqPeak = Math.max(nqPeak, nqInFlight);
      await Promise.resolve();
      try { return await nasdaq(url.searchParams.get("date")!); } finally { nqInFlight--; }
    }
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: [] } } }));
    if (url.pathname.endsWith("/calendar/earnings")) {
      const sym = url.searchParams.get("symbol");
      if (sym) return new Response(JSON.stringify({ earningsCalendar: FH_ROWS.filter((r) => r.symbol === sym) }));
      const from = url.searchParams.get("from")!, to = url.searchParams.get("to")!;
      return new Response(JSON.stringify({ earningsCalendar: FH_ROWS.filter((r) => r.date >= from && r.date <= to) }));
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const call = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(waits); waits = [];
  return r.json() as Promise<any>;
};

describe("/api/calendar cross-check (0015)", () => {
  it("marks agree / differs / unknown and fills a session only on agreement", async () => {
    const r = await call("/api/calendar?from=2026-11-09&to=2026-11-20");
    const by = (s: string) => r.events.find((e: EarningsEvent) => e.s === s);
    expect(by("QQXA")).toMatchObject({ d: "2026-11-11", h: "amc", x: "agree" });
    expect(by("QQXB")).toMatchObject({ d: "2026-11-18", h: "bmo", x: "differs", xd: "2026-11-17", xh: "bmo" });
    expect(by("QQXC")).toMatchObject({ d: "2026-11-12", h: "", x: "unknown" });
    expect(r.warnings).toEqual([]);
    expect(r.unchecked).toBeUndefined();
  });

  it("makes at most 10 Nasdaq calls (one per weekday), 3 at a time, then serves them from the cache", async () => {
    await call("/api/calendar?from=2026-11-09&to=2026-11-13");
    expect(nqCalls.length).toBe(10);
    expect(nqPeak).toBeLessThanOrEqual(3);
    await call("/api/calendar?from=2026-11-16&to=2026-11-20");
    expect(nqCalls.length).toBe(10);
  });

  it("leaves the calendar intact when Nasdaq fails, with no warning (a warning means 'busy' and a retry, 0047)", async () => {
    nasdaq = () => new Response("nope", { status: 503 });
    const r = await call("/api/calendar?from=2026-11-09&to=2026-11-20");
    const qqxa = r.events.find((e: EarningsEvent) => e.s === "QQXA");
    expect(qqxa).toMatchObject({ d: "2026-11-11", h: "" });
    expect(qqxa.x).toBeUndefined();
    expect(r.warnings).toEqual([]);
    expect(r.unchecked).toBe(10);
  });

  it("treats an empty Nasdaq day as a failure: nothing there is called 'unknown'", async () => {
    nasdaq = (day) => new Response(JSON.stringify(day === "2026-11-12" ? { data: { rows: [] } } : nqDay([{ symbol: "FILLER", time: "time-not-supplied" }])));
    const r = await call("/api/calendar?from=2026-11-09&to=2026-11-20");
    expect(r.events.find((e: EarningsEvent) => e.s === "QQXC").x).toBeUndefined();
    expect(r.unchecked).toBe(1);
  });

  it("doesn't call Nasdaq for ranges far from the next two weeks", async () => {
    await call("/api/calendar?from=2027-03-01&to=2027-03-05");
    await call("/api/calendar?from=2026-10-05&to=2026-10-09");
    expect(nqCalls).toEqual([]);
  });
});

describe("/api/ticker cross-check (0015)", () => {
  it("names Nasdaq's date on the sheet when the calendar found a disagreement, with no extra upstream calls", async () => {
    await call("/api/calendar?from=2026-11-09&to=2026-11-20"); // the calendar folds the window into one cached copy
    const before = nqCalls.length;
    const t = await call("/api/ticker/QQXB");
    expect(t.next).toMatchObject({ date: "2026-11-18", session: "bmo", nasdaq: { date: "2026-11-17", session: "bmo" } });
    expect(nqCalls.length).toBe(before);
  });

  it("fills a blank session when both agree, and says nothing extra", async () => {
    await call("/api/calendar?from=2026-11-09&to=2026-11-20");
    const t = await call("/api/ticker/QQXA");
    expect(t.next).toMatchObject({ date: "2026-11-11", session: "amc" });
    expect(t.next.nasdaq).toBeUndefined();
  });

  it("without a cached window, the sheet is unchanged and Nasdaq's calendar isn't called", async () => {
    const t = await call("/api/ticker/QQXB");
    expect(t.next).toMatchObject({ date: "2026-11-18", session: "bmo" });
    expect(t.next.nasdaq).toBeUndefined();
    expect(nqCalls).toEqual([]);
  });
});
