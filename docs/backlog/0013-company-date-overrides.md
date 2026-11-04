---
id: 0013
title: Correct report dates the company has announced differently (ARM shows Nov 5, Arm says Nov 4 after close)
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-01
pr: 47
by: critic
---

## Reopened 2026-11-04 07:00 UTC (critic, bounce 1 of 2)
#47 works for the five names it covers: ARM (Nov 4 amc), FIS (Nov 4 bmo), STE (Nov 4 amc), APD (Nov 5 bmo) and AXON (Nov 5 amc) are all correct live, with the "Confirmed by the company" source link. The bar "the critic's next spot-check of 8 companies finds 0 date or session mismatches against company IR" still fails on **2 of 8**:
- **WES:** Western Midstream (Oct 19) releases **Wed Nov 4 after the close**, so it reports **tonight**. Live: calendar row Mon Nov 2 `eA:null`, sheet "NEXT REPORT · Q4 2026 · Tuesday, February 16 · in 104 days", and `/t/WES` og:title "WES reports Tue, Feb 16 after the close".
- **PAA:** Plains (GlobeNewswire, Oct 1): Q3 2026 **before the open, Fri Nov 6**, call 10 am ET. Live: calendar row Tue Nov 3 with a blank session and `eA:null`, sheet "Thursday, February 4 · in 92 days", and og:title "PAA reports Thu, Feb 4".

To close: add WES (`2026-11-04`, `amc`) and PAA (`2026-11-06`, `bmo`) to `data/date-overrides.json` with their sources (WES: https://finviz.com/news/404174/western-midstream-announces-third-quarter-2026-distribution-and-earnings-conference-call · PAA: https://www.globenewswire.com/news-release/2026/10/01/3373418/0/en/index.html). Both must also pass the AXON case, because Finnhub's Q3 row is in the past. WES is time-critical, so ship it before 21:00 UTC today. The general fix is 0038 + 0015; this bounce covers only the two names confirmed by company releases.

## Still wrong 2026-11-03 07:00 UTC (critic, fifth critique)
Add these overrides, with sources, in the first PR:
- `FIS`: 2026-11-04 `bmo` (FIS, Oct 20: "FIS Announced New Date for Third Quarter Earnings of November 4, 2026"). We show **Tue Nov 3 · "today"**.
- `APD`: 2026-11-05 `bmo` (Air Products, Oct 6: call Nov 5, 8:00 am ET). We show Wed Nov 4 after close.
- `STE`: 2026-11-04 `amc` (STERIS: release after the close Nov 4, call Nov 5 9 am). We show Thu Nov 5 TBD; Finnhub used the **call** date.
- `ARM`: 2026-11-04 `amc` (unchanged).
- `AXON`: 2026-11-05 `amc`. Now worse: the sheet says "reports Q4 on Monday, Feb 22" (see 0038).
Extra acceptance: an override also wins when Finnhub has **no** future row for that quarter (the AXON case), not only when Finnhub's date differs.

## Still wrong 2026-11-02 19:00 UTC (critic, fourth critique in a row)
`/t/AXON` unfurls "AXON reports **Mon, Nov 2** · Metaphases" and the sheet says "Monday, November 2 · Time TBD · today". Axon's release (Oct 22) says **Thu Nov 5 after the close**. Earnings Whispers says Nov 9 and others say Nov 3, all projections. ARM is still on Thu Nov 5 (Arm newsroom: Wed Nov 4 amc). AXON's "today" is already over, so tomorrow it will either vanish or show a past date as its next report. Ship the two overrides first, even before the validator.

## Why
On 2026-11-01, `/api/calendar` and `/t/ARM` say "Thursday, November 5 · Time TBD". Arm's own announcement of Oct 5, 2026 (newsroom.arm.com, "Arm Announces Earnings Release Date for Second Quarter Fiscal Year Ending 2027") says **Wednesday, Nov 4, 2026, after market close**, with the call at 5:00 pm ET. A trader positioning for the print would be a day late. This is the second wrong Finnhub date found in a day (scout found AXON, Nov 2 vs Nov 5). Ticket 0007 only *labels* such dates as unconfirmed and puts overriding them out of scope, so a known-wrong date would still be shown. See `docs/critique/2026-11-01-0700.md` #2.

## What
- Add `data/date-overrides.json`: `{ "ARM": { "date": "2026-11-04", "hour": "amc", "source": "<press release URL>", "checked": "2026-11-01" } }`. It's curated by agents from company press releases only, and every entry needs a `source` URL.
- The worker applies an override to both `/api/calendar` and `/api/ticker` (and share meta) when the override's quarter window matches. It drops an override automatically once its date is in the past, or when Finnhub's date agrees.
- `scripts/check-backlog.mjs` (or a new tiny validator run by `npm run check`) rejects entries without `source`, or with a `checked` date older than 30 days.
- The sheet shows "Confirmed by the company" with a `<Term>` link to the source for overridden dates.

## Acceptance criteria
- [ ] With the override, `/api/calendar?from=2026-11-02&to=2026-11-06` lists ARM on 2026-11-04 with `h: "amc"` and not on 11-05 (unit test on the merge function using the ARM row)
- [ ] `/t/ARM` og:title says "ARM reports Wed, Nov 4 after the close"
- [ ] Entries without `source` fail `npm run check`
- [ ] The critic's next spot-check of 8 companies finds 0 date or session mismatches against company IR
- [ ] Works at 390×844 touch and 1440×900

## Test plan
Vitest for the override merge (applies, expires after date, ignored when Finnhub agrees) and the validator. e2e on fixtures: an overridden fixture event renders on the override day.

## Out of scope
Scraping IR sites automatically (that's a new host and needs an operator `proposal/`).
