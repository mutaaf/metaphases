import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import universe from "../../data/universe.json" with { type: "json" };
import { aliasMap, commitSupp, homeListing, mergeSupplement, refreshEntry, staleSymbols, supplementSymbols, suppRows, SUPP_PER_REQUEST, SUPP_TTL_MS, type Universe } from "../../shared/calendarSupplement";

// 0024: Finnhub's day/range calendar has no Toyota, Sony, Honda, Novo Nordisk or JD rows while each of their
// `symbol=` answers (what the sheet reads) does. The calendar now merges those rows in, once, and renames
// home-listing rows (7203.T) to the tracked symbol.

const U = universe as unknown as Universe;
const ev = (s: string, d: string) => ({ s, d, h: "amc" as const, q: 2, y: 2027, eE: 64.5, eA: null, rE: 1.3e13, rA: null, t: 1 as const });

describe("calendar supplement (pure)", () => {
  it("maps home listings to the tracked symbol, never a renamed US ticker", () => {
    const a = aliasMap(U);
    expect(a["7203.T"]).toBe("TM");
    expect(a["6758.T"]).toBe("SONY");
    expect(a["NOVO B.CO"]).toBe("NVO");
    expect(a["9618.HK"]).toBe("JD");
    expect(a["FB"]).toBeUndefined(); // META's old ticker
    expect(a["NWSA"]).toBeUndefined(); // tracked in its own right
    // Only names whose estimates are known to be non-USD, so an aliased row's figures are labelled right.
    expect(a["FERG.L"]).toBeUndefined();
    expect(a["EFR.TO"]).toBeUndefined();
    for (const sym of Object.values(a)) expect(U[sym].ec && U[sym].ec !== "USD").toBeTruthy();
  });

  it("covers the foreign filers and dotted share classes, and not US names", () => {
    const s = supplementSymbols(U);
    for (const x of ["TM", "SONY", "HMC", "NVO", "JD", "SQM", "BRK.B"]) expect(s).toContain(x);
    expect(s).not.toContain("AAPL");
    expect(s.length).toBeLessThan(80);
  });

  it("refreshes never-fetched symbols first, then the oldest, a few at a time", () => {
    const now = 10 * SUPP_TTL_MS;
    const doc = { A: { at: now - SUPP_TTL_MS - 5, rows: [] }, B: { at: now - 1, rows: [] }, C: { at: now - SUPP_TTL_MS - 9, rows: [] } };
    expect(staleSymbols(doc, ["A", "B", "C", "D"], now, 3)).toEqual(["D", "C", "A"]);
    expect(staleSymbols(doc, ["A", "B", "C", "D", "E", "F", "G"], now).length).toBe(SUPP_PER_REQUEST);
  });

  it("a refresh after the report keeps the reported row (symbol= returns future dates only), spread over the hour", () => {
    const prev = { at: 0, rows: [ev("NVO", "2026-11-04"), ev("NVO", "2026-09-01")] };
    const next = refreshEntry(prev, [ev("NVO", "2027-02-04")], "2026-11-05", 10_000_000, 0.5);
    expect(next.rows.map((r) => r.d)).toEqual(["2026-11-04", "2027-02-04"]); // >40 days old dropped
    expect(next.at).toBe(10_000_000 - 1_800_000);
    // A fresh answer that has the day (now with results) replaces the kept copy.
    const withActual = { ...ev("NVO", "2026-11-04"), eA: 5.1 };
    expect(refreshEntry(prev, [withActual], "2026-11-05", 1, 0).rows.filter((r) => r.d === "2026-11-04")).toEqual([withActual]);
  });

  it("keeps only the asked symbol's rows, once per date", () => {
    const raw = [{ symbol: "TM", date: "2026-11-05", hour: "amc", quarter: 2, year: 2027, epsEstimate: 64.5 }, { symbol: "TM", date: "2026-11-05" }, { symbol: "MSFT", date: "2026-11-05" }];
    expect(suppRows("TM", raw)).toEqual([{ s: "TM", d: "2026-11-05", h: "amc", q: 2, y: 2027, eE: 64.5, eA: null, rE: null, rA: null, t: 1 }]);
  });

  it("accepts an ADR answer labelled with its home listing or unlabelled, never another company's", () => {
    expect(homeListing(U, "TM")).toBe("7203.T");
    expect(homeListing(U, "AAPL")).toBeUndefined();
    const raw = [{ symbol: "7203.T", date: "2026-11-05", hour: "amc" }, { date: "2026-11-06" }, { symbol: "MSFT", date: "2026-11-07" }, { symbol: "6758.T", date: "2026-11-08" }];
    expect(suppRows("TM", raw, "7203.T").map((r) => [r.s, r.d])).toEqual([["TM", "2026-11-05"], ["TM", "2026-11-06"]]);
  });

  it("adds a missing symbol's row once, lets the feed's own row win, and never fills a failed day", () => {
    const doc = { TM: { at: 1, rows: [ev("TM", "2026-11-05")] }, NVO: { at: 1, rows: [ev("NVO", "2026-11-04")] }, SONY: { at: 1, rows: [ev("SONY", "2026-11-06")] } };
    const feed = [ev("AAPL", "2026-11-05"), ev("NVO", "2026-11-04")];
    const out = mergeSupplement(feed, doc, "2026-11-02", "2026-11-06", (d) => d !== "2026-11-06");
    expect(out.filter((e) => e.s === "TM")).toHaveLength(1);
    expect(out.filter((e) => e.s === "NVO")).toHaveLength(1);
    expect(out.some((e) => e.s === "SONY")).toBe(false);
    expect(mergeSupplement(feed, doc, "2026-11-09", "2026-11-13", () => true)).toEqual(feed);
  });
});

