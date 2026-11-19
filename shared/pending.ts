import { HOLIDAYS } from "./market";
import { epsIn } from "./currency";
import { vsExpected } from "./compare";
import { sessionPassed } from "./reported";
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

/**
 * 0078: the quarter of a passed feed row when the feed lists no future row at all (Finnhub's `symbol=` returns
 * future dates only, so after a projected day passes there may be no `next` to find a skipped quarter from).
 * `row`: the newest cached calendar row for the company; `reported`: Nasdaq report dates, newest first. Only a
 * quarterly reporter's row that comes after its newest report (not that report itself) counts.
 */
export function passedQuarter(row: { d: string; q: number; y: number; o?: string } | null | undefined, reported: string[]): { quarter: number; year: number } | null {
  if (!row || row.o || reported.length < 2) return null;
  const [last, prev] = reported;
  if (daysApart(prev, last) > QUARTERLY_MAX || daysApart(prev, last) < 30) return null;
  if (daysApart(last, row.d) < 30) return null; // that's the report Nasdaq already has
  return { quarter: row.q, year: row.y };
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

/**
 * 0040: a row whose session is over but whose figures aren't in yet: today once its usual release time has
 * passed in New York (`sessionPassed`, the same rule as the sheet's "results expected, none in yet"), or an
 * earlier day still inside `noResultYet`'s grace. It must never read like an upcoming report. Depends on the
 * clock (`nowMin` = minutes after NY midnight), so callers compute it; it's never stored in a day cache.
 * Holiday (`c`) and passed-projection (`od`) rows are "Date not confirmed" instead, and a row whose day or
 * session Nasdaq disputes (`x: "differs"`) keeps its "Nasdaq: …" mark: its time may not have come at all.
 */
export const figuresPending = (e: { d: string; h: string; eA: number | null; rA: number | null; c?: string; od?: true; x?: string }, today: string, nowMin: number) =>
  e.eA == null && e.rA == null && !e.c && !e.od && e.x !== "differs" && e.d <= today && !noResultYet(e, today) && (e.d < today || sessionPassed(e.h, nowMin));

const SESSION_WORDS: Record<string, string> = { bmo: "before the open", amc: "after the close", dmh: "during market hours", "": "" };

/** The `/t/:sym` share title: never a date beyond an unreported quarter (0038) or on a closed day (0045). */
export function tickerShareTitle(sym: string, name: string, next: { date: string; session: string; quarter: number; hs?: "n" | "h"; closed?: string; overdue?: true; status?: string; nasdaq?: { date: string; session: string }; projected?: true } | null | undefined, just?: { quarter: number; epsE: number | null; epsA: number | null; currency?: string; nE?: number; nA?: number | null; reit?: true } | null): string {
  // 0039: a report that's out leads the title, whatever comes next.
  if (just) return just.epsA == null ? `${sym} reported Q${just.quarter} · Metaphases`
    : `${sym} reported Q${just.quarter}: ${epsIn(just.epsA, just.currency)} a share${just.epsE != null ? vsExpected(just, (v) => epsIn(v, just.currency)) : ""} · Metaphases`;
  if (next?.status === "results-pending") return `${sym}'s Q${next.quarter} results expected: none in yet · Metaphases`;
  // 0083: the feed's day passed with no figures, and Nasdaq's calendar couldn't be compared yet: no claim either way.
  if (next?.status === "checking") return `${sym}'s Q${next.quarter} report: no figures yet, date being checked · Metaphases`;
  if (isDated(next)) {
    const day = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    const when = day(next.date);
    // 0059: never state a date two calendars disagree on as fact.
    const nq = (next as { nasdaq?: { date: string } }).nasdaq;
    if (nq) return nq.date === next.date ? `${sym} reports ${when}, time unconfirmed · Metaphases` : `${sym} reports ${when} (unconfirmed; Nasdaq lists ${day(nq.date)}) · Metaphases`;
    // 0007: the feed's projection is "expected around", never "reports" with a session.
    if ((next as { projected?: true }).projected) return `${sym} earnings expected around ${when} (not yet confirmed) · Metaphases`;
    const s = (next as { session: string }).session;
    // 0050: a session only Nasdaq's calendar gives is expected, not the company's word.
    return `${sym} reports ${when} ${SESSION_WORDS[s] ?? ""}${s && (next as { hs?: "n" }).hs === "n" ? " (expected)" : ""} · Metaphases`.replace("  ", " ");
  }
  if (next?.overdue) return `${sym}'s Q${next.quarter} report: date not confirmed yet · Metaphases`;
  if (next?.closed) return `${sym} earnings: date not confirmed yet · Metaphases`;
  return `${name} (${sym}) earnings · Metaphases`;
}
