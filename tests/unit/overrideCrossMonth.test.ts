import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 0055 (the cross-month case of 0041): Finnhub's `symbol=` row says Tue Dec 1 while the company announced Thu Nov 19.
// Through the worker, the report is one row on Nov 19 in every range that includes either date, and the sheet
// agrees. A made-up symbol with a made-up override, so no live entry in data/date-overrides.json can mask it
// (LESSONS 2026-11-06).
vi.mock("../../data/date-overrides.json", () => ({
  default: {
    ZQXA: { date: "2026-11-19", hour: "bmo", quarter: 2, year: 2027, source: "https://example.com/zqxa-board-meeting", checked: "2026-11-09" },
  },
}));

const { default: worker } = await import("../../worker/index");

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as any;
const dec1 = { symbol: "ZQXA", date: "2026-12-01", hour: "", quarter: 2, year: 2027, epsEstimate: 1.25, epsActual: null, revenueEstimate: 9e9, revenueActual: null };

beforeEach(() => {
  pending = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-10T15:00:00Z"));
  (globalThis as any).caches = { default: new MemCache() };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { rows: null } }));
    if (!url.pathname.endsWith("/calendar/earnings")) return new Response("{}", { status: 404 });
    const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
    const rows = url.searchParams.get("symbol") === "ZQXA" || (from <= dec1.date && dec1.date <= to) ? [dec1] : [];
    return new Response(JSON.stringify({ earningsCalendar: rows }));
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(pending); pending = [];
  return r.json() as Promise<any>;
};

describe("an override across months: Finnhub's Dec 1 vs the company's Nov 19", () => {
  // Only a range that reaches Dec 1 sees Finnhub's row (and its estimate); the others get the company's date
  // with no estimate rather than an invented one.
  it.each([
    ["2026-11-16", "2026-11-20", null],
    ["2026-11-01", "2026-11-30", null],
    ["2026-11-16", "2026-12-12", 1.25],
  ])("/api/calendar %s..%s: one row, on Nov 19 before the open (estimate %s)", async (from, to, eE) => {
    const r = await get(`/api/calendar?from=${from}&to=${to}`);
    const rows = r.events.filter((e: any) => e.s === "ZQXA");
    expect(rows).toEqual([expect.objectContaining({ d: "2026-11-19", h: "bmo", q: 2, y: 2027, eE })]);
    expect(rows[0].o).toBe("https://example.com/zqxa-board-meeting");
  });

  it("/api/calendar for December has no row: the Dec 1 projection is the same report", async () => {
    const r = await get("/api/calendar?from=2026-11-30&to=2026-12-31");
    expect(r.events.filter((e: any) => e.s === "ZQXA")).toEqual([]);
  });

  it("/api/ticker: next is Thu Nov 19 before the open, company-confirmed, the date the calendar shows", async () => {
    const r = await get("/api/ticker/ZQXA");
    expect(r.next).toMatchObject({ date: "2026-11-19", session: "bmo", quarter: 2, year: 2027, epsE: 1.25 });
    expect(r.next.confirmed).toBe("https://example.com/zqxa-board-meeting");
    expect(r.read.join(" ")).not.toMatch(/Dec 1/);
  });
});
