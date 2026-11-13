import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToRows, closedDay, flagClosed, type DateOverrides } from "../../shared/dateOverrides";
import type { EarningsEvent } from "../../shared/types";
import worker from "../../worker/index";

// 0045: company dates both feeds missed (CSCO, HMC, TSN), and a projected report on a closed-market day
// (MRVL on Thanksgiving) is never stated as fact.

const FILE = overridesFile as unknown as DateOverrides;
const ev = (s: string, d: string, extra: Partial<EarningsEvent> = {}): EarningsEvent => ({ s, d, h: "", q: 3, y: 2027, eE: 1.11, eA: null, rE: 3.2e9, rA: null, t: 1, ...extra });

describe("closed-market days", () => {
  it("knows NYSE holidays and weekends", () => {
    expect(closedDay("2026-11-26")).toBe("Thanksgiving");
    expect(closedDay("2026-11-28")).toBeNull(); // weekends aren't flagged: Berkshire really publishes on Saturdays
    expect(closedDay("2026-11-27")).toBeNull(); // early close is still a trading day
    expect(closedDay("2026-11-25")).toBeNull();
  });

  it("flags an event projected onto Thanksgiving; the same event with a company date is not flagged", () => {
    const [mrvl, cfirm, ok, done] = flagClosed([ev("MRVL", "2026-11-26"), ev("XYZ", "2026-11-26", { o: "https://example.com/release" }), ev("CRM", "2026-11-25"), ev("OLD", "2026-11-26", { eA: 1.2 })]);
    expect(mrvl.c).toBe("Thanksgiving");
    expect(cfirm.c).toBeUndefined();
    expect(ok.c).toBeUndefined();
    expect(done.c).toBeUndefined(); // results are in: it happened
  });
});

describe("0045 company dates in data/date-overrides.json", () => {
  const today = "2026-11-05";
  it("CSCO: Thu Nov 12 after the close (Finnhub Nov 18 / blank, Nasdaq Nov 11)", () => {
    const out = applyToRows("CSCO", [{ symbol: "CSCO", date: "2026-11-18", hour: "", quarter: 1, year: 2027, epsEstimate: 1.35 }], FILE, today);
    expect(out).toEqual([expect.objectContaining({ date: "2026-11-12", hour: "amc", epsEstimate: 1.35 })]);
  });
  it("HMC: Tue Nov 10 before the US open (15:35 JST), not 'today' on Nov 5", () => {
    const out = applyToRows("HMC", [{ symbol: "HMC", date: "2026-11-05", hour: "", quarter: 2, year: 2027, epsEstimate: 27.43 }], FILE, today);
    expect(out).toEqual([expect.objectContaining({ date: "2026-11-10", hour: "bmo" })]);
  });
  it("MRVL: Tue Dec 1 (Marvell, Nov 6), not Thanksgiving; no session, since the release names only the call time (0063)", () => {
    const out = applyToRows("MRVL", [{ symbol: "MRVL", date: "2026-11-26", hour: "", quarter: 3, year: 2027, epsEstimate: 1.1138 }], FILE, "2026-11-13");
    expect(out).toEqual([expect.objectContaining({ date: "2026-12-01", hour: "", quarter: 3, year: 2027, epsEstimate: 1.1138 })]);
    expect(FILE.MRVL?.hour).toBeUndefined();
    const [row] = flagClosed([ev("MRVL", "2026-12-01", { o: FILE.MRVL?.source })]);
    expect(row.c).toBeUndefined();
  });
  it("TSN: Mon Nov 16 before the open, not after the close", () => {
    const out = applyToRows("TSN", [{ symbol: "TSN", date: "2026-11-16", hour: "amc", quarter: 4, year: 2026, epsEstimate: 0.6 }], FILE, today);
    expect(out).toEqual([expect.objectContaining({ date: "2026-11-16", hour: "bmo" })]);
  });
});

// End to end: the worker flags a Thanksgiving projection on the calendar and the sheet, and The Read
// doesn't state the day as fact. A made-up symbol (ZZHOL), so no live entry in data/date-overrides.json can win
// over the feed (LESSONS 2026-11-06); MRVL itself now has a company date (0063, below).
class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as any;
const holRow = { symbol: "ZZHOL", date: "2026-11-26", hour: "", quarter: 3, year: 2027, epsEstimate: 1.1138, epsActual: null, revenueEstimate: 3219504478, revenueActual: null };
const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
  await Promise.all(pending); pending = [];
  return r.json() as Promise<any>;
};

describe("0045 closed-day projections through the worker", () => {
  beforeEach(() => {
    pending = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T15:00:00Z"));
    (globalThis as any).caches = { default: new MemCache() };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.pathname.endsWith("/calendar/earnings") && url.searchParams.get("symbol") === "ZZHOL") return new Response(JSON.stringify({ earningsCalendar: [holRow] }));
      if (url.pathname.endsWith("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: [holRow, { ...holRow, symbol: "CRM", date: "2026-11-25", hour: "amc" }] }));
      return new Response("{}", { status: 404 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("/api/calendar flags ZZHOL on Thanksgiving and leaves CRM alone", async () => {
    const r = await get("/api/calendar?from=2026-11-23&to=2026-11-27");
    expect(r.events.find((e: any) => e.s === "ZZHOL")).toMatchObject({ d: "2026-11-26", c: "Thanksgiving" });
    expect(r.events.find((e: any) => e.s === "CRM")?.c).toBeUndefined();
  });

  it("/api/ticker/ZZHOL marks next as on a closed day, and The Read doesn't state the day as fact", async () => {
    const r = await get("/api/ticker/ZZHOL");
    expect(r.next).toMatchObject({ date: "2026-11-26", closed: "Thanksgiving" });
    expect(r.read[0]).toMatch(/not confirmed/i);
    expect(r.read[0]).not.toMatch(/reports Q3 on/);
  });
});

describe("0045 closed-day projections in the .ics feed and with a company date", () => {
  it("a calendar entry on a holiday says the date isn't confirmed", async () => {
    const { buildIcs } = await import("../../shared/depth");
    const out = buildIcs([{ symbol: "MRVL", name: "Marvell", date: "2026-11-26", session: "", quarter: 3, year: 2027, epsE: 1.11, url: "https://x/t/MRVL", closed: "Thanksgiving" }], new Date("2026-11-05T00:00:00Z"));
    expect(out).toContain("SUMMARY:MRVL earnings · date not confirmed");
  });

  it("a company-announced date is never flagged, even on a holiday", () => {
    const O: DateOverrides = { MRVL: { date: "2026-11-26", hour: "amc", quarter: 3, year: 2027, source: "https://example.com/r", checked: "2026-11-05" } };
    const rows = applyToRows("MRVL", [{ ...holRow, symbol: "MRVL" }], O, "2026-11-05");
    expect(rows[0].source).toBe("https://example.com/r"); // the worker skips closedDay when a source is set
    expect(flagClosed([ev("MRVL", "2026-11-26", { o: "https://example.com/r" })])[0].c).toBeUndefined();
  });
});
