// 0118: Finnhub's free calendar keeps only about a month of history. Older days come back as an empty list with a
// 200, which used to read as "None of the companies we follow report" and "A quiet week", and fed a bare season %.
// A past trading day with no rows at all in the feed (not one row, tracked or not) is a day the feed has dropped,
// never a quiet day: the feed lists hundreds of small companies on every trading day of a season.
import { HOLIDAYS } from "./market";

const CLOSED = new Set(HOLIDAYS.map((h) => h.date));
const weekday = (d: string) => { const w = new Date(d + "T12:00:00Z").getUTCDay(); return w !== 0 && w !== 6; };

/** The words every surface keys on. The warning still starts "Couldn't load <day>", so `missingDays` counts it. */
export const GONE_NOTE = "our data feed no longer has reports from that far back";
export const goneWarning = (day: string) => `Couldn't load ${day} — ${GONE_NOTE}.`;
export const isGoneWarning = (w: string) => w.includes(GONE_NOTE);

/** Finnhub's history reached back 30 days on 2026-11-27. Only days older than this are judged, so a recent day is
 *  never called dropped (a recent empty answer is a feed hiccup, and the last good copy covers it). */
export const GONE_MIN_AGE_DAYS = 21;
const minus = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() - n); return x.toISOString().slice(0, 10); };

/** The days of `days` the feed has dropped: trading days at least GONE_MIN_AGE_DAYS old for which the range call
 *  returned no row at all. */
export function feedGoneDays(days: readonly string[], rowDates: Iterable<string>, today: string): string[] {
  const seen = new Set(rowDates);
  const edge = minus(today, GONE_MIN_AGE_DAYS);
  return days.filter((d) => d < edge && weekday(d) && !CLOSED.has(d) && !seen.has(d));
}

/** The days named by "dropped" warnings (deduped, sorted), so copy can say "not in our feed" instead of "busy". */
export function goneDaysOf(warnings: readonly string[]): string[] {
  return [...new Set(warnings.filter(isGoneWarning).flatMap((w) => w.match(/\d{4}-\d{2}-\d{2}/g) ?? []))].sort();
}

/** What a dropped day says wherever a day's list would be (day view, drawer, brief). Our record, not a claim. */
export const GONE_DAY_COPY = "Our data feed only keeps about a month of past reports, so we can't say who reported on this day.";
export const GONE_WEEK_COPY = "Our data feed only keeps about a month of past reports, so we can't say who reported this week.";

/** The first trading day after the last dropped one: the season numbers count reports from that day on. */
export function coveredSince(gone: readonly string[]): string | null {
  if (!gone.length) return null;
  let d = [...gone].sort()[gone.length - 1];
  do {
    const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); d = x.toISOString().slice(0, 10);
  } while (!weekday(d) || CLOSED.has(d));
  return d;
}
