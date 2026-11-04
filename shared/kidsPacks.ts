// Lesson Packs: the versioned, schema-validated curriculum format shared by the web (/kids) and the
// Moon Club app. A pack is ONE JSON document (packs/<id>/pack.json, schema packs/pack.schema.json):
// a manifest (id, version, reviewers, ages, objectives…) plus units → lessons → steps, a glossary,
// the Guess and Piggy Bank courses, map regions, mastery checks and the glyph keys it draws.
//
//  • "core"    the built-in curriculum (packs/core). Everything else builds on it.
//  • "extend"  adds units, lessons, words and map regions next to Core (guest / creator packs).
//  • "replace" swaps Core's units, lessons, words and regions for its own (a whole new course).
//
// The same rules run in Swift (MoonClubCore Packs.swift); `npm run export:kids` writes vectors so both
// validators agree on every error code. Kids rules are checked here, not just hoped for: reading level,
// glyph coverage, no links, and no advice / promotion phrases.
import { fkGrade } from "./kids";

export const PACK_FORMAT = 1;
/** The content version this build understands (kids-content.json `version`). A pack's requires.content must be ≤ this. */
export const CONTENT_VERSION = 1;

export interface Quiz { q: string; options: string[]; answer: number; why: string }
export interface SortItem { emoji: string; text: string; b: 0 | 1 }
/** What a `grow` step draws: a Moon Garden plant (savings), a price tag (prices rising) or an IOU (money owed). */
export type GrowShow = "garden" | "price" | "owe";
/** The faint comparison row of a `grow` step: a jar (never grows), simple growth (the same extra each year) or another yearly rate. */
export interface GrowVs { kind: "jar" | "simple" | "rate"; rate?: number; label: string }
export type Step =
  | { t: "say"; emoji: string; text: string }
  | { t: "check"; q: string; options: string[]; answer: number; why: string }
  | { t: "sort"; q: string; buckets: [string, string]; items: SortItem[]; why: string }
  /** A worked example: the setup, then 2–4 lines of working the kid reveals one at a time (worked examples first). */
  | { t: "example"; emoji: string; text: string; lines: string[] }
  /** Year-by-year growth the kid grows one tap at a time (concrete → pictures → numbers). Whole numbers, pretend. */
  | { t: "grow"; show: GrowShow; text: string; start: number; rate: number; years: number; label: string; vs?: GrowVs };
export type TrackId = string; // "6-8" | "9-11" in Core; "all" means both
/** `since`: the pack version that added the lesson. Lessons added to a unit later are a bonus for map stars, and show as "New". */
export interface PackLesson { id: string; title: string; emoji: string; track?: TrackId; objectives?: string[]; since?: string; steps: Step[] }
/** `talk`: 1–3 "dinner table talk" prompts for the grown-up (shown only in the grown-up corner). */
export interface PackUnit { id: string; title: string; emoji: string; blurb: string; track?: TrackId; objectives?: string[]; talk?: string[]; lessons: PackLesson[] }
export interface PackTerm { word: string; emoji: string; means: string; example: string; play?: string }
export interface PackWord { word: string; means: string; example: string }
export type NodeKindName = "unit" | "lesson" | "quest" | "game" | "guess" | "review" | "timeMachine" | "practice";
export interface PackNode { id: string; title: string; art: string; kind: NodeKindName; ref?: string }
export interface PackRegion { id: string; name: string; blurb: string; art: string; hue: string; nodes: PackNode[] }
export interface Person { name: string; role: "author" | "teacher" | "markets" | "human" | "creator"; signedOff?: string | null; note?: string }
export type RevealKey = "beatUp" | "beatDown" | "missDown" | "missUp" | "unknown" | "inLine" | "tryAgain";
/** `learn`: after a reveal, the lesson that explains it (e.g. beatDown → "Why a beat can still drop"). */
export interface GuessCourse { unit: string; ladder: string[]; tips: Record<string, string>; reveal: Record<RevealKey, string>; learn?: Partial<Record<RevealKey, string>> }
export type PiggyTipName = "oneBasket" | "fewBaskets" | "manyBaskets" | "newBank" | "longTime" | "bigDrop" | "bigRise" | "peekMany";
/** `garden`: the Moon Garden side's own ladder (growth, baskets, fees). `tips.oneGroup`: every company in one group. */
export interface PiggyCourse { unit: string; ladder: string[]; garden?: string[]; peekLimit: number; tips: Record<PiggyTipName, string> & { oneGroup?: string } }
export interface ReviewConfig { intervals: number[]; retireAt: number; perStop: number; pass: number }
export interface Assessment { id: string; unit: string; title: string; pass: number; items?: string[] }
export interface LessonPack {
  $schema?: string;
  format: number;
  id: string;
  title: string;
  version: string;
  kind: "core" | "extend" | "replace";
  requires: { content: number; app?: string; core?: string };
  ages: { min: number; max: number };
  /** `optional`: a challenge track. Its lessons never gate map stars, unit mastery or boss quizzes. */
  tracks: { id: string; title: string; blurb: string; optional?: boolean }[];
  curators: Person[];
  reviewers: Person[];
  creator: { name: string; fictional: boolean; bio: string; voice: string } | null;
  objectives: { id: string; text: string; standards: string[] }[];
  units: PackUnit[];
  glossary: Record<string, PackTerm>;
  words: PackWord[];
  games: { id: string; unit: string; rounds: number }[];
  guess?: GuessCourse;
  piggy?: PiggyCourse;
  review?: ReviewConfig;
  assessments: Assessment[];
  regions: PackRegion[];
  glyphs: string[];
}

