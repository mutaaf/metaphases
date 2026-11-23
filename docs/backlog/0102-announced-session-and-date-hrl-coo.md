---
id: 0102
title: Hormel shows "after close" for a before-the-open report, and Cooper sits a day early; both companies announced, and Nasdaq agrees with them
status: shipped
priority: P0
size: S
lens: data-quality
created: 2026-11-22
pr: 183
by: critic
---

## Why
Critic check 2026-11-22 19:00 UTC, against the operator's focus (2): every date and session correct, with company-published dates beating Finnhub.

| Ticker | Metaphases now | Company | Nasdaq | Past 4 reports on the sheet |
|---|---|---|---|---|
| HRL | Thu Dec 3 · **after close** on the calendar row, the sheet ("After close · in 11 days") and the unfurl ("HRL reports Thu, Dec 3 after the close") | Hormel (announced Nov 3): Q4 results **Thu Dec 3 before the market opens**, call 8 a.m. CT ([Hormel PDF](https://s204.q4cdn.com/636391999/files/doc_news/Hormel-Foods-Corporation-Announces-Fourth-Quarter-Earnings-Call-2026.pdf), [finviz](https://finviz.com/news/414909/hormel-foods-corporation-announces-fourth-quarter-earnings-call)) | Dec 3, pre-market | bmo, bmo, bmo, bmo |
| COO | **Wed Dec 2** · after close, unfurl "unconfirmed; Nasdaq lists Thu, Dec 3" | CooperCompanies: Q4 results **Thu Dec 3 at 4:15 p.m. ET**, call 5 p.m. ET ([summary](https://www.biopharmawatch.com/news/COO/coopercompanies-release-date-fourth-quarter-full-year-2026), company IR at investor.coopercos.com) | Dec 3, after hours | amc ×4 |

Hormel is the worse of the two. The sheet even says "the two calendars disagree on the time", yet it still headlines the feed's after-close, against the company, Nasdaq and four straight before-open reports. A trader planning around the open would miss the print.

## What
1. Add `HRL` (`2026-12-03`, `hour: "bmo"`) and `COO` (`2026-12-03`, `hour: "amc"`) to `data/date-overrides.json`. Read the company releases first, as the file's `_readme` requires. COO's own release must be found on investor.coopercos.com or a newswire; if it can't be, add the date only after confirming it.
2. Rule fix so the next Hormel doesn't need a hand-added override: when a timed feed session contradicts **both** Nasdaq's session for the same day **and** every one of the last ≥3 dated reports, the headline session is Nasdaq's. The feed's session is shown as the disagreement (the 0099 shape, applied to session instead of day). Calendar row, sheet, unfurl, ICS and Today must agree (the lesson from #176).

## Acceptance criteria
- [ ] Live: `/api/calendar?from=2026-12-03&to=2026-12-03` has HRL `h: "bmo"` and COO on Dec 3 `amc`. No COO row on Dec 2.
- [ ] Live: `/t/HRL` reads "Before open" and the `og:title` says "before the open". `/t/COO`'s `og:title` names Thu, Dec 3 with no "unconfirmed".
- [x] ~~Unit: a fixture with feed `amc`, Nasdaq `bmo` and history `bmo×4` yields `next.session === "bmo"`. With history mixed (2–2), the feed's session is kept and the disagreement is flagged.~~ Moved to 0104.
- [ ] 390×844 screenshot of the Dec 3 drawer shows HRL under Before open.

## Test plan
`tests/unit/announced0081Overrides.test.ts` covers the new entries (source and checked date). Add a session-contest unit test next to the 0099 tests. Extend the e2e day-drawer fixture if the rule lands.

## Out of scope
DE and MRVL, which are company-dated with no stated session: they already show the habit label (0091).

## Builder note (2026-11-23)
Shipped part 1: HRL (Dec 3, bmo, Hormel's own PDF) and COO (Dec 3, amc, CooperCompanies' GlobeNewswire release) in `data/date-overrides.json`, with `tests/unit/announced0102Overrides.test.ts` covering the calendar, the sheet and the share title. Part 2, the general session rule, moved to **0104**. The calendar row only has the feed's session and Nasdaq's, with no per-company report history, so a sheet-only rule would break the "calendar, sheet, unfurl, ICS and Today agree" bar (#176). It needs its own design.
