import { HOLIDAYS } from "./market";
import { epsIn } from "./currency";
const HOLIDAY_SET: ReadonlySet<string> = new Set(HOLIDAYS.map((h) => h.date));

/**
 * 0038: never skip a quarter that hasn't reported.
 *
 * Finnhub's `symbol=` query returns future dates only, so once a projected date passes without a result
 * (AXON's Nov 2), that quarter vanishes and the sheet's `next` jumps to the following quarter (Feb 22).
 * Nasdaq's report history tells us the company's cadence: a quarterly reporter whose next listed date is
 * more than ~140 days after its last report is missing a quarter in between.
 */

const DAY = 86400000;
export const daysApart = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY);

/** Nasdaq's `dateReported` ("8/21/2026") → "2026-08-21"; null if it isn't a date. */
export function nqDate(s: unknown): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? "").trim());
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

/** A quarterly reporter's reports are ≤ this many days apart (Q4 reports can run to ~130). */
const QUARTERLY_MAX = 115;
/** More than this between the last report and the next listed date means a quarter is missing (a late Q4 runs ~145; a true skip ~180+). */
const SKIP_GAP = 160;

export interface NextRow { date: string; quarter: number; year: number; source?: string }

/**
 * The fiscal quarter that should come before `next` but has no report yet, or null when nothing is skipped.
 * `reported`: Nasdaq report dates, newest first. A company-confirmed `next` (override) is trusted as is.
 */
export function skippedQuarter(next: NextRow | undefined | null, reported: string[]): { quarter: number; year: number } | null {
  if (!next || next.source || reported.length < 2) return null;
  const [last, prev] = reported;
  if (daysApart(prev, last) > QUARTERLY_MAX || daysApart(prev, last) < 30) return null; // semiannual or odd cadence: can't tell
  if (daysApart(last, next.date) <= SKIP_GAP) return null;
  return next.quarter > 1 ? { quarter: next.quarter - 1, year: next.year } : { quarter: 4, year: next.year - 1 };
}

/** Calendar days (about 15 trading days) we look back through the cached calendar for the quarter's passed projected date. */
export const LOOKBACK_DAYS = 21;

/** Weekdays strictly before `today`, newest first, not earlier than `notBefore`, for the lookback. */
export function lookbackDays(today: string, notBefore: string, n = LOOKBACK_DAYS): string[] {
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(today + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - i);
    const s = d.toISOString().slice(0, 10);
    if (s < notBefore) break;
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(s);
  }
  return out;
}

/** True when `next` names a real upcoming date (not a closed-day projection or an overdue quarter). */
export const isDated = (n: { closed?: string; overdue?: true; status?: string; date: string } | null | undefined): n is { closed?: undefined; overdue?: undefined; status?: undefined; date: string } =>
  !!n && !n.closed && !n.overdue && !n.status && !!n.date;

/** Trading days strictly after `day` and up to `today` (weekdays that aren't NYSE holidays). */
export function tradingDaysSince(day: string, today: string, holidays: ReadonlySet<string> = HOLIDAY_SET): number {
  let n = 0;
  for (let d = day; ;) {
    const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + 1); d = t.toISOString().slice(0, 10);
    if (d > today) return n;
    const wd = t.getUTCDay();
    if (wd !== 0 && wd !== 6 && !holidays.has(d)) n++;
  }
}

/**
 * A calendar row whose day has passed by more than one trading day with no figures at all: the report
 * didn't come out that day (or the feed missed it). Never tinted as a beat or miss; labelled instead.
 */
export const noResultYet = (e: { d: string; eA: number | null; rA: number | null }, today: string) =>
  e.eA == null && e.rA == null && e.d < today && tradingDaysSince(e.d, today) >= 2;

const SESSION_WORDS: Record<string, string> = { bmo: "before the open", amc: "after the close", dmh: "during market hours", "": "" };

/** The `/t/:sym` share title: never a date beyond an unreported quarter (0038) or on a closed day (0045). */
export function tickerShareTitle(sym: string, name: string, next: { date: string; session: string; quarter: number; closed?: string; overdue?: true; status?: string } | null | undefined, just?: { quarter: number; epsE: number | null; epsA: number | null; currency?: string } | null): string {
  // 0039: a report that's out leads the title, whatever comes next.
  if (just) return just.epsA == null ? `${sym} reported Q${just.quarter} · Metaphases`
    : `${sym} reported Q${just.quarter}: ${epsIn(just.epsA, just.currency)} a share${just.epsE != null ? ` vs ${epsIn(just.epsE, just.currency)} expected` : ""} · Metaphases`;
  if (next?.status === "results-pending") return `${sym}'s Q${next.quarter} results expected: none in yet · Metaphases`;
  if (isDated(next)) {
    const when = new Date(next.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    return `${sym} reports ${when} ${SESSION_WORDS[(next as { session: string }).session] ?? ""} · Metaphases`.replace("  ", " ");
  }
  if (next?.overdue) return `${sym}'s Q${next.quarter} report: date not confirmed yet · Metaphases`;
  if (next?.closed) return `${sym} earnings: date not confirmed yet · Metaphases`;
  return `${name} (${sym}) earnings · Metaphases`;
}
