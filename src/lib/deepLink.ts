// 0025: a shared link (a ticker sheet, Hype Check, Today, a shared watchlist) must render what was
// shared. Landing on one of these never opens the "How do you invest?" picker; the lens defaults to
// Everyday with a small inline switch instead.
export function isDeepLink(path: string, search: string): boolean {
  if (/^\/t\/[^/]+$/.test(path) || /^\/w\/[^/]+/.test(path)) return true;
  if (path === "/check" || path === "/today") return true;
  if (path === "/") return !!new URLSearchParams(search).get("t");
  return false;
}
