// 0025: a shared link (a ticker sheet, Hype Check, Today, a shared watchlist) must render what was
// shared. Landing on one of these never opens the "How do you invest?" picker; the lens defaults to
// Everyday with a small inline switch instead.
/** The share-URL ticker shape; App.tsx rewrites a matching /t/<sym> to /?t=<SYM>. */
export const SHARE_TICKER = /^\/t\/([A-Za-z.\-]{1,10})$/;

// Exact routes, like App.tsx: a URL the app doesn't route as a share link (/t/123, /check/) keeps the picker.
export function isDeepLink(path: string, search: string): boolean {
  if (SHARE_TICKER.test(path) || /^\/w\/[^/]+/.test(path)) return true;
  if (path === "/check" || path === "/today") return true;
  if (path === "/") return !!new URLSearchParams(search).get("t");
  return false;
}
