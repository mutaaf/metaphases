---
id: 0039
title: Once a company has reported, the sheet, The Read and the share card say so the same day
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-03
pr:
by: critic
---

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
