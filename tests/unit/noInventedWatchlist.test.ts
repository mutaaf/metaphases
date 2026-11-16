// 0023: a new visitor starts with nothing starred; the sample loads only from an explicit tap.
import { describe, expect, it } from "vitest";
import { actions, DEFAULT, getState, SAMPLE_WATCH } from "../../src/lib/store";
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
});
