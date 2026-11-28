---
id: 0118
title: Weeks older than a month read "A quiet week" (Oct 21 had META, TSLA, IBM), and the season strip says "61% of the S&P 500 reported" as fact
status: in-progress
priority: P0
size: M
lens: data-quality
created: 2026-11-27
pr:
by: critic
---

## Why
Finnhub's free calendar only reaches back about a month (CLAUDE.md, LESSONS 2026-10-31). On 2026-11-27 (build `7bea7612`) everything before **Oct 28** now comes back empty, with a 200 and **no warning**:

| Range | Metaphases `/api/calendar` | Nasdaq `/api/calendar/earnings?date=` |
|---|---|---|
| `2026-10-12..10-16` | 0 events, `warnings: []` | (peak bank week) |
| `2026-10-19..10-23` | 0 events, `warnings: []` | Oct 21: **105 rows** (META, TSLA, PM, SAP, TMO, TXN, LRCX, IBM, ABT, NEE…); Oct 22: **128** (PG, UNP, LMT, SPOT, CMCSA, HON…) |
| `2026-10-26..10-30` | 247 events, **none on Oct 26 or 27** | Oct 27: **172 rows** (V, KO, NVS, HSBC, SPGI, BA, UPS…) |

Two surfaces turn that silence into false facts:
1. **Day view `?d=2026-10-21`** (390×844, `p_dayview_oct21.png` in the 2026-11-27 19:00 critique run): "Wednesday earnings. **None of the companies we follow report on this day** with these filters." and "WEEK OF OCT 19–23 · **A quiet week**." Meta and Tesla reported that day. This is exactly what 0026 forbids: a failure shown as a fact.
2. **The season strip on every page** (`SeasonScoreboard slim`, `src/components/Depth.tsx:205`; `useSeason` reads `today − 42 d`, so `Oct 16..Nov 27`): "EARNINGS SEASON **61%** of the S&P 500 reported · 85% beat on EPS · median surprise +6.1%", with no "at least", because `missingDays` only counts days with a warning. Counted from the 7-day chunks the SPA sends: 0 + 112 + 148 + 17 + 15 + 13 = **305 of 502 members**. With the late-October week back, the true share is well above 90% four weeks after the season peaked. On an earlier phone load at about 18:55 UTC it read **45%** · 81% beat (16 screenshots, all routes), while desktop read 61% · 85% in the same run; that 45% load also carried no warning. The headline stat on the front page is wrong by a third to a half, and varies by load.

Retrace (whose 0014 trailing window starts Dec 1), Compass week history and any shared `?d=` link to October have the same hole.

## What
- **Never show an empty past day as "none".** The worker knows Finnhub's horizon: a past day earlier than it (or any past weekday in a season month that returns 0 rows) must come back flagged (e.g. `uncoveredDays` or a warning per day), and the client must treat it like a day that didn't load (0026): "Reports from before Oct 28 aren't available from our data feed", never "None of the companies we follow report" or "A quiet week". `missingDays` (and so the season strip's "at least" floor) must count these days.
- **Keep past days once they're complete.** A past day's rows don't change after the reports are out. Persist each finished day (rows with actuals) in KV once, the first time it is read inside the horizon, and serve it from KV after Finnhub drops it. Optionally backfill the gap from Nasdaq's per-date calendar (`api.nasdaq.com/api/calendar/earnings?date=`, already an allowed host, rows include `eps`/`epsForecast`; one call per past day ever, at most two a minute like the cross-check fill). State the KV write and Nasdaq call counts in the PR.
- **Season strip:** compute only over days actually covered, and say which: "since Oct 28" or "at least N%". If coverage is below the season's span, show the floor and the date, never a bare percentage.

## Acceptance criteria
- [ ] Live: `/api/calendar?from=2026-10-19&to=2026-10-23` either returns the reports (META and TSLA on Oct 21) or flags all five days as not covered; never 0 events with `warnings: []`.
- [ ] Live at 390×844: `?d=2026-10-21` never contains "None of the companies we follow report" or "A quiet week".
- [ ] Live: the season strip either shows a share within 3 points of a recount (S&P members with an actual in the window, from Nasdaq per-date rows) or reads "at least N%" with the coverage date; the same value on 5 loads, phone and desktop.
- [ ] Unit: an empty past day before the feed horizon is reported as not covered; `seasonScore` with an uncovered week yields the floor wording.
- [ ] No new 1102s; Finnhub ≤ 60/min; Nasdaq calls per minute stated before/after.

## Test plan
Vitest on the worker with a Finnhub stub that returns `[]` before a horizon date: the response flags those days. Vitest on `missingDays`/`seasonScore` with that flag. E2E fixture: a day view on an uncovered date shows the "not available" copy.

## Out of scope
Rebuilding older seasons (anything before the first KV snapshot or Nasdaq backfill). The 0114 cross-check.

## Builder notes (2026-11-28)
- **Worker.** `calendarWeek` now tells a dropped day from a quiet one: a trading day at least 21 days back for which Finnhub's range call returned **no row at all** (tracked or not; `feedGoneDays`, `shared/feedHorizon.ts`) is served from this colo's last good copy if it has one, otherwise answered with `Couldn't load <day> — our data feed no longer has reports from that far back.` The verdict is kept in the day's own cache entry (an empty list plus an `X-Feed-Gone` header, 6 h), so a re-read costs **no Finnhub call and no extra cache read**; the first verdict costs one stale-copy read and one cache put per dropped day. A dropped day is not a failure, so it doesn't stop the 0024 supplement.
- **Keep past days.** A past day's last good copy (`cal:stale:v3`) now lives 90 days instead of 7 and is re-written each time it is served after the feed dropped it. That is per colo (Cache API), not KV, and there is **no Nasdaq backfill** yet: a colo that never read a day while the feed had it still says "not in our feed". KV snapshots / backfill are left for a follow-up ticket. Nasdaq calls per minute: unchanged (0 new). Finnhub: unchanged for covered days, one range call per dropped week per 6 h per colo (was the same before, as an empty day).
- **Client.** The warning starts "Couldn't load", so `missingDays` (season floor, brief, Retrace) counts it. `needsRetry` ignores it (asking again can't bring it back). Day view, day dek and drawer say "Our data feed only keeps about a month of past reports, so we can't say who reported on this day."; the calendar shows one notice naming the dropped days, never "busy"; the brief says "Too far back for our data feed"; the season strip reads "at least N% … · counting since Oct 28" (the card spells out the coverage).
- **Not fixed here:** the 45% vs 61% spread between loads (likely the same cause: which chunks a colo had). Re-check it once this is live.
- Tests: `tests/unit/feedHorizon0118.test.ts` (worker through `/api/calendar` with a horizon stub, re-read cost, a covered week, a kept day), `tests/e2e/feedgone.spec.ts` (390 and 1440, brief, season strip, no retries).
