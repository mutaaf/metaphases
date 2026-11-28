---
id: 0119
title: Kohl's, Urban Outfitters and Helmerich & Payne sit on the wrong day in the calendar (a day off the company's own date) with no session, while their sheets give the right day
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-28
pr:
by: critic
---

## Why
Critic check 2026-11-28 07:00 UTC (build `61993394`, deployed 04:01). The operator's focus (2) is "every date and session correct". Three reports from the last fortnight sit on the wrong day in the calendar, and in each case the sheet for the same company gives the right day:

| Ticker | `/api/calendar` row | Company / Nasdaq | `/api/ticker` history |
|---|---|---|---|
| **KSS** | `d: 2026-11-23`, `h: ""`, eE −0.01, eA 0.32, `pr: "n"` | [Kohl's Q3 2026 release (8-K ex. 99.1)](https://www.sec.gov/Archives/edgar/data/0000885639/000119312526473133/d168523dex991.htm) is dated **Nov 24, 2026**. Nasdaq `earnings-surprise`: `dateReported 11/24/2026`, and Nasdaq's day calendar lists KSS on **2026-11-24** | `2026-11-24 · bmo` |
| **URBN** | `d: 2026-11-23`, `h: ""`, eE 1.53, eA 1.54 | Nasdaq: `11/24/2026`, and the day calendar lists URBN on 2026-11-24 | `2026-11-24 · amc` |
| **HP** | `d: 2026-11-19`, `h: ""` | Nasdaq: `11/18/2026` | (sheet not checked) |

All three are past rows with an actual and an empty session. Of the 499 rows from Nov 2 to Nov 27, 11 have no session (BLD, ODP, WSE, ROAD, INTU, HP, KSS, URBN, DIDIY, CHA, DE). ROAD, INTU and DE match Nasdaq's date, so the blank session alone isn't the bug. The bug is a Finnhub date nobody cross-checked once the report was out. The calendar puts Kohl's (stock +19.5% on the report) on a Monday when it reported on Tuesday, with no "before open" or "after close". The sheet, which reads Nasdaq, says Tuesday before the open. A trader reading Retrace, the Nov 23 drawer or the week's reactions gets the wrong day. The reaction move is measured from the wrong close too, unless the sheet is opened.

The 0114 cross-check covers upcoming days only; past rows are never reconciled with Nasdaq's report date.

## What
- When a past row has an actual and Nasdaq's `earnings-surprise` (already read for the sheet) or Nasdaq's day calendar (already read for `pr: "n"` estimates) dates the same quarter on a neighbouring day (±3 trading days), move the row to Nasdaq's day and take the session the sheet uses. This applies to the calendar API, and so to the drawer, Retrace, the season strip and the brief.
- If the dates can't be reconciled without extra subrequests in the read path (0114's 50-subrequest budget), do it in the existing fill step and remember the verdict per report (like the 0103 memo), so a re-read costs nothing.
- State the Nasdaq calls per minute before and after.

## Acceptance criteria
- [ ] Live: `/api/calendar?from=2026-11-23&to=2026-11-27` has KSS and URBN on **2026-11-24**, with a session that matches their sheets (`bmo` and `amc`), on 5 of 5 reads; none on 2026-11-23.
- [ ] Live: `/api/calendar?from=2026-11-16&to=2026-11-20` has HP on 2026-11-18.
- [ ] Live sweep: for every past row from Nov 2 to Nov 27 with an actual, the calendar's date equals the date in the company's `/api/ticker` history (0 mismatches; list any exceptions with reasons in the PR).
- [ ] Unit: a past Finnhub row dated a day before Nasdaq's `dateReported` for the same quarter is moved to Nasdaq's day; a row Nasdaq dates on the same day is unchanged.
- [ ] No new 1102s; Finnhub ≤ 60/min.
- [ ] Works at 390×844 and 1440×900 (the Nov 24 drawer lists Kohl's under Before open).

## Test plan
Vitest through `/api/calendar` with a Finnhub stub that dates KSS Nov 23 and a Nasdaq stub that dates it Nov 24: the row comes back on Nov 24 with `h: "bmo"`. A second vector where both agree stays unchanged.

## Out of scope
Upcoming dates (0114, 0024). Days the feed has dropped (0118).
