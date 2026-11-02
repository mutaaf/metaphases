import { describe, expect, it } from "vitest";
import { fkGrade, KID_COMPANIES, type Guess } from "../../shared/kids";
import {
  buildRecap, decodeLeague, encodeLeague, leagueRows, MAX_CODE_GUESSES, mondayOf, parseRecapQuery, PLAYERS, recapImageKey, recapLines, recapQuery, recapWeek,
} from "../../shared/kidsWeek";
import { storyKidsRecapSvg } from "../../shared/story";

const g = (s: string, d: string, at: string, extra: Partial<Guess> = {}): Guess => ({ s, d, pick: "beat", at, ...extra });

describe("weekly recap (0027)", () => {
  it("shows Friday to Sunday for this week, and Monday for last week", () => {
    expect(mondayOf("2026-10-31")).toBe("2026-10-26");
    expect(recapWeek("2026-10-30")).toEqual({ from: "2026-10-26", to: "2026-10-30", label: "This week" });
    expect(recapWeek("2026-11-01")?.label).toBe("This week");
    expect(recapWeek("2026-11-02")).toEqual({ from: "2026-10-26", to: "2026-11-01", label: "Last week" });
    expect(recapWeek("2026-11-04")).toBeNull();
  });

  it("builds from local progress only: this week's guesses, lessons and piggy change", () => {
    const r = buildRecap({
      guesses: [g("AAPL", "2026-10-29", "2026-10-27", { result: "right" }), g("DIS", "2026-11-05", "2026-10-30"), g("KO", "2026-10-21", "2026-10-20", { result: "right" })],
      lessonDates: { share: "2026-10-28", company: "2026-10-10" },
      piggy: { started: "2026-10-20", history: { "2026-10-20": 1000, "2026-10-26": 1010, "2026-10-30": 1024.14 } },
      points: 42, level: 1,
    }, "2026-10-31")!;
    expect(r).toMatchObject({ guesses: 2, right: 1, waiting: 1, lessons: 1, piggyPct: 1.4, level: 1, active: true });
    const text = recapLines(r).join(" ");
    expect(text).toContain("You made 2 guesses.");
    expect(text).toContain("You got 1 right!");
    expect(text).toContain("went up 1.4%");
    expect(text).toContain("Crescent Moon");
  });

  it("is inactive with nothing done this week, and has no piggy % from one reading", () => {
    const r = buildRecap({ guesses: [], piggy: { started: "2026-10-31", history: { "2026-10-31": 1000 } }, points: 5, level: 0 }, "2026-10-31")!;
    expect(r.active).toBe(false);
    expect(r.piggyPct).toBeNull();
  });

  it("recap words stay at reading grade 5 or below", () => {
    const r = buildRecap({ guesses: [g("AAPL", "2026-10-29", "2026-10-27"), g("DIS", "2026-10-29", "2026-10-27")], lessonDates: { a: "2026-10-28" }, piggy: { started: "2026-10-20", history: { "2026-10-20": 1000, "2026-10-30": 990 } }, points: 60, level: 2 }, "2026-10-31")!;
    expect(fkGrade(recapLines(r).join(" "))).toBeLessThanOrEqual(5);
  });

  it("the share image takes only bounded counts and one percent", () => {
    const q = new URLSearchParams("g=3&r=9&l=200&p=1.44&lv=7&name=Ayla&s=AAPL");
    const x = parseRecapQuery(q);
    expect(x).toEqual({ g: 3, r: 3, l: 20, p: 1.4, lv: 4 });
    expect(recapImageKey(x)).toBe("3.3.20.1.4.4");
    expect(parseRecapQuery(new URLSearchParams("g=abc&p=<script>"))).toEqual({ g: 0, r: 0, l: 0, p: null, lv: 0 });
    const r = buildRecap({ guesses: [g("AAPL", "2026-10-29", "2026-10-27", { result: "right" })], piggy: null, points: 12, level: 0 }, "2026-10-31")!;
    expect(recapQuery(r)).toBe("g=1&r=1&l=0&lv=0");
    const svg = storyKidsRecapSvg(x, "Full Moon");
    expect(svg).toContain("My week in");
    expect(svg).not.toMatch(/Ayla|AAPL|\$/);
  });
});

describe("family league codes (0028)", () => {
  const guesses = [
    { s: "AAPL", d: "2026-10-29", pick: "beat" as const, price: "up" as const },
    { s: "DIS", d: "2026-11-12", pick: "miss" as const },
    { s: "TSLA", d: "2026-10-21", pick: "beat" as const, price: "down" as const },
  ];
  it("round-trips company, date, pick and price, and nothing else", () => {
    const code = encodeLeague({ emoji: 3, guesses: guesses.map((x) => ({ ...x, at: "2026-10-20", result: "right" as const })) });
    expect(code).toMatch(/^MOON-[0-9A-Z]{1,4}(-[0-9A-Z]{1,4})*$/);
    const r = decodeLeague(code);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.player.emoji).toBe(3);
    expect(PLAYERS[r.player.emoji]).toBe("🐢");
    expect(r.player.guesses.sort((a, b) => a.d.localeCompare(b.d))).toEqual([...guesses].sort((a, b) => a.d.localeCompare(b.d)));
    expect(JSON.stringify(r.player)).not.toMatch(/"result"|"at"/);
  });
  it("forgives case, spaces and look-alike letters", () => {
    const code = encodeLeague({ emoji: 1, guesses });
    expect(decodeLeague(" " + code.toLowerCase().replace(/-/g, " ") + " ").ok).toBe(true);
  });
  it("rejects malformed codes with a kid-friendly reason", () => {
    const code = encodeLeague({ emoji: 1, guesses });
    const flipped = code.slice(0, -2) + (code.at(-2) === "A" ? "B" : "A") + code.at(-1);
    for (const bad of ["", "hello", "MOON-", "MOON-2X00", flipped, code + "Z", "MOON-1A-ZZZZ-0"]) {
      const r = decodeLeague(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.why.length).toBeGreaterThan(10);
    }
  });
  it("caps a code at the most recent guesses and skips unknown companies", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ s: "KO", d: `2026-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`, pick: "beat" as const }));
    const r = decodeLeague(encodeLeague({ emoji: 0, guesses: [...many, { s: "NVDA", d: "2026-11-01", pick: "beat" }] }));
    expect(r.ok && r.player.guesses.length).toBe(MAX_CODE_GUESSES);
    expect(r.ok && r.player.guesses.some((x) => x.s === "NVDA")).toBe(false);
  });
  it("the company order is part of the code format (append-only)", () => {
    expect(KID_COMPANIES.slice(0, 4).map((c) => c.s)).toEqual(["DIS", "MCD", "NKE", "AAPL"]);
    expect(KID_COMPANIES.length).toBeLessThanOrEqual(32);
  });
  it("scoreboard rows: one per report card, newest first", () => {
    const rows = leagueRows([{ emoji: 0, guesses: guesses.slice(0, 2) }, { emoji: 2, guesses: guesses.slice(1) }]);
    expect(rows.map((r) => r.s)).toEqual(["DIS", "AAPL", "TSLA"]);
    expect(rows[0].picks.map((p) => p?.pick)).toEqual(["miss", "miss"]);
    expect(rows[1].picks[1]).toBeNull();
  });
});
