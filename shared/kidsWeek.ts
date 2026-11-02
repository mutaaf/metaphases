// Metaphases Kids — the weekly recap (0027) and Family League codes (0028). Pure, unit-tested.
// Privacy model: both are built ONLY from this browser's kids progress. A recap image carries
// only small counts and one percent; a league code carries only company, date and pick — never a
// name, free text or a price.
import { KID_COMPANIES, LEVELS, type Guess, type Pick } from "./kids";

// ── Weekly recap ────────────────────────────────────────────────────────────────────────────
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const add = (s: string, n: number) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
/** 0 = Monday … 6 = Sunday. */
export const weekday = (s: string) => (parse(s).getUTCDay() + 6) % 7;
export const mondayOf = (s: string) => add(s, -weekday(s));

export interface RecapInput {
  guesses: Guess[];
  lessonDates?: Record<string, string>;
  piggy: { started: string; history: Record<string, number> } | null;
  points: number;
  level: number;
}
export interface Recap {
  label: "This week" | "Last week";
  from: string;
  to: string;
  guesses: number;
  right: number;
  waiting: number;
  lessons: number;
  /** % change of the pretend piggy bank across the week, 1 decimal; null without two readings. */
  piggyPct: number | null;
  level: number;
  points: number;
  active: boolean;
}

/** Which week to recap today: Fri–Sun → this week; Monday → last week (the "first visit after"). Else none. */
export function recapWeek(today: string): { from: string; to: string; label: Recap["label"] } | null {
  const wd = weekday(today);
  if (wd >= 4) return { from: mondayOf(today), to: today, label: "This week" };
  if (wd === 0) { const from = add(today, -7); return { from, to: add(from, 6), label: "Last week" }; }
  return null;
}

export function buildRecap(st: RecapInput, today: string): Recap | null {
  const w = recapWeek(today);
  if (!w) return null;
  const inWeek = (d: string | undefined) => !!d && d >= w.from && d <= w.to;
  const gs = st.guesses.filter((g) => inWeek(g.at));
  const lessons = Object.values(st.lessonDates ?? {}).filter(inWeek).length;
  let piggyPct: number | null = null;
  if (st.piggy) {
    const h = Object.entries(st.piggy.history).filter(([d]) => d <= w.to).sort(([a], [b]) => a.localeCompare(b));
    const before = h.filter(([d]) => d <= w.from);
    const start = before.length ? before[before.length - 1] : h[0];
    const end = h[h.length - 1];
    if (start && end && start[0] !== end[0] && start[1] > 0) piggyPct = Math.round((end[1] / start[1] - 1) * 1000) / 10;
  }
  const right = gs.filter((g) => g.result === "right").length;
  return {
    ...w, guesses: gs.length, right, waiting: gs.filter((g) => !g.result).length, lessons, piggyPct,
    level: Math.max(0, Math.min(LEVELS.length - 1, st.level)), points: st.points,
    active: gs.length > 0 || lessons > 0 || piggyPct != null,
  };
}

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
/** Recap sentences in kid words (kept at reading grade ≤ 5 by a unit test). */
export function recapLines(r: Recap): string[] {
  const out: string[] = [];
  if (r.guesses) {
    out.push(`You made ${plural(r.guesses, "guess", "guesses")}.`);
    if (r.right) out.push(`You got ${r.right} right! 🎉`);
    else if (r.waiting === r.guesses) out.push("Now we wait for the report cards.");
    else out.push("None were right yet. Even experts miss a lot!");
  }
  if (r.lessons) out.push(`You finished ${plural(r.lessons, "lesson")} at Moon School.`);
  if (r.piggyPct != null) {
    if (Math.abs(r.piggyPct) < 0.1) out.push("Your pretend piggy bank stayed the same.");
    else out.push(`Your pretend piggy bank went ${r.piggyPct > 0 ? "up" : "down"} ${Math.abs(r.piggyPct).toFixed(1)}%.`);
  }
  out.push(`You are a ${LEVELS[r.level].name} now, with ${r.points} points.`);
  return out;
}

// The share image takes only these small numbers. Anything else is dropped by the worker.
const clampInt = (v: unknown, lo: number, hi: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };
export interface RecapImage { g: number; r: number; l: number; p: number | null; lv: number }
export function recapQuery(r: Recap): string {
  const q = new URLSearchParams({ g: String(r.guesses), r: String(r.right), l: String(r.lessons), lv: String(r.level) });
  if (r.piggyPct != null) q.set("p", r.piggyPct.toFixed(1));
  return q.toString();
}
export function parseRecapQuery(q: URLSearchParams): RecapImage {
  const g = clampInt(q.get("g"), 0, 99);
  const pRaw = q.get("p");
  const pNum = pRaw == null || pRaw === "" ? NaN : Number(pRaw);
  return {
    g, r: Math.min(g, clampInt(q.get("r"), 0, 99)), l: clampInt(q.get("l"), 0, 20),
    p: Number.isFinite(pNum) ? Math.round(Math.max(-99, Math.min(999, pNum)) * 10) / 10 : null,
    lv: clampInt(q.get("lv"), 0, LEVELS.length - 1),
  };
}
export const recapImageKey = (x: RecapImage) => `${x.g}.${x.r}.${x.l}.${x.p ?? "n"}.${x.lv}`;

