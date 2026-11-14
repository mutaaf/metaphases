import { describe, expect, it } from "vitest";
import { dateMark, nasdaqLabel } from "../../src/lib/dateMark";

// 0070: Compass marks a row's date the way the calendar's day rows do. Today is Fri Nov 13, 2026.
const T = "2026-11-13";
const row = (s: string, d: string, h: "" | "bmo" | "amc" | "dmh", extra: Record<string, unknown> = {}) =>
  ({ s, d, h, q: 3, y: 2026, eE: 1, eA: null, rE: null, rA: null, t: 1, ...extra }) as any;

describe("dateMark", () => {
  it("a feed date with no session is projected (ANF Mon Nov 23, before 0069)", () => {
    expect(dateMark(row("ANF", "2026-11-23", ""), T)).toEqual({ kind: "projected" });
  });
  it("a dated session inside three weeks is not marked", () => {
    expect(dateMark(row("AMAT", "2026-11-19", "amc"), T)).toBeNull();
  });
  it("a company-announced override is never marked, with or without a session", () => {
    expect(dateMark(row("MRVL", "2026-12-01", "amc", { o: "https://example.com/8k" }), T)).toBeNull();
    expect(dateMark(row("QXO", "2026-11-17", "", { o: "https://example.com/8k" }), T)).toBeNull();
  });
  it("a Nasdaq disagreement names Nasdaq's day, and wins over projected (DKS Nov 23 vs Nov 24)", () => {
    expect(dateMark(row("DKS", "2026-11-23", "", { x: "differs", xd: "2026-11-24", xh: "bmo" }), T))
      .toEqual({ kind: "differs", label: "Nasdaq: Tue, Nov 24, before open" });
  });
  it("same day, other session: shows both sessions", () => {
    expect(nasdaqLabel({ d: "2026-11-12", xd: "2026-11-12", xh: "bmo", fh: "amc" })).toBe("Feed: after close · Nasdaq: before open");
    expect(nasdaqLabel({ d: "2026-11-12", xd: "2026-11-12" })).toBe("Nasdaq: another time");
  });
  it("a holiday row is closed, ahead of everything else", () => {
    expect(dateMark(row("VEEV", "2026-11-26", "amc", { c: "Thanksgiving", x: "differs", xd: "2026-11-30" }), T)).toEqual({ kind: "closed" });
  });
  it("a row with results in is not projected", () => {
    expect(dateMark(row("ZZRP", "2026-11-23", "", { eA: 1.2 }), T)).toBeNull();
  });
});
