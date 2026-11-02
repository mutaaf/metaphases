// Exports every piece of Metaphases Kids content + test vectors to kids-content.json, the single
// source of truth for the native Moon Club app (github.com/mutaaf/moon-club). The app's Swift ports
// of the pure logic are tested against the `vectors` here, so web and app can't drift apart
// (Family League codes made on an iPad must paste into the web, and the other way round).
// Run: npm run export:kids  [out path, default ./kids-content.json]
import { writeFileSync } from "node:fs";
import * as K from "../shared/kids";
import * as C from "../shared/kidsContent";
import * as W from "../shared/kidsWeek";
import * as T from "../shared/kidsTransfer";
import { TRANSFER_SAMPLE } from "../shared/kidsTransfer.sample";

type Step = { t: "say"; emoji: string; text: string } | { t: "check"; q: string; options: string[]; answer: number; why: string } | { t: "sort"; q: string; buckets: [string, string]; items: { emoji: string; text: string; b: 0 | 1 }[]; why: string };

async function main() {
  const out = process.argv[2] ?? "kids-content.json";
  const anyC = C as any;
  // Lessons: step-based when available (micro-lessons), else screens + quiz turned into steps.
  const lessons = (C.LESSONS as any[]).map((l) => ({
    id: l.id, unit: l.unit ?? "school", title: l.title, emoji: l.emoji,
    steps: (l.steps as Step[] | undefined) ?? [
      ...l.screens.map((text: string) => ({ t: "say", emoji: l.emoji, text })),
      ...l.quiz.map((q: any) => ({ t: "check", ...q })),
    ],
  }));
  const units = anyC.UNITS ?? [{ id: "school", title: "Moon School", emoji: "🎓", blurb: "Short lessons, one idea each." }];
  let questChapters: unknown = null;
  try { questChapters = await import("../shared/kidsQuestContent"); } catch { /* chapters 2–3 not on this branch yet */ }

  // ── vectors ──
  const today = "2026-10-31";
  const scores = [0, 10, 24, 25, 40, 44, 45, 50, 55, 56, 70, 75, 76, 100];
  const sessions = ["bmo", "dmh", "amc", ""] as const;
  const dates = ["2026-10-31", "2026-11-01", "2026-10-30", "2026-11-03", "2026-11-06", "2026-11-07", "2026-11-17", "2026-12-25"];
  const players: W.LeaguePlayer[] = [
    { emoji: 0, guesses: [] },
    { emoji: 3, guesses: [{ s: "AAPL", d: "2026-10-29", pick: "beat", price: "up" }, { s: "DIS", d: "2026-11-12", pick: "miss" }, { s: "TSLA", d: "2026-10-21", pick: "beat", price: "down" }] },
    { emoji: 7, guesses: K.KID_COMPANIES.map((c, i) => ({ s: c.s, d: `2026-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + i).padStart(2, "0")}`, pick: i % 2 ? "miss" : "beat" as const })) },
  ];
  const codes = players.map((p) => W.encodeLeague(p));
  const g = (s: string, d: string, at: string, extra: Partial<K.Guess> = {}): K.Guess => ({ s, d, pick: "beat", at, ...extra });
  const recapInputs: { input: W.RecapInput; today: string }[] = [
    { today: "2026-10-31", input: { guesses: [g("AAPL", "2026-10-29", "2026-10-27", { result: "right" }), g("DIS", "2026-11-05", "2026-10-30"), g("KO", "2026-10-21", "2026-10-20", { result: "right" })], lessonDates: { share: "2026-10-28", company: "2026-10-10" }, piggy: { started: "2026-10-20", history: { "2026-10-20": 1000, "2026-10-26": 1010, "2026-10-30": 1024.14 } }, points: 42, level: 1 } },
    { today: "2026-11-02", input: { guesses: [g("NKE", "2026-10-30", "2026-10-28", { result: "wrong" })], lessonDates: {}, piggy: null, points: 12, level: 0 } },
    { today: "2026-11-04", input: { guesses: [], lessonDates: {}, piggy: null, points: 0, level: 0 } },
    { today: "2026-10-31", input: { guesses: [], lessonDates: {}, piggy: { started: "2026-10-31", history: { "2026-10-31": 1000 } }, points: 5, level: 0 } },
  ];
  const prog = (o: Partial<K.KidsProgress>): K.KidsProgress => ({ guesses: [], lessons: [], piggy: false, piggyCount: 0, ...o });
  const progressCases = [
    prog({}),
    prog({ quest: true }),
    prog({ guesses: [g("A", "2026-01-01", "x", { result: "right", priceResult: "right" }), g("B", "2026-01-02", "x", { result: "right" }), g("C", "2026-01-03", "x", { result: "right" })], lessons: ["company", "share"], piggy: true, piggyCount: 5 }),
    prog({ guesses: [g("A", "2026-01-01", "x", { result: "right" }), g("B", "2026-01-02", "x", { result: "wrong" }), g("C", "2026-01-03", "x", { result: "right" })], lessons: lessons.map((l) => l.id) }),
  ];
  const fkTexts = [
    "A share is a tiny piece of a company.",
    "Consensus estimates incorporate analysts' expectations regarding quarterly profitability and operational efficiency.",
    ...lessons.slice(0, 6).flatMap((l) => l.steps.filter((s: Step) => s.t === "say").map((s: any) => s.text)),
  ];
  const prices = { DIS: 110, RBLX: 50, HSY: undefined as number | undefined, KO: 61.5 };
  const coinsSplit = K.evenSplit(["DIS", "RBLX", "HSY"]);
  const holdings = K.buyPretend({ DIS: 400, RBLX: 300, KO: 300 }, { DIS: 100, RBLX: 40, KO: 60 });

  const vectors = {
    weatherFor: scores.map((score) => ({ score, out: K.weatherFor(score) })),
    kidWhen: dates.flatMap((date) => sessions.map((session) => ({ date, session, today, out: K.kidWhen(date, session, today) }))),
    expectLine: [null, -0.42, 0, 2.02, 10.5].map((epsE) => ({ epsE, out: K.expectLine(epsE) })),
    lastTimeLine: [null, 4.8, -3.25, 0].map((move) => ({ move, out: K.lastTimeLine(move) })),
    whyLine: [{ eA: 2.1, eE: 2.02 }, { eA: 1, eE: 2 }, { eA: null, eE: 2 }, { eA: 2, eE: 2 }].map((e) => ({ nick: "Apple", e, out: K.whyLine("Apple", e) })),
    resolveGuess: (["beat", "miss"] as const).flatMap((pick) => [null, { eA: null, eE: 1 }, { eA: 1, eE: null }, { eA: 2, eE: 1 }, { eA: 1, eE: 2 }, { eA: 1, eE: 1 }].map((e) => ({ pick, e, out: K.resolveGuess(pick, e) }))),
    resolvePrice: ([undefined, "up", "down"] as const).flatMap((pick) => [null, 2.5, -1, 0].map((move) => ({ pick: pick ?? null, move, out: K.resolvePrice(pick, move) }))),
    evenSplit: [[], ["DIS"], ["DIS", "RBLX"], ["DIS", "RBLX", "HSY"], ["A", "B", "C", "D", "E"], ["A", "B", "C", "D", "E", "F", "G"]].map((syms) => ({ syms, out: K.evenSplit(syms) })),
    buyPretend: [{ coins: { DIS: 400, RBLX: 300, KO: 300, HSY: 0 }, prices: { DIS: 100, RBLX: 40, KO: 60 }, out: holdings }],
    piggyValue: [{ holdings, prices, out: K.piggyValue(holdings, prices) }],
    holdingChange: holdings.map((h) => ({ holding: h, price: (prices as any)[h.s] ?? null, out: K.holdingChange(h, (prices as any)[h.s]) })),
    biggestMover: [{ holdings, prices, out: K.biggestMover(holdings, prices) }],
    basketTip: [0, 1, 2, 3, 4, 5].map((n) => ({ n, out: K.basketTip(n) })),
    levelFor: [0, 5, 19, 20, 49, 50, 89, 90, 139, 140, 500].map((points) => ({ points, out: K.levelFor(points) })),
    pointsFor: progressCases.map((p) => ({ progress: p, out: K.pointsFor(p) })),
    badgesFor: progressCases.map((p) => ({ progress: p, totalLessons: lessons.length, out: K.badgesFor(p, lessons.length) })),
    fkGrade: fkTexts.map((text) => ({ text, out: K.fkGrade(text) })),
    syllables: ["share", "company", "the", "profit", "money", "dividend", "beautiful", "rhythm", "make", "played", "Apple's"].map((w) => ({ word: w, out: K.syllables(w) })),
    ofTheDay: ["2026-10-31", "2026-11-01", "2027-03-15"].flatMap((d) => [0, 3].map((salt) => ({ today: d, salt, n: K_WORDS_LEN(), index: C.KID_WORDS.indexOf(K.ofTheDay(C.KID_WORDS, d, salt)) }))),
    recap: recapInputs.map(({ input, today }) => { const r = W.buildRecap(input, today); return { input, today, out: r, lines: r ? W.recapLines(r) : null, query: r ? W.recapQuery(r) : null }; }),
    recapWeek: ["2026-10-26", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-04"].map((d) => ({ today: d, out: W.recapWeek(d) })),
    leagueEncode: players.map((p, i) => ({ player: p, code: codes[i] })),
    leagueDecode: [
      ...codes.map((code) => ({ code, out: W.decodeLeague(code) })),
      ...[codes[1].toLowerCase().replace(/-/g, " "), "", "hello", "MOON-", "MOON-2X00", codes[1] + "Z", "MOON-1A-ZZZZ-0", codes[1].slice(0, -2) + (codes[1].at(-2) === "A" ? "B" : "A") + codes[1].at(-1)].map((code) => ({ code, out: W.decodeLeague(code) })),
    ],
    leagueRows: [{ players: players.slice(1, 3), limit: 10, out: W.leagueRows(players.slice(1, 3), 10) }],
    evenSplitDefault: coinsSplit,
    // Move my progress (web → app): the app must decode `code` to `state`, and reject every `bad` code.
    transfer: (() => {
      const code = T.encodeTransfer(TRANSFER_SAMPLE);
      const flip = (i: number) => code.slice(0, i) + (code[i] === "A" ? "B" : "A") + code.slice(i + 1);
      return {
        code, state: TRANSFER_SAMPLE, pasted: `Moon Club progress:\n${code.slice(0, 30)}\n${code.slice(30)}\n`,
        checksums: ["", "abc", "eyJ2IjoxfQ", code.slice(T.TRANSFER_PREFIX.length, code.lastIndexOf("-"))].map((body) => ({ body, out: T.transferChecksum(body) })),
        bad: [{ code: "hello", why: "notACode" }, { code: flip(T.TRANSFER_PREFIX.length + 12), why: "damaged" }, { code: code.slice(0, -1), why: "damaged" }],
      };
    })(),
  };
  function K_WORDS_LEN() { return C.KID_WORDS.length; }

  const doc = {
    version: 1,
    generated: new Date().toISOString(),
    source: "github.com/mutaaf/metaphases shared/kids*.ts",
    companies: K.KID_COMPANIES,
    words: C.KID_WORDS,
    terms: C.KID_TERMS,
    quest: C.QUEST,
    questChapters,
    units, lessons,
    badges: K.BADGES, levels: K.LEVELS,
    startCoins: K.START_COINS, maxPicks: K.MAX_PICKS,
    players: W.PLAYERS, playerNames: W.PLAYER_NAMES, maxCodeGuesses: W.MAX_CODE_GUESSES,
    vectors,
  };
  writeFileSync(out, JSON.stringify(doc, (_, v) => (v === undefined ? null : v), 2) + "\n");
  console.log(`wrote ${out}: ${lessons.length} lessons, ${Object.keys(C.KID_TERMS).length} terms, ${K.KID_COMPANIES.length} companies, chapters: ${questChapters ? "yes" : "no"}`);
}
main();
