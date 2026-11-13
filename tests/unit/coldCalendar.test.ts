import { describe, expect, it } from "vitest";
import { CHECK_TRIES, checkingOf, retryDelay } from "../../src/lib/partial";
import { sessionLabel } from "../../src/components/bits";

// 0061: a cold calendar read lists the days on screen whose Nasdaq cross-check hasn't run (`uncheckedDays`).
// The client asks again until they're in, a few times at most, and says so meanwhile.
describe("retryDelay (0026, 0061)", () => {
  const cal = (o: { warnings?: string[]; uncheckedDays?: string[] }) => ({ warnings: [], ...o });

  it("retries a partial failure quickly, twice", () => {
    const d = cal({ warnings: ["Couldn't load 2026-11-16 — showing the rest."] });
    expect(retryDelay(d, 0)).toBe(4000);
    expect(retryDelay(d, 1)).toBe(8000);
    expect(retryDelay(d, 2)).toBeNull();
  });

  it("on the calendar page, asks again while days on screen are still being cross-checked, then stops", () => {
    const d = cal({ uncheckedDays: ["2026-11-19"] });
    for (let a = 0; a < CHECK_TRIES; a++) expect(retryDelay(d, a, true)).toBeGreaterThanOrEqual(20_000);
    expect(retryDelay(d, CHECK_TRIES, true)).toBeNull();
    // Bounded: a few minutes of quiet re-reads, never a loop (0024: a slow upstream must not become more calls).
    expect(CHECK_TRIES).toBeLessThanOrEqual(8);
  });

  it("never re-reads for surfaces that don't show the checking state (scoreboard, Compass, peers, AI)", () => {
    expect(retryDelay(cal({ uncheckedDays: ["2026-11-19"] }), 0)).toBeNull();
  });

  it("stops once every day is checked, and never retries a clean answer or a ticker", () => {
    expect(retryDelay(cal({}), 0, true)).toBeNull();
    expect(retryDelay(cal({ uncheckedDays: [] }), 0, true)).toBeNull();
    expect(retryDelay({ next: null } as never, 0)).toBeNull();
    expect(retryDelay(null, 0)).toBeNull();
  });
});

describe("sessionLabel (0061)", () => {
  it("a blank session on a day still being checked says so, never a plain Time TBD", () => {
    expect(sessionLabel("", true)).toBe("Checking time…");
    expect(sessionLabel("", false)).toBe("Time TBD");
    expect(sessionLabel("bmo", true)).toBe("Before open");
  });
});

describe("checkingOf (0061)", () => {
  it("never counts a market holiday or a weekend as a day still being compared", () => {
    expect(checkingOf(["2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"])).toEqual(["2026-11-25", "2026-11-27"]);
    expect(checkingOf(undefined)).toEqual([]);
  });
});
