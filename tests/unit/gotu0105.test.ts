import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToEvents, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { buildIndex, crossCheck, keepNasdaq, nasdaqDaySessions, windowDays, windowEnd, type NqWindow } from "../../shared/crossCheck";
import { leadRows } from "../../shared/leadDay";
import { tickerShareTitle } from "../../shared/pending";
import type { EarningsEvent } from "../../shared/types";
import worker from "../../worker/index";

// 0105: Gaotu Techedu (GOTU), Nov 16 (PR Newswire): Q3 2026 results "before U.S. markets open on Wednesday,
// November 25, 2026". Finnhub's feed: Tue Nov 24, no time. GOTU is off-universe and about $490M, so the slim Nasdaq
// cache (tracked names or $1B+) dropped its listing: the 0099 lead never saw Nasdaq's Nov 25 pre-market, and the
// calendar left it a day early with no hint.

const FILE = overridesFile as unknown as DateOverrides;
const SRC = "https://finviz.com/news/422913/gaotu-techedu-to-report-third-quarter-2026-financial-results-on-november-25-2026";
const TODAY = "2026-11-23";

describe("0105 GOTU's company date", () => {
  it("the entry passes the gate: Wed Nov 25 before the open, the company's notice", () => {
    expect(FILE.GOTU).toMatchObject({ date: "2026-11-25", hour: "bmo", quarter: 3, year: 2026, source: SRC, call: "8 a.m. ET" });
    expect(validateOverrides({ GOTU: FILE.GOTU }, TODAY)).toEqual([]);
  });

  it("applies to the off-universe feed row: one row, on Nov 25, before the open, untracked", () => {
    const feed: EarningsEvent[] = [{ s: "GOTU", d: "2026-11-24", h: "", q: 3, y: 2026, eE: 0.2652, eA: null, rE: 1928353860, rA: null, t: 0 }];
    const r = applyToEvents(feed, FILE, "2026-11-23", "2026-11-27", TODAY, () => false);
    expect(r.filter((e) => e.s === "GOTU")).toEqual([expect.objectContaining({ s: "GOTU", d: "2026-11-25", h: "bmo", o: SRC, eE: 0.2652, t: 0 })]);
  });
});

// Shaped like Nasdaq's day calendar rows.
const nqBody = (rows: { symbol: string; time: string; marketCap: string }[]) => ({ data: { asOf: "", headers: {}, rows: rows.map((r) => ({ name: r.symbol, epsForecast: "", ...r })) } });
const ev = (s: string, d: string, extra: Partial<EarningsEvent> = {}): EarningsEvent =>
  ({ s, d, h: "", q: 3, y: 2026, eE: 0.1, eA: null, rE: 1.9e9, rA: null, t: 0, ...extra });
const win = (days: Record<string, Record<string, EarningsEvent["h"]>>): NqWindow => {
  const loaded = windowDays(TODAY);
  return { from: TODAY, to: windowEnd(TODAY), loaded, idx: buildIndex(Object.fromEntries(loaded.map((d) => [d, days[d] ?? {}]))) };
};

describe("0105 the slim Nasdaq cache keeps timed mid-size listings", () => {
  it("keeps tracked names, anything $1B+, and timed listings from $250M; drops the rest", () => {
    expect(keepNasdaq(true, 0, "")).toBe(true);
    expect(keepNasdaq(false, 1e9, "")).toBe(true);
    expect(keepNasdaq(false, 491190208, "bmo")).toBe(true);
    expect(keepNasdaq(false, 491190208, "amc")).toBe(true);
    expect(keepNasdaq(false, 491190208, "")).toBe(false);
    expect(keepNasdaq(false, 2e8, "bmo")).toBe(false);
  });

  it("Nasdaq's Nov 25 day keeps GOTU pre-market (it used to be dropped)", () => {
    const body = nqBody([
      { symbol: "GOTU", time: "time-pre-market", marketCap: "$491,190,208" },
      { symbol: "QQMID", time: "time-not-supplied", marketCap: "$491,190,208" },
      { symbol: "QQTINY", time: "time-after-hours", marketCap: "$40,000,000" },
    ]);
    expect(nasdaqDaySessions(body, (_s, cap, h) => keepNasdaq(false, cap, h))).toEqual({ GOTU: "bmo" });
  });
});

