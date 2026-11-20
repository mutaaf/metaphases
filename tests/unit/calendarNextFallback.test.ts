import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { CALENDAR_NEXT } from "../../shared/sheetCache";

// 0092: in peak week a burst of cold sheets rate-limits Finnhub's `symbol=` read, and with no last good copy on this
// colo the sheet read "Upcoming date unavailable." for a company the calendar on the same page lists (ZM, HPE, HPQ,
// WDAY). The calendar's cached days already hold that date and session: the sheet takes them (cache only), says where
// they came from, and stays short-lived. Nothing cached: unchanged.

const REPORTS = ["2026-08-25", "2026-05-21", "2026-02-26", "2025-11-24"];
const nqRows = REPORTS.map((d) => { const [y, m, dd] = d.split("-"); return { fiscalQtrEnd: "Jul 2026", dateReported: `${+m}/${+dd}/${y}`, eps: 1.5, consensusForecast: "1.40", percentageSurprise: "7.1" }; });

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const key = (k: string) => `https://cache.metaphases.internal/${encodeURIComponent(k)}`;
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
let symbolCalls = 0;

/** Finnhub rejects every read (a 60-a-minute key in a burst); Nasdaq's history and Yahoo still answer. */
function stub(status = 429) {
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") return new Response(JSON.stringify({ data: { rows: [] } }));
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nqRows } } }));
    if (url.hostname.endsWith("finance.yahoo.com")) return new Response(JSON.stringify({ chart: { result: [{ timestamp: [1763650800], indicators: { quote: [{ open: [100], high: [100], low: [100], close: [100] }] } }] } }));
    if (url.pathname.endsWith("/calendar/earnings")) symbolCalls++;
    return new Response("{}", { status });
  }));
}
beforeEach(() => {
  waits = []; symbolCalls = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T16:00:00Z")); // Friday
  (globalThis as any).caches = { default: new MemCache() };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const store = () => (globalThis as any).caches.default.store as Map<string, string>;
const sheet = async (sym: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases/api/ticker/${sym}`), env, ctx);
  await Promise.all(waits); waits = [];
  return { body: (await r.json()) as any, cc: r.headers.get("Cache-Control") };
};
const zmRow = { s: "ZM", d: "2026-11-23", h: "amc", q: 3, y: 2027, eE: 1.52, eA: null, rE: 1.21e9, rA: null, t: 1 };

describe("/api/ticker: a rate-limited `symbol=` read takes the date the calendar already has (0092)", () => {
  it("ZM: symbol= 429, the calendar's Nov 23 day lists it after the close → the sheet does too, with a softer note", async () => {
    stub(429);
    store().set(key("cal:v3:2026-11-23"), JSON.stringify([{ ...zmRow, s: "HPE" }, zmRow]));
    const { body: r, cc } = await sheet("ZM");
    expect(symbolCalls).toBeGreaterThan(0); // it did try Finnhub first
    expect(r.next).toMatchObject({ date: "2026-11-23", session: "amc" });
    expect(r.warnings).not.toContain("Upcoming date unavailable.");
    expect(r.warnings).toContain(CALENDAR_NEXT);
    // Nasdaq's history answered, so the past dates stay even though Finnhub's history failed.
    expect(r.history.map((h: any) => h.date)).toEqual(expect.arrayContaining(REPORTS));
    // Still short-lived, and never saved as the last good copy.
    expect(cc).toContain("max-age=30");
    expect(store().has(key("tk:stale:v7:ZM"))).toBe(false);
  }, 20000);

  it("the calendar's last good copy of a day stands in when the fresh day is cold", async () => {
    stub(503);
    store().set(key("cal:stale:v3:2026-11-24"), JSON.stringify([{ ...zmRow, s: "WDAY", d: "2026-11-24" }]));
    const { body: r } = await sheet("WDAY");
    expect(r.next).toMatchObject({ date: "2026-11-24", session: "amc" });
    expect(r.warnings).toContain(CALENDAR_NEXT);
  });

  it("a fresh day that doesn't list the company outranks an old copy that does", async () => {
    stub(503);
    store().set(key("cal:v3:2026-11-24"), JSON.stringify([]));
    store().set(key("cal:stale:v3:2026-11-24"), JSON.stringify([{ ...zmRow, s: "ZZMV", d: "2026-11-24" }]));
    const { body: r } = await sheet("ZZMV");
    expect(r.warnings).toContain("Upcoming date unavailable.");
  });

  it("nothing cached: unchanged, the sheet says the date is unavailable", async () => {
    stub(503);
    const { body: r } = await sheet("ZZNO");
    expect(r.warnings).toContain("Upcoming date unavailable.");
    expect(r.warnings).not.toContain(CALENDAR_NEXT);
  });

  it("a usable last good copy of the whole sheet still wins over the calendar's row", async () => {
    stub(503);
    store().set(key("cal:v3:2026-11-23"), JSON.stringify([zmRow]));
    const good = { at: Date.parse("2026-11-20T14:00:00Z"), day: "2026-11-20", data: { next: { date: "2026-11-23", session: "amc", quarter: 3, year: 2027 }, history: [], warnings: [], justReported: null, expectedMove: null } };
    store().set(key("tk:stale:v7:ZM"), JSON.stringify(good));
    const { body: r } = await sheet("ZM");
    expect(r.warnings[0]).toMatch(/^This is an earlier read/);
    expect(r.warnings).not.toContain(CALENDAR_NEXT);
  });
});

describe("0092 review: the fallback never mislabels what it didn't borrow", () => {
  it("only the date failed: a fresh history never reads as an earlier read", async () => {
    // Finnhub's history answers, only symbol= fails.
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") return new Response(JSON.stringify({ data: { rows: [] } }));
      if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nqRows } } }));
      if (url.hostname.endsWith("finance.yahoo.com")) return new Response(JSON.stringify({ chart: { result: [{ timestamp: [1763650800], indicators: { quote: [{ open: [100], high: [100], low: [100], close: [100] }] } }] } }));
      if (url.pathname.endsWith("/stock/earnings")) return new Response(JSON.stringify([]));
      return new Response("{}", { status: 503 });
    }));
    store().set(key("cal:v3:2026-11-23"), JSON.stringify([zmRow]));
    // Yesterday's good copy: its report day is today, so it can't stand in for the whole sheet, only for history.
    const old = { at: Date.parse("2026-11-19T14:00:00Z"), day: "2026-11-19", data: { next: { date: "2026-11-20", session: "bmo", quarter: 3, year: 2027 }, history: [{ date: "2026-08-25", move: 9 }], warnings: [], justReported: null, expectedMove: 9, beatRate: 1 } };
    store().set(key("tk:stale:v7:ZM"), JSON.stringify(old));
    const { body: r } = await sheet("ZM");
    expect(r.next).toMatchObject({ date: "2026-11-23", session: "amc" });
    expect(r.warnings.some((w: string) => w.startsWith("Past reports are an earlier read"))).toBe(false);
  });

  it("a row with today's figures isn't an upcoming date: the sheet keeps saying the next date is unavailable", async () => {
    stub(503);
    store().set(key("cal:v3:2026-11-20"), JSON.stringify([{ s: "NTES", d: "2026-11-20", h: "bmo", q: 3, y: 2026, eE: 1.9, eA: 2.1, rE: 4e9, rA: 4.1e9, t: 1 }]));
    const { body: r } = await sheet("NTES");
    expect(r.warnings).toContain("Upcoming date unavailable.");
    expect(r.warnings).not.toContain(CALENDAR_NEXT);
  });

  it("a far day's cold fresh cache doesn't fall back to an old copy (read budget)", async () => {
    stub(503);
    store().set(key("cal:stale:v3:2026-12-02"), JSON.stringify([{ ...zmRow, s: "ZZFAR", d: "2026-12-02" }]));
    const { body: r } = await sheet("ZZFAR");
    expect(r.warnings).toContain("Upcoming date unavailable.");
  });
});
