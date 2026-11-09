---
id: 0039
title: Once a company has reported, the sheet, The Read and the share card say so the same day
status: shipped
priority: P0
size: M
lens: data-quality
created: 2026-11-03
pr: 74
by: critic
---

## Update, critique 2026-11-04 19:00: still live on day 2 of peak week, now with a −12% move
At 19:00 UTC Nov 4 (2 pm ET, about 7 h after the open), **21 tracked names** that reported before today's open have a calendar actual while their sheet's `next` is still today (DDOG, ECX, EMR, FLUT, GFS, GWW, KD, KHC, MCD, MDLN, MLCO, MLM, NATL, OC, OPCH, PFGC, PODD, PRGO, Q, RIOT and CVS). The worst one: **CVS is −12.16%**, the calendar has `eA 2.09` vs `eE 1.667`, and `/t/CVS` says "NEXT REPORT · Q3 2026 · Wednesday, November 4 · Before open · today · EPS EST $1.67", "CVS Health Corporation reports Q3 on Wednesday, Nov 4 before the opening bell", "WHAT TO WATCH IN THIS REPORT · WRITE THE PREVIEW" and "that's the size of swing to be ready for" (`p-CVS-trader.png`). Compass also lists CVS's Nov 4 report as one "touching your money", ahead of it.

The day-after half has improved on its own: ADM now has `history[0]` Nov 3, `epsA 1.77`, `move −6.8%`, and The Read says "versus $1.77 last quarter" (Nasdaq caught up about 30 h after the print). The same-day half is unchanged. The live-sweep criterion still fails: **0 of 21** pass.

## Update, critique 2026-11-04 07:00: the day after is worse
On day 2, the report vanishes. ADM reported Nov 3 before the open and is **−6.82%**. At 06:55 UTC Nov 4, `/t/ADM` says "NEXT REPORT · Q4 2026 · Monday, February 1 · in 89 days", and The Read says "reports Q4 on Monday, Feb 1… Wall Street expects $1.40 a share, versus **$1.84 last quarter**". That's Q2: Q3's $1.77 adjusted isn't anywhere on the page. og:title is "ADM reports Mon, Feb 1". Nasdaq `earnings-surprise` still has 8/4/2026 as the latest row, and the calendar row still has `eA:null`. So no source has the result, and the sheet moved on. Extra acceptance: until a source has the actual, a quarter whose session has passed stays visible as "Reported Tue, Nov 3 · figures not in yet" on the sheet, in The Read and in og, for at least 3 trading days. It never falls back to "last quarter" = the quarter before.

## Why
Critique 2026-11-03 19:00 #1. At 18:51 UTC (1:51 pm ET) on Tue Nov 3, `/api/calendar` already had actuals for 79 of the 81 names that reported before the open (PFE `eA 0.87` vs `eE 0.73`, SHOP, ETN, MPC, APO…). But every one of those sheets still said:
- `NEXT REPORT · Q3 2026 · Tuesday, November 3 · Before open · today · EPS EST $0.73` (`p_t_PFE_sheet.png`);
- The Read: "Pfizer Inc. **reports** Q3 on Tuesday, Nov 3 before the opening bell. Wall Street **expects** $0.73 a share… **Into the print** it's in an uptrend" (that's post-report price action described as the setup);
- a "WRITE THE PREVIEW" button for a report that's already out;
- `/t/PFE` unfurls "PFE reports Tue, Nov 3 before the open" / "Street expects $0.73 EPS".
The next day it corrects itself (PLTR, AAPL, VRTX on Nov 3: `history[0]` is Nov 2 and `next` is Q4). So the stale window is exactly the hours of peak attention: from the print until NY midnight for before-open reporters (about 17 h), and the whole evening for after-close ones. Cause: `worker/index.ts:190` picks `nextE` as the first event with `date >= today` and never looks at its `epsActual`; history only comes from Nasdaq's surprise table, which lags a day.

## What
- In the ticker route, if `nextE.date === today` and the event has an actual (from the `symbol=` row, or the same day's per-day calendar row the calendar route already caches), treat it as **reported**: put it at the head of `history` (`epsE`, `epsA`, surprise, session, and `move` once a post-report bar exists), and set `next` to the following quarter.
- If the session has passed (bmo after 9:30 ET, amc after 16:00 ET) and there's still no actual, `next` gets `status: "results-pending"` and the sheet says "Reported this morning · figures not in yet", not "expects". (0040 covers the calendar side.)
- The Read switches to past tense ("Pfizer reported $0.87 a share against $0.73 expected: a beat of 19%") and drops "into the print" setup language once the report is out.
- Hide "Write the preview" once reported; share meta (`/t/:sym` og:title/description) uses the reported line.
- The calendar and the sheet must never disagree on whether a report happened.

## Acceptance criteria
- [ ] Vitest with a recorded PFE row (date today, bmo, `epsActual 0.87`) and clock 2026-11-03T18:00Z: `next.quarter === 4` and `history[0]` is the Nov 3 report with `epsA 0.87`
- [ ] Same with `epsActual null` at 18:00Z: `next.status === "results-pending"`, and The Read contains no future-tense "reports"/"expects" sentence for that quarter
- [ ] `/t/PFE` og:title at that state doesn't contain "reports Tue, Nov 3"; og:description doesn't say "Street expects"
- [ ] Critic sweep on a live report day: for every tracked name with a same-day calendar actual, the sheet's `history[0].date` equals that day (0 mismatches)
- [ ] e2e on fixtures at 390×844 and 1440×900: the reported sheet shows the actual and beat/miss, with no preview button
- [ ] Loading / empty / error / partial states handled

## Test plan
Vitest on the next/history selector (reported today, pending today, not yet due, foreign currency). e2e fixture with a same-day actual.

## Out of scope
The price-move reaction for the same day (it can show "—" until the first post-report close). Estimate drift (0035) and orphaned projections (0038).