export const NODE_KINDS: NodeKindName[] = ["unit", "lesson", "quest", "game", "guess", "review", "timeMachine", "practice"];
export const GAME_IDS = ["buildCandle", "readDay", "candleMatch", "spotTrend", "drawTrend", "findFloor", "patternDetective", "busyDay", "smoothLine"];
export const QUEST_IDS = ["lemonade", "save", "dividends"];
export const HUES = ["lemon", "orange", "coral", "berry", "grape", "sky", "teal", "mint", "gold", "slate", "choco", "ink"];

// ── Kids rules as data (the Swift validator carries the same lists; the vectors prove they agree) ──
/** Links, handles and hashtags: never anywhere in kid copy, not even a wrong answer. */
export const LINK_PATTERNS = ["https?://", "www\\.", "\\b[a-z0-9-]+\\.(com|net|org|io|app|tv|gg|ly|co|me)\\b", "(^|\\s)@[a-z0-9_]{2,}", "(^|\\s)#[a-z][a-z0-9_]+"];
/** Advice, promises and promotion. Allowed only inside "double quotes" (an example of hype being taught) or as a wrong answer. */
export const BANNED_PHRASES = [
  "buy now", "sell now", "buy it now", "buy today", "sell today", "you should buy", "you should sell", "buy when", "sell when",
  "time to buy", "time to sell", "must buy", "guaranteed", "guarantee", "can't lose", "cannot lose", "risk-free", "risk free", "sure thing",
  "will go up", "will double", "will skyrocket", "to the moon", "price target", "strong buy",
  "follow me", "follow us", "subscribe", "link in bio", "promo code", "discount code", "sponsored", "sponsor", "my channel", "my videos",
  "my store", "merch", "download", "sign up",
];

/** Card fit limits (characters), the same numbers the app's CardFitTests lay out at iPhone SE size. */
export const FIT = { title: 40, say: 110, q: 90, option: 42, why: 100, sortQ: 60, bucket: 14, label: 20, talk: 160 };
/** Bounds for a `grow` step, so every picture fits one card and every number stays kid-sized. */
export const GROW = { minYears: 2, maxYears: 10, maxRate: 30, maxStart: 100000 };

/**
 * The numbers a `grow` step shows, year 0…years, rounded to whole numbers (each year from the exact value,
 * never from a rounded one). compound: growth on growth; simple: the same extra every year; jar: no growth.
 * Mirrored in Swift (MoonClubCore Growth.series) and pinned by the `grow` vectors.
 */
