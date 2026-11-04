---
id: 0041
title: One report, one row; a calendar row never says "to come" for a report that's already in the history
status: ready
priority: P1
size: S
lens: data-quality
created: 2026-11-04
pr:
by: critic
---

## Why
Critique 2026-11-04 07:00. Live `/api/calendar?from=2026-10-26&to=2026-11-13`:
- **FDXF** has **three** rows for one Q3 report: `2026-10-28 h:""` with no actual, `2026-10-29 amc eA 1.49 rA $2.442B`, and `2026-10-29 amc` with no actual. A glancer sees FedEx Freight twice on the 29th (once reported, once pending) and once as a phantom on the 28th.
- **ROKU** reported on **Mon Nov 2** (company shareholder letter, SEC exhibit 99.1: revenue $1,502.0M, GAAP diluted EPS $1.20). The sheet's history already has the Nov 2 report from Nasdaq, yet the calendar still has a **Tue Nov 3 amc** row with no actual, a report "to come" that already happened.
The trader reads the duplicate as two events, and the season counters count the same report twice or count a finished report as still to come.

## What
- In the calendar merge (`worker/index.ts` calendar route, after 0013 overrides), collapse rows with the same symbol + fiscal `q`/`y` into one. Prefer the row with an actual, then a company override, then the latest-fetched date.
- If Nasdaq `earnings-surprise` (already fetched for sheets; cache-only lookup here, no new calls in the calendar path) shows a report for that quarter on a different date, the calendar shows it on Nasdaq's date with the actual, and the stale row goes away. If the cache is cold, leave the row and add a `warnings` note. Never fan out (LESSONS 2026-11-03).

## Acceptance criteria
- [ ] Unit test with the recorded FDXF rows: the merged output has exactly one FDXF Q3 2026 row, dated 2026-10-29 with `eA 1.49`
- [ ] Unit test: a ROKU-shaped case (calendar row Nov 3 with no actual, history Nov 2 with an actual for the same period) yields one row on Nov 2 with the actual
- [ ] Live sweep: 0 universe symbols with two rows for the same `q`/`y` in any 3-week range
- [ ] Season counters (reports, % reported, beat rate) count each report once (unit test on the counter with the FDXF fixture)
- [ ] Works at 390×844 touch and 1440×900; loading / empty / error / partial states unchanged

## Test plan
Vitest on the merge function with recorded FDXF and ROKU rows. The existing calendar e2e still passes on fixtures.

## Out of scope
Missing future dates (0015, 0038) and missing actuals (0040). No new hosts and no new upstream calls in the calendar path.
