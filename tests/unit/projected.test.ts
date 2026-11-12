import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIRM_HORIZON_DAYS, eventProjected, isProjected } from "../../shared/projected";
import { buildIcs } from "../../shared/depth";
import { tickerShareTitle } from "../../shared/pending";
import { tickerShareDesc } from "../../shared/reported";
import worker from "../../worker/index";

// 0007: a report date the company hasn't confirmed is the feed's projection. Blank session, or more than 21 days
// ahead (GOOGL "Tue, Feb 2 · after close" in 93 days, critique 2026-11-01-0506 #3). A company override never is.

describe("isProjected", () => {
  const today = "2026-11-01";
  it("a blank session is projected; a session within the horizon is not", () => {
    expect(isProjected({ date: "2026-11-02", session: "" }, today)).toBe(true);
    expect(isProjected({ date: "2026-11-02", session: "amc" }, today)).toBe(false);
  });
  it(`more than ${CONFIRM_HORIZON_DAYS} days ahead is projected even with a session (GOOGL Feb 2 amc)`, () => {
    expect(CONFIRM_HORIZON_DAYS).toBe(21);
    expect(isProjected({ date: "2027-02-02", session: "amc" }, today)).toBe(true);
    expect(isProjected({ date: "2026-11-22", session: "bmo" }, today)).toBe(false); // 21 days: inside
    expect(isProjected({ date: "2026-11-23", session: "bmo" }, today)).toBe(true); // 22 days
  });
  it("the company's own date (override source) is never projected, session or not (QXO)", () => {
    expect(isProjected({ date: "2026-11-12", session: "", source: "https://www.sec.gov/x" }, today)).toBe(false);
    expect(isProjected({ date: "2027-02-02", session: "amc", source: "https://x" }, today)).toBe(false);
  });
  it("today or a passed day is left to the report-day states", () => {
    expect(isProjected({ date: today, session: "" }, today)).toBe(false);
    expect(isProjected({ date: "2026-10-30", session: "" }, today)).toBe(false);
  });
  it("calendar rows: empty h is projected, amc is not, an override is not", () => {
    const ev = { s: "AXON", d: "2026-11-02", h: "" as const };
    expect(eventProjected(ev, today)).toBe(true);
    expect(eventProjected({ ...ev, h: "amc" }, today)).toBe(false);
    expect(eventProjected({ ...ev, d: "2026-11-05", h: "amc", o: "https://investor.axon.com/x" }, today)).toBe(false);
  });
});

describe("share meta and .ics for a projected date", () => {
  const next = { date: "2027-02-02", session: "amc", quarter: 4, year: 2026, epsE: 2.6, revE: null, projected: true as const };
  it("the og:title says 'expected around', with no session", () => {
    expect(tickerShareTitle("GOOGL", "Alphabet", next)).toBe("GOOGL earnings expected around Tue, Feb 2 (not yet confirmed) · Metaphases");
    const { projected: _p, ...firm } = next;
    expect(tickerShareTitle("GOOGL", "Alphabet", firm)).toBe("GOOGL reports Tue, Feb 2 after the close · Metaphases");
  });
  it("the description says the date isn't confirmed", () => {
    const d = { next, justReported: undefined, beatRate: null, expectedMove: null, setup: { grade: null }, compass: { grade: null } } as any;
    expect(tickerShareDesc("Alphabet", d)).toMatch(/^Alphabet — report expected around Tue, Feb 2, date not yet confirmed by the company; Street expects \$2\.60 EPS\./);
  });
  it("a Nasdaq disagreement or a report that's out wins over 'projected'", () => {
    const contested = { ...next, date: "2026-11-02", session: "", nasdaq: { date: "2026-11-05", session: "amc" } };
    expect(tickerShareTitle("AXON", "Axon", contested)).toBe("AXON reports Mon, Nov 2 (unconfirmed; Nasdaq lists Thu, Nov 5) · Metaphases");
    const d = { next: contested, justReported: undefined, beatRate: null, expectedMove: null, setup: { grade: null }, compass: { grade: null } } as any;
    expect(tickerShareDesc("Axon", d)).toMatch(/^Axon — report date unconfirmed \(the feed says Mon, Nov 2; Nasdaq lists Thu, Nov 5\)/);
    const just = { quarter: 3, epsE: 1, epsA: 1.2 };
    expect(tickerShareTitle("GOOGL", "Alphabet", next, just)).toMatch(/^GOOGL reported Q3/);
    expect(tickerShareDesc("Alphabet", { ...d, next, justReported: { ...just, date: "2026-10-29", session: "amc", year: 2026 } })).toMatch(/^Alphabet — Reported Q3/);
  });
  it("a closed-day (0045) .ics item is tentative too, and says it's a projection", () => {
    const out = buildIcs([{ symbol: "MRVL", name: "Marvell", date: "2026-11-26", session: "", quarter: 3, year: 2027, epsE: 1.11, url: "https://x/t/MRVL", closed: "Thanksgiving" }], new Date("2026-11-05T00:00:00Z"));
    expect(out).toContain("STATUS:TENTATIVE");
    expect(out.replace(/\r\n /g, "")).toContain("the data feed's projection");
  });
  it(".ics marks it STATUS:TENTATIVE and says so; a confirmed one isn't", () => {
    const base = { symbol: "GOOGL", name: "Alphabet", date: "2027-02-02", session: "amc" as const, quarter: 4, year: 2026, epsE: 2.6, url: "https://x/t/GOOGL" };
    const tent = buildIcs([{ ...base, projected: true }], new Date("2026-11-01T00:00:00Z"));
    expect(tent).toContain("STATUS:TENTATIVE");
    expect(tent).toContain("SUMMARY:GOOGL earnings · date not confirmed");
    expect(tent.replace(/\r\n /g, "")).toContain("Date not yet confirmed by the company");
    const firm = buildIcs([base], new Date("2026-11-01T00:00:00Z"));
    expect(firm).not.toContain("TENTATIVE");
    expect(firm).toContain("SUMMARY:GOOGL earnings · after the close");
  });
});

