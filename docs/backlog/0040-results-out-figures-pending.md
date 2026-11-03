---
id: 0040
title: Say "results out, figures pending" when a company has reported but the feed has no numbers yet, and flag actuals off the company's headline basis
status: ready
priority: P1
size: S
lens: data-quality
created: 2026-11-03
pr:
by: critic
---

## Why
Critique 2026-11-03 19:00 #3. **ADM** published Q3 on Nov 3 before the open (SEC 8-K: adjusted EPS **$1.77**, GAAP $1.70, revenue $22.34B). Twelve hours later `/api/calendar` still had `eA: null, rA: null`, so the Tuesday column shows ADM like a company that hasn't reported, and Nasdaq's per-day calendar had no EPS either. **APO** reported adjusted net income of **$2.07** a share and total revenues of **$4.739B** (SEC 8-K). The calendar has `eA 2.15` and `rA 1.374B` (which isn't total revenue). The verdict (a miss against $2.22) is the same either way, but the surprise is −3.4% instead of −7.0%, and the revenue figure isn't the company's.

## What
- In `/api/calendar` and the sheet, a tracked event whose session has passed by more than 2 hours with `eA == null` gets `pending: true` and renders "Reported · figures pending", not a blank or an upcoming style.
- When revenue actual / estimate is outside the 0011 sanity bound, show the EPS verdict only and label revenue "basis differs from the estimate", with no %, no tint (verify that 0011's guard also covers the calendar cell and the season scoreboard, not just the sheet).
- Optional, no new host: if Nasdaq's per-day calendar later carries `eps` for that row, prefer it when Finnhub's actual is null.

## Acceptance criteria
- [ ] Vitest: ADM-shaped event (bmo, today, clock 16:00Z, `eA null`) → `pending: true`; at 13:00Z → not pending
- [ ] e2e on fixtures: the pending event shows "figures pending" at 390×844 and 1440×900, without a beat/miss tint
- [ ] APO-shaped event (`rA/rE = 0.23`) shows no revenue % and no revenue tint anywhere (calendar cell, sheet, scoreboard counts)
- [ ] Loading / empty / error / partial states handled

## Test plan
Vitest on the pending rule and the revenue-basis guard in `shared/compare.ts` callers. e2e fixture row for each.

## Out of scope
Parsing SEC filings. Fixing Finnhub's EPS basis (record mismatches in the critique instead).
