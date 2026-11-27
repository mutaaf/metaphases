// 0073: a stored market cap follows the price between data refreshes. NVDA read "$4.93T" beside $162.85 because
// universe.json's cap was taken at about $203 two weeks earlier and nothing scaled it.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { capNow, profileCap } from "../../shared/marketCap";
import universe from "../../data/universe.json" with { type: "json" };

const day = (d: string) => Date.parse(`${d}T14:30:00Z`) / 1000;
const chart = (pts: [string, number][]) => ({ t: pts.map(([d]) => day(d)), c: pts.map(([, c]) => c) });

describe("capNow", () => {
  it("scales the ticket's vector: $4.93T at $203.00, last close $162.85 → about $3.956T", () => {
    const r = capNow({ mc: 4931824, px: 203, mcAt: "2026-10-30" }, chart([["2026-11-13", 162.85]]));
    expect(r.marketCap! / 3956000).toBeCloseTo(1, 2);
    expect(r.capAt).toBe("2026-11-13");
  });

  it("prefers the chart's own close on the cap's day (split-adjusted) over the stored px", () => {
    // A 4-for-1 split since the stamp: Yahoo's history is adjusted, so the chart's Oct 30 close is 50, not 200.
    const r = capNow({ mc: 1000000, px: 200, mcAt: "2026-10-30" }, chart([["2026-10-29", 49], ["2026-10-30", 50], ["2026-11-02", 55]]));
    expect(r.marketCap).toBe(1100000);
    expect(r.capAt).toBe("2026-11-02");
  });

  it("takes the last close on or before the cap's day when that day has no bar (a holiday)", () => {
    const r = capNow({ mc: 1000, mcAt: "2026-11-26" }, chart([["2026-11-25", 100], ["2026-11-27", 110]]));
    expect(r.marketCap).toBe(1100);
  });

  it("keeps the stored cap, dated, when there's no price history", () => {
    expect(capNow({ mc: 4931824, px: 203, mcAt: "2026-10-30" }, null)).toEqual({ marketCap: 4931824, capAt: "2026-10-30" });
    expect(capNow({ mc: 4931824 }, null)).toEqual({ marketCap: 4931824 });
  });

  it("keeps the stored cap when the chart ends on or before the cap's day", () => {
    expect(capNow({ mc: 500, px: 10, mcAt: "2026-11-25" }, chart([["2026-11-25", 12]]))).toEqual({ marketCap: 500, capAt: "2026-11-25" });
  });

  it("refuses an implausible move (an unadjusted split, a bad print) and shows the stored cap with its date", () => {
    // No chart bar on the stamp day, and the stored px is 10x the last close.
    expect(capNow({ mc: 900, px: 500, mcAt: "2026-10-30" }, chart([["2026-11-20", 50]]))).toEqual({ marketCap: 900, capAt: "2026-10-30" });
  });

  it("an unknown cap (mc 0) stays unknown", () => {
    expect(capNow({ mc: 0, px: 10, mcAt: "2026-10-30" }, chart([["2026-11-20", 50]]))).toEqual({ marketCap: null });
  });
});

describe("profileCap with a chart", () => {
  it("a tracked company's sheet cap is the universe figure scaled to the last close, in dollars", () => {
    const r = profileCap({ mc: 4931824, px: 203, mcAt: "2026-10-30" }, { marketCapitalization: 1, currency: "USD" }, chart([["2026-10-30", 203], ["2026-11-16", 156.4]]));
    expect(r.currency).toBe("USD");
    expect(r.marketCap! / 3799700).toBeCloseTo(1, 2);
    expect(r.capAt).toBe("2026-11-16");
  });

  it("an untracked company keeps Finnhub's current cap, undated", () => {
    expect(profileCap(undefined, { marketCapitalization: 6185.88, currency: "CNY", exchange: "NEW YORK STOCK EXCHANGE, INC." }, chart([["2026-11-20", 1]])))
      .toEqual({ marketCap: 6185.88, currency: "USD" });
  });
});

