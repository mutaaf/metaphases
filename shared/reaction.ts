import type { Session } from "./types";

/**
 * 0057: a report's price reaction, close to close. Before the open (or during hours) the market reacts on the
 * report day itself: close the day before → close on the day. After the close it reacts the next day: close
 * on the day → close the next day. An unknown session is never guessed (a before-open report read as
 * after-close measures the day after the reaction: Walmart's ±6.1% read as ±1.0%), so it gives null ("—").
 */
export function reactionMove(session: Session | undefined, date: string, closeOn: (day: string, offset: number) => number | null): number | null {
  if (!session) return null;
  const early = session === "bmo" || session === "dmh";
  const before = early ? closeOn(date, -1) : closeOn(date, 0);
  const after = early ? closeOn(date, 0) : closeOn(date, 1);
  return before && after ? ((after - before) / before) * 100 : null;
}

/**
 * The company's habit, best source first: Finnhub's session for the next report, then Nasdaq's listing for
 * that same date (the 0015 cross-check), then Finnhub's session for the last one. "" when none says.
 */
export function sessionHabit(nextHour: string | undefined, nasdaqNext: string | undefined, lastHour: string | undefined): Session {
  const ok = (h: string | undefined): h is Session => h === "bmo" || h === "amc" || h === "dmh";
  return ok(nextHour) ? nextHour : ok(nasdaqNext) ? nasdaqNext : ok(lastHour) ? lastHour : "";
}

/** True when Finnhub and Nasdaq both give a session for the same report date and they differ (dmh is never compared). */
export function isContested(feed: string | undefined, nasdaq: string | undefined): feed is "bmo" | "amc" {
  const timed = (h: string | undefined) => h === "bmo" || h === "amc";
  return timed(feed) && timed(nasdaq) && feed !== nasdaq;
}

/**
 * 0060: when the two calendars disagree on the session, neither feed wins blindly (Nasdaq was right for ADI, DE
 * and ROAD, Finnhub for WMG). The price series says which day the market reacted on: the session whose reaction
 * day carries the larger close-to-close move in at least 3 of the last 4 reports. Fewer than 3 measurable
 * reports, or no clear winner, gives "" (unknown: every move reads "—", never one feed's guess).
 */
export function contestedSession(a: Session, b: Session, dates: string[], closeOn: (day: string, offset: number) => number | null): Session {
  let winsA = 0, winsB = 0, measured = 0;
  for (const d of dates.slice(0, 4)) {
    const ma = reactionMove(a, d, closeOn), mb = reactionMove(b, d, closeOn);
    if (ma == null || mb == null) continue;
    measured++;
    if (Math.abs(ma) > Math.abs(mb)) winsA++;
    else if (Math.abs(mb) > Math.abs(ma)) winsB++;
  }
  if (measured < 3) return "";
  return winsA >= 3 ? a : winsB >= 3 ? b : "";
}

/**
 * 0086: the session on a report the feed projects (no company date, `isProjected`). The feed's first projection
 * after a print often defaults to "after close" (TGT and TJX on 2026-11-18, both before-the-open reporters every
 * quarter on record). When the company's last dated report on the same calendar had the other timed session, the
 * stock's own past moves decide, as for a contested session (0060): the last report's session when they back it
 * (shown as the company's usual time), the feed's when they back that, else "" (unknown, never the feed's guess).
 * null = no contradiction, keep the feed's session.
 */
export function projectedSession(feed: string | undefined, last: string | undefined, dates: string[], closeOn: (day: string, offset: number) => number | null): Session | null {
  if (!isContested(feed, last)) return null;
  const v = contestedSession(feed, last as Session, dates, closeOn);
  return v === feed ? null : v;
}

/** 0088: the fewest measured reports a typical move is ever averaged from (TJX read ±8.0% from one; five gave ±3.9%). */
export const TYPICAL_MOVE_MIN = 3;

/** The mean absolute report-day move, or null ("—") with fewer than TYPICAL_MOVE_MIN measured reports. */
export function typicalMove(moves: number[]): number | null {
  return moves.length >= TYPICAL_MOVE_MIN ? moves.reduce((a, b) => a + Math.abs(b), 0) / moves.length : null;
}

/**
 * 0090: the session past reports are measured with when the next report's own session says nothing (a date-only
 * company notice, a blank feed time, an unsettled projection). An unknown next session is no evidence about when the
 * last four reports came out: the last dated report's session first, then Nasdaq's listing, then the stock's own
 * reaction test (the before-open vs after-close day wins in at least 3 of the last 4 reports), else "" (no guess).
 */
export function pastSession(lastHour: string | undefined, nasdaq: string | undefined, dates: string[], closeOn: (day: string, offset: number) => number | null): Session {
  return sessionHabit(lastHour, nasdaq, undefined) || contestedSession("bmo", "amc", dates, closeOn);
}
