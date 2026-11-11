// Shapes shared by the Worker API and the React client.

export type Session = "bmo" | "dmh" | "amc" | "";

/** One earnings event on the calendar (compact keys keep month payloads small). */
export interface EarningsEvent {
  s: string; // symbol
  d: string; // YYYY-MM-DD
  h: Session;
  q: number;
  y: number;
  eE: number | null; // EPS estimate
  eA: number | null; // EPS actual
  rE: number | null; // revenue estimate
  rA: number | null; // revenue actual
  t: 0 | 1; // 1 = in the curated Metaphases universe, 0 = large untracked reporter
  o?: string; // the company's announcement URL when its date overrides Finnhub's (data/date-overrides.json)
  c?: string; // a projected date on an NYSE holiday ("Thanksgiving"): not a real date yet (0045)
  /** After the print, where eE/rE came from (0035): "s" = our pre-report snapshot of Finnhub's estimates, "n" = Nasdaq's pre-report EPS consensus. Absent = Finnhub's current figure, which may have been revised toward the actual. */
  pr?: "s" | "n";
  /** 0049: Nasdaq's pre-report EPS consensus when `eE` is on another basis from `eA` (REIT FFO vs GAAP EPS) and Nasdaq's is on the actual's. Judge with `epsVerdict`. */
  nE?: number;
  /** 0015, the next 14 days: how Nasdaq's per-day calendar compares. "agree" = same day; "differs" = another day or session (`xd`/`xh` say which); "unknown" = Nasdaq doesn't list it. Absent = not checked. */
  x?: "agree" | "differs" | "unknown";
  /** Nasdaq's day on `differs`. */
  xd?: string;
  /** Nasdaq's session, when it gives one. */
  xh?: Session;
}

export interface CalendarResponse {
  from: string;
  to: string;
  events: EarningsEvent[];
  asOf: string;
  /** Real failures only ("Couldn't load <day>"): the client says so and quietly retries (0026). */
  warnings: string[];
  /** Overseas names whose dates haven't been checked yet (0024): progress, not a failure (0047). */
  pending?: number;
  /** 0015: weekdays in the next 14 whose Nasdaq cross-check couldn't load. Not a failure: the dates are Finnhub's as before. */
  unchecked?: number;
}

export type Grade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "D" | "F";

export interface Factor {
  key: string;
  label: string;
  score: number | null; // 0-100
  grade: Grade | null;
  why: string; // plain-English explanation
  inputs: { label: string; value: string; term?: string }[];
}

export interface Reaction {
  date: string;
  session: Session;
  period: string;
  epsE: number | null;
  epsA: number | null;
  surprisePct: number | null;
  move: number | null; // % price move across the print
  /** 0049: the actual isn't on the estimate's basis (FFO vs GAAP, per ADR vs per share, GAAP vs adjusted): no surprise, not counted in the beat rate. */
  basis?: "differs";
}

export interface TickerResponse {
  symbol: string;
  profile: { name: string; logo: string; industry: string; country: string; web: string; marketCap: number; /** Currency of marketCap (Finnhub profile; local for many foreign filers). */ currency?: string; exchange: string; ipo: string } | null;
  quote: { price: number; change: number; changePct: number; prevClose: number; asOf: number } | null;
  next: { date: string; session: Session; quarter: number; year: number; epsE: number | null; revE: number | null; /** ISO code of epsE/revE. "" = not dollars, currency unknown. */ currency?: string; /** The company's announcement URL when its date overrides Finnhub's. */ confirmed?: string; /** Projected onto a closed-market day (holiday name or "a weekend"): not a real date yet (0045). */ closed?: string; /** 0038: this quarter's projected date passed with no results and no new date is known. `date` is the passed date, or "" if the feed never had one. */ overdue?: true; /** 0039: the session has passed (today, or within the grace day) and no figures are in yet. */ status?: "results-pending"; /** 0015: Nasdaq's per-day calendar lists this report on another day or session (`date`/`session` say which). The feed's date stays; the sheet calls it unconfirmed. */ nasdaq?: { date: string; session: Session }; /** 0049: a REIT, whose own measure is FFO: the feed's EPS estimate isn't the bar it reports against, so it isn't quoted. */ epsBasis?: "ffo" } | null;
  /** 0039: a report that came out today or in the last day or two, before Nasdaq's history catches up. `epsE`/`epsA` are in `currency`. */
  justReported?: { date: string; session: Session; quarter: number; year: number; epsE: number | null; epsA: number | null; currency?: string; /** 0049: Nasdaq's consensus on the actual's basis when `epsE` isn't. */ nE?: number; /** 0049: a REIT (judge with `epsVerdict({ reit })`). */ reit?: true };
  compass: { score: number | null; grade: Grade | null; factors: Factor[] };
  setup: { score: number | null; grade: Grade | null; factors: Factor[]; trend: string; rsi: number | null; atrPct: number | null; from52wHigh: number | null };
  history: Reaction[];
  expectedMove: number | null; // mean |move| across recent prints
  beatRate: { beats: number; total: number } | null;
  street: { buy: number; hold: number; sell: number; period: string; buyPctChange3m: number | null } | null;
  spark: number[]; // ~6 months of closes
  /** ~1 year of daily closes, downsampled to ≤ 260 points, with 50/200-day averages aligned to the same points. */
  chart: { t: number[]; c: number[]; s50: (number | null)[]; s200: (number | null)[] } | null;
  /** Last ≤ 8 fiscal quarters from Finnhub's free quarterly series (oldest first). rev ≈ salesPerShare × shares. */
  quarters: Quarter[];
  read: string[]; // plain-English bullets
  warnings: string[];
}

export interface Quarter {
  period: string; // fiscal quarter end, YYYY-MM-DD
  eps: number | null; // GAAP EPS
  rev: number | null; // approximate revenue in dollars
  gm: number | null; // gross margin, %
  om: number | null; // operating margin, %
}

export interface MacroEvent {
  key: string;
  name: string;
  date: string;
  kind: "jobs" | "inflation" | "fed" | "growth" | "consumer";
  blurb: string;
}

export interface MoodComponent {
  key: string;
  label: string;
  score: number; // 0 fear … 100 greed
  reading: string;
  why: string;
}

export interface MacroResponse {
  events: MacroEvent[];
  mood: { score: number; label: string; components: MoodComponent[]; history: number[] } | null;
  holidays: { date: string; name: string }[];
  asOf: string;
  warnings: string[];
}
