import type { EarningsEvent, Session } from "./types";

/**
 * 0062: the two calendars give the same date in different sessions (Finnhub "amc", Nasdaq "bmo"). Neither is
 * the company's word, so no surface may headline either session as fact: the row shows the unknown glyph and
 * names both. A company override (`o` / `confirmed`) settles it, and so does an agreeing or blank Nasdaq session.
 */
export const eventTimeContested = (e: Pick<EarningsEvent, "d" | "h" | "x" | "xd" | "xh" | "o">): boolean =>
  e.x === "differs" && !!e.xd && e.xd === e.d && !!e.xh && !!e.h && e.xh !== e.h && !e.o;

/** A calendar row as surfaces should show it: a contested session becomes "" (Time TBD); `fh` keeps the feed's. */
export const settleContested = <E extends EarningsEvent>(e: E): E =>
  eventTimeContested(e) ? { ...e, h: "" as Session, fh: e.h } : e;

type Next = { date: string; session: Session; confirmed?: string; nasdaq?: { date: string; session: Session } } | null | undefined;

/** The sheet's next report: same date, both feeds name a session, and they differ. */
export const nextTimeContested = (n: Next): boolean =>
  !!n?.nasdaq && n.nasdaq.date === n.date && !!n.nasdaq.session && !!n.session && n.nasdaq.session !== n.session && !n.confirmed;

/** The session to headline for the next report ("" when the two calendars contest it). */
export const shownSession = (n: Next): Session => (!n ? "" : nextTimeContested(n) ? "" : n.session);
