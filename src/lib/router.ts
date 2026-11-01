// Tiny router. The app lives under a base path (mutaafaziz.com/metaphases/); everything inside the
// app speaks in base-relative paths ("/compass") and this module adds or strips the base.
import { useSyncExternalStore } from "react";
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, ""); // "/metaphases"
const subs = new Set<() => void>();
window.addEventListener("popstate", () => subs.forEach((f) => f()));
export const appPath = () => (location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) || "/" : location.pathname);
export const href = (p: string) => BASE + p;
export const useLocation = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => location.pathname + location.search);
export function navigate(to: string, replace = false) {
  const full = BASE && to.startsWith(BASE + "/") ? to : BASE + to;
  if (full === location.pathname + location.search) return;
  history[replace ? "replaceState" : "pushState"](null, "", full);
  subs.forEach((f) => f());
}
export function setParam(k: string, v: string | null) {
  const u = new URL(location.href);
  if (v == null) u.searchParams.delete(k); else u.searchParams.set(k, v);
  navigate(u.pathname + u.search);
}
export const param = (k: string) => new URL(location.href).searchParams.get(k);
