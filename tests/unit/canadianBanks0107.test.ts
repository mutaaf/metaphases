import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import universe from "../../data/universe.json" with { type: "json" };
import { aliasMap, supplementSymbols, type Universe } from "../../shared/calendarSupplement";
import { validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { tickerShareTitle } from "../../shared/pending";
import type { EarningsEvent } from "../../shared/types";
import worker from "../../worker/index";

// 0107: Canada's Big Five banks ($740B together) were missing from the Dec 2–3 calendar. Finnhub's range feed lists
// them only under their Toronto symbols (RY.TO…), and `toEvents` drops untracked dotted symbols. Tracking them
// (c: "CA", ec: "CAD", Toronto logos) lets the 0024 alias rename RY.TO → RY and the supplement cover any gap.
// BMO's invite (Dec 2, about 6:00 a.m. ET) and CIBC's IR page (Dec 3, about 5:30 a.m. ET) state a pre-open release.

const U = universe as unknown as Universe;
const FILE = overridesFile as unknown as DateOverrides;
const BANKS = ["RY", "TD", "BMO", "BNS", "CM"];
const BMO_SRC = "https://www.bmo.com/ir/qtrinfo/1/2026-q4/Q4_26_Invite.pdf";
const CM_SRC = "https://www.cibc.com/en/about-cibc/investor-relations/quarterly-results.html";
// Bounce 1: RBC (Dec 3, about 6:00 a.m. ET) and Scotiabank (Dec 2, about 5:30 a.m. ET) also state a pre-open release.
const RY_SRC = "https://investingnews.com/rbc-to-announce-fourth-quarter-and-fiscal-2026-results/";
const BNS_SRC = "https://investingnews.com/scotiabank-to-announce-fourth-quarter-2026-results/";
const TODAY = "2026-11-24";

describe("0107 the Big Five are tracked", () => {
  for (const s of BANKS) {
    it(`${s}: in the universe as a Canadian CAD reporter with a dollar market value, aliased from ${s}.TO`, () => {
      expect(U[s]).toMatchObject({ c: "CA", ec: "CAD", mcCur: "CAD" });
      const e = U[s] as typeof U[string] & { mcL: number; fx: number };
      expect(e.mc).toBe(Math.round(e.mcL * e.fx)); // USD millions, never the CAD figure
      expect(e.mc).toBeGreaterThan(50_000);
      expect(aliasMap(U)[`${s}.TO`]).toBe(s);
      expect(supplementSymbols(U)).toContain(s);
    });
  }

  it("the weekly refresh keeps them (they're in build_universe.py's EXTRA list)", () => {
    const src = readFileSync(new URL("../../scripts/build_universe.py", import.meta.url), "utf8");
    const extra = /EXTRA = """([\s\S]*?)"""/.exec(src)![1].split(/\s+/);
    for (const s of BANKS) expect(extra).toContain(s);
  });

  it("BMO and CM carry the company's date and pre-open session", () => {
    expect(FILE.BMO).toMatchObject({ date: "2026-12-02", hour: "bmo", quarter: 4, year: 2026, source: BMO_SRC });
    expect(FILE.CM).toMatchObject({ date: "2026-12-03", hour: "bmo", quarter: 4, year: 2026, source: CM_SRC });
    expect(validateOverrides({ BMO: FILE.BMO, CM: FILE.CM }, TODAY)).toEqual([]);
  });

  it("RY, BNS and TD carry the company's release time as a pre-open session", () => {
    expect(FILE.RY).toMatchObject({ date: "2026-12-03", hour: "bmo", quarter: 4, year: 2026, source: RY_SRC });
    expect(FILE.BNS).toMatchObject({ date: "2026-12-02", hour: "bmo", quarter: 4, year: 2026, source: BNS_SRC });
    expect(validateOverrides({ RY: FILE.RY, BNS: FILE.BNS }, TODAY)).toEqual([]);
    // 0115: TD's Nov 12 advisory: results at about 6:30 a.m. ET on Dec 3, call 9:30 a.m. ET.
    expect(FILE.TD).toMatchObject({ date: "2026-12-03", hour: "bmo", quarter: 4, year: 2026, call: "9:30 a.m. ET" });
    expect(validateOverrides({ TD: FILE.TD }, "2026-11-26")).toEqual([]);
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
// Finnhub's range feed, as on 2026-11-24: Toronto symbols, CA$ figures, every bank "amc".
const fh = (symbol: string, date: string, epsEstimate: number, revenueEstimate: number) =>
  ({ symbol, date, hour: "amc", quarter: 4, year: 2026, epsEstimate, epsActual: null, revenueEstimate, revenueActual: null });
const FH_ROWS = [
  fh("RY.TO", "2026-12-03", 4.2695, 19065338552), fh("TD.TO", "2026-12-03", 2.5979, 15878480000),
  fh("BMO.TO", "2026-12-02", 3.7846, 10007031631), fh("BNS.TO", "2026-12-02", 2.1993, 10464574023),
  fh("CM.TO", "2026-12-03", 2.5916, 8563978373),
];
const NQ: Record<string, string[]> = { "2026-12-02": ["BMO", "BNS"], "2026-12-03": ["RY", "TD", "CM"] };
const store = () => (globalThis as any).caches.default.store as Map<string, string>;
const unlock = () => { for (const k of [...store().keys()]) if (k.includes("nq%3Ax%3Alock")) store().delete(k); };

describe("0107 on the worker", () => {
  beforeEach(() => {
    waits = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T15:00:00Z"));
    (globalThis as any).caches = { default: new MemCache() };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") {
        const syms = NQ[url.searchParams.get("date")!] ?? ["FILLER"];
        return new Response(JSON.stringify({ data: { asOf: "", headers: {}, rows: syms.map((s) => ({ symbol: s, name: s, epsForecast: "", time: s === "FILLER" ? "time-not-supplied" : "time-pre-market", marketCap: "$100,000,000,000" })) } }));
      }
      if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: [] } } }));
      if (url.pathname.endsWith("/calendar/earnings")) {
        const sym = url.searchParams.get("symbol");
        if (sym) return new Response(JSON.stringify({ earningsCalendar: FH_ROWS.filter((r) => r.symbol === `${sym}.TO`) }));
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
  const RANGE = "/api/calendar?from=2026-12-02&to=2026-12-03";
  const warm = async () => { let r: any; for (let i = 0; i < 8; i++) { unlock(); r = await call(RANGE); } return r; };

  it("Dec 2–3 has each bank once, on its day, under its US ticker", async () => {
    const r = await warm();
    const rows = r.events.filter((e: EarningsEvent) => BANKS.includes(e.s));
    expect(rows.map((e: EarningsEvent) => e.s).sort()).toEqual([...BANKS].sort());
    const day: Record<string, string> = { RY: "2026-12-03", TD: "2026-12-03", CM: "2026-12-03", BMO: "2026-12-02", BNS: "2026-12-02" };
    for (const e of rows) expect(e.d).toBe(day[e.s]);
    expect(r.events.some((e: EarningsEvent) => e.s.endsWith(".TO"))).toBe(false);
  });

  it("BMO and CM read before the open with the company's link; no bank is plainly 'after the close'", async () => {
    const r = await warm();
    const by = Object.fromEntries(r.events.map((e: EarningsEvent) => [e.s, e]));
    expect(by.BMO).toMatchObject({ d: "2026-12-02", h: "bmo", o: BMO_SRC });
    expect(by.CM).toMatchObject({ d: "2026-12-03", h: "bmo", o: CM_SRC });
    expect(by.RY).toMatchObject({ d: "2026-12-03", h: "bmo", o: RY_SRC });
    expect(by.BNS).toMatchObject({ d: "2026-12-02", h: "bmo", o: BNS_SRC });
    // TD: the feed says amc; the company's advisory (0115) says before the open, so it reads bmo with its link.
    expect(by.TD).toMatchObject({ d: "2026-12-03", h: "bmo", o: FILE.TD.source });
  });

  it("/t/BMO: Wed Dec 2 before the open, never after the close", async () => {
    await warm();
    const t = await call("/api/ticker/BMO");
    expect(t.next).toMatchObject({ date: "2026-12-02", session: "bmo", confirmed: BMO_SRC });
    const title = tickerShareTitle("BMO", "Bank of Montreal", t.next, t.justReported);
    expect(title).toMatch(/^BMO reports Wed, Dec 2 before the open/);
    expect(title).not.toMatch(/after the close/i);
  });

  for (const [s, name, date, src, re] of [
    ["RY", "Royal Bank of Canada", "2026-12-03", RY_SRC, /^RY reports Thu, Dec 3 before the open/],
    ["BNS", "Bank of Nova Scotia", "2026-12-02", BNS_SRC, /^BNS reports Wed, Dec 2 before the open/],
  ] as const) {
    it(`/t/${s}: before the open on the company's date, not "time unconfirmed"`, async () => {
      await warm();
      const t = await call(`/api/ticker/${s}`);
      expect(t.next).toMatchObject({ date, session: "bmo", confirmed: src });
      const title = tickerShareTitle(s, name, t.next, t.justReported);
      expect(title).toMatch(re);
      expect(title).not.toMatch(/unconfirmed|after the close/i);
    });
  }
});
