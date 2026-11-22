// 0099: which day leads when the two calendars disagree on a date neither has confirmed.
//
// 0015 keeps the feed's date and only says Nasdaq lists another. That's right when the feed carries a session of
// its own, but when the feed's row has no time and is its own projection (KSS, URBN: Mon Nov 23, blank) while
// Nasdaq lists another day with a named session (Tue Nov 24, before the open), Nasdaq's listing is the better-
// supported of two unconfirmed dates. It leads, still called unconfirmed, and the feed's day is named beside it.
// Nothing changes when the feed names a session, when the company has announced a date (overrides win), when
// Nasdaq gives no session, or when there's no cross-check at all (a cold window).
import type { EarningsEvent, Session } from "./types";
import { isProjected } from "./projected";

const timed = (h: Session | "" | undefined): h is "bmo" | "amc" => h === "bmo" || h === "amc";

/** True when Nasdaq's listing (`nq`) should headline the next report instead of the feed's projected row. */
export function leadsNasdaq(feed: { date: string; session: string; source?: string | null }, nq: { date: string; session: Session } | null | undefined, today: string): boolean {
  if (!nq || feed.source || feed.session) return false;
  if (!isProjected({ date: feed.date, session: "", source: feed.source }, today)) return false;
  return nq.date !== feed.date && nq.date >= today && timed(nq.session);
}

/**
 * Calendar rows for `leadsNasdaq`: placed on Nasdaq's day at Nasdaq's session (`hs: "n"`), with the feed's day kept
 * as the evidence the other way round (`xd` = the feed's day, `xf: 1`), so the row is still `x: "differs"` and
 * counted as not confirmed. A row whose Nasdaq day falls outside `from`..`to` stays where it is (the range that
 * holds Nasdaq's day never saw the feed's row), and so does one whose company already has a row on that day.
 */
export function leadRows(events: EarningsEvent[], from: string, to: string, today: string): EarningsEvent[] {
  const on = new Set(events.map((e) => `${e.s}|${e.d}`));
  return events.map((e) => {
    if (e.xf || e.x !== "differs" || !e.xd || e.o || e.c || e.od || e.fh || e.eA != null || e.rA != null) return e;
    if (!leadsNasdaq({ date: e.d, session: e.h, source: e.o }, { date: e.xd, session: e.xh ?? "" }, today)) return e;
    if (e.xd < from || e.xd > to || on.has(`${e.s}|${e.xd}`)) return e;
    const { xh: _xh, ...rest } = e;
    return { ...rest, d: e.xd, h: e.xh as Session, hs: "n" as const, xd: e.d, xf: 1 as const };
  });
}
