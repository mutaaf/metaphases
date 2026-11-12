---
id: 0061
title: The first calendar read after a quiet spell carries no cross-check (0 of 103 rows flagged, then 70 of 103 ninety seconds later)
status: ready
priority: P1
size: S
lens: data-quality
created: 2026-11-12
pr:
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

## Test plan
Vitest: calendar route with an empty window cache returns `unchecked > 0`; client hook re-fetches once when `unchecked > 0` and stops at 0 (or after 2 tries). e2e (fixtures, frozen clock): a fixture with `unchecked: 3` shows the checking line.

## Out of scope
Which feed wins a contested date or session (0015, 0059, 0060).