export function growSeries(start: number, rate: number, years: number, kind: "compound" | "simple" | "jar" = "compound"): number[] {
  const r = rate / 100;
  return Array.from({ length: years + 1 }, (_, y) => Math.round(kind === "jar" ? start : kind === "simple" ? start * (1 + r * y) : start * Math.pow(1 + r, y)));
}
/** The main and comparison rows of a grow step. */
export function growRows(s: Extract<Step, { t: "grow" }>): { main: number[]; vs: number[] | null } {
  const main = growSeries(s.start, s.rate, s.years);
  const vs = !s.vs ? null : s.vs.kind === "rate" ? growSeries(s.start, s.vs.rate ?? 0, s.years) : growSeries(s.start, s.rate, s.years, s.vs.kind);
  return { main, vs };
}

export interface PackIssue { code: string; at: string; msg: string }

const EMOJI = /\p{Extended_Pictographic}/u;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const unquoted = (s: string) => s.replace(/"[^"]*"|“[^”]*”/g, " ");
const lower = (s: string) => s.toLowerCase().replace(/’/g, "'");

/** Every kid-visible string in a pack, tagged with where it lives and whether advice phrases are allowed there (distractors). */
export function packTexts(p: LessonPack): { at: string; text: string; distractor: boolean }[] {
  const out: { at: string; text: string; distractor: boolean }[] = [];
  const add = (at: string, text: string | undefined, distractor = false) => { if (text) out.push({ at, text, distractor }); };
  add("title", p.title);
  if (p.creator) { add("creator.bio", p.creator.bio); add("creator.voice", p.creator.voice); }
  for (const t of p.tracks ?? []) { add(`tracks.${t.id}`, t.title); add(`tracks.${t.id}`, t.blurb); }
  for (const u of p.units ?? []) {
    add(`units.${u.id}`, u.title); add(`units.${u.id}`, u.blurb);
    (u.talk ?? []).forEach((t, i) => add(`units.${u.id}.talk.${i}`, t));
    for (const l of u.lessons ?? []) {
      add(`lessons.${l.id}`, l.title);
      (l.steps ?? []).forEach((s, i) => {
        const at = `lessons.${l.id}.${i}`;
        if (s.t === "say") add(at, s.text);
        else if (s.t === "check") { add(at, s.q); add(at, s.why); s.options.forEach((o, k) => add(at, o, k !== s.answer)); }
        else if (s.t === "sort") { add(at, s.q); add(at, s.why); s.buckets.forEach((b) => add(at, b)); s.items.forEach((x) => add(at, x.text)); }
        else if (s.t === "example") { add(at, s.text); s.lines.forEach((x) => add(at, x)); }
        else if (s.t === "grow") { add(at, s.text); add(at, s.label); add(at, s.vs?.label); }
      });
    }
  }
  for (const [k, t] of Object.entries(p.glossary ?? {})) { add(`glossary.${k}`, t.word); add(`glossary.${k}`, t.means); add(`glossary.${k}`, t.example); }
  (p.words ?? []).forEach((w, i) => { add(`words.${i}`, w.word); add(`words.${i}`, w.means); add(`words.${i}`, w.example); });
  if (p.guess) { for (const [k, v] of Object.entries(p.guess.tips)) add(`guess.tips.${k}`, v); for (const [k, v] of Object.entries(p.guess.reveal)) add(`guess.reveal.${k}`, v); }
  if (p.piggy) for (const [k, v] of Object.entries(p.piggy.tips)) add(`piggy.tips.${k}`, v);
  for (const r of p.regions ?? []) { add(`regions.${r.id}`, r.name); add(`regions.${r.id}`, r.blurb); for (const n of r.nodes) add(`regions.${r.id}.${n.id}`, n.title); }
  return out;
}

/** Every emoji (glyph key) a pack draws. */
export function packGlyphs(p: LessonPack): string[] {
  const g = new Set<string>();
  for (const u of p.units ?? []) {
    g.add(u.emoji);
    for (const l of u.lessons ?? []) {
      g.add(l.emoji);
      for (const s of l.steps ?? []) { if (s.t === "say" || s.t === "example") g.add(s.emoji); if (s.t === "sort") s.items.forEach((i) => g.add(i.emoji)); }
    }
  }
  for (const t of Object.values(p.glossary ?? {})) g.add(t.emoji);
  for (const r of p.regions ?? []) { g.add(r.art); r.nodes.forEach((n) => g.add(n.art)); }
  return [...g].sort();
}

