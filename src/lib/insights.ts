// Custom Box Office events (shared/insights.ts). Public, non-personal values only: tickers, views,
// lenses. Never names, free text, holdings or ids. Nothing is ever sent from the kids area.
import { isKidsPath } from "../../shared/insights";
import { appPath } from "./router";

type Queue = { q?: unknown[][]; on?: boolean; track: (name: string, props?: Record<string, string | number | boolean>) => void };
declare global { interface Window { boxoffice?: Queue } }

export function track(name: string, props: Record<string, string | number | boolean> = {}) {
  try {
    if (isKidsPath(appPath())) return;
    (window.boxoffice ??= { q: [], track(...a) { this.q!.push(a); } }).track(name, props);
  } catch { /* analytics never breaks a page */ }
}

/** True once the loader is running on this page (a grown-up page, consent not withheld). */
export const insightsOn = () => { try { return window.boxoffice?.on === true; } catch { return false; } };
