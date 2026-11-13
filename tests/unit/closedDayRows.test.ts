import { describe, expect, it } from "vitest";
import { eventProjected } from "../../shared/projected";
import { splitClosed } from "../../shared/closedRows";
import { buildBrief } from "../../src/lib/brief";

// 0064: a row the feed projects onto a market holiday (`c`, from flagClosed) is never a dated report: it is
// projected even when the feed carries a session (VEEV "amc" on Thanksgiving), and the calendar keeps it out of
// the day's reporting count and session groups.

const row = (s: string, d: string, h: "" | "bmo" | "amc" | "dmh", extra: Record<string, unknown> = {}) =>
  ({ s, d, h, q: 3, y: 2027, eE: 1, eA: null, rE: null, rA: null, t: 1, ...extra }) as any;

describe("eventProjected with c", () => {
  it("a holiday row with a session is projected (VEEV amc on Thanksgiving, 13 days out)", () => {
    expect(eventProjected(row("VEEV", "2026-11-26", "amc"), "2026-11-13")).toBe(false); // without c: a dated session
    expect(eventProjected(row("VEEV", "2026-11-26", "amc", { c: "Thanksgiving" }), "2026-11-13")).toBe(true);
  });
  it("still projected on the holiday itself, when date ≤ today would otherwise clear it", () => {
    expect(eventProjected(row("VEEV", "2026-11-26", "amc", { c: "Thanksgiving" }), "2026-11-26")).toBe(true);
  });
});

describe("splitClosed", () => {
  it("separates holiday rows from dated rows, order kept", () => {
    const a = row("AAA", "2026-11-25", "bmo");
    const v = row("VEEV", "2026-11-26", "amc", { c: "Thanksgiving" });
    const m = row("MRVL", "2026-11-26", "", { c: "Thanksgiving" });
    const { dated, unconfirmed } = splitClosed([a, v, m]);
    expect(dated.map((e) => e.s)).toEqual(["AAA"]);
    expect(unconfirmed.map((e) => e.s)).toEqual(["VEEV", "MRVL"]);
  });
});

describe("week brief", () => {
  it("a top reporter projected onto Thanksgiving carries c, so the brief states no day or session for it", () => {
    const co = (n: string, mc: number) => ({ n, logo: "", mc, ind: "", sec: "", c: "US", web: "", sp: true });
    const wk = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"];
    const b = buildBrief(wk, [row("VEEV", "2026-11-26", "amc", { c: "Thanksgiving" }), row("DE", "2026-11-25", "bmo")], [], null, { VEEV: co("Veeva", 40000), DE: co("Deere", 150000) }, "2026-11-13");
    expect(b.top.find((t) => t.s === "VEEV")?.c).toBe("Thanksgiving");
    expect(b.top.find((t) => t.s === "DE")).not.toHaveProperty("c");
  });
});
