// Plain-English helpers for the Everyday lens: what a company does, when it reports, how the market feels.
// Pure and deterministic (unit-tested) — no AI spend, no network.
import type { Session } from "./types";

const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

/** Finnhub / GICS industry → what the company actually does, in words a non-investor uses. */
const INDUSTRY: [RegExp, string][] = [
  [/semiconductor/i, "designs or makes computer chips"],
  [/software|technology|information technology/i, "sells software and tech services"],
  [/internet|interactive media|media/i, "runs websites, apps or media people use every day"],
  [/retail|consumer discretionary/i, "sells things people buy for themselves"],
  [/consumer staples|food|beverage|household/i, "makes everyday things people buy every week"],
  [/bank|financial|capital markets|insurance/i, "handles money — banking, investing or insurance"],
  [/pharma|biotech|health|life sciences|medical/i, "works on medicines, healthcare or medical devices"],
  [/oil|gas|energy/i, "produces or moves oil, gas or other energy"],
  [/utilit/i, "supplies electricity, gas or water"],
  [/real estate|reit/i, "owns and rents out buildings"],
  [/airline/i, "flies passengers"],
  [/automobile|auto/i, "makes cars or car parts"],
  [/aerospace|defense/i, "builds planes, rockets or defense equipment"],
  [/telecom|communication/i, "runs phone, internet or TV networks"],
  [/machinery|industrial|electrical equipment|construction|logistics|road|rail|marine/i, "builds or moves the physical stuff the economy runs on"],
  [/hotel|restaurant|leisure/i, "runs hotels, restaurants or entertainment"],
  [/chemical|metal|mining|materials/i, "produces raw materials like metals and chemicals"],
];

export function whatTheyDo(name: string, industry?: string | null): string {
  const n = name.replace(/,?\s+(Inc\.?|Corporation|Corp\.?|Co\.?|Ltd\.?|plc|Holdings?|Group)$/i, "").trim() || name;
  const hit = industry ? INDUSTRY.find(([re]) => re.test(industry)) : undefined;
  return hit ? `${n} ${hit[1]}.` : industry ? `${n} is a ${industry.toLowerCase()} company.` : `${n} is a publicly traded company.`;
}

const SESSION_WORDS: Record<Session, string> = { bmo: "before the market opens", amc: "after the market closes", dmh: "during market hours", "": "(time not confirmed yet)" };

/** "tomorrow after the market closes", "Thursday before the market opens", "on Nov 17 …". */
export function whenPlain(date: string, session: Session, today: string): string {
  const n = daysBetween(today, date);
  const day = n === 0 ? "today" : n === 1 ? "tomorrow" : n > 1 && n < 7 ? parse(date).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) : `on ${parse(date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  return `${day} ${SESSION_WORDS[session]}`;
}

/** Market Mood in one sentence a non-investor understands. */
export function moodPlain(score: number): { headline: string; line: string } {
  if (score < 25) return { headline: "Investors are scared", line: "Lots of selling and hiding in safe places. Prices can swing hard on any news." };
  if (score < 45) return { headline: "Investors are nervous", line: "People are being careful right now — bad news tends to hit harder than good news helps." };
  if (score <= 55) return { headline: "Investors are calm", line: "Neither scared nor greedy. Reports this week will set the tone." };
  if (score <= 75) return { headline: "Investors are optimistic", line: "Money is flowing into stocks. Expectations are high, so a miss can sting." };
  return { headline: "Investors are euphoric", line: "Everyone's buying. That's often when it pays to be the calm one." };
}

/** Typical earnings move in words: ±2% is "a small wobble", ±10% is "a big jump either way". */
export function movePlain(move: number | null): string {
  if (move == null) return "We don't have enough past reports to say how much it usually moves.";
  const m = move.toFixed(1);
  if (move < 3) return `Usually moves about ±${m}% on a report — a small wobble.`;
  if (move < 6) return `Usually moves about ±${m}% on a report — a noticeable swing.`;
  if (move < 10) return `Usually moves about ±${m}% on a report — a big swing, up or down.`;
  return `Usually moves about ±${m}% on a report — a very big jump, up or down.`;
}
