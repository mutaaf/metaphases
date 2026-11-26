import { describe, expect, it } from "vitest";
import { dayCount, dayCountLabel } from "../../shared/dayCount";
import { dayShareText } from "../../shared/dayShare";

// 0109: one Tuesday had three counts (drawer "10 reporting", day view 16, the API 19) and DKS, BURL and VIPS
// couldn't be reached. One helper counts a day for every surface; rows the filter hides are listed, not lost.
const row = (s: string, t: 0 | 1, extra: Record<string, unknown> = {}) => ({ s, d: "2026-11-24", h: "bmo", eA: null, rA: null, t, ...extra }) as any;
const ALL = [row("BBY", 1), row("ADI", 1), row("DKS", 0), row("BURL", 0), row("VIPS", 0), row("NIO", 1, { od: true })];
const shown = ALL.filter((e) => e.t);

describe("dayCount", () => {
  it("counts the filter's dated rows and every dated row, and lists the hidden ones", () => {
    const c = dayCount(shown, ALL, "2026-11-24");
    expect(c.shown).toBe(2);
    expect(c.total).toBe(5); // NIO never happened (od): not counted anywhere
    expect(c.more.map((e) => e.s)).toEqual(["DKS", "BURL", "VIPS"]);
  });
  it("Everything shows every row, so nothing is 'more'", () => {
    const c = dayCount(ALL, ALL, "2026-11-24");
    expect(c).toMatchObject({ shown: 5, total: 5 });
    expect(c.more).toEqual([]);
  });
  it("labels: one figure when they agree, both when the filter hides rows", () => {
    expect(dayCountLabel(5, 5)).toBe("5 reporting");
    expect(dayCountLabel(10, 19)).toBe("10 popular · 19 in all");
    expect(dayCountLabel(2, 19, "S&P 500")).toBe("2 S&P 500 · 19 in all");
  });
  it("the unfurl names every dated row and gives the same total", () => {
    const c = dayCount(shown, ALL, "2026-11-24");
    const syms = [...shown, ...c.more].map((e) => e.s).filter((s) => s !== "NIO");
    const t = dayShareText("Tuesday, November 24", null, syms, []);
    expect(t.title).toBe(`${c.total} earnings on Tuesday, November 24 · Metaphases`);
    expect(t.desc).toContain(`(${c.total} in all)`);
  });
});
