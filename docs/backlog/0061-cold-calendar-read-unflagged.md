---
id: 0061
title: The first calendar read after a quiet spell carries no cross-check (0 of 103 rows flagged, then 70 of 103 ninety seconds later)
status: shipped
priority: P1
size: S
lens: data-quality
created: 2026-11-12
pr: 107
by: critic
---

## Why
Critic check 2026-11-12 07:00 UTC, build `a29c8878`. The first `/api/calendar?from=2026-11-12&to=2026-11-25` read of the morning returned `unchecked: 10` and **zero** rows with `x`. WSM, CPRT, BBWI, ADI and DE carried no "two calendars disagree" flag, and nothing on the grid said the check hadn't run. Ninety seconds later the same URL gave `unchecked: 2` and 70 rows with `x`, 17 of them `differs`. The 11-11 19:00 critique saw the same thing (item 3, not filed). 0059 fixed the sheet by reading the window per day and fetching the report's day on demand, but the calendar still answers before the window has loaded anything. The first visitor of the morning, the one most likely to share a screenshot of next week, gets the unflagged version and is never told.

## What
- When a calendar response covers window days that are `unchecked`, the client shows it (a quiet line under the week, e.g. "Cross-checking dates with Nasdaq…") and re-fetches once those days have loaded (the response already carries `unchecked`). Today the number is in the payload and nothing reads it.
- Or (better, if it fits the CPU budget, 0012): fold the first missing days on the first read, with a short budget, so a cold read has at least the next five weekdays checked. Keep `pool()` concurrency ≤ 6 and the per-day `nq:x:v1` caches.
- The worker has no `scheduled` handler, and adding a cron trigger means touching `wrangler.jsonc` (frozen). If warming turns out to be the right fix, write a `proposal/` for it rather than editing the file.

## Acceptance criteria
- [ ] With every `nq:x:v1` day cache empty (unit/integration test with a stubbed Nasdaq), the first `/api/calendar` response for the next two weeks has `unchecked` set and the client renders a visible "still checking" state; a second fetch within 60 s carries `x` on the stubbed `differs` row and the state clears
- [ ] On production, after an hour with no traffic, the first phone visit to the week view shows either the flags or the "checking" line, never a silently unflagged week (screenshot at 390×844)
- [ ] No more than 6 concurrent Nasdaq calls from one request; no Cloudflare 1102 in the run (0012)
- [ ] Works at 390×844 touch and 1440×900

## Evidence 2026-11-12 19:00 UTC (critic, sharpened)
It isn't only the first read of the morning, and it isn't only the flags. At **18:51 UTC**, in market hours, `/api/calendar?from=2026-11-12&to=2026-11-25` answered `unchecked: 10`, `pending: 64` and **0 of 101** rows with `x`. In that same response the sessions that only Nasdaq supplies were blank: **WMT** (`h: ""`, $951B), **INTU**, ADSK, BBY, DELL, MDT, SJM, CPRT. One minute later: `unchecked: 4`, 36 rows with `x`, WMT `bmo` and INTU `amc`. Eight minutes later: `pending: 4`, 88 rows with `x`, and ADSK/BBY/DELL/MDT/SJM all had sessions. Meanwhile `/api/ticker/<SYM>` gave the session on the first read (ADSK `amc`, MDT `bmo`, SJM `bmo`), so the calendar tile and the sheet disagreed for those eight minutes. A week view of Nov 16–20 opened at 18:51 showed Walmart with no moon at all.

Added bar: on a cold read, a row whose session the sheet would fill from Nasdaq is either filled or shown in the "checking" state, never as a plain "time not yet confirmed". Test: with the window empty, the first response for a stubbed WMT row (Finnhub `hour: ""`, Nasdaq pre-market) carries `unchecked` and the client shows the checking line on that day.

## Test plan
Vitest: calendar route with an empty window cache returns `unchecked > 0`; client hook re-fetches once when `unchecked > 0` and stops at 0 (or after 2 tries). e2e (fixtures, frozen clock): a fixture with `unchecked: 3` shows the checking line.

## Out of scope
Which feed wins a contested date or session (0015, 0059, 0060).

## Builder note 2026-11-13 (#107)
The first option, plus a nudge to the worker. `/api/calendar` now returns `uncheckedDays`: the requested days inside the 0015 window that Nasdaq's day calendar hasn't been read for yet (an outage counts too). Such an answer is cached 30 s, not 600, and the background build fetches the requested range's days first (still 2 days per colo per minute, ≤ 2 in flight, no new calls). The client merges `uncheckedDays` across week chunks, shows "Still comparing N days' dates and times with Nasdaq's calendar…" above the grid, labels a blank-session group on those days "Checking time…" (week column, day view, drawer) instead of "Time TBD", and re-reads every 40 s up to 8 times (`retryDelay` in `src/lib/partial.ts`, calendar page only: the scoreboard, Compass, peers and AI never loop), passing `_r` through to the week chunks so a re-read reaches the worker. A partial or unchecked answer is no longer memoized for the tab's life, so revisiting a week reads it fresh. When the re-reads run out (or Nasdaq is down) the line changes to "We couldn't compare … just now, so they're our data feed's alone. Check again" and the labels go back to "Time TBD": a stalled check is never shown as one in progress. Holidays don't count as days being compared. A cron warm-up would need `wrangler.jsonc` (frozen), so it isn't part of this.
