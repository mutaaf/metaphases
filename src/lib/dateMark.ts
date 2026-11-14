import type { EarningsEvent, Session } from "../../shared/types";
import { eventProjected } from "../../shared/projected";
import { fmtDay } from "./dates";

// 0070: how sure a row's date is, in one place, so Compass marks a date exactly as the calendar's day rows do.
// Order matters: a holiday row (0064) has no real date at all; a Nasdaq disagreement (0015) has its own note,
// which wins over "projected" (as in the drawer and the sheet); a row with results in is never projected.

const LOWER: Record<Session, string> = { bmo: "before open", dmh: "during hours", amc: "after close", "": "" };

export type DateMark = { kind: "closed" } | { kind: "overdue" } | { kind: "differs"; label: string } | { kind: "projected" } | null;

/** "Nasdaq: Thu, Nov 5, after close" (another day) or "Feed: after close · Nasdaq: before open" (same day). */
export function nasdaqLabel(e: Pick<EarningsEvent, "d" | "xd" | "xh" | "fh">): string {
  const feed = e.fh ? `Feed: ${LOWER[e.fh]} · ` : "";
  const nq = e.xd === e.d ? (e.xh ? LOWER[e.xh] : "another time") : `${fmtDay(e.xd!)}${e.xh ? `, ${LOWER[e.xh]}` : ""}`;
  return `${feed}Nasdaq: ${nq}`;
}

export function dateMark(e: EarningsEvent, today: string): DateMark {
  if (e.c) return { kind: "closed" };
  // 0072: the projected day passed and the company didn't report then.
  if (e.od) return { kind: "overdue" };
  if (e.x === "differs" && e.xd) return { kind: "differs", label: nasdaqLabel(e) };
  if (e.eA == null && eventProjected(e, today)) return { kind: "projected" };
  return null;
}
