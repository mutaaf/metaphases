import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import overridesFile from "../../data/date-overrides.json" with { type: "json" };
import { applyToRows, validateOverrides, type DateOverrides } from "../../shared/dateOverrides";
import { tickerShareTitle } from "../../shared/pending";
import worker from "../../worker/index";

// 0115: TD read "after the close" on every unchecked calendar read (Finnhub's amc, no Nasdaq mark), although TD's
// media advisory (Nov 12) says "Financial results will be released at approximately 6:30 a.m. ET" on Thursday,
// December 3, 2026, "followed by a conference call at 9:30 a.m. ET". The sweep of $40B+ rows with a company notice
// but no link (read 2026-11-26):
//  CRM  Salesforce, Nov 10: Wednesday, December 2, 2026, "after the close of the market", call 2:00 p.m. PT
//  SNOW Snowflake, Nov 2: after the U.S. market close on Wednesday, December 2, 2026
//  VEEV Veeva, Nov 12: "after market close on December 3, 2026", call 2:00 p.m. PT
// And the copy: we only know we haven't found a notice, never that the company is silent.

const FILE = overridesFile as unknown as DateOverrides;
const today = "2026-11-26";
const CASES = [
  { s: "TD", date: "2026-12-03", h: "bmo", q: 4, y: 2026, feedH: "amc", title: "TD reports Thu, Dec 3 before the open · Metaphases" },
  { s: "CRM", date: "2026-12-02", h: "amc", q: 3, y: 2027, feedH: "amc", title: "CRM reports Wed, Dec 2 after the close · Metaphases" },
  { s: "SNOW", date: "2026-12-02", h: "amc", q: 3, y: 2027, feedH: "amc", title: "SNOW reports Wed, Dec 2 after the close · Metaphases" },
  { s: "VEEV", date: "2026-12-03", h: "amc", q: 3, y: 2027, feedH: "amc", title: "VEEV reports Thu, Dec 3 after the close · Metaphases" },
] as const;
// Finnhub's rows as production served them on 2026-11-26.
const feed = CASES.map((c, i) => ({ symbol: c.s, date: c.date, hour: c.feedH, quarter: c.q, year: c.y, epsEstimate: 1 + i / 10, epsActual: null, revenueEstimate: 1e9 + i, revenueActual: null }));

describe("0115 company-announced dates and sessions", () => {
  for (const c of CASES) {
    it(`${c.s}: the entry passes the gate, ${c.date} ${c.h}`, () => {
      expect(FILE[c.s]).toMatchObject({ date: c.date, hour: c.h, quarter: c.q, year: c.y });
      expect(FILE[c.s].source).toMatch(/^https:\/\//);
      expect(validateOverrides({ [c.s]: FILE[c.s] }, today)).toEqual([]);
    });

    it(`${c.s}: the feed's row takes the company's session; the share title is firm`, () => {
      const row = feed.find((r) => r.symbol === c.s)!;
      const out = applyToRows(c.s, [row], FILE, today);
      expect(out).toEqual([expect.objectContaining({ date: c.date, hour: c.h, epsEstimate: row.epsEstimate })]);
      const next = { date: out[0].date, session: out[0].hour, quarter: c.q, year: c.y, epsE: row.epsEstimate, revE: null, confirmed: out[0].source };
      expect(tickerShareTitle(c.s, c.s, next, undefined)).toBe(c.title);
    });
  }
  it("TD keeps its 9:30 a.m. ET call; BNS's note no longer says TD named no time", () => {
    expect(FILE.TD.call).toBe("9:30 a.m. ET");
    expect(FILE.BNS.note).not.toMatch(/TD has named no time/);
  });
});

describe("0115 the copy never claims what the company has or hasn't done", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css|html)$/.test(f) ? [p] : [];
  });
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // Every inflection (LESSONS 2026-11-26), not one phrase: "hasn't confirmed its time" slipped past an earlier list.
  const PHRASES = /until the compan(y|ies) announces?|when the compan(y|ies) announces?|(hasn['’]t|haven['’]t|has not|have not) (yet )?(said|announced|confirmed|named|given|published)/i;
  it("no copy in src/, shared/ or worker/ uses the phrases", () => {
    const hits = ["src", "shared", "worker"].flatMap((d) => walk(new URL(`../../${d}`, import.meta.url).pathname))
      .filter((p) => PHRASES.test(strip(readFileSync(p, "utf8"))));
    expect(hits).toEqual([]);
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

describe("0115 through the worker, with Nasdaq unread (the unchecked first read)", () => {
  beforeEach(() => {
    pending = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-26T19:00:00Z"));
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

  for (const range of [["2026-11-30", "2026-12-04"], ["2026-12-03", "2026-12-03"], ["2026-11-27", "2026-12-06"]]) {
    it(`/api/calendar ${range[0]}..${range[1]}: each company's session and link, TD never after the close`, async () => {
      const r = await get(`/api/calendar?from=${range[0]}&to=${range[1]}`);
      for (const c of CASES) {
        if (c.date < range[0] || c.date > range[1]) continue;
        const rows = r.events.filter((e: any) => e.s === c.s);
        expect(rows, c.s).toHaveLength(1);
        expect(rows[0]).toMatchObject({ d: c.date, h: c.h, o: FILE[c.s]?.source });
        // No contest mark either: the client would blank a marked row to "Time unconfirmed".
        expect(rows[0].x, c.s).toBeUndefined();
        expect(rows[0].xh, c.s).toBeUndefined();
      }
    });
  }

  it("/api/ticker/TD: next is Dec 3 before the open, confirmed, not projected", async () => {
    const r = await get("/api/ticker/TD");
    expect(r.next).toMatchObject({ date: "2026-12-03", session: "bmo", confirmed: FILE.TD?.source, call: "9:30 a.m. ET" });
    expect(r.next.projected).toBeUndefined();
    expect(r.next.nasdaq).toBeUndefined();
  });

  it("/t/TD unfurls before the open, never after the close", async () => {
    // A tiny HTMLRewriter (Workers-only) that records what the share page sets, as in announced0093Overrides.test.ts.
    vi.stubGlobal("HTMLRewriter", class {
      hs: [string, any][] = [];
      on(sel: string, h: any) { this.hs.push([sel, h]); return this; }
      transform(res: Response) {
        const out: Record<string, string> = {};
        for (const [sel, h] of this.hs) h.element?.({ setInnerContent: (v: string) => { out[sel] = v; }, setAttribute: (_a: string, v: string) => { out[sel] = v; }, getAttribute: (a: string) => (sel.includes("og:title") && a === "property" ? "og:title" : null), append: (v: string) => { out[sel] = v; } });
        return new Response(JSON.stringify(out), { status: res.status, headers: res.headers });
      }
    });
    const r = await worker.fetch(new Request("https://mutaafaziz.com/metaphases/t/TD"), env, ctx);
    await Promise.all(pending); pending = [];
    const out = (await r.json()) as Record<string, string>;
    const og = out['meta[property="og:title"], meta[name="twitter:title"]'];
    expect(og).toMatch(/^TD reports Thu, Dec 3 before the open/);
    expect(JSON.stringify(out)).not.toMatch(/after the close/i);
  });
});
