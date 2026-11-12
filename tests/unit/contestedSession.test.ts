import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToRows, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { contestedSession, isContested } from "../../shared/reaction";

// 0060: Finnhub and Nasdaq list the same date in different sessions (ADI, DE, ROAD: Finnhub "amc", Nasdaq "bmo",
// Nasdaq right; WMG: the reverse, Finnhub right). Neither feed wins blindly: the stock's own closes say which day
// the market reacted on, or the moves read "—". Made-up symbols (LESSONS 2026-11-06), except ADI's override.

const REPORTS = ["2026-08-20", "2026-05-21", "2026-02-19", "2025-11-20"]; // Thursdays, newest first

/**
 * Weekday closes from Sep 2025 to Nov 11 2026, flat at 100 except around each report: `day[i]` is the report
 * day's move (close the day before → the day), `next[i]` the day after's (the day → the next day), in %.
 */
function closes(day: number[], next: number[]) {
  const timestamp: number[] = [], close: number[] = [];
  let px = 100, bump: number | null = null;
  for (let t = Date.parse("2025-09-01T20:00:00Z"); t <= Date.parse("2026-11-11T21:00:00Z"); t += 86400000) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const iso = d.toISOString().slice(0, 10);
    const i = REPORTS.indexOf(iso);
    if (bump != null) { px *= 1 + bump / 100; bump = null; }
    if (i >= 0) { px *= 1 + day[i] / 100; bump = next[i]; }
    timestamp.push(t / 1000); close.push(px);
  }
  return { timestamp, close };
}
const closeOnFor = ({ timestamp, close }: { timestamp: number[]; close: number[] }) => {
  const days = timestamp.map((t) => new Date(t * 1000).toISOString().slice(0, 10));
  return (d: string, off: number) => { const i = days.indexOf(d); return i < 0 ? null : close[i + off] ?? null; };
};

// ADI-shaped: the big moves land on the report day (a before-the-open reporter), as measured from its closes.
const ADI_DAY = [-0.9, -3.9, 2.6, 5.3], ADI_NEXT = [-0.8, -3.5, -0.3, 2.3];
// WMG-shaped: the big moves land the day after (an after-the-close reporter).
const WMG_DAY = [0.8, 2.3, 0, -2.7], WMG_NEXT = [1.7, 7.5, 3.1, 3.4];

describe("contestedSession", () => {
  it("the session whose reaction day carries the larger move in 3 of 4 reports wins, whichever feed said it", () => {
    expect(contestedSession("amc", "bmo", REPORTS, closeOnFor(closes(ADI_DAY, ADI_NEXT)))).toBe("bmo");
    expect(contestedSession("bmo", "amc", REPORTS, closeOnFor(closes(ADI_DAY, ADI_NEXT)))).toBe("bmo");
    expect(contestedSession("amc", "bmo", REPORTS, closeOnFor(closes(WMG_DAY, WMG_NEXT)))).toBe("amc");
  });
  it("DE-shaped: three measurable reports, all three on the report day → bmo", () => {
    expect(contestedSession("amc", "bmo", REPORTS.slice(0, 3), closeOnFor(closes([6.9, -5.2, 11.6, 0], [4.3, -0.4, 0.1, 0])))).toBe("bmo");
  });
  it("no clear winner (2 of 4), or fewer than 3 measurable reports: unknown", () => {
    expect(contestedSession("amc", "bmo", REPORTS, closeOnFor(closes([5, 5, 1, 1], [1, 1, 5, 5])))).toBe("");
    expect(contestedSession("amc", "bmo", REPORTS.slice(0, 2), closeOnFor(closes(ADI_DAY, ADI_NEXT)))).toBe("");
    expect(contestedSession("amc", "bmo", ["2024-01-04", "2024-04-04", "2024-07-03"], closeOnFor(closes(ADI_DAY, ADI_NEXT)))).toBe("");
  });
  it("only two different timed sessions are contested (Nasdaq has no during-hours label)", () => {
    expect(isContested("amc", "bmo")).toBe(true);
    expect(isContested("amc", "amc")).toBe(false);
    expect(isContested("dmh", "bmo")).toBe(false);
    expect(isContested("", "bmo")).toBe(false);
    expect(isContested("amc", undefined)).toBe(false);
  });
});

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
const CAL = (k: string) => `https://cache.metaphases.internal/${encodeURIComponent(k)}`;

