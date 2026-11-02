import { describe, expect, it } from "vitest";
import { nyDate } from "../../shared/depth";

// Guard for Cloudflare 1102: nyDate must stay arithmetic (no Intl per candle) yet agree with New York dates.
describe("nyDate (Yahoo daily bars)", () => {
  const intl = (t: number) => new Date(t * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  // 9:30 ET opens across DST and standard time, plus a late-day stamp.
  const stamps = [Date.UTC(2026, 6, 15, 13, 30) / 1000, Date.UTC(2026, 10, 2, 14, 30) / 1000, Date.UTC(2026, 2, 9, 13, 30) / 1000, Date.UTC(2025, 11, 31, 20, 0) / 1000];
  it.each(stamps)("matches the Intl NY date for %d", (t) => expect(nyDate(t)).toBe(intl(t)));
  it("is fast: 50k conversions well under 200ms", () => {
    const t0 = performance.now();
    for (let i = 0; i < 50_000; i++) nyDate(1793390400 + i * 86400);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
