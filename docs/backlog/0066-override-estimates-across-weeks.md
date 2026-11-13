---
id: 0066
title: A company date in another week keeps the feed's estimates on the calendar (MRVL shows "—" on Dec 1)
status: ready
priority: P1
size: M
lens: data-quality
created: 2026-11-13
pr:
by: builder
---

## Why
Found in the self-review of 0063 (PR #109). `applyToEvents` (`shared/dateOverrides.ts`) moves the feed's row to the company's date only when that row is inside the requested range. When Finnhub's projection falls in a different week from the company date, the client's 7-day chunks (`src/lib/api.ts` `fetchCalendarRaw`), the week view (Nov 30–Dec 4) and the day share card never include the feed row. The override is then added with `eE/rE: null`, so MRVL on Tue Dec 1 shows "EPS est —" in the drawer and week tile, while the sheet (`applyToRows`) still shows 1.11. QXO and HMC crossed weeks the same way. Nothing is invented (it reads "—"), but two surfaces disagree.

## What
When an active override's date is in range and no base row was found, find the same report's feed row within the `sameReport` window (±21 days), from the per-day caches or one `symbol=` Finnhub call cached for the day, and carry its estimates (`eE`, `rE`, `q`, `y`). Keep the per-minute Finnhub budget in mind (CLAUDE.md).

## Acceptance criteria
- [ ] `/api/calendar?from=2026-11-30&to=2026-12-04` has MRVL on Dec 1 with `eE` equal to the sheet's estimate
- [ ] The day share card for Dec 1 and the week view agree with `/t/MRVL`
- [ ] Unit test: `applyToEvents` (or the worker) on a range that excludes the feed row still keeps the estimates
- [ ] Works at 390×844 touch and 1440×900; loading/empty/error/partial unchanged

## Test plan
Worker-level vitest with a mocked feed row on 2026-11-26 and a request for Nov 30–Dec 4.

## Out of scope
Changing which date wins (0045/0063).
