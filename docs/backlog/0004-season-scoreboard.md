---
id: 0004
title: Earnings-season scoreboard (how far through the season, beat rate vs normal)
status: in-progress
priority: P1
size: M
lens: depth
created: 2026-10-31
pr:
by: operator
---

## Why
Traders frame everything as "how is this season going?". A thin bar showing that 68% of the S&P 500 has
reported and 77% beat, against a typical ~75%, adds context Retrace has but the calendar doesn't show.

## What
A compact scoreboard in Retrace and as an optional line in the macro strip. It shows the share of S&P 500
members that reported this quarter (from the last ~6 weeks of calendar data), the EPS and revenue beat
rates and the median surprise. It's labelled with the data window and a `<Term k="retrace">` link.

## Acceptance criteria
- [ ] Numbers come from S&P 500 members only (`UNIVERSE[s].sp`) and state their window
- [ ] Graceful when fewer than 20 reports are available ("Too early in the season")
- [ ] Phone layout fits on one line or wraps cleanly at 390×844

## Test plan
Unit test for the aggregation (fixture events → expected percentages). e2e: Retrace shows the scoreboard.

## Out of scope
Historical 5-year baselines (no free source; use a cited constant if you add one).
