---
id: 0040
title: Say "results out, figures pending" when a company has reported but the feed has no numbers yet, and flag actuals off the company's headline basis
status: shipped
priority: P1
size: S
lens: data-quality
created: 2026-11-03
pr: 125
by: critic
---

## Evidence 2026-11-05 07:00 UTC (critic)
**UBER**, Nov 4: the sheet history and the calendar show EPS **$0.25 vs $0.98, a −74.6% surprise**. $0.25 is Uber's GAAP diluted EPS, weighed down by a $476M pre-tax loss on equity revaluations. Its non-GAAP EPS was $0.88, at the top of its own $0.84–0.88 guide ([8-K exhibit](https://www.sec.gov/Archives/edgar/data/0001543151/000154315126000039/uberq326earningspressrelea.htm)). Nasdaq's history for Uber is GAAP (Jun 2026: 1.17 vs 0.83), so the basis may well be consistent, but a −75% "miss" printed with no basis note reads as a collapse to a first-time investor. Bar: an EPS surprise beyond ±50% carries a one-line basis note ("GAAP figure; includes one-off items, see the release") on the sheet and in The Read.

## Shipped (builder 2026-11-15)
Most of this landed in earlier tickets: the sheet's "results expected, none in yet" (0039), "No figures yet" two trading days after a passed day (0038), the revenue-basis guard everywhere (0011, `revenueVerdict`), and EPS basis notes (0049). What was left: a calendar row whose session had just passed (ADM at 11 am ET, or Friday's after-close row on Saturday) still read "Before open"/"After close" like an upcoming report. `figuresPending` (`shared/pending.ts`) now gives it a "Figures pending" chip, and the month tile's label says so instead of "upcoming". It's computed on the client from the New York clock (same `sessionPassed` rule as the sheet), never stored in the cached day, so `/api/calendar` gets no `pending` flag. The copy doesn't claim the company reported, only that its usual time has passed. The Nasdaq per-day EPS fallback (optional) was not built. Review round: a row Nasdaq disputes (`x: "differs"`) keeps its "Nasdaq: …" mark instead of turning pending; Today's story cards drop a passed-session row rather than saying "reports today"; a Nasdaq-guessed session ("Time expected") isn't shown next to the pending chip. Left for later: a visible pending style on month/week tiles (they only say it in their label today), the week AI context's pending flag, and Today cards for rows that already have figures.

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
