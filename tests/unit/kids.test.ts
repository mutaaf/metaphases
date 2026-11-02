import { afterEach, describe, expect, it, vi } from "vitest";
import {
  badgesFor, basketTip, biggestMover, buyPretend, evenSplit, expectLine, fkGrade, isKidCo, KID_BY_SYMBOL, KID_COMPANIES, kidWhen, lastTimeLine,
  levelFor, moveAnalogy, piggyValue, pointsFor, resolveGuess, resolvePrice, START_COINS, weatherFor, whyLine,
} from "../../shared/kids";
import { KID_WORDS, LESSONS, UNITS } from "../../shared/kidsContent";
import { storyKidsSvg } from "../../shared/story";
import { buildMessages, FREE_ONLY, KIDS_SYSTEM, SYSTEM } from "../../worker/ai/prompts";
import { handleAi } from "../../worker/ai";
import { UNIVERSE } from "../../src/lib/data";

describe("kid companies", () => {
  it("every kid company is one we track, with a hook and an emoji", () => {
    expect(KID_COMPANIES.length).toBeGreaterThanOrEqual(15);
    for (const c of KID_COMPANIES) {
      expect(UNIVERSE[c.s], c.s).toBeTruthy();
      expect(c.hook.length).toBeGreaterThan(5);
      expect(c.emoji).toBeTruthy();
    }
  });
  it("maps tickers to kid hooks", () => {
    expect(KID_BY_SYMBOL.MSFT.hook).toMatch(/Minecraft/);
    expect(KID_BY_SYMBOL.MCD.hook).toMatch(/Happy Meals/);
    expect(KID_BY_SYMBOL.RBLX.nick).toBe("Roblox");
    expect(isKidCo("NVDA")).toBe(false);
  });
});