describe("supplement store converges (0047)", () => {
  const entry = (at: number, s: string) => ({ at, rows: [ev(s, "2026-11-05")] });
  const fakeStore = (initial: Record<string, any> = {}) => {
    let doc = initial;
    return { read: async () => structuredClone(doc), write: async (d: any) => { doc = structuredClone(d); }, get doc() { return doc; } };
  };

  it("two interleaved refreshes over different symbols both survive", async () => {
    const store = fakeStore();
    const seenA = await store.read(), seenB = await store.read(); // both read the empty document
    await commitSupp(store, seenA, { TM: entry(1, "TM"), SONY: entry(1, "SONY") });
    await commitSupp(store, seenB, { HMC: entry(2, "HMC"), NVO: entry(2, "NVO") });
    expect(Object.keys(store.doc).sort()).toEqual(["HMC", "NVO", "SONY", "TM"]);
  });

  it("never writes back less than it read, even if the stored copy went missing", async () => {
    const store = fakeStore();
    const seen = { TM: entry(5, "TM"), SONY: entry(5, "SONY") }; // what this request read before the copy was evicted
    const out = await commitSupp(store, seen, { HMC: entry(6, "HMC") });
    expect(Object.keys(out).sort()).toEqual(["HMC", "SONY", "TM"]);
    expect(Object.keys(store.doc).sort()).toEqual(["HMC", "SONY", "TM"]);
  });

  it("drops names that are no longer on the supplement list", async () => {
    const store = fakeStore({ OLD: entry(1, "OLD") });
    await commitSupp(store, {}, { TM: entry(2, "TM") }, ["TM", "SONY"]);
    expect(Object.keys(store.doc)).toEqual(["TM"]);
  });

  it("keeps the newer answer when two requests refreshed the same symbol", async () => {
    const store = fakeStore({ TM: entry(10, "TM") });
    await commitSupp(store, { TM: entry(1, "TM") }, { SONY: entry(3, "SONY") });
    expect(store.doc.TM.at).toBe(10);
    await commitSupp(store, {}, { TM: entry(20, "TM") });
    expect(store.doc.TM.at).toBe(20);
  });
});

// ── through the worker ──────────────────────────────────────────────────
class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as any;
const raw = (symbol: string, date: string, extra: object = {}) => ({ symbol, date, hour: "amc", quarter: 2, year: 2027, epsEstimate: 64.4986, epsActual: null, revenueEstimate: 13484143935600, revenueActual: null, ...extra });
let symCalls: string[] = [];
let rangeCalls = 0;
let rangeRows: () => any[] = () => [raw("AAPL", "2026-11-05")];
let rangeStatus = 200;
// Finnhub may label an ADR's rows with its home listing (TM → 7203.T).
const bySymbol: Record<string, any[]> = { TM: [raw("7203.T", "2026-11-05")], SONY: [raw("SONY", "2026-11-05", { hour: "bmo" })], HMC: [raw("HMC", "2026-11-05", { hour: "" })] };