// Through the worker: made-up symbols, so no live entry in data/date-overrides.json can win (LESSONS 2026-11-06).
class MemCache {
  store = new Map<string, string>();
  async match(req: Request) { const v = this.store.get(req.url); return v === undefined ? undefined : new Response(v); }
  async put(req: Request, res: Response) { this.store.set(req.url, await res.text()); }
}
const env = { FINNHUB_API_KEY: "k", FRED_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } } as any;
let waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as any;
const fhRow = (symbol: string, date: string, hour = "") => ({ symbol, date, hour, quarter: 4, year: 2026, epsEstimate: 1, epsActual: null, revenueEstimate: 5e9, revenueActual: null });
const FH_ROWS = [fhRow("QQPF", "2027-02-02", "amc"), fhRow("QQPN", "2026-11-10", "amc"), fhRow("QQPB", "2026-11-12")];

describe("0007 through the worker", () => {
  beforeEach(() => {
    waits = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T15:00:00Z"));
    (globalThis as any).caches = { default: new MemCache() };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const url = new URL(u);
      if (url.hostname === "api.nasdaq.com" && url.pathname === "/api/calendar/earnings") return new Response(JSON.stringify({ data: { rows: [] } }));
      if (url.hostname === "api.nasdaq.com") return new Response(JSON.stringify({ data: { earningsSurpriseTable: { rows: [] } } }));
      if (url.pathname.endsWith("/calendar/earnings")) {
        const sym = url.searchParams.get("symbol")!.split(",");
        return new Response(JSON.stringify({ earningsCalendar: FH_ROWS.filter((r) => sym.includes(r.symbol)) }));
      }
      return new Response("{}", { status: 200 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const get = async (path: string) => {
    const r = await worker.fetch(new Request(`https://mutaafaziz.com/metaphases${path}`), env, ctx);
    await Promise.all(waits); waits = [];
    return r;
  };

  it("a far-out amc date: next.projected, and the Read says 'expected around' without a session", async () => {
    const t = await (await get("/api/ticker/QQPF")).json() as any;
    expect(t.next).toMatchObject({ date: "2027-02-02", session: "amc", projected: true });
    const line = t.read.join(" ");
    expect(line).toMatch(/Q4 report is expected around Tuesday, Feb 2, but the company hasn't confirmed the date yet\./);
    expect(line).not.toMatch(/after the (close|closing bell)/i);
  }, 20_000);

  it("the share card headline says 'Around … · unconfirmed' and draws no session", async () => {
    const svg = await (await get("/og/t/QQPF.svg")).text();
    expect(svg).toContain("Around Tue, Feb 2 · unconfirmed");
    expect(svg).not.toMatch(/Reports Tue, Feb 2/);
  }, 20_000);

  it("a closed-market projection stays 'closed', not 'projected'", async () => {
    FH_ROWS.push(fhRow("QQPH", "2026-11-26"));
    try {
      const t = await (await get("/api/ticker/QQPH")).json() as any;
      expect(t.next).toMatchObject({ date: "2026-11-26", closed: "Thanksgiving" });
      expect(t.next.projected).toBeUndefined();
    } finally { FH_ROWS.pop(); }
  }, 20_000);

  it("a near amc date is not projected; a near blank-session date is", async () => {
    expect((await (await get("/api/ticker/QQPN")).json() as any).next.projected).toBeUndefined();
    expect((await (await get("/api/ticker/QQPB")).json() as any).next).toMatchObject({ date: "2026-11-12", session: "", projected: true });
  }, 20_000);

  it("/api/ics marks only the projected ones TENTATIVE", async () => {
    const text = (await (await get("/api/ics?s=QQPF,QQPN,QQPB")).text()).replace(/\r\n /g, "");
    const ev = (sym: string) => text.split("BEGIN:VEVENT").find((b) => b.includes(`UID:${sym}-`)) ?? "";
    expect(ev("QQPF")).toContain("STATUS:TENTATIVE");
    expect(ev("QQPB")).toContain("STATUS:TENTATIVE");
    expect(ev("QQPN")).toContain("UID:QQPN-");
    expect(ev("QQPN")).not.toContain("TENTATIVE");
  }, 20_000);
});
