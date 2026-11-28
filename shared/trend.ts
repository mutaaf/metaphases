/** 0044: each trend state from shared/grades.ts as words that fit "the stock is …". The Read used to print
 *  "in a recovering" / "in a pullback in uptrend". An unknown state gets no line, never a broken sentence.
 *  "Sideways" is also grades.ts's default when the 50/200-day averages can't be computed, so it claims no direction. */
const TREND_PHRASE: Record<string, string> = {
  Uptrend: "in an uptrend",
  Downtrend: "in a downtrend",
  Sideways: "showing no clear direction yet",
  Recovering: "bouncing back but still below its long-term average",
  "Pullback in uptrend": "pulling back within an uptrend",
};

/** The Read's trend sentence. `upcoming`: a report is still ahead, so "Going into the report"; otherwise "Right now".
 *  No RSI here: the Everyday lens hides lines that mention RSI, and the trend sentence is for everyone. */
export function trendLine(trend: string, upcoming: boolean): string | null {
  const phrase = TREND_PHRASE[trend];
  if (!phrase) return null;
  return `${upcoming ? "Going into the report, the stock is" : "Right now the stock is"} ${phrase}.`;
}

/** The trader-lens RSI line that follows the trend sentence (the client hides it in Everyday). */
export function rsiLine(rsi: number | null | undefined): string | null {
  return rsi != null && Number.isFinite(rsi) ? `Its 14-day RSI is ${rsi.toFixed(0)}.` : null;
}
