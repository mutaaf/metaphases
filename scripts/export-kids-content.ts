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
import * as P from "../shared/kidsPacks";
import * as Y from "../shared/kidsWhy";
import * as CO from "../shared/kidsCoach";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { createPublicKey, verify } from "node:crypto";

type Step = P.Step;

async function main() {
  const out = process.argv[2] ?? "kids-content.json";
  const anyC = C as any;
  // Lessons: step-based when available (micro-lessons), else screens + quiz turned into steps.
  const lessons = (C.LESSONS as any[]).map((l) => ({
    id: l.id, unit: l.unit ?? "school", title: l.title, emoji: l.emoji, track: l.track, objectives: l.objectives, since: l.since,
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

  // ── Lesson packs: every pack in packs/ (Core is the top-level content; the rest ship as `packs`) ──
  const core = C.CORE_PACK;
  const extra = readdirSync("packs", { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "core" && existsSync(`packs/${d.name}/pack.json`))
    .map((d) => JSON.parse(readFileSync(`packs/${d.name}/pack.json`, "utf8")) as P.LessonPack);
  for (const p of [core, ...extra]) {
    const issues = P.validatePack(p, p.kind === "core" ? undefined : core);
    if (issues.length) throw new Error(`pack ${p.id} is invalid:\n${issues.map((i) => `  ${i.code} ${i.at}: ${i.msg}`).join("\n")}`);
  }
  const channel = JSON.parse(readFileSync("packs/channel.json", "utf8"));
  // Bad packs (one mutation each) and the codes BOTH validators must report.
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  const firstStep = (p: any, t: string) => p.units.flatMap((u: any) => u.lessons).flatMap((l: any) => l.steps).find((s: any) => s.t === t);
  const guest = extra[0];
  const mut = (name: string, base: P.LessonPack, f: (p: any) => void, withCore = true) => { const p = clone(base); f(p); return { name, pack: p, withCore, codes: [...new Set(P.validatePack(p, withCore && p.kind !== "core" ? core : undefined).map((i) => i.code))].sort() }; };
  const packVectors = guest ? [
    mut("good guest", guest, () => {}),
    mut("bad format", guest, (p) => { p.format = 2; }),
    mut("bad id", guest, (p) => { p.id = "Bad Id!"; }),
    mut("needs newer content", guest, (p) => { p.requires.content = 99; }),
    mut("answer out of range", guest, (p) => { p.units[0].lessons[0].steps[3].answer = 9; }),
    mut("too few steps", guest, (p) => { p.units[0].lessons[0].steps = p.units[0].lessons[0].steps.slice(2); }),
    mut("grown-up prose", guest, (p) => { p.units[0].lessons[0].steps[1].text = "Consensus estimates incorporate analysts' expectations regarding quarterly profitability and operational efficiency."; }),
    mut("a link", guest, (p) => { p.units[0].lessons[0].steps[0].text = "Visit coachnova.com for more!"; }),
    mut("a handle", guest, (p) => { p.creator.bio = "Say hi to @coachnova on video."; }),
    mut("advice", guest, (p) => { p.units[0].lessons[0].steps[2].text = "You should buy a cookie company now."; }),
    mut("promotion", guest, (p) => { p.units[0].lessons[0].steps[2].text = "Please subscribe to my channel."; }),
    mut("advice in a wrong answer is fine", guest, (p) => { p.units[0].lessons[2].steps[4].options[2] = "Buy now"; }),
    mut("quoted hype is fine", guest, (p) => { p.units[0].lessons[0].steps[2].text = "A video says \"buy now\". That is hype."; }),
    mut("undeclared glyph", guest, (p) => { p.glyphs = p.glyphs.slice(1); }),
    mut("collides with core", guest, (p) => { p.units[0].lessons[0].id = "money"; }),
    mut("unknown map ref", guest, (p) => { p.regions[0].nodes[0].ref = "nope"; }),
    mut("no boss", guest, (p) => { p.regions[0].nodes.pop(); }),
    mut("no sign-off", guest, (p) => { p.reviewers = []; }),
    mut("too long for one card", guest, (p) => { p.units[0].lessons[0].steps[3].q = "Coach Nova bakes forty comet cookies on Saturday and sells every single one of them at the school fair."; }),
    mut("emoji in words", guest, (p) => { p.units[0].lessons[0].steps[0].text = "Hi there 🚀 friends."; }),
    mut("sort with one bucket", core, (p) => { const l = p.units[0].lessons[2]; l.steps[2].items.forEach((i: any) => (i.b = 0)); }, false),
    mut("core without courses", core, (p) => { delete p.guess; }, false),
    // 0.15 step types and fields: a worked example needs 2–4 lines; a grow step stays inside its bounds; talk is short; since is a version.
    mut("example with one line", core, (p) => { firstStep(p, "example").lines = ["$1 + $1 = $2"]; }, false),
    mut("example line too long", core, (p) => { firstStep(p, "example").lines[0] = "This line of working is far too long to fit on one card"; }, false),
    mut("grow for 40 years", core, (p) => { firstStep(p, "grow").years = 40; }, false),
    mut("grow against the same rate", core, (p) => { const g = firstStep(p, "grow"); g.vs = { kind: "rate", rate: g.rate, label: "Same" }; }, false),
    mut("grow with a made-up picture", core, (p) => { firstStep(p, "grow").show = "rocket"; }, false),
    mut("too much talk", core, (p) => { p.units[0].talk = ["a", "b", "c", "d"]; }, false),
    mut("bad since", core, (p) => { p.units[0].lessons[0].since = "soon"; }, false),
    mut("ladder to nowhere", core, (p) => { p.piggy.garden = ["nope"]; }, false),
  ] : [];
  // A real Ed25519 signature over a pack's served bytes, so the app's verifier is tested against Node's.
  const sigEntry = guest ? channel.packs.find((x: any) => x.id === guest.id) : null;
  const packSig = sigEntry ? (() => {
    const bytes = Buffer.from(JSON.stringify(guest), "utf8");
    const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(channel.publicKey, "base64").toString("base64url") }, format: "jwk" });
    if (!verify(null, bytes, key, Buffer.from(sigEntry.sig, "base64"))) throw new Error(`packs/channel.json: ${guest.id}'s signature is stale. Run npm run packs:sign.`);
    return { publicKey: channel.publicKey, body: bytes.toString("base64"), sig: sigEntry.sig, sha256: sigEntry.sha256, tampered: Buffer.from(JSON.stringify({ ...guest, title: "Tampered" }), "utf8").toString("base64") };
  })() : null;
  const composed = P.composePacks(core, extra);
  const composeVector = { packs: extra.map((p) => p.id), units: composed.units.map((u) => u.id), lessons: composed.units.flatMap((u) => u.lessons.map((l) => l.id)), regions: composed.regions.map((r) => r.id), glossary: Object.keys(composed.glossary).sort(), glyphs: composed.glyphs };

  // ── "Why did it move?" vectors: hand-made inputs covering every cause, plus the input builder ──
  const W0 = (o: Partial<Y.WhyInput>): Y.WhyInput => ({ s: "DIS", nick: "Disney", range: "1d", move: -1, market: null, sector: null, report: null, dividend: null, normal: 1.5, asOf: "2026-10-30", ...o });
  const grp = (m: number | null) => ({ etf: "RSPC", name: Y.KID_GROUPS.media.name, move: m });
  const whyCases: { input: Y.WhyInput; today: string }[] = [
    { today: "2026-10-30", input: W0({ move: 0.3 }) },
    { today: "2026-10-30", input: W0({ move: -0.02 }) },
    { today: "2026-10-30", input: W0({ move: null }) },
    { today: "2026-10-30", input: W0({ move: 6.2, report: { date: "2026-10-29", eA: 1.2, eE: 1.0 } }) },
    { today: "2026-10-30", input: W0({ move: -5.1, report: { date: "2026-10-29", eA: 1.2, eE: 1.0 } }) },
    { today: "2026-10-30", input: W0({ move: -4.0, report: { date: "2026-10-30", eA: 0.8, eE: 1.0 } }) },
    { today: "2026-10-30", input: W0({ move: 3.0, report: { date: "2026-10-30", eA: 0.8, eE: 1.0 } }) },
    { today: "2026-10-30", input: W0({ move: 2.2, report: { date: "2026-10-30", eA: 1.0, eE: 1.0 } }) },
    { today: "2026-10-30", input: W0({ move: -4.4, report: { date: "2026-10-30", eA: null, eE: 1.0 } }) },
    { today: "2026-10-31", input: W0({ move: -2.0, market: -1.8, sector: grp(-1.9) }) },
    { today: "2026-10-30", input: W0({ move: -8.0, market: -0.5, sector: grp(-0.6) }) },
    { today: "2026-10-30", input: W0({ move: -2.5, market: 1.1 }) },
    { today: "2026-10-30", input: W0({ move: 2.4, market: 0.5, sector: grp(2.2) }) },
    { today: "2026-10-30", input: W0({ move: -1.9, market: 0.1, dividend: { date: "2026-10-30", amount: 0.5, pct: 1.4 } }) },
    { today: "2026-10-30", input: W0({ move: -1.2, dividend: { date: "2026-10-30", amount: 0.5, pct: null } }) },
    { today: "2026-10-30", input: W0({ move: 9.5, normal: 1.4 }) },
    { today: "2026-11-03", input: W0({ range: "5d", move: -4.6, market: -2.4, sector: grp(-3.6), normal: 3.1, asOf: "2026-10-30" }) },
    { today: "2026-11-03", input: W0({ range: "5d", move: 0.7, market: 0.2, normal: 3.1 }) },
  ];
  const series = (start: number, steps: number[], d0 = "2026-08-03"): Y.DailySeries => {
    const d: string[] = [], c: number[] = []; let x = start; let day = new Date(`${d0}T12:00:00Z`);
    for (const st of [0, ...steps]) { while ([0, 6].includes(day.getUTCDay())) day = new Date(day.getTime() + 86400000); x = Math.round(x * (1 + st / 100) * 100) / 100; d.push(day.toISOString().slice(0, 10)); c.push(x); day = new Date(day.getTime() + 86400000); }
    return { d, c };
  };
  const wig = Array.from({ length: 60 }, (_, i) => [0.8, -0.6, 1.1, -0.9, 0.4, -1.2, 0.7][i % 7]);
  const stock = series(100, [...wig, -3.5]), spy = series(500, [...wig.map((v) => v / 2), -1.1]), sec = series(40, [...wig.map((v) => v * 0.7), -2.0]);
  const last = stock.d[stock.d.length - 1], prevDay = stock.d[stock.d.length - 2];
  const buildCases = [
    { s: "DIS", nick: "Disney", range: "1d" as const, stock, spy, sector: sec, reports: [{ date: prevDay, eA: 1.1, eE: 1.0 }], dividends: [] },
    { s: "DIS", nick: "Disney", range: "1d" as const, stock, spy, sector: sec, reports: [{ date: prevDay, eA: 1.1, eE: 1.0, hour: "bmo" as const }], dividends: [{ date: last, amount: 0.6 }] },
    { s: "KO", nick: "Coca-Cola", range: "5d" as const, stock, spy, sector: sec, reports: [{ date: last, eA: 0.7, eE: 0.7, hour: "amc" as const }, { date: stock.d[stock.d.length - 4], eA: 0.7, eE: 0.75 }], dividends: [{ date: stock.d[stock.d.length - 3], amount: 0.5 }] },
    { s: "AAPL", nick: "Apple", range: "5d" as const, stock: { d: stock.d.slice(0, 4), c: stock.c.slice(0, 4) }, spy: null, sector: null, reports: [], dividends: [] },
  ];
  const coachCases = {
    next: [[], ["report-card"], ["report-card", "guess", "beat", "after", "expectations", "guidance"]].map((done) => ({ done, out: CO.courseNext(core.guess!.ladder, done) })),
    reveal: [{ eA: 1.2, eE: 1, move: 3 }, { eA: 1.2, eE: 1, move: -2 }, { eA: 0.8, eE: 1, move: -2 }, { eA: 0.8, eE: 1, move: 1 }, { eA: 1, eE: 1.004, move: 1 }, { eA: null, eE: 1, move: 1 }, { eA: 1.2, eE: 1, move: null }].map((r) => ({ r, out: CO.guessReveal(core.guess!, r), key: CO.guessRevealKey(r), learn: CO.guessLearn(core.guess!, r) })),
    piggy: [
      { holdings: 3, started: "2026-10-01", today: "2026-10-31", value: 1010, start: 1000, peeks: 9 },
      { holdings: 3, started: "2026-10-01", today: "2026-10-31", value: 850, start: 1000, peeks: 1 },
      { holdings: 3, started: "2026-10-01", today: "2026-10-31", value: 1120, start: 1000, peeks: 1 },
      { holdings: 1, started: "2026-10-01", today: "2026-10-31", value: 1000, start: 1000, peeks: 0 },
      { holdings: 3, started: "2026-10-28", today: "2026-10-31", value: 1000, start: 1000, peeks: 0 },
      { holdings: 3, started: "2026-09-01", today: "2026-10-31", value: 1000, start: 1000, peeks: 0 },
      { holdings: 5, started: "2026-10-10", today: "2026-10-31", value: 1000, start: 1000, peeks: 0 },
      { holdings: 3, started: "2026-10-10", today: "2026-10-31", value: 1000, start: 1000, peeks: 3 },
      // 0.15: every company in one group (sector) gets its own tip; one company is still "one basket".
      { holdings: 3, started: "2026-10-10", today: "2026-10-31", value: 1000, start: 1000, peeks: 0, groups: 1 },
      { holdings: 3, started: "2026-10-10", today: "2026-10-31", value: 1000, start: 1000, peeks: 0, groups: 2 },
      { holdings: 1, started: "2026-10-10", today: "2026-10-31", value: 1000, start: 1000, peeks: 0, groups: 1 },
      { holdings: 4, started: "2026-10-10", today: "2026-10-31", value: 850, start: 1000, peeks: 0, groups: 1 },
    ].map((x) => ({ x, out: CO.piggyTip(core.piggy!, x) })),
  };
  Object.assign(vectors, {
    packValidate: packVectors,
    packSig,
    compose: composeVector,
    why: whyCases.map(({ input, today }) => ({ input, today, out: Y.whyMoved(input, today) })),
    whyBuild: buildCases.map((a) => { const input = Y.buildWhyInput(a); return { args: a, input }; }),
    reportResult: [[1, 1], [1.004, 1], [1.02, 1], [0.98, 1], [-0.1, -0.1], [0.003, 0], [-0.2, -0.25]].map(([eA, eE]) => ({ eA, eE, out: Y.reportResult(eA, eE) })),
    coach: coachCases,
    // Grow steps: the numbers both platforms draw, for hand-picked cases and every grow step in Core.
    grow: [
      ...[[100, 10, 5], [100, 20, 4], [100, 3, 10], [1000, 6.9, 10], [1000, 6, 10], [100, 10, 8], [250, 2.5, 6], [1, 30, 10]].flatMap(([start, rate, years]) =>
        (["compound", "simple", "jar"] as const).map((kind) => ({ start, rate, years, kind, out: P.growSeries(start, rate, years, kind) }))),
    ],
    growSteps: core.units.flatMap((u) => u.lessons.flatMap((l) => l.steps.flatMap((s, i) => (s.t === "grow" ? [{ at: `${l.id}#${i}`, rows: P.growRows(s) }] : [])))),
  });

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
    // Lesson packs (shared/kidsPacks.ts): Core's manifest + courses + map, then every other pack whole.
    pack: { id: core.id, title: core.title, version: core.version, kind: core.kind, requires: core.requires, ages: core.ages, tracks: core.tracks, curators: core.curators, reviewers: core.reviewers },
    objectives: core.objectives, regions: core.regions, guessCourse: core.guess, piggyCourse: core.piggy, review: core.review,
    assessments: core.assessments, games: core.games, glyphs: core.glyphs,
    packs: extra,
    channel: { publicKey: channel.publicKey },
    whyGroups: Y.KID_GROUPS, whySectors: Y.KID_SECTOR,
    vectors,
  };
  writeFileSync(out, JSON.stringify(doc, (_, v) => (v === undefined ? null : v), 2) + "\n");
  console.log(`wrote ${out}: ${lessons.length} lessons, ${Object.keys(C.KID_TERMS).length} terms, ${K.KID_COMPANIES.length} companies, chapters: ${questChapters ? "yes" : "no"}`);
}
main();
