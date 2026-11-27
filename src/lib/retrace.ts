import { addDays, parse } from "./dates";

// 0014: a young month (fewer than this many graded reports) shows the trailing 30 days instead,
// so Retrace is never empty in the first days of peak season.
export const RETRACE_MIN_MONTH = 25;
export const RETRACE_TRAILING_DAYS = 30;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The month `offset` months before today's, clipped to today, plus the range to fetch. */
export function retraceRange(today: string, offset: number) {
  const t = parse(today);
  const m = new Date(t.getFullYear(), t.getMonth() - offset, 1);
  const from = ymd(m);
  const last = ymd(new Date(m.getFullYear(), m.getMonth() + 1, 0));
  const to = last < today ? last : today;
  // Only the current month can fall back, so only it fetches the trailing window too.
  const trailingFrom = addDays(today, -RETRACE_TRAILING_DAYS);
  const fetchFrom = offset === 0 && trailingFrom < from ? trailingFrom : from;
  return { month: m, from, to, fetchFrom, fetchTo: to };
}

type Graded = { d: string; eA?: number | null; t?: unknown };
export const isGraded = (e: Graded) => e.eA != null && !!e.t;

export type RetraceView<E> = { mode: "month" | "trailing"; from: string; to: string; events: E[]; monthCount: number };

/** Which reports Retrace grades: the month, or (current month only, under 25 graded) the last 30 days. */
export function retraceView<E extends Graded>(events: E[], today: string, offset: number): RetraceView<E> {
  const r = retraceRange(today, offset);
  const done = events.filter(isGraded);
  const inMonth = done.filter((e) => e.d >= r.from && e.d <= r.to);
  if (offset !== 0 || inMonth.length >= RETRACE_MIN_MONTH) return { mode: "month", from: r.from, to: r.to, events: inMonth, monthCount: inMonth.length };
  const from = addDays(today, -RETRACE_TRAILING_DAYS);
  const trailing = done.filter((e) => e.d >= from && e.d <= today);
  // Nothing more in the trailing window than in the month: the month view says the same, honestly labelled.
  if (trailing.length <= inMonth.length) return { mode: "month", from: r.from, to: r.to, events: inMonth, monthCount: inMonth.length };
  return { mode: "trailing", from, to: today, events: trailing, monthCount: inMonth.length };
}