describe("universe.json carries the close each cap was taken at", () => {
  const U = universe as unknown as Record<string, { mc: number; px?: number; mcAt?: string }>;
  it("every entry has mcAt; nearly every one has px", () => {
    const all = Object.values(U);
    expect(all.filter((c) => !/^\d{4}-\d{2}-\d{2}$/.test(c.mcAt ?? ""))).toEqual([]);
    expect(all.filter((c) => c.px! > 0).length).toBeGreaterThan(all.length * 0.95);
  });

  it("the build stamps every refetched entry (scripts/build_universe.py calls universe_px.stamp)", () => {
    const src = readFileSync(new URL("../../scripts/build_universe.py", import.meta.url), "utf8");
    expect(src).toMatch(/from universe_px import stamp/);
    expect(src).toMatch(/\nstamp\(/);
  });
});

describe("the client bundle stays slim (main JS ≤ 120 kB gzip)", () => {
  it("vite's slimUniverse drops the worker-only fields from data/universe.json and nothing else", async () => {
    const { slimUniverse, WORKER_ONLY_UNIVERSE_FIELDS } = await import("../../vite.config");
    const raw = readFileSync(new URL("../../data/universe.json", import.meta.url), "utf8");
    const t = slimUniverse().transform as (code: string, id: string) => { code: string } | null;
    const out = JSON.parse(t(raw, "/repo/data/universe.json")!.code) as Record<string, Record<string, unknown>>;
    const full = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    expect(Object.keys(out)).toEqual(Object.keys(full));
    for (const k of WORKER_ONLY_UNIVERSE_FIELDS) expect(Object.values(out).some((c) => k in c)).toBe(false);
    expect(out.NVDA).toEqual({ n: full.NVDA.n, logo: full.NVDA.logo, mc: full.NVDA.mc, ind: full.NVDA.ind, sec: full.NVDA.sec, c: full.NVDA.c, web: full.NVDA.web, sp: full.NVDA.sp });
    expect(t("{}", "/repo/data/etf_holdings.json")).toBeNull();
  });
});

describe("the weekly refresh survives Yahoo blocking the runner (scripts/universe_px.py stamp)", () => {
  const run = (answers: string) => JSON.parse(execFileSync("python3", ["-I", "-B", "-c", `
import sys, json, datetime, io, contextlib
sys.path.insert(0, ${JSON.stringify(fileURLToPath(new URL("../../scripts/", import.meta.url)))})
import universe_px as px
calls = []
answers = ${answers}
def fake(sym, start, end, tries=3):
    calls.append(sym)
    return answers(sym)
px.closes = fake
px.time.sleep = lambda s: None
u = {f"S{i}": {"mc": 100} for i in range(40)}
with contextlib.redirect_stdout(io.StringIO()):
    px.stamp(u, today=datetime.date(2026, 11, 29))
print(json.dumps({"calls": len(calls), "u": u}))
`], { encoding: "utf8" }));

  it("gives up after 10 empty answers in a row and stamps the rest with the cap's day only", () => {
    const r = run("lambda s: []");
    expect(r.calls).toBe(10);
    for (const c of Object.values(r.u) as { mcAt: string; px?: number }[]) expect(c).toEqual({ mc: 100, mcAt: "2026-11-27" });
  });

  it("a few misses don't trip it; answered symbols get the close before the run", () => {
    const r = run(`lambda s: [] if s in ("S3", "S4") else [("2026-11-25", 10.0), ("2026-11-27", 11.5)]`);
    expect(r.calls).toBe(40);
    expect(r.u.S0).toEqual({ mc: 100, mcAt: "2026-11-27", px: 11.5 });
    expect(r.u.S3).toEqual({ mc: 100, mcAt: "2026-11-27" });
  });
});