/** The prose a step reads out (worked-example lines are working, not prose, so they count only in `all`). */
const prose = (s: Step): string | null => (s.t === "say" || s.t === "example" || s.t === "grow" ? s.text : null);
/** The readability gate for one lesson: say cards ≤ grade 5, the whole lesson (with questions) ≤ 5.5. */
export function lessonGrade(l: PackLesson): { say: number; all: number } {
  const say = l.steps.flatMap((s) => { const t = prose(s); return t ? [t] : []; }).join(" ");
  const all = l.steps.map((s) => (s.t === "check" || s.t === "sort" ? `${s.q} ${s.why}` : s.t === "example" ? `${s.text} ${s.lines.join(" ")}` : s.text)).join(" ");
  return { say: say ? fkGrade(say) : 0, all: fkGrade(all) };
}

/**
 * Validates a pack. `base` is the Core pack an extend/replace pack builds on (ids must not collide with it,
 * and its regions may point at Core units). Returns every issue; an empty list means the pack is good.
 */
export function validatePack(p: LessonPack, base?: LessonPack): PackIssue[] {
  const issues: PackIssue[] = [];
  const bad = (code: string, at: string, msg: string) => issues.push({ code, at, msg });
  if (!p || typeof p !== "object") return [{ code: "shape", at: "", msg: "not an object" }];
  if (p.format !== PACK_FORMAT) bad("format", "format", `format ${p.format} is not ${PACK_FORMAT}`);
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(p.id ?? "")) bad("id", "id", "id must be 2–41 lowercase letters, digits or dashes");
  if (!/^\d+\.\d+\.\d+$/.test(p.version ?? "")) bad("version", "version", "version must be semver x.y.z");
  if (!["core", "extend", "replace"].includes(p.kind)) bad("kind", "kind", `unknown kind ${p.kind}`);
  if (!p.requires || typeof p.requires.content !== "number" || p.requires.content > CONTENT_VERSION) bad("requires", "requires.content", `needs content version ${p.requires?.content}, this build has ${CONTENT_VERSION}`);
  if (!p.ages || p.ages.min < 4 || p.ages.max > 13 || p.ages.min > p.ages.max) bad("ages", "ages", "ages must sit inside 4–13");
  const units = p.units ?? [];
  if (!units.length) bad("units", "units", "a pack needs at least one unit");
  const trackIds = new Set([...(p.tracks ?? []).map((t) => t.id), "all", ...(base?.tracks ?? []).map((t) => t.id)]);
  const objIds = new Set([...(p.objectives ?? []).map((o) => o.id), ...(base?.objectives ?? []).map((o) => o.id)]);

  // ids: unique inside the pack, and (for extend packs) never shadowing Core
  const baseUnits = new Set((p.kind === "extend" ? base?.units ?? [] : []).map((u) => u.id));
  const baseLessons = new Set((p.kind === "extend" ? base?.units ?? [] : []).flatMap((u) => u.lessons.map((l) => l.id)));
  const seenU = new Set<string>(), seenL = new Set<string>();
  for (const u of units) {
    if (seenU.has(u.id)) bad("unit.dup", `units.${u.id}`, "duplicate unit id");
    if (baseUnits.has(u.id)) bad("collide", `units.${u.id}`, "unit id already used by Core");
    seenU.add(u.id);
    if (u.track && !trackIds.has(u.track)) bad("track", `units.${u.id}`, `unknown track ${u.track}`);
    if (!(u.lessons ?? []).length) bad("unit.empty", `units.${u.id}`, "unit has no lessons");
    if (u.talk && (u.talk.length < 1 || u.talk.length > 3 || u.talk.some((t) => !t.trim() || t.length > FIT.talk))) bad("talk", `units.${u.id}`, `1–3 dinner-table prompts, each at most ${FIT.talk} characters`);
    for (const l of u.lessons ?? []) {
      const at = `lessons.${l.id}`;
      if (seenL.has(l.id)) bad("lesson.dup", at, "duplicate lesson id");
      if (baseLessons.has(l.id)) bad("collide", at, "lesson id already used by Core");
      seenL.add(l.id);
      if (l.track && !trackIds.has(l.track)) bad("track", at, `unknown track ${l.track}`);
      for (const o of l.objectives ?? []) if (!objIds.has(o)) bad("objective.ref", at, `unknown objective ${o}`);
      if (l.since != null && !/^\d+\.\d+\.\d+$/.test(l.since)) bad("since", at, "since must be a pack version x.y.z");
      const steps = l.steps ?? [];
      // Fit: the Moon Club app shows every step on one card with no scrolling (iPhone SE at large text).
      if (l.title.length > FIT.title) bad("fit", at, `title longer than ${FIT.title} characters`);
      steps.forEach((s, i) => {
        const long = s.t === "say" ? s.text.length > FIT.say
          : s.t === "check" ? s.q.length > FIT.q || s.options.length > 3 || s.options.some((o) => o.length > FIT.option) || s.why.length > FIT.why
          : s.t === "example" ? s.text.length > FIT.say || s.lines.length > 4 || s.lines.some((x) => x.length > FIT.option)
          : s.t === "grow" ? s.text.length > FIT.say || s.label.length > FIT.label || (s.vs?.label.length ?? 0) > FIT.label
          : s.t === "sort" ? s.q.length > FIT.sortQ || s.items.length > 6 || s.items.some((x) => x.text.length > FIT.option) || s.buckets.some((b) => b.length > FIT.bucket) : false;
        if (long) bad("fit", `${at}.${i}`, "too long to fit one card");
      });
      if (steps.length < 3 || steps.length > 7) bad("lesson.steps", at, "a lesson has 3–7 steps");
      if (!steps.some((s) => s.t === "check" || s.t === "sort")) bad("lesson.steps", at, "a lesson needs a check or a sort");
      steps.forEach((s, i) => {
        const sat = `${at}.${i}`;
        if (s.t === "say") { if (words(s.text) > 22) bad("say.long", sat, "a say card is at most 22 words"); }
        else if (s.t === "check") {
          if (s.options.length < 2 || s.options.length > 4) bad("check.options", sat, "2–4 options");
          if (!(Number.isInteger(s.answer) && s.answer >= 0 && s.answer < s.options.length)) bad("check.answer", sat, "answer out of range");
          if (new Set(s.options).size !== s.options.length) bad("check.options", sat, "options repeat");
        } else if (s.t === "sort") {
          if (s.buckets.length !== 2) bad("sort.buckets", sat, "a sort has 2 buckets");
          if (s.items.length < 4 || new Set(s.items.map((x) => x.b)).size !== 2 || s.items.some((x) => x.b !== 0 && x.b !== 1)) bad("sort.items", sat, "4+ items across both buckets");
        } else if (s.t === "example") {
          if (words(s.text) > 22) bad("say.long", sat, "an example's setup is at most 22 words");
          if (!Array.isArray(s.lines) || s.lines.length < 2 || s.lines.length > 4 || s.lines.some((x) => !x.trim())) bad("example.lines", sat, "a worked example has 2–4 lines");
        } else if (s.t === "grow") {
          if (words(s.text) > 22) bad("say.long", sat, "a grow card is at most 22 words");
          const okNum = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v > lo && v <= hi;
          if (!["garden", "price", "owe"].includes(s.show)) bad("grow", sat, `unknown picture ${s.show}`);
          if (!(Number.isInteger(s.years) && s.years >= GROW.minYears && s.years <= GROW.maxYears)) bad("grow", sat, `years must be ${GROW.minYears}–${GROW.maxYears}`);
          if (!okNum(s.rate, 0, GROW.maxRate)) bad("grow", sat, `rate must be above 0 and at most ${GROW.maxRate}`);
          if (!(Number.isInteger(s.start) && s.start >= 1 && s.start <= GROW.maxStart)) bad("grow", sat, "start must be a whole number 1–100000");
          if (!s.label?.trim()) bad("grow", sat, "a grow step names its row");
          if (s.vs && (!["jar", "simple", "rate"].includes(s.vs.kind) || !s.vs.label?.trim() || (s.vs.kind === "rate" && (!okNum(s.vs.rate, 0, GROW.maxRate) || s.vs.rate === s.rate)))) bad("grow", sat, "the comparison row is a jar, simple growth or a different rate, with a label");
        } else bad("step.type", sat, `unknown step type ${(s as { t: string }).t}`);
      });
      if (steps.length) {
        const g = lessonGrade(l);
        if (g.say > 5 || g.all > 5.5) bad("readability", at, `reading grade ${g.say.toFixed(1)} / ${g.all.toFixed(1)} is above 5 / 5.5`);
      }
    }
  }
  // glossary + word of the day
  const baseTerms = new Set(p.kind === "extend" ? Object.keys(base?.glossary ?? {}) : []);
  for (const [k, t] of Object.entries(p.glossary ?? {})) {
    if (!/^[a-z][a-z0-9-]*$/.test(k)) bad("glossary.key", `glossary.${k}`, "glossary keys are lowercase");
    if (baseTerms.has(k)) bad("collide", `glossary.${k}`, "word already in Core");
    if (fkGrade(`${t.means} ${t.example}`) > 5) bad("readability", `glossary.${k}`, "glossary card reads above grade 5");
  }
  const termText = [...Object.values(p.glossary ?? {}).map((t) => `${t.means} ${t.example}`), ...(p.words ?? []).map((w) => `${w.means} ${w.example}`)].join(" ");
  if (termText && fkGrade(termText) > 5) bad("readability", "glossary", "glossary + words read above grade 5");

  // courses
  const allLessons = new Set([...seenL, ...(base?.units ?? []).flatMap((u) => u.lessons.map((l) => l.id))]);
  const allUnits = new Set([...seenU, ...(base?.units ?? []).map((u) => u.id)]);
  if (p.kind === "core" && (!p.guess || !p.piggy || !p.review)) bad("course", "guess", "Core needs guess, piggy and review");
  for (const [name, c] of [["guess", p.guess], ["piggy", p.piggy]] as const) {
    if (!c) continue;
    if (!allUnits.has(c.unit)) bad("course", `${name}.unit`, `unknown unit ${c.unit}`);
    for (const id of c.ladder) if (!allLessons.has(id)) bad("course", `${name}.ladder`, `unknown lesson ${id}`);
  }
  if (p.guess) for (const id of p.guess.ladder) if (!p.guess.tips[id]) bad("course", "guess.tips", `no tip for ${id}`);
  if (p.guess?.learn) for (const [k, id] of Object.entries(p.guess.learn)) if (!allLessons.has(id ?? "")) bad("course", `guess.learn.${k}`, `unknown lesson ${id}`);
  if (p.piggy?.garden) for (const id of p.piggy.garden) if (!allLessons.has(id)) bad("course", "piggy.garden", `unknown lesson ${id}`);
  if (p.review && (p.review.perStop < 1 || p.review.retireAt !== p.review.intervals.length || p.review.pass <= 0 || p.review.pass > 1)) bad("course", "review", "review: intervals one per box, retireAt = intervals.length, pass in (0,1]");
  for (const a of p.assessments ?? []) if (!allUnits.has(a.unit)) bad("assessment", `assessments.${a.id}`, `unknown unit ${a.unit}`);

  // regions (the map)
  if ((p.kind === "core" || p.kind === "replace") && !(p.regions ?? []).length) bad("regions", "regions", "Core and replace packs draw the map");
  const baseRegions = new Set((p.kind === "extend" ? base?.regions ?? [] : []).map((r) => r.id));
  const baseNodes = new Set((p.kind === "extend" ? base?.regions ?? [] : []).flatMap((r) => r.nodes.map((n) => n.id)));
  const seenN = new Set<string>();
  for (const r of p.regions ?? []) {
    if (baseRegions.has(r.id)) bad("collide", `regions.${r.id}`, "region id already used by Core");
    if (!HUES.includes(r.hue)) bad("region.hue", `regions.${r.id}`, `unknown hue ${r.hue}`);
    if (r.nodes.length < 2) bad("region.nodes", `regions.${r.id}`, "a region needs 2+ stops");
    const last = r.nodes[r.nodes.length - 1];
    if (!last || (last.kind !== "review" && last.kind !== "timeMachine")) bad("region.boss", `regions.${r.id}`, "a region ends with a boss (review or timeMachine)");
    for (const n of r.nodes) {
      const at = `regions.${r.id}.${n.id}`;
      if (seenN.has(n.id) || baseNodes.has(n.id)) bad("node.dup", at, "duplicate map stop id");
      seenN.add(n.id);
      if (!NODE_KINDS.includes(n.kind)) { bad("node.kind", at, `unknown kind ${n.kind}`); continue; }
      const ok =
        n.kind === "unit" ? allUnits.has(n.ref ?? "") :
        n.kind === "lesson" ? allLessons.has(n.ref ?? "") :
        n.kind === "quest" ? QUEST_IDS.includes(n.ref ?? "") :
        n.kind === "game" ? GAME_IDS.includes(n.ref ?? "") :
        n.kind === "review" ? (p.regions ?? []).some((x) => x.id === n.ref) :
        n.kind === "timeMachine" ? /^[A-Z.]{1,6}$/.test(n.ref ?? "") : true;
      if (!ok) bad("node.ref", at, `${n.kind} points at ${n.ref ?? "nothing"}`);
    }
  }

  // kids rules: glyphs, links, advice / promotion
  const declared = new Set(p.glyphs ?? []);
  for (const gl of packGlyphs(p)) if (!declared.has(gl)) bad("glyphs", "glyphs", `${gl} is drawn but not declared`);
  for (const { at, text, distractor } of packTexts(p)) {
    const t = lower(text);
    if (LINK_PATTERNS.some((re) => new RegExp(re, "i").test(t))) bad("link", at, `looks like a link or handle: ${text}`);
    if (!distractor) { const u = lower(unquoted(text)); const hit = BANNED_PHRASES.find((ph) => u.includes(ph)); if (hit) bad("banned", at, `"${hit}" reads as advice or promotion`); }
    if (EMOJI.test(text) && !at.startsWith("title")) bad("emoji.text", at, "emoji belong in glyph fields, not in words");
  }

  // who signed it off
  if (p.kind !== "core") {
    if (!p.creator) bad("creator", "creator", "guest and replace packs name their creator");
    for (const role of ["teacher", "markets"] as const) if (!(p.reviewers ?? []).some((r) => r.role === role && r.signedOff)) bad("review", "reviewers", `needs a ${role} sign-off`);
  }
  return issues;
}