// ── Family League codes ─────────────────────────────────────────────────────────────────────
/** Players pick an emoji instead of a name. Order is part of the code format: append only. */
export const PLAYERS = ["🌙", "🚀", "🦊", "🐢", "🦄", "🐼", "⭐", "🐙"] as const;
export const PLAYER_NAMES = ["Moon", "Rocket", "Fox", "Turtle", "Unicorn", "Panda", "Star", "Octopus"] as const;
export interface LeagueGuess { s: string; d: string; pick: Pick; price?: "up" | "down" }
export interface LeaguePlayer { emoji: number; guesses: LeagueGuess[] }

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford: no I, L, O or U
const EPOCH = "2026-01-01";
const MAX_DAY = 4095;
export const MAX_CODE_GUESSES = 20;
const PREFIX = "MOON";
const VERSION = "1";

const dayOf = (d: string) => Math.round((parse(d).getTime() - parse(EPOCH).getTime()) / 86400000);
function checksum(body: string): string {
  let s = 7;
  for (let i = 0; i < body.length; i++) s = (s * 31 + B32.indexOf(body[i]) + i) % 1024;
  return B32[s % 32];
}

/** "MOON-1A2B-…": version, player, 4 characters per guess, checksum. Grouped for reading aloud. */
export function encodeLeague(p: LeaguePlayer): string {
  const sorted = [...p.guesses].sort((a, b) => b.d.localeCompare(a.d));
  let body = VERSION + B32[p.emoji & 7];
  let n = 0;
  for (const g of sorted) {
    const si = KID_COMPANIES.findIndex((c) => c.s === g.s);
    const day = dayOf(g.d);
    if (si < 0 || si > 31 || day < 0 || day > MAX_DAY) continue;
    const bits = (si << 15) | (day << 3) | ((g.pick === "miss" ? 1 : 0) << 2) | (g.price === "up" ? 1 : g.price === "down" ? 2 : 0);
    body += [15, 10, 5, 0].map((sh) => B32[(bits >> sh) & 31]).join("");
    if (++n >= MAX_CODE_GUESSES) break;
  }
  body += checksum(body);
  return PREFIX + "-" + (body.match(/.{1,4}/g) ?? []).join("-");
}

export type DecodeResult = { ok: true; player: LeaguePlayer } | { ok: false; why: string };
export function decodeLeague(raw: string): DecodeResult {
  const clean = raw.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
  if (!clean.startsWith(PREFIX.replace(/O/g, "0"))) return { ok: false, why: "That doesn't look like a Moon Club code. It starts with MOON." };
  const body = clean.slice(PREFIX.length);
  if (body.length < 3 || (body.length - 3) % 4 !== 0) return { ok: false, why: "That code is too short or too long. Check every letter." };
  if (body[0] !== VERSION) return { ok: false, why: "That code is from a different version of the club." };
  if ([...body].some((c) => B32.indexOf(c) < 0)) return { ok: false, why: "That code has a letter we don't use." };
  if (checksum(body.slice(0, -1)) !== body[body.length - 1]) return { ok: false, why: "One letter looks wrong. Check the code again." };
  const emoji = B32.indexOf(body[1]);
  if (emoji >= PLAYERS.length) return { ok: false, why: "That code has an unknown player." };
  const guesses: LeagueGuess[] = [];
  for (let i = 2; i + 4 <= body.length - 1; i += 4) {
    const bits = [...body.slice(i, i + 4)].reduce((a, c) => (a << 5) | B32.indexOf(c), 0);
    const si = bits >> 15, day = (bits >> 3) & 0xfff, miss = (bits >> 2) & 1, pr = bits & 3;
    const co = KID_COMPANIES[si];
    if (!co || pr === 3) return { ok: false, why: "One letter looks wrong. Check the code again." };
    guesses.push({ s: co.s, d: add(EPOCH, day), pick: miss ? "miss" : "beat", ...(pr ? { price: pr === 1 ? "up" as const : "down" as const } : {}) });
  }
  return { ok: true, player: { emoji, guesses } };
}

export interface LeagueRow { key: string; s: string; d: string; picks: (LeagueGuess | null)[] }
/** One row per report card anyone guessed, newest first, at most `limit`. */
export function leagueRows(players: LeaguePlayer[], limit = 10): LeagueRow[] {
  const map = new Map<string, LeagueRow>();
  players.forEach((p, i) => {
    for (const g of p.guesses) {
      const key = `${g.s}:${g.d}`;
      if (!map.has(key)) map.set(key, { key, s: g.s, d: g.d, picks: players.map(() => null) });
      map.get(key)!.picks[i] = g;
    }
  });
  return [...map.values()].sort((a, b) => b.d.localeCompare(a.d) || a.s.localeCompare(b.s)).slice(0, limit);
}
