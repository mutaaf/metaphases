// 0026: which days of a window didn't load. Calendar warnings name a failed day ("Couldn't load 2026-10-27 — …",
// from the worker) or a failed week chunk ("Couldn't load 2026-10-10–2026-10-16 — …", from src/lib/api.ts).
// Chunks overlap and repeat each other's warnings, so days are deduped; weekends and NYSE holidays never count.
import { HOLIDAYS } from "../../shared/market";
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
export const needsRetry = (data: { warnings?: readonly string[] } | null | undefined) => (data?.warnings?.length ?? 0) > 0;