describe("kid words", () => {
  it("report times are school times", () => {
    expect(kidWhen("2026-11-02", "amc", "2026-11-01")).toBe("tomorrow after school");
    expect(kidWhen("2026-11-04", "bmo", "2026-11-01")).toBe("Wednesday before school starts");
    expect(kidWhen("2026-11-17", "", "2026-11-01")).toBe("on Nov 17 (the time isn't set yet)");
  });
  it("market mood becomes weather", () => {
    expect(weatherFor(10).title).toBe("Stormy");
    expect(weatherFor(40).title).toBe("Cloudy");
    expect(weatherFor(50).title).toBe("Partly sunny");
    expect(weatherFor(65).title).toBe("Sunny");
    expect(weatherFor(90).title).toBe("Super sunny");
  });
  it("price moves become pocket money", () => {
    expect(moveAnalogy(4.8)).toContain("$10.48");
    expect(moveAnalogy(-5)).toContain("$9.50");
    expect(lastTimeLine(8.7)).toMatch(/went up 8.7%/);
    expect(lastTimeLine(null)).toMatch(/don't know/);
    expect(expectLine(2.02)).toContain("$2.02");
    expect(expectLine(-0.5)).toMatch(/lose/);
  });
});

describe("guess the report card", () => {
  it("is pending until the real number arrives", () => {
    expect(resolveGuess("beat", { eA: null, eE: 2 })).toBe("pending");
    expect(resolveGuess("beat", null)).toBe("pending");
  });
  it("beat = at least the grown-up guess", () => {
    expect(resolveGuess("beat", { eA: 2.1, eE: 2 })).toBe("right");
    expect(resolveGuess("beat", { eA: 2, eE: 2 })).toBe("right");
    expect(resolveGuess("miss", { eA: 2.1, eE: 2 })).toBe("wrong");
    expect(resolveGuess("miss", { eA: 1.9, eE: 2 })).toBe("right");
  });
  it("can't judge without a grown-up guess", () => expect(resolveGuess("beat", { eA: 1, eE: null })).toBe("unknown"));
  it("price bonus", () => {
    expect(resolvePrice("up", 3)).toBe("right");
    expect(resolvePrice("down", 3)).toBe("wrong");
    expect(resolvePrice("up", null)).toBe("pending");
    expect(resolvePrice(undefined, 3)).toBe("unknown");
  });
  it("explains why in kid words", () => {
    expect(whyLine("Apple", { eA: 2.1, eE: 2 })).toMatch(/more than expected, so it BEAT/);
    expect(whyLine("Apple", { eA: 1.9, eE: 2 })).toMatch(/less than expected, so it MISSED/);
  });
});

describe("pretend piggy bank", () => {
  it("splits 1,000 coins evenly in tens", () => {
    const s = evenSplit(["DIS", "RBLX", "HSY"]);
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(START_COINS);
    expect(s).toEqual({ DIS: 340, RBLX: 330, HSY: 330 });
  });
  it("buys pretend shares at today's prices and values them later", () => {
    const h = buyPretend({ DIS: 500, RBLX: 500, HSY: 0 }, { DIS: 100, RBLX: 50 });
    expect(h).toHaveLength(2);
    expect(piggyValue(h, { DIS: 100, RBLX: 50 })).toBeCloseTo(1000);
    expect(piggyValue(h, { DIS: 110, RBLX: 50 })).toBeCloseTo(1050);
    expect(biggestMover(h, { DIS: 110, RBLX: 45 })?.s).toBe("DIS");
  });
  it("skips companies with no price instead of inventing one", () => {
    expect(buyPretend({ DIS: 1000 }, {})).toEqual([]);
  });
  it("teaches eggs-in-baskets for every size", () => {
    expect(basketTip(1)).toMatch(/one basket/);
    expect(basketTip(5)).toMatch(/spread out/);
  });
});

describe("points, levels, badges", () => {
  it("levels go New Moon → Full Moon", () => {
    expect(levelFor(0).name).toBe("New Moon");
    expect(levelFor(25).name).toBe("Crescent Moon");
    expect(levelFor(200).name).toBe("Full Moon");
    expect(levelFor(200).next).toBeNull();
  });
  it("points reward trying, right answers, lessons and the piggy bank", () => {
    const p = { guesses: [{ s: "AAPL", d: "2026-11-02", pick: "beat" as const, at: "x", result: "right" as const }], lessons: ["share"], piggy: true, piggyCount: 3 };
    expect(pointsFor(p)).toBe(2 + 10 + 10 + 5);
    const b = badgesFor(p, LESSONS.length);
    expect(b).toEqual(expect.arrayContaining(["first-guess", "good-guess", "piggy", "first-lesson"]));
    expect(b).not.toContain("all-school");
  });
  it("a three-in-a-row streak earns Hot Streak", () => {
    const g = (d: string, result: "right" | "wrong") => ({ s: "X", d, pick: "beat" as const, at: "x", result });
    expect(badgesFor({ guesses: [g("2026-01-01", "right"), g("2026-01-02", "right"), g("2026-01-03", "right")], lessons: [], piggy: false, piggyCount: 0 }, 9)).toContain("streak-3");
    expect(badgesFor({ guesses: [g("2026-01-01", "right"), g("2026-01-02", "wrong"), g("2026-01-03", "right")], lessons: [], piggy: false, piggyCount: 0 }, 9)).not.toContain("streak-3");
  });
});

describe("Moon School content", () => {
  it("is a set of micro-lessons: every unit has lessons, 3–7 tiny steps each, at least one check or sort, unique ids", () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    for (const u of UNITS) expect(LESSONS.filter((l) => l.unit === u.id).length, u.id).toBeGreaterThanOrEqual(3);
    for (const l of LESSONS) {
      expect(UNITS.some((u) => u.id === l.unit), l.id).toBe(true);
      expect(l.steps.length, l.id).toBeGreaterThanOrEqual(3);
      expect(l.steps.length, l.id).toBeLessThanOrEqual(7);
      expect(l.steps.some((x) => x.t !== "say"), l.id).toBe(true);
      for (const x of l.steps) {
        if (x.t === "say") { expect(x.emoji, l.id).toBeTruthy(); expect(x.text.split(/\s+/).length, `${l.id}: ${x.text}`).toBeLessThanOrEqual(22); }
        if (x.t === "check") { expect(x.answer).toBeLessThan(x.options.length); expect(x.options.length).toBeGreaterThanOrEqual(2); expect(x.why.length).toBeGreaterThan(5); }
        if (x.t === "sort") { expect(x.items.length).toBeGreaterThanOrEqual(4); expect(new Set(x.items.map((i) => i.b)).size, l.id).toBe(2); }
      }
    }
  });
  it("keeps the old lesson ids so finished lessons stay finished", () => {
    for (const id of ["company", "share", "prices", "report-card", "beat", "saving", "baskets", "patience", "hype"]) expect(LESSONS.some((l) => l.id === id), id).toBe(true);
  });
  it("every lesson reads at grade 5 or below, and no single card is grown-up prose", () => {
    for (const l of LESSONS) {
      const texts = l.steps.map((x) => (x.t === "say" ? x.text : `${x.q} ${x.why}`));
      expect(fkGrade(l.steps.flatMap((x) => (x.t === "say" ? [x.text] : [])).join(" ")), l.id).toBeLessThanOrEqual(5);
      expect(fkGrade(texts.join(" ")), l.id).toBeLessThanOrEqual(5.5);
      for (const t of texts) if (t.split(/\s+/).length > 5) expect(fkGrade(t), `${l.id}: ${t}`).toBeLessThanOrEqual(9);
    }
    expect(fkGrade(KID_WORDS.map((w) => `${w.means} ${w.example}`).join(" "))).toBeLessThanOrEqual(5);
  });
  it("the reading-level check really does flag grown-up prose", () => {
    expect(fkGrade("Consensus estimates incorporate analysts' expectations regarding quarterly profitability and operational efficiency.")).toBeGreaterThan(12);
  });
  it("nothing in kid content tells anyone to buy or sell real shares", () => {
    const all = [...LESSONS.flatMap((l) => [...l.screens, ...l.quiz.flatMap((q) => [q.q, ...q.options, q.why])]), ...KID_WORDS.flatMap((w) => [w.means, w.example])].join(" ");
    expect(all).not.toMatch(/\byou should (buy|sell)\b|buy now|sign up|download/i);
  });
});

