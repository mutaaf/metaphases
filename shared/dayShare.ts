// The `?day=` unfurl text (worker shareMeta). 0067: on a market holiday nothing is a dated report, so the title says
// the market is closed and any rows the feed projects there are named as unconfirmed, never counted as earnings.

export function dayShareText(label: string, holiday: string | null, dated: string[], unconfirmed: string[]): { title: string; desc: string } {
  const list = (syms: string[]) => `${syms.slice(0, 4).join(", ")}${syms.length > 4 ? ` and ${syms.length - 4} more` : ""}`;
  if (holiday) {
    // A company can date a report on a holiday itself (an override, or figures already in): those stay named.
    const named = dated.length ? ` ${list(dated)} ${dated.length === 1 ? "has" : "have"} a company-given date here.` : "";
    const proj = unconfirmed.length ? ` Our data feed projects ${list(unconfirmed)} here, so ${unconfirmed.length === 1 ? "that date is" : "those dates are"} not confirmed.` : "";
    return {
      title: `Market closed on ${label} (${holiday}) · Metaphases`,
      desc: named || proj ? `The exchanges are shut for ${holiday}.${named}${proj}` : `The exchanges are shut for ${holiday}, so no company reports that day.`,
    };
  }
  return {
    title: `${dated.length} earnings on ${label} · Metaphases`,
    desc: dated.length ? `${list(dated)} — sorted by session, with estimates, results and how each stock has reacted before.` : `A quiet day on the earnings calendar.`,
  };
}
