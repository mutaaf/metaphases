import { describe, expect, it } from "vitest";
import { FILL_EVERY_MS, fillPath, shouldAskFill } from "../../src/lib/partial";

// 0114 bounce 3: the browser asks for the Nasdaq fill in a request of its own, at most once a minute per tab.
describe("shouldAskFill", () => {
  it("asks only for an answer marked `fill`, at most once a minute", () => {
    const t = 1_000_000_000;
    expect(shouldAskFill({}, t, -Infinity)).toBe(false);
    expect(shouldAskFill(null, t, -Infinity)).toBe(false);
    expect(shouldAskFill({ fill: 1 }, t, -Infinity)).toBe(true);
    expect(shouldAskFill({ fill: 1 }, t + 30_000, t)).toBe(false);
    expect(shouldAskFill({ fill: 1 }, t + FILL_EVERY_MS, t)).toBe(true);
  });
  it("stays under the base path", () => {
    expect(fillPath("/metaphases", "2026-11-30", "2026-12-04")).toBe("/metaphases/api/xcheck/fill?from=2026-11-30&to=2026-12-04");
  });
});
