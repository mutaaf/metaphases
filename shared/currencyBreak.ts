// 0098: Finnhub's quarterly series can switch currency mid-series for foreign filers (PDD, BABA, NTES, YMM, FUTU:
// the newest quarter in US dollars per share beside yuan or HK-dollar quarters, about ×0.14). Its TTM growth metrics
// are computed over that mix, so a company that grew grades Growth F, and "The last 8 quarters" reads an 85% collapse.
// Detect the break from the numbers (sales per share between neighbouring quarters), drop the off-currency quarters,
// and treat the TTM growth metrics as unavailable rather than grade a mix. `shared/grades.ts` stays untouched.
import { isUsd, type Currency } from "./currency";

type Pt = { period: string; v: number };
type Series = Record<string, Pt[]>;

/** Neighbouring quarters' sales per share outside (1/BREAK, BREAK) are a currency switch, not a business change. */
export const BREAK = 4;
/** The TTM year-over-year metrics read the newest eight quarters. */
const TTM_WINDOW = 8;

export interface CurrencyBreak {
  /** Quarter-ends whose figures are in a different currency from most of the series. */
  off: string[];
  /** A switch inside the newest eight quarters: Finnhub's TTM growth metrics are computed over the mix. */
  growthBroken: boolean;
}

const NONE: CurrencyBreak = { off: [], growthBroken: false };

/** Find the quarters reported in another currency, from `salesPerShare` alone (EPS swings too much to tell). Only
 *  for a company whose reporting currency isn't US dollars: a dollar reporter's series is left alone. */
export function currencyBreak(series: Series | undefined, currency: Currency | null | undefined): CurrencyBreak {
  if (isUsd(currency) || !series) return NONE;
  const sps = (series.salesPerShare ?? []).filter((p) => p && typeof p.period === "string" && typeof p.v === "number" && Number.isFinite(p.v) && p.v > 0);
  if (sps.length < 2) return NONE;
  const pts = sps.slice().sort((a, b) => a.period.localeCompare(b.period));
  // Each quarter's currency "level": the product of the break ratios before it (1 for the oldest quarter).
  const level: number[] = [1];
  let broke = false;
  for (let i = 1; i < pts.length; i++) {
    const r = pts[i].v / pts[i - 1].v;
    const isBreak = r < 1 / BREAK || r > BREAK;
    if (isBreak) broke = true;
    level.push(isBreak ? level[i - 1] * r : level[i - 1]);
  }
  if (!broke) return NONE;
  // The home currency is the level most quarters share (ties: the newer level). A quarter is off-currency when its
  // level is a break away from home.
  const near = (a: number, b: number) => a / b > 1 / BREAK && a / b < BREAK;
  let home = level[level.length - 1], best = -1;
  for (const l of level) {
    const n = level.filter((x) => near(x, l)).length;
    if (n > best || (n === best && l === level[level.length - 1])) { best = n; home = l; }
  }
  const off = pts.filter((_, i) => !near(level[i], home)).map((p) => p.period);
  if (!off.length) return NONE;
  const window = new Set(pts.slice(-TTM_WINDOW).map((p) => p.period));
  return { off, growthBroken: off.some((p) => window.has(p)) };
}

/** The quarterly series without the off-currency quarters (every key, so EPS and margins drop with them). */
export function withoutOff(series: Series | undefined, off: string[]): Series | undefined {
  if (!series || !off.length) return series;
  const drop = new Set(off);
  const out: Series = {};
  for (const [k, pts] of Object.entries(series)) out[k] = Array.isArray(pts) ? pts.filter((p) => !drop.has(p?.period)) : pts;
  return out;
}

/** The metric map Compass grades: on a break inside the TTM window, the two growth metrics are unavailable, so the
 *  factor reads "Growth history unavailable." instead of grading a currency mix. */
export function sanitizeMetric<M extends Record<string, unknown>>(metric: M, brk: CurrencyBreak): M {
  if (!brk.growthBroken) return metric;
  const { revenueGrowthTTMYoy: _r, epsGrowthTTMYoy: _e, ...rest } = metric;
  return rest as M;
}