/** A pack may be offered on the remote channel only when the experts AND a human have signed it off. */
export function channelReady(p: LessonPack): boolean {
  return validatePack(p).filter((i) => i.code !== "collide").length === 0 && ["teacher", "markets", "human"].every((role) => p.reviewers.some((r) => r.role === role && r.signedOff));
}

/** Core + enabled packs → the one curriculum a kid sees. Replace packs swap the course; extend packs add to it. */
export function composePacks(core: LessonPack, packs: LessonPack[]): { units: PackUnit[]; glossary: Record<string, PackTerm>; words: PackWord[]; regions: PackRegion[]; assessments: Assessment[]; glyphs: string[] } {
  let units = core.units, glossary = { ...core.glossary }, words = core.words, regions = core.regions, assessments = core.assessments;
  const glyphs = new Set(core.glyphs);
  const rep = packs.find((p) => p.kind === "replace");
  if (rep) { units = rep.units; glossary = { ...rep.glossary }; words = rep.words.length ? rep.words : core.words; regions = rep.regions; assessments = rep.assessments; rep.glyphs.forEach((g) => glyphs.add(g)); }
  for (const p of packs.filter((x) => x.kind === "extend")) {
    units = [...units, ...p.units];
    glossary = { ...glossary, ...p.glossary };
    words = [...words, ...p.words];
    regions = [...regions, ...p.regions];
    assessments = [...assessments, ...p.assessments];
    p.glyphs.forEach((g) => glyphs.add(g));
  }
  return { units, glossary, words, regions, assessments, glyphs: [...glyphs].sort() };
}
