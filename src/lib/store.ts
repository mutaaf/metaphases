// Per-viewer state (watchlist, holdings, prefs) in localStorage — every access guarded, the app works without it.
import { useSyncExternalStore } from "react";

export interface WatchItem { s: string; buy?: number; note?: string; added: string }
export interface Holding { s: string; v: number } // symbol, dollar value
export interface Prefs { theme: "auto" | "light" | "dark"; tiles: "logo" | "ticker"; view: "month" | "week" | "day"; filter: string; sector: string; brief: "auto" | "open" | "closed"; intro: "new" | "seen" | "dismissed"; lens: "unset" | "everyday" | "trader"; install: "new" | "dismissed" }

const KEY = "metaphases:v1";
interface State { watch: WatchItem[]; holdings: Holding[]; prefs: Prefs; /** 2 = saved after 0023; older saves may hold the seed */ wv?: number }
/** The sample a visitor can load on purpose ("Try a sample watchlist"). Never the default: a new visitor
 *  hasn't starred anything, so nothing may say a company is "on your watchlist" until she does (0023). */
export const SAMPLE_WATCH = ["AAPL", "NVDA", "DIS"] as const;
export const DEFAULT: Readonly<State> = {
  watch: [],
  holdings: [],
  wv: 2,
  prefs: { theme: "auto", tiles: "logo", view: "month", filter: "popular", sector: "", brief: "auto", intro: "new", lens: "unset", install: "new" },
};

/** Before 0023 every browser was seeded with AAPL, NVDA and DIS, all "added" 2026-10-31, and any pref write saved
 *  that seed as if she had starred them. In a pre-0023 save (no `wv`), exactly that untouched seed (no buy price,
 *  no note) is dropped on load; anything she changed or added herself is kept. Saves from now on carry `wv: 2`. */
export function dropLegacySeed(watch: WatchItem[]): WatchItem[] {
  const seed = watch.length === SAMPLE_WATCH.length && SAMPLE_WATCH.every((s, i) => {
    const w = watch[i];
    return w?.s === s && w.added === "2026-10-31" && w.buy == null && !w.note;
  });
  return seed ? [] : watch;
}

export function loadState(raw: string | null): State {
  if (!raw) return DEFAULT;
  const p = JSON.parse(raw);
  const prefs = { ...DEFAULT.prefs, ...p.prefs };
  if ((prefs.lens as string) === "kids") prefs.lens = "everyday";
  const watch = !Array.isArray(p.watch) ? DEFAULT.watch : p.wv >= 2 ? p.watch : dropLegacySeed(p.watch);
  return { ...DEFAULT, ...p, watch, prefs, wv: 2 };
}

let state: State = (() => {
  try { return loadState(localStorage.getItem(KEY)); } catch {}
  return DEFAULT;
})();
const subs = new Set<() => void>();
function set(next: Partial<State>) {
  state = { ...state, ...next };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  subs.forEach((f) => f());
}
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
export const getState = () => state;
export const useStore = () => useSyncExternalStore(subscribe, getState);

export const actions = {
  toggleWatch(s: string) {
    const has = state.watch.some((w) => w.s === s);
    set({ watch: has ? state.watch.filter((w) => w.s !== s) : [...state.watch, { s, added: new Date().toISOString().slice(0, 10) }] });
  },
  /** Star the sample companies (keeping any she already starred). Only ever called from an explicit tap. */
  loadSampleWatch() {
    const added = new Date().toISOString().slice(0, 10);
    const have = new Set(state.watch.map((w) => w.s));
    set({ watch: [...state.watch, ...SAMPLE_WATCH.filter((s) => !have.has(s)).map((s) => ({ s, added }))] });
  },
  updateWatch(s: string, patch: Partial<WatchItem>) { set({ watch: state.watch.map((w) => (w.s === s ? { ...w, ...patch } : w)) }); },
  setHoldings(holdings: Holding[]) { set({ holdings }); },
  setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) { set({ prefs: { ...state.prefs, [k]: v } }); },
};
