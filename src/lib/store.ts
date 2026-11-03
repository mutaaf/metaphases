// Per-viewer state (watchlist, holdings, prefs) in localStorage — every access guarded, the app works without it.
import { useSyncExternalStore } from "react";

export interface WatchItem { s: string; buy?: number; note?: string; added: string }
export interface Holding { s: string; v: number } // symbol, dollar value
export interface Prefs { theme: "auto" | "light" | "dark"; tiles: "logo" | "ticker"; view: "month" | "week" | "day"; filter: string; sector: string; brief: "auto" | "open" | "closed"; intro: "new" | "seen" | "dismissed"; lens: "unset" | "everyday" | "trader"; install: "new" | "dismissed" }

const KEY = "metaphases:v1";
interface State { watch: WatchItem[]; holdings: Holding[]; prefs: Prefs }
const DEFAULT: State = {
  watch: [{ s: "AAPL", added: "2026-10-31" }, { s: "NVDA", added: "2026-10-31" }, { s: "DIS", added: "2026-10-31" }],
  holdings: [],
  prefs: { theme: "auto", tiles: "logo", view: "month", filter: "popular", sector: "", brief: "auto", intro: "new", lens: "unset", install: "new" },
};

let state: State = (() => {
  try { const raw = localStorage.getItem(KEY); if (raw) { const p = JSON.parse(raw); const prefs = { ...DEFAULT.prefs, ...p.prefs }; if ((prefs.lens as string) === "kids") prefs.lens = "everyday"; return { ...DEFAULT, ...p, prefs }; } } catch {}
  return DEFAULT;
})();
const subs = new Set<() => void>();
function set(next: Partial<State>) {
  state = { ...state, ...next };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  subs.forEach((f) => f());
}
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
export const useStore = () => useSyncExternalStore(subscribe, () => state);

export const actions = {
  toggleWatch(s: string) {
    const has = state.watch.some((w) => w.s === s);
    set({ watch: has ? state.watch.filter((w) => w.s !== s) : [...state.watch, { s, added: new Date().toISOString().slice(0, 10) }] });
  },
  updateWatch(s: string, patch: Partial<WatchItem>) { set({ watch: state.watch.map((w) => (w.s === s ? { ...w, ...patch } : w)) }); },
  setHoldings(holdings: Holding[]) { set({ holdings }); },
  setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) { set({ prefs: { ...state.prefs, [k]: v } }); },
};
