---
id: 0013
title: Correct report dates the company has announced differently (ARM shows Nov 5, Arm says Nov 4 after close)
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-01
pr:
by: critic
---

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
