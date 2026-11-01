import { describe, expect, it } from "vitest";
import { macroIcs } from "../../src/lib/ics";
import type { MacroEvent } from "../../shared/types";

const ev = (p: Partial<MacroEvent>): MacroEvent => ({ key: "jobs", name: "Jobs report", date: "2026-11-06", kind: "jobs", blurb: "How many jobs the economy added, plus the unemployment rate; it moves rates.", ...p });

describe("macroIcs (RFC 5545)", () => {
  const text = macroIcs([ev({}), ev({ key: "cpi", name: "CPI inflation", date: "2026-12-31", kind: "inflation" })], "https://mutaafaziz.com/metaphases/", new Date("2026-10-31T15:00:00Z"));
  it("wraps events in a VCALENDAR with CRLF line endings", () => {
    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(text.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(text.split("\r\n").every((l) => !l.includes("\n"))).toBe(true);
  });
  it("all-day events with exclusive DTEND, including across a year boundary", () => {
    expect(text).toContain("DTSTART;VALUE=DATE:20261106\r\nDTEND;VALUE=DATE:20261107");
    expect(text).toContain("DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101");
  });
  it("stable UIDs and a fixed DTSTAMP", () => {
    expect(text).toContain("UID:jobs-2026-11-06@metaphases");
    expect(text).toContain("DTSTAMP:20261031T150000Z");
  });
  it("escapes commas/semicolons and folds long lines to ≤ 75 octets", () => {
    expect(text.replace(/\r\n /g, "")).toContain("added\\, plus the unemployment rate\\; it moves");
    for (const line of text.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
  });
});
