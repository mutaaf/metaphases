---
id: 0085
title: A row moved to the company's date loses its EPS and revenue estimates when the requested range doesn't include the feed's old day (PDD, WSM on Thursday show no estimate)
status: ready
priority: P0
size: S
lens: data-quality
created: 2026-11-18
pr:
by: critic
---

## Why
Critic check 2026-11-18 06:55 UTC. The same PDD and WSM rows on Thu Nov 19 have estimates or not depending on the range asked for:

| `/api/calendar` range | PDD `eE` / `rE` | WSM `eE` / `rE` |
|---|---|---|
| `2026-11-16 → 11-22` | 19.213 / 117.1B | 2.2063 / 2.02B |
| `2026-11-01 → 11-30` | 19.213 / 117.1B | 2.2063 / 2.02B |
| `2026-11-18 → 11-30` | **null / null** | **null / null** |
| `2026-11-19 → 11-19` | **null / null** | **null / null** |

DLTR (Nov 24) and SQM (Nov 18) also come back with `eE: null` in `11-18 → 11-30`. The SPA asks for exactly these ranges: on the phone, opening a sheet fired `/api/calendar?from=2026-11-19&to=2026-11-25` and `?from=2026-11-18&to=2026-11-24`, and the home asks for "today" alone (`?from=2026-11-18&to=2026-11-18`). So on Thursday, the peak day, "today" will show PDD and WSM, two of the day's biggest reporters, with no Street estimate.

Cause: `applyToEvents` (`shared/dateOverrides.ts:58`) only sees the feed rows in `[from, to]`. When the feed has the report on a day outside the range (PDD Nov 16, WSM Nov 17), `found` is empty, and the row is rebuilt with `eE: null, rE: null`. The sheet (`applyToRows`, per symbol) is unaffected, so the sheet and the calendar disagree.

## What
- When an active override's date is in range but its feed row may sit outside it, read that row from the cached days around it. `oneRowInRange` already reads ±`SAME_REPORT_DAYS` neighbours from `caches.default`, and an override's matching window is 21 days. Or carry `eE`/`rE` into the override row from the symbol's cached `symbol=` rows. No new upstream calls.
- If no estimate can be found, keep `null` (shown as "—"). Never invent one.

## Acceptance criteria
- [ ] Unit: a WSM-shaped override (feed row Nov 17 with `eE` 2.2063, override Nov 19) applied to range `11-19 → 11-19` keeps `eE` 2.2063 and `rE`, given the neighbour day's rows
- [ ] Live: PDD and WSM have the same `eE`/`rE` in `/api/calendar` for `11-16→11-22`, `11-18→11-24`, `11-19→11-19` and `11-19→11-25`
- [ ] The Nov 19 "today" view on Thursday shows both estimates at 390×844 and 1440×900
- [ ] No extra Finnhub or Nasdaq calls per request (cache reads only); a cold neighbour cache leaves `null`, never a 500

## Test plan
Vitest on `applyToEvents` (or its caller) with an override whose feed row is outside `[from, to]`; a worker test that a single-day range returns the estimate from a cached neighbour day.

## Out of scope
Feed estimates that are wrong in themselves (SKYD's Q3 revenue estimate of $16.27B against a $7.07B consensus; its surprise is already suppressed as `basis: differs`).

## Critic re-check 2026-11-18 19:00 UTC (still live; raised to P0)
Still reproduces on the 16:04 UTC build, and now for **BBWI** too (0084 moved it to Nov 19): `/api/calendar?from=2026-11-19&to=2026-11-19` gives PDD, WSM and BBWI `eE: null, rE: null`, while `11-16→11-22` gives 19.213, 2.2063 and 0.1213. In `11-18→11-28`, PDD and WSM are null as well. The phone home really fires a one-day "today" call (`?from=2026-11-18&to=2026-11-18` was observed this run), so **from 00:00 ET Thursday the Today view will show three of the peak day's company-confirmed reporters without an estimate**, while their sheets show one. Raised to P0 because the calendar and the sheet disagree on the busiest day of the season. Bounce count: 0 (never shipped).
