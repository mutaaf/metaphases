---
id: 0043
title: A sheet missing its date or history is never edge-cached for 5 minutes or used for a share card
status: shipped
priority: P0
size: S
lens: data-quality
created: 2026-11-04
pr: 83
by: critic
---

## Why
Critique 2026-11-04 19:00 #3. During the critic's 119-sheet sweep at 19:00 UTC (4 requests at a time, about what a few dozen peak-week visitors produce), Finnhub calls inside `buildTicker` failed. Those sheets were then served degraded **for 5 minutes to every visitor**: `/api/ticker/UBER` still returned `next: null` with warnings `Upcoming date unavailable. · Analyst ratings unavailable. · Earnings history unavailable.` 80 s later (`cache-control: public, max-age=300`). UBER reported this morning and is +7.10%. During that window `/t/UBER` unfurled as "Uber Technologies, Inc. (UBER) earnings", with no date and no result, and The Read said "Into the print…" about a print that's already happened. SUN, ADNT and ET showed the same degraded state. The in-app sheet is honest ("Partial picture", so 0026 holds), but the cache turns one transient 429 into five minutes of missing data for everyone and every share card. Cause: `worker/index.ts:294` caches the finished `TickerResponse` with TTL 300 whatever `warnings` it carries.

**Re-seen 2026-11-10 07:00 UTC (critic, raised to P0 under the operator's focus item 1).** A 92-sheet sweep of next week's reporters at 5 concurrent (about 06:50 UTC) left NVDA, WMT, HD, TJX and WIX degraded. At 06:56:42 and again at 06:58:26, `/api/ticker/NVDA` still had `next: null` with `Earnings history unavailable. · Analyst ratings unavailable. · Upcoming date unavailable.`, a week before its biggest print of the season. `/t/NVDA` unfurled as the bare "NVIDIA Corporation (NVDA) earnings", and The Read said "It has beaten the estimate in 4 of its last 4 reports" directly under "Earnings history unavailable" (`shots/p__t_NVDA.png`). All five had recovered by 06:59:35. The window is up to ~10 minutes because the sheet is cached twice: `cached("tk:v3:…", 300)` in `tickerData` (`worker/index.ts:419`), and then the response itself goes out with `max-age=300` (`worker/index.ts:423`). A dozen peak-week visitors opening sheets at once is enough to trigger it.

## What
- In `tickerData`, if the built sheet has a warning for the upcoming date or the earnings history, cache it for at most 30 s (or don't cache it), and keep serving the last good copy (`tk:stale:v2:SYM`, 24 h) with a `warnings` entry saying it's from an earlier read, the same way the calendar's stale copy works.
- The share route (`worker/og.ts`) uses the last good copy, never a sheet whose `next` failed to load.

## Acceptance criteria
- [x] Vitest: `buildTicker` with the `symbol=` calendar call mocked to 429 → the response is cached with TTL ≤ 30 s; with a stale good copy present, `next` comes from it and `warnings` names it as earlier data
- [x] Vitest: a sheet with no warnings is still cached 300 s (no regression in upstream call volume)
- [x] `/t/SYM` og:title is never the bare "(SYM) earnings" fallback while a good copy less than 24 h old exists
- [x] Both cache layers obey the short TTL: the `json(…, 300)` response header is ≤ 30 s too when the sheet is degraded
- [ ] Critic re-check: rerun the 119-sheet sweep at 4 concurrent. Re-fetching any degraded sheet 60 s later returns full data, or the stale copy with its warning

## Test plan
`tests/ticker-cache.test.ts` with a fake `caches.default` and mocked `fetch` covers the three cases above.

## Out of scope
Raising Finnhub limits or adding hosts. This only changes what gets cached.

## Shipped (builder, 2026-11-10)
`shared/sheetCache.ts` + `tickerEntry` in `worker/index.ts`. A sheet whose build lost "Upcoming date unavailable." or "Earnings history unavailable." is cached 30 s in both layers (edge copy and response `max-age`) and never becomes the last good copy. A good build writes `tk:stale:v2:SYM` (24 h); a degraded build is replaced by it, marked "This is an earlier read from 9:00 AM ET; the market data service is busy right now." An earlier day's copy stands in only while its report is still ahead, and a copy from today with the report today only until that session has passed (it would predate the 0039 report-day state otherwise). A build that lost only its history keeps its own date and report state and borrows just the past reports ("Past reports are an earlier read from …"). `/t/SYM` HTML follows the sheet's TTL, and `/og/t/SYM.(svg|png)` from a degraded sheet or stand-in is served with `max-age=30`, never under the 6 h keys; a degraded PNG is kept 30 s under its own key so an unfurl burst renders it once (keys bumped to v4 so cards cached degraded before this deploy go away). Tests: `tests/unit/tickerCache.test.ts` (worker-level, 429 on the `symbol=` calendar and `stock/earnings`).

## Critic re-check 2026-11-10 19:00 UTC
Build `1de09f28` (deployed 15:00 UTC). In this run's ~16 sequential sheet reads (3–4 s apart: NVDA, DIS, WMT, HD, TJX, NTES, CSCO, KEYS, UBER, QCOM, HMC, TGT, INTU, BABA, GAP, QXO), none was degraded and every one had `warnings: []`. A healthy NVDA sheet answers `cache-control: public, max-age=300`, as designed. The last unchecked criterion ("rerun the 119-sheet sweep at 4 concurrent") contradicts LESSONS 2026-11-10, which bans that sweep on production because it causes the very outage. So the critic won't run it. Instead, the next organic degraded sheet the critic sees is re-fetched after 60 s, and it must return full data or the stale copy with its "earlier read" warning. Left `shipped`.
