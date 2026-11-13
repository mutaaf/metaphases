// 0007: report dates the company hasn't confirmed.
//
// Finnhub's calendar mixes dates a company has announced with its own projections, and doesn't say which is
// which. Two signals mark a projection:
//   1. no session (`hour` blank): a company announcing its date almost always names the time too;
//   2. more than CONFIRM_HORIZON_DAYS ahead: companies typically announce two to three weeks before the report,
//      so a date further out (GOOGL "Tue, Feb 2 · after close", 93 days ahead) is the feed's guess even when the
//      feed carries a session (critique 2026-11-01-0506 #3).
// A date from data/date-overrides.json (the company's own announcement, `o` / `source`) is always confirmed,
// with or without a session (QXO's 8-K named the day only). A date that has arrived is not called projected:
// the report-day states (0039) and the overdue / closed-day states (0038, 0045) speak for those.

/** Days ahead beyond which a feed date is treated as projected (see above). */
export const CONFIRM_HORIZON_DAYS = 21;

const dayNum = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;

/** True when `date` is the data feed's projection rather than a date the company has announced. */
export function isProjected(r: { date: string; session: string; source?: string | null }, today: string): boolean {
  if (r.source || !r.date || r.date <= today) return false;
  if (!r.session) return true;
  return dayNum(r.date) - dayNum(today) > CONFIRM_HORIZON_DAYS;
}

/** The calendar row form (`d`, `h`, `o`). */
export const eventProjected = (e: { d: string; h: string; o?: string; fh?: string; c?: string }, today: string) => !!e.c || isProjected({ date: e.d, session: e.fh || e.h, source: e.o }, today);
// `fh` (0062): a row whose session the two calendars contest shows h "" but still carries the feed's session,
// and both feeds agree on its date, so it isn't a projection for want of a time.
// `c` (0064): a row the feed projects onto a market holiday is never a dated report, session or not, and
// stays projected on the holiday itself (VEEV "after close" on Thanksgiving).
