// 0025: a shared link (a ticker sheet, a day drawer, Hype Check, Today, a shared watchlist) must render what was
// shared. Landing on one of these never opens the "How do you invest?" picker; the lens defaults to
// Everyday with a small inline switch instead.
/** The share-URL ticker shape; App.tsx rewrites a matching /t/<sym> to /?t=<SYM>. */
export const SHARE_TICKER = /^\/t\/([A-Za-z.\-]{1,10})$/;

/** A real calendar day in the day drawer's share shape (YYYY-MM-DD); "2026-13-45" and "tuesday" aren't. 0065. */
export function isISODay(v: string | null | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// Exact routes, like App.tsx: a URL the app doesn't route as a share link (/t/123, /check/) keeps the picker.
export function isDeepLink(path: string, search: string): boolean {
  if (SHARE_TICKER.test(path) || /^\/w\/[^/]+/.test(path)) return true;
  if (path === "/check" || path === "/today") return true;
  // 0065: the day drawer's own share URL (?day=YYYY-MM-DD) is a shared link too.
  if (path === "/") { const q = new URLSearchParams(search); return !!q.get("t") || isISODay(q.get("day")); }
  return false;
}
