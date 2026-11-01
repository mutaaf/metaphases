// The week's brief: a 30-second read of who reports and what else moves markets this week.
// Pure and deterministic — built from data the calendar already loaded, no extra API calls.
import type { EarningsEvent, MacroResponse, MacroEvent, Session } from "../../shared/types";
import { addDays } from "./dates";
import { HOLIDAYS } from "../../shared/market";
import type { Co } from "./data";

export interface BriefReporter { s: string; name: string; d: string; h: Session; mc: number }
export interface Brief {
  week: string[]; // Mon…Fri
  total: number; // every company reporting this week (share classes count once)
  missingDays: string[]; // weekdays whose earnings didn't load (calendar warnings)
  macroComplete: boolean; // false when the economic calendar can't vouch for this week
  sp: number; // S&P 500 members reporting
  largest: { reporting: string[]; of: number }; // which of the 10 largest S&P 500 companies report
  top: BriefReporter[]; // up to 5 biggest by market cap
  macro: MacroEvent[];
  holidays: { date: string; name: string }[];
  mood: { score: number; label: string; change5d: number | null } | null;
}

/** Which displayed week the brief covers: the one holding the anchor day, or the next one after it
 *  (a weekend anchor rolls forward, like the month grid), else the last week on screen. */
export function briefWeek(weeks: string[][], anchor: string): string[] {
  return weeks.find((w) => w[4] >= anchor) ?? weeks[weeks.length - 1];
}

/** The N largest S&P 500 companies, one row per company (GOOG and GOOGL count once). */
export function largestSP(universe: Record<string, Co>, n = 10): string[][] {
  const byName = new Map<string, { mc: number; syms: string[] }>();
  for (const [s, c] of Object.entries(universe)) {
    if (!c.sp) continue;
    const g = byName.get(c.n);
    if (g) { g.syms.push(s); g.mc = Math.max(g.mc, c.mc); } else byName.set(c.n, { mc: c.mc, syms: [s] });
  }
  return [...byName.values()].sort((a, b) => b.mc - a.mc).slice(0, n).map((g) => g.syms.sort());
}

/** The worker publishes FRED release dates from 40 days back to 150 days ahead (worker/index.ts). */
export const MACRO_WINDOW = { back: 40, ahead: 150 };

export function buildBrief(
  week: string[], events: EarningsEvent[], calWarnings: string[], macro: MacroResponse | null, universe: Record<string, Co>, today: string,
): Brief {
  const from = week[0], to = week[week.length - 1];
  const inWeek = (d: string) => d >= from && d <= to;
  const evs = events.filter((e) => inWeek(e.d));
  const syms = new Set(evs.map((e) => e.s));
  const companies = new Set(evs.map((e) => universe[e.s]?.n ?? e.s));
  const missingDays = [...new Set(calWarnings.flatMap((w) => w.match(/\d{4}-\d{2}-\d{2}/g) ?? []))].filter((d) => inWeek(d) && !HOLIDAYS.some((x) => x.date === d)).sort();
  const macroComplete = !!macro && macro.warnings.length === 0 && from >= addDays(today, -MACRO_WINDOW.back) && to <= addDays(today, MACRO_WINDOW.ahead);

  // One row per company: share classes (GOOG/GOOGL) collapse to the first by market cap.
  const seen = new Set<string>();
  const ranked = evs
    .filter((e) => universe[e.s])
    .sort((a, b) => universe[b.s].mc - universe[a.s].mc || a.s.localeCompare(b.s))
    .filter((e) => { const n = universe[e.s].n; return seen.has(n) ? false : (seen.add(n), true); });
  const top = ranked.slice(0, 5).map((e) => ({ s: e.s, name: universe[e.s].n, d: e.d, h: e.h, mc: universe[e.s].mc }));

  const spNames = new Set(evs.filter((e) => universe[e.s]?.sp).map((e) => universe[e.s].n));
  const big = largestSP(universe, 10);
  const reporting = big.filter((g) => g.some((s) => syms.has(s))).map((g) => g.find((s) => syms.has(s))!);

  const h = macro?.mood?.history ?? [];
  const mood = macro?.mood
    ? { score: macro.mood.score, label: macro.mood.label, change5d: h.length >= 6 ? Math.round(h[h.length - 1] - h[h.length - 6]) : null }
    : null;

  return {
    week,
    total: companies.size,
    missingDays,
    macroComplete,
    sp: spNames.size,
    largest: { reporting, of: big.length },
    top,
    macro: (macro?.events ?? []).filter((e) => inWeek(e.date)).sort((a, b) => a.date.localeCompare(b.date)),
    holidays: HOLIDAYS.filter((x) => inWeek(x.date)),
    mood,
  };
}
