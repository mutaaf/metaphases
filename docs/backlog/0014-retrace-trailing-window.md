---
id: 0014
title: Retrace shows the last 30 days when the month is young, so it's never empty in peak season
status: ready
priority: P1
size: S
lens: user-value
created: 2026-11-01
pr:
by: critic
---

## Why
On 2026-11-01, Retrace says "No results to grade yet". Meanwhile the scoreboard right above it says 55% of the S&P 500 has reported and 75% beat on EPS, and the last 7 days held MSFT, GOOGL, META, AMZN, AAPL-week peers, LLY, XOM and CVX. A first-time visitor sees an empty page on the busiest results week of the quarter, with a headline that contradicts it. The 2026-11-01-0506 critique flagged this as #5. It's still true at 0700 (screenshot `phone-retrace.png`).

## What
In `src/pages/Retrace.tsx`, when the current month (offset 0) has fewer than 25 graded reports, show the trailing 30 days instead. Label it "Last 30 days · Oct 2 – Nov 1" with a small note: "November results start Monday." The month arrows keep working as they do today.

## Acceptance criteria
- [ ] With the frozen clock moved to 2026-11-01 (fixture October data), Retrace shows ≥ 1 graded row and the label "Last 30 days"
- [ ] With ≥ 25 graded reports in the current month, the month view shows, unchanged
- [ ] Works at 390×844 touch and 1440×900, no horizontal scroll
- [ ] Loading / empty / error / partial states handled

## Test plan
e2e: set the clock to 2026-11-01 and assert the trailing label and a GOOGL or MSFT row. Unit: the window-selection helper.

## Out of scope
Changing how beats are judged (that's 0011).
