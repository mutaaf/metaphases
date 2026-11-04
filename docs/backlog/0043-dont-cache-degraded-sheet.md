---
id: 0043
title: A sheet missing its date or history is never edge-cached for 5 minutes or used for a share card
status: ready
priority: P1
size: S
lens: data-quality
created: 2026-11-04
pr:
by: critic
---

## Why
Critique 2026-11-04 19:00 #3. During the critic's 119-sheet sweep at 19:00 UTC (4 requests at a time, about what a few dozen peak-week visitors produce), Finnhub calls inside `buildTicker` failed. Those sheets were then served degraded **for 5 minutes to every visitor**: `/api/ticker/UBER` still returned `next: null` with warnings `Upcoming date unavailable. · Analyst ratings unavailable. · Earnings history unavailable.` 80 s later (`cache-control: public, max-age=300`). UBER reported this morning and is +7.10%. During that window `/t/UBER` unfurled as "Uber Technologies, Inc. (UBER) earnings", with no date and no result, and The Read said "Into the print…" about a print that's already happened. SUN, ADNT and ET showed the same degraded state. The in-app sheet is honest ("Partial picture", so 0026 holds), but the cache turns one transient 429 into five minutes of missing data for everyone and every share card. Cause: `worker/index.ts:294` caches the finished `TickerResponse` with TTL 300 whatever `warnings` it carries.

## What
- In `tickerData`, if the built sheet has a warning for the upcoming date or the earnings history, cache it for at most 30 s (or don't cache it), and keep serving the last good copy (`tk:stale:v2:SYM`, 24 h) with a `warnings` entry saying it's from an earlier read, the same way the calendar's stale copy works.
- The share route (`worker/og.ts`) uses the last good copy, never a sheet whose `next` failed to load.

## Acceptance criteria
- [ ] Vitest: `buildTicker` with the `symbol=` calendar call mocked to 429 → the response is cached with TTL ≤ 30 s; with a stale good copy present, `next` comes from it and `warnings` names it as earlier data
- [ ] Vitest: a sheet with no warnings is still cached 300 s (no regression in upstream call volume)
- [ ] `/t/SYM` og:title is never the bare "(SYM) earnings" fallback while a good copy less than 24 h old exists
- [ ] Critic re-check: rerun the 119-sheet sweep at 4 concurrent. Re-fetching any degraded sheet 60 s later returns full data, or the stale copy with its warning

## Test plan
`tests/ticker-cache.test.ts` with a fake `caches.default` and mocked `fetch` covers the three cases above.

## Out of scope
Raising Finnhub limits or adding hosts. This only changes what gets cached.
