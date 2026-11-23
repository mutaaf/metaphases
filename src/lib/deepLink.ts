// 0025: a shared link (a ticker sheet, a day drawer, Hype Check, Today, a shared watchlist) must render what was
// shared. Landing on one of these never opens the "How do you invest?" picker; the lens defaults to
// Everyday with a small inline switch instead.
/** The share-URL ticker shape; App.tsx rewrites a matching /t/<sym> to /?t=<SYM>. */
export const SHARE_TICKER = /^\/t\/([A-Za-z.\-]{1,10})$/;

// Exact routes, like App.tsx: a URL the app doesn't route as a share link (/t/123, /check/) keeps the picker.
export function isDeepLink(path: string, search: string): boolean {
  if (SHARE_TICKER.test(path) || /^\/w\/[^/]+/.test(path)) return true;
  if (path === "/check" || path === "/today") return true;
  // 0065: the day drawer's own share URL (?day=YYYY-MM-DD) is a shared link too.
  if (path === "/") { const q = new URLSearchParams(search); return !!q.get("t") || /^\d{4}-\d{2}-\d{2}$/.test(q.get("day") ?? ""); }
  return false;
}
