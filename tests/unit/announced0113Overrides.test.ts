import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToRows, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { buildIcs } from "../../shared/depth";
import { tickerShareTitle } from "../../shared/pending";
import worker from "../../worker/index";

// 0113: four companies reporting Dec 2–3 published the date and session, but the sheets said "(expected) … the
// company hasn't said" and the first unfurl said "not yet confirmed". Company releases (read 2026-11-25):
//  FIVE Five Below, Nov 18: "after market close on Wednesday, December 2, 2026", call 4:15 p.m. ET
//  ULTA Ulta Beauty, Nov 19: "on Thursday, December 3, 2026, after the market closes", call 4:30 p.m. ET
//  DOCU Docusign, Nov 19: "after the U.S. markets close on Thursday, December 3, 2026", call 5:00 p.m. ET
//  S    SentinelOne, Nov 12: "after market close on Thursday, December 3, 2026", call 2:00 p.m. PT
// And the copy: we only know we have no notice on file, never that the company is silent.

const FILE = overridesFile as unknown as DateOverrides;
const today = "2026-11-25";
const CASES = [
  { s: "FIVE", date: "2026-12-02", q: 3, y: 2027, title: "FIVE reports Wed, Dec 2 after the close · Metaphases" },
  { s: "ULTA", date: "2026-12-03", q: 3, y: 2027, title: "ULTA reports Thu, Dec 3 after the close · Metaphases" },
  { s: "DOCU", date: "2026-12-03", q: 3, y: 2027, title: "DOCU reports Thu, Dec 3 after the close · Metaphases" },
  { s: "S", date: "2026-12-03", q: 3, y: 2027, title: "S reports Thu, Dec 3 after the close · Metaphases" },
] as const;
// Finnhub's rows as production served them on 2026-11-25: right day, no session.
const feed = CASES.map((c, i) => ({ symbol: c.s, date: c.date, hour: "", quarter: c.q, year: c.y, epsEstimate: 1 + i / 10, epsActual: null, revenueEstimate: 1e9 + i, revenueActual: null }));

describe("0113 announced dates and sessions", () => {
  for (const c of CASES) {
    it(`${c.s}: the entry passes the gate, ${c.date} amc`, () => {
      expect(FILE[c.s]).toMatchObject({ date: c.date, hour: "amc", quarter: c.q, year: c.y });
      expect(FILE[c.s].source).toMatch(/^https:\/\//);
      expect(validateOverrides({ [c.s]: FILE[c.s] }, today)).toEqual([]);
    });

    it(`${c.s}: the feed's session-less row takes the company's session; the share title is firm`, () => {
      const row = feed.find((r) => r.symbol === c.s)!;
      const out = applyToRows(c.s, [row], FILE, today);
      expect(out).toEqual([expect.objectContaining({ date: c.date, hour: "amc", epsEstimate: row.epsEstimate })]);
      const next = { date: out[0].date, session: out[0].hour, quarter: c.q, year: c.y, epsE: row.epsEstimate, revE: null, confirmed: out[0].source };
      expect(tickerShareTitle(c.s, c.s, next, undefined)).toBe(c.title);
    });
  }
});

describe("0113 the copy never claims the company's silence", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css|html)$/.test(f) ? [p] : [];
  });
  // Code comments may describe the state; only strings a reader (or the AI) sees are checked.
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  it("no copy in src/, shared/ or worker/ claims the company hasn't said or announced", () => {
    const hits = ["src", "shared", "worker"].flatMap((d) => walk(new URL(`../../${d}`, import.meta.url).pathname))
      .filter((p) => /(company|it) hasn['’]t (said|announced)/i.test(strip(readFileSync(p, "utf8"))));
    expect(hits).toEqual([]);
  });
  it("the ICS for a Nasdaq-filled session says we have no announcement on file", () => {
    const ics = buildIcs([{ symbol: "ZZN", name: "Zz Nine", date: "2026-12-03", session: "amc", quarter: 3, year: 2027, epsE: 1, url: "https://x/t/ZZN", expected: true }], new Date("2026-11-25T15:00:00Z")).replace(/\r\n /g, "");
    expect(ics).toContain("we haven't found a company announcement yet");
    expect(ics).not.toMatch(/hasn't said/);
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

describe("0113 the companies' sessions through the worker", () => {
  beforeEach(() => {
    pending = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T19:00:00Z"));
    (globalThis as any).caches = { default: new MemCache() };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.pathname.endsWith("/calendar/earnings")) {
        const from = url.searchParams.get("from") ?? "0000", to = url.searchParams.get("to") ?? "9999";
        const sym = url.searchParams.get("symbol");
        const rows = feed.filter((r) => sym ? r.symbol === sym : r.date >= from && r.date <= to);
        return new Response(JSON.stringify({ earningsCalendar: rows }));
      }
      return new Response("{}", { status: 404 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  for (const range of [["2026-11-30", "2026-12-04"], ["2026-12-02", "2026-12-03"], ["2026-12-03", "2026-12-03"], ["2026-11-23", "2026-12-04"]]) {
    it(`/api/calendar ${range[0]}..${range[1]} carries each company's session and source`, async () => {
      const r = await get(`/api/calendar?from=${range[0]}&to=${range[1]}`);
      for (const c of CASES) {
        if (c.date < range[0] || c.date > range[1]) continue;
        const rows = r.events.filter((e: any) => e.s === c.s);
        expect(rows, c.s).toHaveLength(1);
        expect(rows[0]).toMatchObject({ d: c.date, h: "amc", o: FILE[c.s]?.source });
        expect(rows[0].hs).toBeUndefined();
      }
    });
  }

  for (const c of CASES) {
    it(`/api/ticker/${c.s}: next is ${c.date} after the close, confirmed, not projected`, async () => {
      const r = await get(`/api/ticker/${c.s}`);
      expect(r.next).toMatchObject({ date: c.date, session: "amc", confirmed: FILE[c.s]?.source });
      expect(r.next.projected).toBeUndefined();
      expect(r.next.hs).toBeUndefined();
    });
  }
});