describe("Luna (kids AI)", () => {
  it("uses the kid-safe system prompt with the safety rules", () => {
    const m = buildMessages({ task: "kids", context: { weather: "Cloudy", companies: [{ s: "DIS", nick: "Disney", hook: "makes movies" }] }, question: "What is a share?" });
    expect(m[0].content).toBe(KIDS_SYSTEM);
    expect(m[0].content).not.toBe(SYSTEM);
    for (const rule of [/simple words/i, /Never tell anyone to buy or sell/i, /personal information/i, /ask a grown-up/i, /pretend/i]) expect(KIDS_SYSTEM).toMatch(rule);
    expect(m[1].content).toContain("Disney");
    expect(m[1].content).toMatch(/pretend money/);
  });
  it("is a free-only task", () => expect(FREE_ONLY).toContain("kids"));

  afterEach(() => { vi.unstubAllGlobals(); });
  it("ignores a grown-up's own key: goes to the free brain, never calls the provider", async () => {
    const store = new Map<string, string>();
    (globalThis as any).caches = { default: { match: async (r: Request) => (store.has(r.url) ? new Response(store.get(r.url)) : undefined), put: async (r: Request, res: Response) => { store.set(r.url, await res.text()); } } };
    const fetchSpy = vi.fn(async () => new Response("should not be called", { status: 500 }));
    vi.stubGlobal("fetch", fetchSpy);
    const enc = new TextEncoder();
    const ai = { run: vi.fn(async () => new ReadableStream({ start(c) { c.enqueue(enc.encode('data: {"response":"A share is a tiny piece!"}\n\n')); c.close(); } })) };
    const req = new Request("https://x/metaphases/api/ai/stream", { method: "POST", headers: { "x-mp-key": "sk-ant-grownup", "cf-connecting-ip": "9.9.9.9" }, body: JSON.stringify({ task: "kids", context: {}, question: "What is a share?", provider: "anthropic", model: "claude-x" }) });
    const res = (await handleAi("/api/ai/stream", req, { AI: ai }))!;
    const text = await res.text();
    expect(text).toContain("tiny piece");
    expect(text).toContain('"provider":"edge"');
    expect(ai.run).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("kids share card", () => {
  it("is a friendly 9:16 card with the promises and no prices", () => {
    const svg = storyKidsSvg();
    expect(svg).toContain('width="1080" height="1920"');
    expect(svg).toContain("No real money");
    expect(svg).not.toMatch(/\$\d/);
  });
});
