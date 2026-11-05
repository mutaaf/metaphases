---
id: 0047
title: The calendar says "the market data service is busy" on every load, and refetches every week three times, because the overseas check never finishes
status: shipped
priority: P0
size: M
lens: data-quality
created: 2026-11-05
pr: 64
by: critic
---

## Why
Critic check 2026-11-05 19:00 UTC, build `f06e052c`. Every `/api/calendar` response that touches the next weeks carries `"Still checking N overseas companies' report dates — some may be missing for now."` (`worker/index.ts:254`). It has been there on every fetch since 0024 shipped (Nov 4), and N doesn't converge: three calls 2 s apart gave **20, 40, 52**; earlier runs saw 28–40.

Two consequences, both measured on production at 390×844 with empty storage:
1. **A false failure, shown as fact.** The calendar renders "Part of the calendar didn't load yet — the market data service is busy. Retrying in the background; everything else is current." (`src/components/Calendar.tsx:328-331`) on 2 of 2 loads, and it's still there 12 s later. Every one of the 36 `/api/calendar` responses was HTTP 200. Nothing failed.
2. **3× the traffic.** `useApi` (`src/lib/api.ts:65-67`) retries any response with warnings twice, so one page load makes **36** calendar requests (12 ranges × 3) instead of 12, on the same Finnhub key that 0012 and 0043 are guarding.

Likely cause: the supplement is one whole document in `caches.default`, read, patched with ≤ 4 symbols and written back by every request (`worker/index.ts:130-145`), so concurrent requests and cache nodes overwrite each other's progress and `unfetched()` (`shared/calendarSupplement.ts:73`) never reaches 0.

## What
- Stop progress notes from looking like failures: a "still checking" note is not a warning. Send it in a separate field (e.g. `pending: n`) or drop it, so the client neither shows the "busy" banner nor retries for it. `warnings` stays for real failures (0026).
- Make the supplement converge: per-symbol cache keys (or KV) instead of one read-modify-write document, so a refresh can't erase another's results. Keep the 0024 rate rules (≤ 4 calls per refresh, the per-colo lock, no calls after a failed range).
- If a note stays, word it as what it is ("Some overseas companies' dates are still being checked"), never as a service failure.

## Acceptance criteria
- [ ] On production, 10 sequential `/api/calendar?from=<this Monday>&to=<this Friday>` calls 30 s apart, starting an hour after deploy: `warnings` is empty on all 10 (or the pending count reaches 0 and stays there)
- [x] A Playwright load of `/` at 390×844 with empty storage makes ≤ 13 `/api/calendar` requests and shows no "service is busy" notice when every response is 200
- [x] Unit test: two interleaved supplement refreshes over different symbols both survive (neither overwrites the other)
- [x] Unit test: a calendar response with only a pending/progress note triggers no client retry and no warn notice; a response with a "Couldn't load" warning still does both (0026 unchanged)
- [x] Works at 390×844 touch and 1440×900

## Test plan
Unit on the supplement store and on `useApi`'s retry rule; e2e: the November fixture with a pending note shows the calendar with no warn notice.

## Out of scope
Which names the supplement tracks (0024). Real range failures (0026 already handles them).
