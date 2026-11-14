---
id: 0072
title: A past calendar day lists reports that never happened (NIO "1 reporting" on Nov 11) and reports that did with "No figures yet" (Amcor, Atmos, Nov 4)
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-14
pr:
by: critic
---

## Why
Critic check 2026-11-14 07:00 UTC, build `ec6b9067`. `/api/calendar?from=2026-11-02&to=2026-11-13` has 16 past rows with no actuals. Two kinds of them are shown as fact:

- **A report that hasn't happened.** `/?day=2026-11-11` on the phone reads "1 REPORTING · Wednesday, November 11 · TIME TBD · NIO · No figures yet" (`shots/p_b_day11-11.png`), and the month cell counts Nov 11 as `01`. NIO hasn't reported or announced a date: its own sheet says `overdue: true`, "Date not confirmed", and the og title is "NIO's Q3 report: date not confirmed yet". Last year NIO reported Q3 on Nov 25 ([NIO IR](https://ir.nio.com/news-releases/news-release-details/nio-inc-report-unaudited-third-quarter-2025-financial-results)). The calendar and the sheet disagree one tap apart.
- **A report that did happen, ten days later still blank.** Amcor (`t: 1`, S&P 500) and Atmos Energy (`t: 1`, S&P 500) sit on Nov 4 after the close with `eA: null, rA: null`, so the drawer shows "No figures yet". Both reported that day: Amcor adjusted EPS $0.95 vs $0.96 ([Zacks via search](https://www.zacks.com/stock/news/3024700/)), Atmos $1.17 vs $1.14 ([8-K Ex. 99.1](https://www.sec.gov/Archives/edgar/data/0000731802/000073180226000129/ato20261104exhibit991.htm)). Our own `/api/ticker/AMCR` and `/api/ticker/ATO` `history[0]` already carry those pairs from Nasdaq (`2026-11-04`, 0.95/0.96 and 1.17/1.14). BN (Nov 12, 0.73 vs 0.72 in its sheet history) is in the same state.

Focus item 1: "no failure ever shown as a fact". A glancer reading back over last week sees NIO as having reported, and sees two S&P names as never having reported.

## What
- **Did report:** when a past calendar row has no `eA` and the symbol's Nasdaq `earnings-surprise` (already fetched for the sheet, cached) has a row dated within ±1 trading day of it, fill `eA` (and `eE` for judging, per `epsVerdict`/0058, carrying `nA`) so the row judges like any other. Revenue stays null unless a source gives it. Fill it in the worker's calendar build (or the supplement), not per client.
- **Didn't report:** when a row's date has passed by more than 2 trading days, there are no actuals from either feed, and the sheet logic (`shared/pending.ts`, `next.overdue`) would call the quarter overdue, mark the row (e.g. `od: true`). The client then treats it like the `c` closed-day rows (0064, `splitClosed`): not counted as reporting, grouped under "Date not confirmed" with a line saying the feed expected it that day and there are no results yet, out of the month count, the week brief, Compass and the og counts.
- Reuse the existing helpers (`noResultYet`, `splitClosed`, `dateMark`) rather than adding a third path.

## Acceptance criteria
- [ ] `/api/calendar?from=2026-11-02&to=2026-11-13` on production: AMCR and ATO on Nov 4 carry `eA` 0.95 and 1.17, and BN on Nov 12 carries 0.73; their drawer rows show a beat/miss chip, not "No figures yet"
- [ ] `/?day=2026-11-11` at 390×844 and 1440×900 doesn't say "1 reporting"; NIO sits under "Date not confirmed" with the overdue line; the Nov 11 month cell shows no count
- [ ] Unit: a fixture with a past no-actual row plus a matching Nasdaq surprise fills `eA`; one without a match and > 2 trading days old is flagged and excluded from counts
- [ ] e2e on the frozen fixture clock: an overdue row renders under "Date not confirmed", and the day's count excludes it
- [ ] Retrace's season scoreboard counts AMCR and ATO as reported once filled (note the before/after numbers in the PR)

## Test plan
Unit tests for the fill and the flag in `shared/` (the calendar build path). e2e: extend the closed-day spec with an overdue fixture row.

## Out of scope
Finding NIO's real date (it hasn't announced). Revenue actuals for filled rows.
