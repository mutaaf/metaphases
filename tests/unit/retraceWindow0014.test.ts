import { describe, expect, it } from "vitest";
import { retraceRange, retraceView, RETRACE_MIN_MONTH } from "../../src/lib/retrace";

const ev = (d: string, n = 1) => Array.from({ length: n }, () => ({ d, eA: 1, t: 1 }));

describe("0014 Retrace window", () => {
  it("the current month fetches the trailing 30 days too when they start earlier", () => {
    const r = retraceRange("2026-11-01", 0);
    expect(r).toMatchObject({ from: "2026-11-01", to: "2026-11-01", fetchFrom: "2026-10-03", fetchTo: "2026-11-01" });
  });
  it("past months fetch only themselves", () => {
    expect(retraceRange("2026-11-01", 1)).toMatchObject({ from: "2026-10-01", to: "2026-10-31", fetchFrom: "2026-10-01", fetchTo: "2026-10-31" });
  });
  it("a young month shows the last 30 days", () => {
    const v = retraceView([...ev("2026-10-01", 5), ...ev("2026-10-20", 40), ...ev("2026-11-02", 3)], "2026-11-03", 0);
    expect(v.mode).toBe("trailing");
    expect(v.from).toBe("2026-10-05");
    expect(v.to).toBe("2026-11-03");
    expect(v.events).toHaveLength(43); // Oct 1 is outside the window
    expect(v.monthCount).toBe(3);
  });
  it("24 graded in the month still falls back", () => {
    const v = retraceView([...ev("2026-10-20", 40), ...ev("2026-11-05", RETRACE_MIN_MONTH - 1)], "2026-11-10", 0);
    expect(v).toMatchObject({ mode: "trailing", from: "2026-10-12", to: "2026-11-10", monthCount: RETRACE_MIN_MONTH - 1 });
    expect(v.events).toHaveLength(40 + RETRACE_MIN_MONTH - 1);
  });
  it("the window is 30 days, today included", () => {
    const v = retraceView([...ev("2026-10-02", 5), ...ev("2026-10-03", 2)], "2026-11-01", 0);
    expect(v.from).toBe("2026-10-03");
    expect(v.events).toHaveLength(2);
  });
  it("a month with 25 graded reports shows unchanged", () => {
    const v = retraceView([...ev("2026-10-20", 40), ...ev("2026-11-05", RETRACE_MIN_MONTH)], "2026-11-10", 0);
    expect(v).toMatchObject({ mode: "month", from: "2026-11-01", to: "2026-11-10", monthCount: RETRACE_MIN_MONTH });
    expect(v.events).toHaveLength(RETRACE_MIN_MONTH);
  });
  it("past months never fall back", () => {
    const v = retraceView([...ev("2026-09-20", 40), ...ev("2026-10-05", 2)], "2026-11-01", 1);
    expect(v).toMatchObject({ mode: "month", from: "2026-10-01", to: "2026-10-31", monthCount: 2 });
  });
  it("ungraded rows (no actual, or untracked) don't count", () => {
    const v = retraceView([{ d: "2026-10-20", eA: null, t: 1 }, { d: "2026-10-20", eA: 1, t: 0 }], "2026-11-01", 0);
    expect(v.events).toHaveLength(0);
    expect(v.mode).toBe("month");
  });
  it("an empty trailing window keeps the month view", () => {
    expect(retraceView([], "2026-11-01", 0).mode).toBe("month");
  });
});
