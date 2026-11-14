import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { buildIndex, crossCheck, windowDays, windowEnd, type NqWindow } from "../../shared/crossCheck";
import { applyToRows, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { tickerShareTitle } from "../../shared/pending";
import type { EarningsEvent } from "../../shared/types";
import { sessionText } from "../../src/lib/sessionText";
import worker from "../../worker/index";

// 0050: a session filled in from Nasdaq's day calendar (Finnhub blank, Nasdaq pre-market / after hours) is
// Nasdaq's, not the company's. It is marked `hs: "n"` on the calendar row and the sheet, and every surface calls
// it expected ("the company hasn't said") instead of stating it as fact. Company overrides still win.
// Made-up symbols in the worker tests, so no live date-overrides entry can win (LESSONS 2026-11-06).

const TODAY = "2026-11-09";
const ev = (s: string, d: string, h: EarningsEvent["h"] = "", extra: Partial<EarningsEvent> = {}): EarningsEvent =>
  ({ s, d, h, q: 1, y: 2027, eE: 1, eA: null, rE: 1e9, rA: null, t: 1, ...extra });
const win = (days: Record<string, Record<string, EarningsEvent["h"]>>): NqWindow => {
  const loaded = windowDays(TODAY);
  return { from: TODAY, to: windowEnd(TODAY), loaded, idx: buildIndex(Object.fromEntries(loaded.map((d) => [d, days[d] ?? {}]))) };
};

describe("0050 crossCheck marks a session it filled from Nasdaq", () => {
  it("Finnhub blank + Nasdaq after hours → amc, hs n", () => {
    const [e] = crossCheck([ev("QQPA", "2026-11-18")], win({ "2026-11-18": { QQPA: "amc" } }));
    expect(e).toMatchObject({ h: "amc", hs: "n", x: "agree" });
  });
  it("Finnhub bmo + Nasdaq after hours → Finnhub kept, flagged differs, no hs", () => {
    const [e] = crossCheck([ev("QQPA", "2026-11-18", "bmo")], win({ "2026-11-18": { QQPA: "amc" } }));
    expect(e.h).toBe("bmo");
    expect(e.x).toBe("differs");
    expect(e.hs).toBeUndefined();
  });
  it("Finnhub's own session that Nasdaq agrees with isn't marked", () => {
    const [e] = crossCheck([ev("QQPA", "2026-11-18", "bmo")], win({ "2026-11-18": { QQPA: "bmo" } }));
    expect(e.hs).toBeUndefined();
  });
  it("a company-dated row is never filled or marked", () => {
    const [e] = crossCheck([ev("QQPA", "2026-11-18", "", { o: "https://example.com/r" })], win({ "2026-11-18": { QQPA: "amc" } }));
    expect(e).toMatchObject({ h: "" });
    expect(e.hs).toBeUndefined();
  });
});

describe("0050 the session label says expected for a Nasdaq-filled time", () => {
  it("labels", () => {
    expect(sessionText("bmo")).toBe("Before open");
    expect(sessionText("bmo", "n")).toBe("Before open (expected)");
    expect(sessionText("", "n")).toBe("Time TBD");
  });
  it("the share title calls the time expected", () => {
    expect(tickerShareTitle("QQPA", "Qqpa", { date: "2026-11-18", session: "amc", quarter: 1, hs: "n" } as any))
      .toBe("QQPA reports Wed, Nov 18 after the close (expected) · Metaphases");
    expect(tickerShareTitle("QQPA", "Qqpa", { date: "2026-11-18", session: "amc", quarter: 1 }))
      .toBe("QQPA reports Wed, Nov 18 after the close · Metaphases");
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
const fhRow = (symbol: string, date: string, hour = "") => ({ symbol, date, hour, quarter: 1, year: 2027, epsEstimate: 1, epsActual: null, revenueEstimate: 5e9, revenueActual: null });
const FH_ROWS = [fhRow("QQPA", "2026-11-18"), fhRow("QQPB", "2026-11-18", "amc")];
let cache: MemCache;

describe("0050 the sheet marks and words a Nasdaq-filled session as expected", () => {
  beforeEach(() => {
    waits = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-09T15:00:00Z"));
    cache = new MemCache();
    (globalThis as any).caches = { default: cache };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") return new Response(JSON.stringify({ data: { rows: [] } }));
      if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: [] } } }));
      if (url.pathname.endsWith("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: FH_ROWS.filter((r) => r.symbol === url.searchParams.get("symbol")) }));
      return new Response("{}", { status: 200 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const sheet = async (sym: string) => {
    const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases/api/ticker/${sym}`), env, ctx);
    await Promise.all(waits); waits = [];
    return r.json() as Promise<any>;
  };

  it("Finnhub blank, Nasdaq after hours: session amc, hs n, the Read says expected", async () => {
    cache.store.set(CAL("nq:x:v1:2026-11-18"), JSON.stringify({ QQPA: "amc", QQPB: "amc" }));
    const t = await sheet("QQPA");
    expect(t.next).toMatchObject({ date: "2026-11-18", session: "amc", hs: "n" });
    expect(t.read.join(" ")).toContain("Wednesday, Nov 18 after the close (expected; the company hasn't said)");
    expect(tickerShareTitle("QQPA", "Qqpa", t.next)).toContain("(expected)");
  });

  it("Finnhub's own session isn't marked", async () => {
    cache.store.set(CAL("nq:x:v1:2026-11-18"), JSON.stringify({ QQPA: "amc", QQPB: "amc" }));
    const t = await sheet("QQPB");
    expect(t.next).toMatchObject({ session: "amc" });
    expect(t.next.hs).toBeUndefined();
    expect(t.read.join(" ")).not.toContain("expected;");
  });
});

describe("0050 company sessions for Walmart and Target", () => {
  const FILE = overridesFile as unknown as DateOverrides;
  const today = "2026-11-14";
  it("WMT: Thu Nov 19 before the open (materials ~6 am CT), passes the gate", () => {
    expect(FILE.WMT).toMatchObject({ date: "2026-11-19", hour: "bmo", quarter: 3, year: 2027 });
    expect(validateOverrides({ WMT: FILE.WMT }, today)).toEqual([]);
  });
  it("TGT: Wed Nov 18 before the open (call 8:00 am ET), passes the gate", () => {
    expect(FILE.TGT).toMatchObject({ date: "2026-11-18", hour: "bmo", quarter: 3, year: 2027 });
    expect(validateOverrides({ TGT: FILE.TGT }, today)).toEqual([]);
  });
  it("a blank-session feed row takes the company's session and source", () => {
    const out = applyToRows("WMT", [{ symbol: "WMT", date: "2026-11-19", hour: "", quarter: 3, year: 2027, epsEstimate: 0.64, epsActual: null, revenueEstimate: 1.89e11, revenueActual: null }], FILE, today);
    expect(out[0]).toMatchObject({ date: "2026-11-19", hour: "bmo", epsEstimate: 0.64 });
    expect(out[0].source).toMatch(/^https:\/\/corporate\.walmart\.com\//);
  });
});