const SYM = "ZZZC";
const NEXT_DAY = "2026-11-24";
const nqRows = REPORTS.map((d) => { const [y, m, dd] = d.split("-"); return { fiscalQtrEnd: "Jul 2026", dateReported: `${+m}/${+dd}/${y}`, eps: 1.0, consensusForecast: "0.95", percentageSurprise: "5.26" }; });
let cache: MemCache;

function stub(sym: string, finnhubHour: string, chart: { timestamp: number[]; close: number[] }) {
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") return new Response(JSON.stringify({ data: { rows: [] } }));
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nqRows } } }));
    if (url.hostname.endsWith("finance.yahoo.com")) return new Response(JSON.stringify({ chart: { result: [{ timestamp: chart.timestamp, indicators: { quote: [{ open: chart.close, high: chart.close, low: chart.close, close: chart.close }] } }] } }));
    if (url.pathname.endsWith("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: [{ symbol: sym, date: NEXT_DAY, hour: finnhubHour, quarter: 4, year: 2026, epsEstimate: 1.1, epsActual: null, revenueEstimate: 4e9, revenueActual: null }] }));
    return new Response("{}", { status: 404 });
  }));
}
beforeEach(() => {
  waits = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T16:00:00Z"));
  cache = new MemCache();
  (globalThis as any).caches = { default: cache };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const sheet = async (sym = SYM) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases/api/ticker/${sym}`), env, ctx);
  await Promise.all(waits); waits = [];
  return r.json() as Promise<any>;
};
const nasdaqSays = (sym: string, h: "bmo" | "amc") => cache.store.set(CAL(`nq:x:v1:${NEXT_DAY}`), JSON.stringify({ [sym]: h }));
const mean = (xs: number[]) => xs.reduce((a, b) => a + Math.abs(b), 0) / xs.length;

describe("/api/ticker when the two calendars disagree on the session", () => {
  it("ADI shape (Finnhub amc, Nasdaq bmo, moves on the report day): moves and the typical move are the report day's", async () => {
    stub(SYM, "amc", closes(ADI_DAY, ADI_NEXT));
    nasdaqSays(SYM, "bmo");
    const r = await sheet();
    expect(r.next).toMatchObject({ date: NEXT_DAY, session: "amc", nasdaq: { date: NEXT_DAY, session: "bmo" } });
    expect(r.moveSession).toEqual({ feed: "amc", nasdaq: "bmo", session: "bmo" });
    r.history.slice(0, 4).forEach((h: any, i: number) => { expect(h.session).toBe("bmo"); expect(h.move).toBeCloseTo(ADI_DAY[i], 4); });
    expect(r.expectedMove).toBeCloseTo(mean(ADI_DAY), 4); // ±3.2, never Finnhub's ±1.7
    const read = r.read.join(" ");
    expect(read).toContain("measured on the day the stock has usually moved: the report day");
    expect(read).toContain(`±${mean(ADI_DAY).toFixed(1)}%`);
  });

  it("WMG shape (Finnhub amc right, Nasdaq bmo): the after-close day stands", async () => {
    stub(SYM, "amc", closes(WMG_DAY, WMG_NEXT));
    nasdaqSays(SYM, "bmo");
    const r = await sheet();
    expect(r.moveSession).toEqual({ feed: "amc", nasdaq: "bmo", session: "amc" });
    r.history.slice(0, 4).forEach((h: any, i: number) => expect(h.move).toBeCloseTo(WMG_NEXT[i], 4));
    expect(r.expectedMove).toBeCloseTo(mean(WMG_NEXT), 4);
  });

  it("the past moves don't settle it: every move '—', no typical move anywhere, and the sheet says why", async () => {
    stub(SYM, "amc", closes([5, 5, 1, 1], [1, 1, 5, 5]));
    nasdaqSays(SYM, "bmo");
    const r = await sheet();
    expect(r.moveSession).toEqual({ feed: "amc", nasdaq: "bmo", session: "" });
    expect(r.history.slice(0, 4).map((h: any) => h.move)).toEqual([null, null, null, null]);
    expect(r.expectedMove).toBeNull();
    const read = r.read.join(" ");
    expect(read).toContain("we can't tell which day the market reacted");
    expect(read).not.toMatch(/typical report/);
    const page = await (await worker.fetch(new Request(`https://mutaafaziz.com/metaphases/t/${SYM}`), { ...env, ASSETS: { fetch: async () => new Response("<html><head><title>x</title></head><body></body></html>", { headers: { "Content-Type": "text/html" } }) } }, ctx)).text();
    await Promise.all(waits); waits = [];
    expect(page).not.toMatch(/typical move ±/);
  });

  it("the Nasdaq day isn't cached yet: it's read on demand even though Finnhub gives a session", async () => {
    stub(SYM, "amc", closes(ADI_DAY, ADI_NEXT));
    const f = fetch as any;
    f.mockImplementation(async (u: string) => {
      const url = new URL(u);
      if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") return new Response(JSON.stringify({ data: { rows: url.searchParams.get("date") === NEXT_DAY ? [{ symbol: SYM, time: "time-pre-market", marketCap: "$100,000,000,000" }] : [] } }));
      if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nqRows } } }));
      const c = closes(ADI_DAY, ADI_NEXT);
      if (url.hostname.endsWith("finance.yahoo.com")) return new Response(JSON.stringify({ chart: { result: [{ timestamp: c.timestamp, indicators: { quote: [{ open: c.close, high: c.close, low: c.close, close: c.close }] } }] } }));
      if (url.pathname.endsWith("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: [{ symbol: SYM, date: NEXT_DAY, hour: "amc", quarter: 4, year: 2026, epsEstimate: 1.1, epsActual: null, revenueEstimate: 4e9, revenueActual: null }] }));
      return new Response("{}", { status: 404 });
    });
    const r = await sheet();
    expect(r.moveSession?.session).toBe("bmo");
    expect(r.expectedMove).toBeCloseTo(mean(ADI_DAY), 4);
  });

  it("both calendars agree: no moveSession, Finnhub's session measures the moves as before", async () => {
    stub(SYM, "amc", closes(ADI_DAY, ADI_NEXT));
    nasdaqSays(SYM, "amc");
    const r = await sheet();
    expect(r.moveSession).toBeUndefined();
    expect(r.history[0].move).toBeCloseTo(ADI_NEXT[0], 4);
  });
});

describe("ADI's announced 7:00 am release (0060)", () => {
  const FILE = overridesFile as unknown as DateOverrides;
  it("the ADI entry passes the gate on the day it was added", () => {
    expect(validateOverrides({ ADI: FILE.ADI }, "2026-11-12")).toEqual([]);
  });
  it("the sheet takes the company's session: bmo, no 'two calendars disagree', moves on the report day", async () => {
    stub("ADI", "amc", closes(ADI_DAY, ADI_NEXT));
    nasdaqSays("ADI", "bmo");
    const r = await sheet("ADI");
    expect(r.next).toMatchObject({ date: NEXT_DAY, session: "bmo" });
    expect(r.next.confirmed).toMatch(/^https:\/\//);
    expect(r.next.nasdaq).toBeUndefined();
    expect(r.moveSession).toBeUndefined();
    expect(r.expectedMove).toBeCloseTo(mean(ADI_DAY), 4);
    expect(applyToRows("ADI", [{ symbol: "ADI", date: NEXT_DAY, hour: "amc", quarter: 4, year: 2026 }], FILE, "2026-11-12")[0]).toMatchObject({ hour: "bmo" });
  });
});
