// 0064: rows the feed projects onto a market holiday (`c`, set by flagClosed in shared/dateOverrides.ts) are not
// dated reports. The calendar keeps them out of a day's reporting count and session groups and files them under
// "Date not confirmed" instead. 0072: so are past rows that never happened (`od`: the projected day passed with
// no results anywhere and the company hasn't reported the quarter).
import type { EarningsEvent } from "./types";

/** Not a dated report: projected onto a holiday (0064) or a projection that passed unreported (0072). */
export const unconfirmedRow = (e: Pick<EarningsEvent, "c" | "od">) => !!e.c || !!e.od;

export function splitClosed<E extends Pick<EarningsEvent, "c" | "od">>(events: E[]): { dated: E[]; unconfirmed: E[] } {
  const dated: E[] = [], unconfirmed: E[] = [];
  for (const e of events) (unconfirmedRow(e) ? unconfirmed : dated).push(e);
  return { dated, unconfirmed };
}
