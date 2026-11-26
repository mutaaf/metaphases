// 0109: one day, one count. The drawer header, the day view's sentence and the `?day=` unfurl all count a day's
// dated reports the same way: the rows the filter shows, and every dated row the calendar has for that day
// ("10 popular · 19 in all"). Rows the filter hides are listed under "+N more reporting", so every row
// `/api/calendar` has for a day can be reached from that day's drawer.
import { splitClosed } from "./closedRows";
import type { EarningsEvent } from "./types";

type Row = Pick<EarningsEvent, "s" | "c" | "od"> & Partial<Pick<EarningsEvent, "d" | "o" | "x" | "xd" | "xf" | "eA" | "rA">>;

export function dayCount<E extends Row>(shown: E[], all: E[], today?: string): { shown: number; total: number; more: E[] } {
  const s = splitClosed(shown, today).dated;
  const a = splitClosed(all, today).dated;
  const keep = new Set(s.map((e) => e.s));
  const more = a.filter((e) => !keep.has(e.s));
  return { shown: s.length, total: s.length + more.length, more };
}

/** Header words: "19 reporting" when the filter shows everything, else "10 popular · 19 in all". */
export function dayCountLabel(shown: number, total: number, kind = "popular"): string {
  return shown >= total ? `${total} reporting` : `${shown} ${kind} · ${total} in all`;
}
