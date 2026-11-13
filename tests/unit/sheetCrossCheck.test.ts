import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { windowDays, withDay } from "../../shared/crossCheck";
import { tickerShareTitle } from "../../shared/pending";
import { tickerShareDesc } from "../../shared/reported";
import worker from "../../worker/index";

// 0059: the sheet (and its unfurl) must see the Nasdaq cross-check the calendar already shows. The calendar reads
// each cached Nasdaq day; the sheet used to read only the *folded* window, written once every day had loaded, so a
// single slow day kept every sheet blind (PDD "reports Mon, Nov 16 before the open" while the calendar flagged
// Nasdaq's Nov 17). Made-up symbols, so no live entry in data/date-overrides.json can win (LESSONS 2026-11-06).

class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
const CAL = (k: string) => `https://cache.metaphases.internal/${encodeURIComponent(k)}`;

const TODAY = "2026-11-09"; // a Monday; the window is Nov 9–20
const fhRow = (symbol: string, date: string, hour = "") => ({ symbol, date, hour, quarter: 3, year: 2026, epsEstimate: 1, epsActual: null, revenueEstimate: 5e9, revenueActual: null });
const FH_ROWS = [fhRow("QQYP", "2026-11-16", "bmo"), fhRow("QQYW", "2026-11-19"), fhRow("QQYC", "2026-11-18")];
let nqCalls: string[] = [];
let nasdaqDay: (day: string) => Response;
let cache: MemCache;