beforeEach(() => {
  pending = []; symCalls = []; rangeCalls = 0; rangeStatus = 200; rangeRows = () => [raw("AAPL", "2026-11-05")];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T15:00:00Z"));
  (globalThis as any).caches = { default: new MemCache() };
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    const sym = url.searchParams.get("symbol");
    if (sym) { symCalls.push(sym); return new Response(JSON.stringify({ earningsCalendar: bySymbol[sym] ?? [] })); }
    rangeCalls++;
    if (rangeStatus !== 200) return new Response("down", { status: rangeStatus });
    return new Response(JSON.stringify({ earningsCalendar: rangeRows() }));
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const LOCK = "cal%3Asupp%3Alock%3Av1";
const minutePasses = () => { const st = (globalThis as any).caches.default.store as Map<string, string>; for (const k of [...st.keys()]) if (k.includes(LOCK)) st.delete(k); };
const get = async (from: string, to: string) => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases/api/calendar?from=${from}&to=${to}`), env, ctx);
  await Promise.all(pending); pending = [];
  return r.json() as Promise<{ events: any[]; warnings: string[]; pending?: number }>;
};

describe("calendar supplement in the worker", () => {
  it("lists Toyota on Nov 5 once, in its own currency figures, when the range feed lacks it", async () => {
    let r = await get("2026-11-05", "2026-11-05");
    // Largest first by dollar value (0042: Toyota's cap was ranked in yen, so it jumped the queue).
    expect(symCalls).toEqual(supplementSymbols(U).slice(0, SUPP_PER_REQUEST));
    const tmAt = supplementSymbols(U).indexOf("TM");
    expect(tmAt).toBeGreaterThanOrEqual(0);
    for (let i = 1; i <= Math.floor(tmAt / SUPP_PER_REQUEST); i++) { minutePasses(); r = await get("2026-11-05", "2026-11-05"); }
    expect(symCalls).toContain("TM");
    const tm = r.events.filter((e) => e.s === "TM");
    expect(tm).toHaveLength(1);
    expect(tm[0]).toMatchObject({ d: "2026-11-05", h: "amc", eE: 64.4986, t: 1 });
  });

  it("fills in the rest over later requests and stops calling once everything is fresh", async () => {
    const n = supplementSymbols(U).length;
    for (let i = 0; i < Math.ceil(n / SUPP_PER_REQUEST) + 2; i++) { await get("2026-11-02", "2026-11-06"); minutePasses(); }
    expect(new Set(symCalls).size).toBe(n);
    expect(symCalls.length).toBe(n); // each symbol once within its 12 h
    const r = await get("2026-11-02", "2026-11-06");
    for (const s of ["TM", "SONY"]) expect(r.events.filter((e) => e.s === s)).toHaveLength(1);
    // HMC's supplement row says Nov 5, but Honda announced Tue Nov 10 (0045 override): off this week, onto next.
    expect(r.events.filter((e) => e.s === "HMC")).toEqual([]);
    expect((await get("2026-11-09", "2026-11-13")).events.filter((e) => e.s === "HMC")).toEqual([expect.objectContaining({ d: "2026-11-10", h: "bmo" })]);
    expect(symCalls.length).toBe(n);
    expect(r.warnings).toEqual([]);
    expect(r.pending ?? 0).toBe(0); // everything fetched: nothing left to check
  });

  it("refreshes at most once a minute per colo, however many visitors arrive at once", async () => {
    await Promise.all([get("2026-11-02", "2026-11-06"), get("2026-11-02", "2026-11-06"), get("2026-11-05", "2026-11-05")]);
    await get("2026-11-02", "2026-11-06");
    expect(symCalls.length).toBeLessThanOrEqual(SUPP_PER_REQUEST * 3); // concurrent first requests may race; later ones wait
    const before = symCalls.length;
    await get("2026-11-02", "2026-11-06");
    expect(symCalls.length).toBe(before);
  });

  it("counts overseas names not checked yet as pending, never as a warning (0047: progress isn't a failure)", async () => {
    const r = await get("2026-11-05", "2026-11-05");
    expect(r.pending).toBe(supplementSymbols(U).length - SUPP_PER_REQUEST);
    expect(r.warnings).toEqual([]); // every call succeeded: nothing failed, so nothing to retry or flag
  });

  it("keeps the feed's own row when it has one, and renames a home-listing row", async () => {
    rangeRows = () => [raw("TM", "2026-11-05", { hour: "bmo" }), raw("7203.T", "2026-11-05"), raw("6758.T", "2026-11-05")];
    const r = await get("2026-11-05", "2026-11-05");
    expect(r.events.filter((e) => e.s === "TM")).toEqual([expect.objectContaining({ h: "bmo" })]);
    expect(r.events.filter((e) => e.s === "SONY")).toHaveLength(1);
    expect(r.events.some((e) => e.s.includes(".T"))).toBe(false);
  });

  it("a failed range call makes no supplement calls and adds nothing to the failed day", async () => {
    rangeStatus = 500;
    const r = await get("2026-11-05", "2026-11-05");
    expect(symCalls).toEqual([]);
    expect(r.events.filter((e) => ["TM", "SONY", "HMC"].includes(e.s))).toEqual([]);
    expect(r.warnings.filter((w) => /^Couldn't load/.test(w)).length).toBe(1);
  });

  it("a failed range call covered by a stale copy still makes no supplement calls", async () => {
    await get("2026-11-05", "2026-11-05"); // warms the day (and 4 symbols)
    const store = (globalThis as any).caches.default.store as Map<string, string>;
    for (const k of [...store.keys()]) if (!k.includes("stale")) store.delete(k);
    symCalls = []; rangeStatus = 500;
    minutePasses();
    const r = await get("2026-11-05", "2026-11-05");
    expect(r.warnings.filter((w) => /^Couldn't load/.test(w))).toEqual([]);
    expect(symCalls).toEqual([]);
  });

  it("doesn't call for ranges symbol= can't answer (months ahead)", async () => {
    await get("2027-06-07", "2027-06-11");
    expect(symCalls).toEqual([]);
    expect(rangeCalls).toBe(1);
  });
});