describe("0105 a projected off-universe row Nasdaq lists a day later", () => {
  it("is flagged and leads on Nasdaq's day, still unconfirmed; with Nasdaq agreeing it isn't", () => {
    const row = ev("QQGT", "2026-11-24");
    const later = leadRows(crossCheck([row], win({ "2026-11-25": { QQGT: "bmo" } })), "2026-11-23", "2026-11-27", TODAY);
    expect(later).toEqual([expect.objectContaining({ d: "2026-11-25", h: "bmo", hs: "n", x: "differs", xd: "2026-11-24", xf: 1 })]);
    const same = leadRows(crossCheck([row], win({ "2026-11-24": { QQGT: "bmo" } })), "2026-11-23", "2026-11-27", TODAY);
    expect(same).toEqual([expect.objectContaining({ d: "2026-11-24", h: "bmo", x: "agree" })]);
    expect(same[0].xd).toBeUndefined();
  });

  it("with Nasdaq unavailable, the row is unchanged", () => {
    const row = ev("QQGT", "2026-11-24");
    const none: NqWindow = { from: TODAY, to: windowEnd(TODAY), loaded: [], idx: {} };
    expect(leadRows(crossCheck([row], none), "2026-11-23", "2026-11-27", TODAY)).toEqual([row]);
  });
});

// ── through the worker ───────────────────────────────────────────────────
class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
// Off-universe, revenue in CNY (so on the calendar), about $490M on Nasdaq. QQGT is made up, so no override applies.
const fhRow = (symbol: string, date: string) => ({ symbol, date, hour: "", quarter: 3, year: 2026, epsEstimate: 0.2652, epsActual: null, revenueEstimate: 1928353860, revenueActual: null });
const FH_ROWS = [fhRow("GOTU", "2026-11-24"), fhRow("QQGT", "2026-11-24")];
let cold = false;
const store = () => (globalThis as any).caches.default.store as Map<string, string>;
const unlock = () => { for (const k of [...store().keys()]) if (k.includes("nq%3Ax%3Alock")) store().delete(k); };

describe("0105 on the worker", () => {
  beforeEach(() => {
    waits = []; cold = false;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T19:00:00Z"));
    (globalThis as any).caches = { default: new MemCache() };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") {
        if (cold) return new Response("nope", { status: 503 });
        const day = url.searchParams.get("date");
        return new Response(JSON.stringify(nqBody(day === "2026-11-25"
          ? [{ symbol: "GOTU", time: "time-pre-market", marketCap: "$491,190,208" }, { symbol: "QQGT", time: "time-pre-market", marketCap: "$491,190,208" }]
          : [{ symbol: "FILLER", time: "time-not-supplied", marketCap: "$5,000,000,000" }])));
      }
      if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: [] } } }));
      if (url.pathname.endsWith("/calendar/earnings")) {
        const sym = url.searchParams.get("symbol");
        if (sym) return new Response(JSON.stringify({ earningsCalendar: FH_ROWS.filter((r) => r.symbol === sym) }));
        const from = url.searchParams.get("from")!, to = url.searchParams.get("to")!;
        return new Response(JSON.stringify({ earningsCalendar: FH_ROWS.filter((r) => r.date >= from && r.date <= to) }));
      }
      if (url.pathname.endsWith("/stock/earnings")) return new Response("[]");
      return new Response(JSON.stringify({}), { status: 200 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  const call = async (path: string) => {
    const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
    await Promise.all(waits); waits = [];
    return r.json() as Promise<any>;
  };
  const WEEK = "/api/calendar?from=2026-11-23&to=2026-11-27";
  const warm = async () => { let r: any; for (let i = 0; i < 6; i++) { unlock(); r = await call(WEEK); } return r; };

  it("the calendar has one GOTU row, Wed Nov 25 before the open, company-dated", async () => {
    const r = await warm();
    const g = r.events.filter((e: EarningsEvent) => e.s === "GOTU");
    expect(g).toEqual([expect.objectContaining({ d: "2026-11-25", h: "bmo", o: SRC })]);
    expect(g[0].x).toBeUndefined();
  });

  it("an off-universe projection Nasdaq lists a day later, timed, sits on Nasdaq's day, still unconfirmed", async () => {
    const r = await warm();
    expect(r.events.filter((e: EarningsEvent) => e.s === "QQGT")).toEqual([expect.objectContaining({ d: "2026-11-25", h: "bmo", x: "differs", xd: "2026-11-24", xf: 1 })]);
  });

  it("with Nasdaq down, the off-universe row stays on the feed's day, unflagged", async () => {
    cold = true;
    const r = await warm();
    const q = r.events.filter((e: EarningsEvent) => e.s === "QQGT");
    expect(q).toEqual([expect.objectContaining({ d: "2026-11-24", h: "" })]);
    expect(q[0].x).toBeUndefined();
  });

  it("/t/GOTU: Wed Nov 25 before the open, confirmed, and the unfurl never says unconfirmed", async () => {
    await warm();
    const t = await call("/api/ticker/GOTU");
    expect(t.next).toMatchObject({ date: "2026-11-25", session: "bmo", confirmed: SRC });
    expect(t.next.projected).toBeUndefined();
    const title = tickerShareTitle("GOTU", "Gaotu Techedu", t.next, t.justReported);
    expect(title).toMatch(/^GOTU reports Wed, Nov 25 before the open/);
    expect(title).not.toMatch(/unconfirmed|not yet confirmed|Nov 24/i);
  });
});
