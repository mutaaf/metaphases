// 0043: what the edge cache may keep of a ticker sheet. A sheet built while Finnhub was rate-limiting lost its
// upcoming date or its earnings history; caching that for 5 minutes turned one 429 into minutes of "no date" for
// every visitor and every share card. A degraded sheet is cached briefly, and the last good copy is served instead
// (with a warning that says it's an earlier read), the same way the calendar's stale day works.
import type { TickerResponse } from "./types";
import { isDated } from "./pending";
import { sessionPassed } from "./reported";

/** A full sheet: sheets, share pages and OG cards read it from the edge for 5 minutes. */
export const SHEET_TTL = 300;
/** A sheet missing its date or history, or an earlier copy standing in for one: short enough to recover fast,
 *  long enough that a burst of visitors doesn't rebuild it on every request. */
export const SHEET_DEGRADED_TTL = 30;
/** How long the last good copy is kept to stand in for a degraded build. */
export const SHEET_STALE_TTL = 86400;

/** The `buildTicker` warnings that mean the sheet can't say when the company reports or how it did before. */
export const DEGRADING_WARNINGS = ["Upcoming date unavailable.", "Earnings history unavailable."] as const;
const EARLIER = "This is an earlier read";
const EARLIER_PAST = "Past reports are an earlier read";

export const isDegraded = (d: Pick<TickerResponse, "warnings">): boolean =>
  d.warnings.some((w) => (DEGRADING_WARNINGS as readonly string[]).includes(w));

/** True for a sheet that's an earlier good copy standing in for a degraded build. */
export const isEarlierRead = (d: Pick<TickerResponse, "warnings">): boolean => d.warnings.some((w) => w.startsWith(EARLIER) || w.startsWith(EARLIER_PAST));

/** Edge TTL for a finished (or stood-in) sheet; both cache layers use it. */
export const sheetTtl = (d: Pick<TickerResponse, "warnings">): number => (isDegraded(d) || isEarlierRead(d) ? SHEET_DEGRADED_TTL : SHEET_TTL);

export interface StaleSheet { at: number; day: string; data: TickerResponse }

/**
 * May a last good copy stand in for a degraded build now? Only if it can't be stale about the report itself.
 * - `part: "history"` (the build has its date, only the past reports failed): any good copy will do, because
 *   only its history is borrowed.
 * - A copy from an earlier day: only while its next report is still after today. Otherwise it predates the
 *   report-day state (0039) and could say "reports today" after the print.
 * - A copy from today that has the report today: only while that session hasn't passed (`nowMin` = minutes
 *   after NY midnight). An unknown session can't be judged, so it doesn't stand in.
 */
export function staleUsable(s: StaleSheet | null | undefined, today: string, nowMin: number, part: "all" | "history" = "all"): s is StaleSheet {
  if (!s || !s.data || isDegraded(s.data)) return false;
  if (part === "history") return s.data.history.length > 0;
  const n = s.data.next;
  if (s.day !== today) return isDated(n) && n.date > today && !s.data.justReported;
  if (isDated(n) && n.date === today && !s.data.justReported) return n.session !== "" && !sessionPassed(n.session, nowMin);
  return true;
}

/** "9:12 AM ET" for a timestamp (one Intl call per stand-in, never in a loop). */
export const etTime = (at: number): string =>
  `${new Date(at).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET`;

const whenOf = (s: StaleSheet, today: string) => (s.day === today ? etTime(s.at) : `${s.day}, ${etTime(s.at)}`);

/** The last good copy, marked as an earlier read so the sheet says so (and the client knows it's partial). */
export function standIn(s: StaleSheet, today: string): TickerResponse {
  return { ...s.data, warnings: [`${EARLIER} from ${whenOf(s, today)}; the market data service is busy right now.`, ...s.data.warnings] };
}

/**
 * A build that has its date but lost its past reports: keep everything fresh (date, report-day state, The Read)
 * and borrow only the history and what's derived from it from the last good copy, saying so.
 */
export function borrowHistory(built: TickerResponse, s: StaleSheet, today: string): TickerResponse {
  const has = built.history.length > 0;
  return {
    ...built,
    history: has ? built.history : s.data.history,
    beatRate: built.beatRate ?? s.data.beatRate,
    expectedMove: built.expectedMove ?? s.data.expectedMove,
    warnings: [`${EARLIER_PAST} from ${whenOf(s, today)}; the market data service is busy right now.`, ...built.warnings.filter((w) => w !== "Earnings history unavailable.")],
  };
}
