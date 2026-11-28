// 0026: which days of a window didn't load. Calendar warnings name a failed day ("Couldn't load 2026-10-27 — …",
// from the worker) or a failed week chunk ("Couldn't load 2026-10-10–2026-10-16 — …", from src/lib/api.ts).
// Chunks overlap and repeat each other's warnings, so days are deduped; weekends and NYSE holidays never count.
import { HOLIDAYS } from "../../shared/market";
import { isGoneWarning } from "../../shared/feedHorizon";
const CLOSED = new Set(HOLIDAYS.map((h) => h.date));
const DAY = /(\d{4}-\d{2}-\d{2})(?:\s*[–-]\s*(\d{4}-\d{2}-\d{2}))?/;
const next = (d: string) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
const weekday = (d: string) => { const w = new Date(d + "T12:00:00Z").getUTCDay(); return w !== 0 && w !== 6; };

export function missingDays(warnings: readonly string[], from: string, to: string): string[] {
  const out = new Set<string>();
  for (const w of warnings) {
    if (!/^Couldn't load/.test(w)) continue;
    const m = DAY.exec(w);
    if (!m) continue;
    const end = m[2] ?? m[1];
    for (let d = m[1]; d <= end; d = next(d)) if (d >= from && d <= to && weekday(d) && !CLOSED.has(d)) out.add(d);
  }
  return [...out].sort();
}

/** 0047: only a real failure is worth a quiet retry. A pending count (overseas names still being checked) isn't one. */
/** 0118: a day the data feed has dropped can't come back by asking again, so it alone never triggers a retry. */
export const needsRetry = (data: { warnings?: readonly string[] } | null | undefined) => (data?.warnings ?? []).some((w) => !isGoneWarning(w));

/** 0061: re-reads while the Nasdaq cross-check fills the days on screen (its builder takes 2 days per colo per minute,
 *  so a cold 10-day window takes about 5 minutes). */
export const CHECK_TRIES = 8;
const CHECK_DELAY = 40_000;

/**
 * When useApi should quietly ask again, or null when the answer is final. A partial failure is retried twice,
 * quickly (0026). With `recheck` (the calendar page only), a calendar whose days on screen haven't been
 * cross-checked yet (`uncheckedDays`) is re-read every 40 s, a few times at most, so the flags and
 * Nasdaq-filled sessions arrive without a reload (0061).
 */
export function retryDelay(data: { warnings?: readonly string[]; uncheckedDays?: readonly string[]; next?: { unchecked?: true } | null } | null | undefined, attempt: number, recheck = false): number | null {
  if (needsRetry(data)) return attempt < 2 ? 4000 * (attempt + 1) : null;
  // 0114: a sheet whose next report's time couldn't be checked against Nasdaq's day yet asks again too.
  if (recheck && ((data?.uncheckedDays?.length ?? 0) > 0 || !!data?.next?.unchecked)) return attempt < CHECK_TRIES ? CHECK_DELAY : null;
  return null;
}

/** 0061: the unchecked days worth mentioning (a market holiday has nothing to compare). */
export const checkingOf = (days: readonly string[] | undefined) => (days ?? []).filter((d) => weekday(d) && !CLOSED.has(d));

/**
 * 0114 bounce 3: Nasdaq's cross-check days are fetched in a request of their own (`/api/xcheck/fill`), because a
 * calendar read already uses the worker's 50 subrequests. Ask when an answer is marked `fill`, at most once a minute
 * per tab (the worker also takes one fill per data centre per minute).
 */
export const FILL_EVERY_MS = 60_000;
export const shouldAskFill = (body: { fill?: 1 } | null | undefined, now: number, last: number) => !!body?.fill && now - last >= FILL_EVERY_MS;
export const fillPath = (base: string, from: string, to: string) => `${base}/api/xcheck/fill?from=${from}&to=${to}`;
