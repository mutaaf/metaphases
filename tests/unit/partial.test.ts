import { describe, expect, it } from "vitest";
import { missingDays, needsRetry } from "../../src/lib/partial";

describe("missingDays (0026)", () => {
  it("collects single days and week ranges inside the window, weekdays only, deduped", () => {
    const w = [
      "Couldn't load 2026-10-27 — showing the rest.",
      "Couldn't load 2026-10-27 — showing the rest.", // the same day reported by two chunks
      "Couldn't load 2026-10-10–2026-10-16 — showing the rest.", // a failed week chunk (Sat–Fri)
      "Couldn't load 2026-08-03 — showing the rest.", // outside the window
      "Some other warning",
    ];
    expect(missingDays(w, "2026-09-19", "2026-10-31")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-27"]);
  });
  it("skips NYSE holidays (Thanksgiving) inside a failed range", () => {
    expect(missingDays(["Couldn't load 2026-11-26 — showing the rest.", "Couldn't load 2026-11-27 — showing the rest."], "2026-11-02", "2026-12-04")).toEqual(["2026-11-27"]);
  });
  it("is empty for a clean window", () => {
    expect(missingDays([], "2026-09-19", "2026-10-31")).toEqual([]);
  });
});

// 0047: a progress note ("still checking N overseas names") is not a failure: no quiet retry, no "busy" notice.
describe("needsRetry", () => {
  it("retries only for real failures, never for a pending count", () => {
    expect(needsRetry({ warnings: [], pending: 40 })).toBe(false);
    expect(needsRetry({ warnings: [] })).toBe(false);
    expect(needsRetry({ warnings: ["Couldn't load 2026-11-05 — showing the rest."], pending: 3 })).toBe(true);
    expect(needsRetry(null)).toBe(false);
  });
});
