import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { projectedSession } from "../../shared/reaction";
import { sessionText } from "../../src/lib/sessionText";

// 0086: the feed's first projection after a print often defaults to "after close" (TGT and TJX on 2026-11-18:
// next `2027-03-03 amc`, projected, while every report on record was before the open). A projected session that
// the company's last dated report contradicts, and the stock's own past moves don't back, is never shown. It also
// never decides the day past moves are measured on. Made-up symbols (LESSONS 2026-11-06).

const REPORTS = ["2026-08-20", "2026-05-21", "2026-02-19", "2025-11-20"]; // Thursdays, newest first
const LAST = "2026-11-18"; // the report the calendar still holds (Wednesday)
const NEXT = "2027-03-03"; // the feed's projection, months out

/** Weekday closes, flat at 100 except around each report: `day[i]` is the report day's move, `next[i]` the day after's (%). */
function closes(day: number[], next: number[]) {
  const timestamp: number[] = [], close: number[] = [];
  let px = 100, bump: number | null = null;
  for (let t = Date.parse("2025-09-01T20:00:00Z"); t <= Date.parse("2026-11-19T21:00:00Z"); t += 86400000) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const iso = d.toISOString().slice(0, 10);
    const i = REPORTS.indexOf(iso);
    if (bump != null) { px *= 1 + bump / 100; bump = null; }
    if (i >= 0) { px *= 1 + day[i] / 100; bump = next[i]; }
    timestamp.push(t / 1000); close.push(px);
  }
  return { timestamp, close };
}
const closeOnFor = ({ timestamp, close }: { timestamp: number[]; close: number[] }) => {
  const days = timestamp.map((t) => new Date(t * 1000).toISOString().slice(0, 10));
  return (d: string, off: number) => { const i = days.indexOf(d); return i < 0 ? null : close[i + off] ?? null; };
};
// Moves land on the report day (a before-the-open reporter) / the day after (an after-the-close reporter).
const BMO_DAY = [-0.9, -3.9, 2.6, 5.3], BMO_NEXT = [-0.8, -3.5, -0.3, 2.3];
const AMC_DAY = [0.8, 2.3, 0, -2.7], AMC_NEXT = [1.7, 7.5, 3.1, 3.4];

