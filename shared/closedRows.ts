// 0064: rows the feed projects onto a market holiday (`c`, set by flagClosed in shared/dateOverrides.ts) are not
// dated reports. The calendar keeps them out of a day's reporting count and session groups and files them under
// "Date not confirmed" instead.
import type { EarningsEvent } from "./types";

export function splitClosed<E extends Pick<EarningsEvent, "c">>(events: E[]): { dated: E[]; unconfirmed: E[] } {
  const dated: E[] = [], unconfirmed: E[] = [];
  for (const e of events) (e.c ? unconfirmed : dated).push(e);
  return { dated, unconfirmed };
}
