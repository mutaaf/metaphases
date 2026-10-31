import { useSyncExternalStore } from "react";
const subs = new Set<() => void>();
window.addEventListener("popstate", () => subs.forEach((f) => f()));
export const useLocation = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => location.pathname + location.search);
export function navigate(to: string, replace = false) {
  if (to === location.pathname + location.search) return;
  history[replace ? "replaceState" : "pushState"](null, "", to);
  subs.forEach((f) => f());
}
export function setParam(k: string, v: string | null) {
  const u = new URL(location.href);
  if (v == null) u.searchParams.delete(k); else u.searchParams.set(k, v);
  navigate(u.pathname + u.search);
}
export const param = (k: string) => new URL(location.href).searchParams.get(k);