describe("projectedSession", () => {
  it("projected amc against a bmo last report, the moves on the report day: the habit, bmo", () => {
    expect(projectedSession("amc", "bmo", REPORTS, closeOnFor(closes(BMO_DAY, BMO_NEXT)))).toBe("bmo");
  });
  it("projected amc against a bmo last report, the moves don't settle it: no session, never the feed's", () => {
    expect(projectedSession("amc", "bmo", REPORTS, closeOnFor(closes([5, 5, 1, 1], [1, 1, 5, 5])))).toBe("");
    expect(projectedSession("amc", "bmo", [], () => null)).toBe("");
  });
  it("the moves back the feed's session: the feed's stands (null = unchanged)", () => {
    expect(projectedSession("amc", "bmo", REPORTS, closeOnFor(closes(AMC_DAY, AMC_NEXT)))).toBeNull();
  });
  it("no contradiction: same session, a blank or during-hours session, or no last report", () => {
    const c = closeOnFor(closes(BMO_DAY, BMO_NEXT));
    expect(projectedSession("amc", "amc", REPORTS, c)).toBeNull();
    expect(projectedSession("", "bmo", REPORTS, c)).toBeNull();
    expect(projectedSession("amc", "", REPORTS, c)).toBeNull();
    expect(projectedSession("amc", undefined, REPORTS, c)).toBeNull();
    expect(projectedSession("dmh", "bmo", REPORTS, c)).toBeNull();
  });
  it("the sheet labels the habit as the usual time, not the company's word", () => {
    expect(sessionText("bmo", "h")).toBe("Before open (usual time)");
    expect(sessionText("bmo", "n")).toBe("Before open (expected)");
    expect(sessionText("bmo")).toBe("Before open");
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
const SYM = "ZZPH";
let cache: MemCache;
const CAL = (k: string) => `https://cache.metaphases.internal/${encodeURIComponent(k)}`;
const nqRows = REPORTS.map((d) => { const [y, m, dd] = d.split("-"); return { fiscalQtrEnd: "Jul 2026", dateReported: `${+m}/${+dd}/${y}`, eps: 1.0, consensusForecast: "0.95", percentageSurprise: "5.26" }; });

function stub(rows: { date: string; hour: string; source?: string }[], chart: { timestamp: number[]; close: number[] }) {
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") return new Response(JSON.stringify({ data: { rows: [] } }));
    if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: nqRows } } }));
    if (url.hostname.endsWith("finance.yahoo.com")) return new Response(JSON.stringify({ chart: { result: [{ timestamp: chart.timestamp, indicators: { quote: [{ open: chart.close, high: chart.close, low: chart.close, close: chart.close }] } }] } }));
    if (url.pathname.endsWith("/calendar/earnings")) return new Response(JSON.stringify({ earningsCalendar: rows.map((r) => r.date === LAST
      ? { symbol: SYM, date: r.date, hour: r.hour, quarter: 3, year: 2026, epsEstimate: 2.05, epsActual: 2.65, revenueEstimate: 25e9, revenueActual: 25.2e9 }
      : { symbol: SYM, date: r.date, hour: r.hour, quarter: 4, year: 2026, epsEstimate: 2.71, epsActual: null, revenueEstimate: 32e9, revenueActual: null }) }));
    return new Response("{}", { status: 404 });
  }));
}
beforeEach(() => {
  waits = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-19T16:00:00Z"));
  cache = new MemCache();
  (globalThis as any).caches = { default: cache };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const sheet = async () => {
  const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases/api/ticker/${SYM}`), env, ctx);
  await Promise.all(waits); waits = [];
  return r.json() as Promise<any>;
};

describe("/api/ticker: a projected next report after a print (TGT/TJX, 0086)", () => {
  it("projected amc, last report bmo, moves on the report day: next shows bmo as the usual time, and every past move is the report day's", async () => {
    stub([{ date: LAST, hour: "bmo" }, { date: NEXT, hour: "amc" }], closes(BMO_DAY, BMO_NEXT));
    const r = await sheet();
    expect(r.next).toMatchObject({ date: NEXT, session: "bmo", hs: "h", projected: true });
    const past = r.history.filter((h: any) => REPORTS.includes(h.date));
    expect(past).toHaveLength(4);
    past.forEach((h: any) => { expect(h.session).toBe("bmo"); expect(h.move).toBeCloseTo(BMO_DAY[REPORTS.indexOf(h.date)], 4); });
    expect(JSON.stringify(r.next)).not.toContain("amc");
  });

  it("the moves don't settle it: the projection carries no session, never the feed's amc", async () => {
    stub([{ date: LAST, hour: "bmo" }, { date: NEXT, hour: "amc" }], closes([5, 5, 1, 1], [1, 1, 5, 5]));
    const r = await sheet();
    expect(r.next).toMatchObject({ date: NEXT, session: "", projected: true });
    expect(r.next.hs).toBeUndefined();
    // No past move is measured on a day nothing settled (0060's rule): "—", never the feed's or the last report's guess.
    expect(r.history.filter((h: any) => REPORTS.includes(h.date)).map((h: any) => h.move)).toEqual([null, null, null, null]);
  });

  it("the day after, symbol= has dropped the reported row: the calendar's cached day still says how the company reported", async () => {
    stub([{ date: NEXT, hour: "amc" }], closes(BMO_DAY, BMO_NEXT));
    cache.store.set(CAL(`cal:v3:${LAST}`), JSON.stringify([{ s: SYM, d: LAST, h: "bmo", q: 3, y: 2026, eE: 2.05, eA: 2.65, rE: 25e9, rA: 25.2e9 }]));
    const r = await sheet();
    expect(r.next).toMatchObject({ date: NEXT, session: "bmo", hs: "h", projected: true });
    r.history.filter((h: any) => REPORTS.includes(h.date)).forEach((h: any) => expect(h.session).toBe("bmo"));
  });

  it("no last report anywhere in the cache: nothing contradicts the feed, which stands (no inference from nothing)", async () => {
    stub([{ date: NEXT, hour: "amc" }], closes(BMO_DAY, BMO_NEXT));
    const r = await sheet();
    expect(r.next).toMatchObject({ date: NEXT, session: "amc", projected: true });
    expect(r.next.hs).toBeUndefined();
  });

  it("the feed agrees with the last report: unchanged", async () => {
    stub([{ date: LAST, hour: "amc" }, { date: NEXT, hour: "amc" }], closes(AMC_DAY, AMC_NEXT));
    const r = await sheet();
    expect(r.next).toMatchObject({ date: NEXT, session: "amc", projected: true });
    expect(r.next.hs).toBeUndefined();
    r.history.filter((h: any) => REPORTS.includes(h.date)).forEach((h: any) => expect(h.session).toBe("amc"));
  });

  it("a date within three weeks with a session (not projected) is never altered", async () => {
    stub([{ date: LAST, hour: "bmo" }, { date: "2026-12-03", hour: "amc" }], closes(BMO_DAY, BMO_NEXT));
    const r = await sheet();
    expect(r.next).toMatchObject({ date: "2026-12-03", session: "amc" });
    expect(r.next.projected).toBeUndefined();
    expect(r.next.hs).toBeUndefined();
  });

  it("on the report day itself, the next quarter's projection is checked against the report just out", async () => {
    vi.setSystemTime(new Date("2026-11-18T21:00:00Z"));
    stub([{ date: LAST, hour: "bmo" }, { date: NEXT, hour: "amc" }], closes(BMO_DAY, BMO_NEXT));
    const r = await sheet();
    expect(r.justReported).toMatchObject({ date: LAST, session: "bmo" });
    expect(r.next).toMatchObject({ date: NEXT, session: "bmo", hs: "h", projected: true });
  });
});
