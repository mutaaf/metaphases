// 0023: a new visitor starts with nothing starred; the sample loads only from an explicit tap.
import { describe, expect, it } from "vitest";
import { actions, DEFAULT, getState, loadState, SAMPLE_WATCH } from "../../src/lib/store";
import { pickStories } from "../../src/lib/stories";

describe("no invented watchlist (0023)", () => {
  it("the store's default watchlist is empty", () => {
    expect(DEFAULT.watch).toEqual([]);
  });

  it("the sample loads only by the explicit action, keeping what she starred", () => {
    expect(getState().watch).toEqual([]);
    actions.toggleWatch("TSLA");
    actions.loadSampleWatch();
    actions.loadSampleWatch(); // twice adds nothing twice
    expect(getState().watch.map((w) => w.s)).toEqual(["TSLA", ...SAMPLE_WATCH]);
  });

  it("Today offers an add-your-companies card, never a watchlist claim, when she has nothing", () => {
    const ev = (s: string) => ({ s, d: "2026-11-02", h: "amc", q: 3, y: 2026, eE: 1, eA: null, rE: null, rA: null, t: 1 }) as never;
    const base = { events: [ev("AAPL"), ev("NVDA")], macro: { mood: { score: 50, label: "Neutral" } } as never, today: "2026-10-31", horizon: "2026-11-09", mcap: () => 1, heldVia: () => [] };
    const empty = pickStories({ ...base, watch: [], holdings: [] });
    expect(empty.map((x) => x.kind).slice(0, 2)).toEqual(["mood", "start"]);
    expect(empty.some((x) => x.kind === "report" && x.why === "watch")).toBe(false);
    const mine = pickStories({ ...base, watch: [{ s: "AAPL", added: "" }], holdings: [] });
    expect(mine.some((x) => x.kind === "start")).toBe(false);
    expect(mine.find((x) => x.kind === "report")).toMatchObject({ why: "watch", e: { s: "AAPL" } });
  });

  it("a returning browser that only saved the old seed loses it; anything she touched is kept", () => {
    const seed = [{ s: "AAPL", added: "2026-10-31" }, { s: "NVDA", added: "2026-10-31" }, { s: "DIS", added: "2026-10-31" }];
    const saved = (watch: unknown) => JSON.stringify({ watch, holdings: [], prefs: { lens: "everyday", theme: "dark" } });
    const legacy = loadState(saved(seed));
    expect(legacy.watch).toEqual([]);
    expect(legacy.prefs.theme).toBe("dark"); // her prefs survive
    expect(loadState(saved([...seed, { s: "TSLA", added: "2026-11-02" }])).watch).toHaveLength(4);
    expect(loadState(saved([seed[0], { ...seed[1], buy: 150 }, seed[2]])).watch).toHaveLength(3);
    expect(loadState(saved([seed[0], seed[2]])).watch).toHaveLength(2);
    expect(loadState(saved([{ s: "AAPL", added: "2026-11-05" }, seed[1], seed[2]])).watch).toHaveLength(3);
    expect(loadState(null).watch).toEqual([]);
    // After 0023 the same three on the same day are her own choice (e.g. the sample tapped): kept.
    expect(loadState(JSON.stringify({ watch: seed, wv: 2 })).watch).toHaveLength(3);
  });
});
