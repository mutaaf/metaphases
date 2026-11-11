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
