// Metaphases Kids progress — guesses, pretend piggy bank, lessons. Lives ONLY in this browser's
// localStorage (every access guarded). Nothing is sent anywhere; there are no accounts.
import { useSyncExternalStore } from "react";
import type { Guess, PiggyHolding } from "../../shared/kids";

export interface Piggy { started: string; holdings: PiggyHolding[]; history: Record<string, number> }
export interface KidsState { guesses: Guess[]; piggy: Piggy | null; lessons: string[]; seenBadges: string[] }

const KEY = "metaphases:kids:v1";
const DEFAULT: KidsState = { guesses: [], piggy: null, lessons: [], seenBadges: [] };

let state: KidsState = (() => {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...DEFAULT, ...JSON.parse(raw) }; } catch {}
  return DEFAULT;
})();
const subs = new Set<() => void>();
function set(next: Partial<KidsState>) {
  state = { ...state, ...next };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  subs.forEach((f) => f());
}
export const useKids = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
export const kidsState = () => state;

export const kids = {
  guess(g: Guess) { set({ guesses: [...state.guesses.filter((x) => !(x.s === g.s && x.d === g.d)), g] }); },
  resolve(s: string, d: string, patch: Partial<Guess>) { set({ guesses: state.guesses.map((g) => (g.s === s && g.d === d ? { ...g, ...patch } : g)) }); },
  startPiggy(holdings: PiggyHolding[], today: string, value: number) { set({ piggy: { started: today, holdings, history: { [today]: Math.round(value * 100) / 100 } } }); },
  recordValue(today: string, value: number) {
    if (!state.piggy) return;
    const v = Math.round(value * 100) / 100;
    if (state.piggy.history[today] === v) return;
    const history = { ...state.piggy.history, [today]: v };
    const keys = Object.keys(history).sort();
    while (keys.length > 120) delete history[keys.shift()!];
    set({ piggy: { ...state.piggy, history } });
  },
  resetPiggy() { set({ piggy: null }); },
  finishLesson(id: string) { if (!state.lessons.includes(id)) set({ lessons: [...state.lessons, id] }); },
  seeBadges(ids: string[]) { set({ seenBadges: Array.from(new Set([...state.seenBadges, ...ids])) }); },
};
