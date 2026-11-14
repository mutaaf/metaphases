---
id: 0075
title: A lone stale row moves to the day the company actually reported (ROKU on Nov 2, not Nov 3)
status: ready
priority: P1
size: S
lens: data-quality
created: 2026-11-14
pr:
by: builder
---

## Why
Split from 0041 (PR #120). 0041 collapses twin rows of one report and, between twins, keeps the day Nasdaq's report history gives (`nd`). A **lone** stale row is still shown on the feed's day: ROKU's calendar row on Tue Nov 3 (after close) with history saying Mon Nov 2 is filled by 0072's one-trading-day match and shown as reported on Nov 3, the wrong day. Since Nasdaq dates some after-close reports the next morning, a one-day gap alone can't tell which day is right.

## What
- When the history's day differs from a lone past row's day, move the row to the history's day only when that is unambiguous. Examples: history before the row's day, with the row bmo or with no session (a report can't be dated before it happened); or a gap of 2 to 10 trading days with a fiscal-period match (`fiscalQtrEnd`).
- The moved row keeps its figures. A range that no longer holds the day drops it, and the range holding the new day shows it, through the cache-only neighbour read from 0041 (`oneRowInRange`).
- No `warnings` on a cold cache (0047).

## Acceptance criteria
- [ ] Unit: ROKU-shaped lone row (Nov 3 amc, no actual; history Nov 2) gives one row on Nov 2 with the actual, or stays on Nov 3 with the reason recorded if the rule says the gap is ambiguous
- [ ] Unit: a lone row 2–10 trading days from a same-period history report moves; one matching only the previous quarter does not
- [ ] Live sweep: 0 universe symbols with two rows within 7 days in any 3-week range (carried from 0041)

## Test plan
Vitest on `settlePastRow` and through `/api/calendar` with a made-up symbol.

## Out of scope
Future dates (0015, 0038).