beforeEach(() => {
  waits = []; nqCalls = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T15:00:00Z"));
  cache = new MemCache();
  (globalThis as any).caches = { default: cache };
  nasdaqDay = () => new Response(JSON.stringify({ data: { rows: [] } }));
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") { nqCalls.push(url.searchParams.get("date")!); return nasdaqDay(url.searchParams.get("date")!); }
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: [] } } }));
    if (url.pathname.endsWith("/calendar/earnings")) {
      const sym = url.searchParams.get("symbol");
      return new Response(JSON.stringify({ earningsCalendar: FH_ROWS.filter((r) => r.symbol === sym) }));
    }
    return new Response("{}", { status: 200 });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const sheet = async (sym: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases/api/ticker/${sym}`), env, ctx);
  await Promise.all(waits); waits = [];
  return r.json() as Promise<any>;
};
/** Cache Nasdaq's days the way the calendar's background fill does (`nq:x:v1:<day>`), with no folded copy. */
const cacheDays = (days: Record<string, Record<string, string>>) => { for (const [d, v] of Object.entries(days)) cache.store.set(CAL(`nq:x:v1:${d}`), JSON.stringify(v)); };

describe("0059: the sheet reads a partly loaded Nasdaq window", () => {
  it("9 of 10 days cached (a different day missing), Nasdaq lists it a day later: next.nasdaq is set and the Read and og say unconfirmed", async () => {
    const days = windowDays(TODAY);
    expect(days).toHaveLength(10);
    cacheDays(Object.fromEntries(days.filter((d) => d !== "2026-11-12").map((d) => [d, d === "2026-11-17" ? { QQYP: "bmo" } : { FILLER: "" }])));
    expect(cache.store.has(CAL(`nq:x:idx:v1:${TODAY}`))).toBe(false); // never folded

    const t = await sheet("QQYP");
    expect(t.next).toMatchObject({ date: "2026-11-16", session: "bmo", nasdaq: { date: "2026-11-17", session: "bmo" } });
    expect(t.read.join(" ")).toMatch(/Monday, Nov 16 before the opening bell, but that's unconfirmed: Nasdaq's calendar lists Tuesday, Nov 17/);
    const title = tickerShareTitle("QQYP", "Qqyp Holdings", t.next);
    expect(title).toBe("QQYP reports Mon, Nov 16 (unconfirmed; Nasdaq lists Tue, Nov 17) · Metaphases");
    expect(tickerShareDesc("Qqyp Holdings", t)).toMatch(/^Qqyp Holdings — report date unconfirmed \(the feed says Mon, Nov 16; Nasdaq lists Tue, Nov 17\); Street expects/);
    expect(nqCalls).toEqual([]); // the sheet path reads the cache; Finnhub's session is set, so no on-demand day
  });

  it("no folded window, the report day's cached listing says pre-market, Finnhub's session blank: the session is filled (bmo)", async () => {
    cacheDays({ "2026-11-19": { QQYW: "bmo" } });
    const t = await sheet("QQYW");
    expect(t.next).toMatchObject({ date: "2026-11-19", session: "bmo" });
    expect(t.next.nasdaq).toBeUndefined();
    expect(t.read.join(" ")).toContain("Thursday, Nov 19 before the opening bell");
    expect(nqCalls).toEqual([]);
  });

  it("nothing cached: the report day read on demand (one call, shared cache) fills the session too", async () => {
    nasdaqDay = (d) => new Response(JSON.stringify({ data: { rows: d === "2026-11-19" ? [{ symbol: "QQYW", time: "time-pre-market", marketCap: "$600,000,000,000" }] : [] } }));
    const t = await sheet("QQYW");
    expect(t.next).toMatchObject({ date: "2026-11-19", session: "bmo" });
    expect(nqCalls).toEqual(["2026-11-19"]);
    expect(JSON.parse(cache.store.get(CAL("nq:x:v1:2026-11-19"))!)).toEqual({ QQYW: "bmo" });
  });

  it("a blank session whose day Nasdaq lists elsewhere: flagged, with Nasdaq's day named", async () => {
    cacheDays({ "2026-11-18": { FILLER: "" }, "2026-11-19": { QQYC: "bmo" } });
    const t = await sheet("QQYC");
    expect(t.next).toMatchObject({ date: "2026-11-18", session: "", nasdaq: { date: "2026-11-19", session: "bmo" } });
    expect(tickerShareTitle("QQYC", "Qqyc", t.next)).toBe("QQYC reports Wed, Nov 18 (unconfirmed; Nasdaq lists Thu, Nov 19) · Metaphases");
    expect(t.read.join(" ")).toMatch(/unconfirmed: Nasdaq's calendar lists Thursday, Nov 19 before the opening bell/);
  });

  it("Nasdaq's day fails: the sheet stays as Finnhub has it, with no warning about Nasdaq", async () => {
    nasdaqDay = () => new Response("busy", { status: 503 });
    const t = await sheet("QQYW");
    expect(t.next).toMatchObject({ date: "2026-11-19", session: "" });
    expect(t.next.nasdaq).toBeUndefined();
    expect(t.warnings.join(" ")).not.toMatch(/nasdaq/i);
  });
});

describe("0059: share title when Nasdaq lists the same day in another session", () => {
  it("drops the feed's session and says the time is unconfirmed", () => {
    expect(tickerShareTitle("QQYS", "Qqys", { date: "2026-11-17", session: "amc", quarter: 3, nasdaq: { date: "2026-11-17", session: "bmo" } }))
      .toBe("QQYS reports Tue, Nov 17, time unconfirmed · Metaphases");
  });
});

describe("0059 self-review: the card, slow answers, and the same-day case", () => {
  it("the share card image never draws a contested date as fact", async () => {
    const days = windowDays(TODAY);
    cacheDays(Object.fromEntries(days.map((d) => [d, d === "2026-11-17" ? { QQYP: "bmo" } : { FILLER: "" }])));
    const r = await worker.fetch(new Request("https://mutaafaziz.com/metaphases/og/t/QQYP.svg"), env, ctx);
    await Promise.all(waits); waits = [];
    const svg = await r.text();
    expect(svg).toContain("Reports Mon, Nov 16, date unconfirmed");
    expect(svg).not.toContain("before the open");
  });

  it("a slow Nasdaq answer on the sheet isn't remembered as a failure, so the background fill can still load that day", async () => {
    nasdaqDay = () => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); };
    const t = await sheet("QQYW");
    expect(t.next).toMatchObject({ date: "2026-11-19", session: "" });
    expect(cache.store.get(CAL("nq:x:fail:v1"))).toBeUndefined();
  });

  it("a refused Nasdaq answer on the sheet is remembered for 15 minutes", async () => {
    nasdaqDay = () => new Response("busy", { status: 503 });
    await sheet("QQYW");
    expect(JSON.parse(cache.store.get(CAL("nq:x:fail:v1"))!)["2026-11-19"]).toBeGreaterThan(Date.now());
  });

  it("same day, other session: the Read names Nasdaq's session and the description says the time is unconfirmed", async () => {
    cacheDays({ "2026-11-16": { QQYP: "amc" } });
    const t = await sheet("QQYP");
    expect(t.next).toMatchObject({ date: "2026-11-16", session: "bmo", nasdaq: { date: "2026-11-16", session: "amc" } });
    // 0062: the day leads and the time is called unconfirmed; neither session is stated as fact.
    expect(t.read.join(" ")).toContain("QQYP reports Q3 on Monday, Nov 16, time unconfirmed: our data feed says before the opening bell, Nasdaq's calendar after the close.");
    expect(t.read.join(" ")).not.toMatch(/Nov 16 before the opening bell, but/);
    expect(tickerShareTitle("QQYP", "Q", t.next)).toBe("QQYP reports Mon, Nov 16, time unconfirmed · Metaphases");
    expect(tickerShareDesc("Q", t)).toMatch(/^Q — report time unconfirmed \(the feed and Nasdaq list Mon, Nov 16 in different sessions\)/);
  });
});

describe("withDay", () => {
  it("adds a window day (sorted), ignores a day outside the window or already loaded, and starts a window from null", () => {
    const w = withDay(null, TODAY, "2026-11-12", { A: "bmo" })!;
    expect(w).toMatchObject({ from: TODAY, loaded: ["2026-11-12"], idx: { A: [{ d: "2026-11-12", h: "bmo" }] } });
    const w2 = withDay(w, TODAY, "2026-11-10", { A: "" })!;
    expect(w2.loaded).toEqual(["2026-11-10", "2026-11-12"]);
    expect(w2.idx.A.map((x) => x.d)).toEqual(["2026-11-10", "2026-11-12"]);
    expect(withDay(w2, TODAY, "2026-11-12", { B: "amc" })).toBe(w2);
    expect(withDay(w2, TODAY, "2026-12-01", { B: "amc" })).toBe(w2);
    expect(withDay(null, TODAY, "2026-11-14", { B: "amc" })).toBeNull(); // a Saturday isn't a window day
  });
});
