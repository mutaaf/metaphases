/** 0044: each trend state from shared/grades.ts as words that fit "the stock is …". The Read used to print
 *  "in a recovering" / "in a pullback in uptrend". An unknown state gets no line, never a broken sentence. */
const TREND_PHRASE: Record<string, string> = {
  Uptrend: "in an uptrend",
  Downtrend: "in a downtrend",
  Sideways: "moving sideways",
  Recovering: "bouncing back but still below its long-term average",
  "Pullback in uptrend": "pulling back within an uptrend",
};

/** The Read's trend sentence. `upcoming`: a report is still ahead, so "Going into the report"; otherwise "Right now". */
export function trendLine(trend: string, rsi: number | null | undefined, upcoming: boolean): string | null {
  const phrase = TREND_PHRASE[trend];
  if (!phrase) return null;
  return `${upcoming ? "Going into the report, the stock is" : "Right now the stock is"} ${phrase}${rsi != null && Number.isFinite(rsi) ? `, with RSI ${rsi.toFixed(0)}` : ""}.`;
}
