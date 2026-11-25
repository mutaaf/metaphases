---
id: 0114
title: One read in three skips the Nasdaq check (17 of 43 sessions blank), and a link shared on that read unfurls as "not yet confirmed"
status: ready
priority: P1
size: M
lens: data-quality
created: 2026-11-25
pr:
by: critic
---

## Why
The 07:00 critique logged this as P2 ("a cold first read drops Nasdaq-filled sessions") with a bar: if a reader sees it, it becomes a ticket. At 18:55–19:05 UTC on 2026-11-25 (build `be43859d`, colo YYZ) it happened on most reads, and it reached the unfurl:

- **12 of 12 consecutive reads** across four ranges between 18:55 and 18:58 returned `unchecked` 5–10 and blank `h` on 20 of 50 rows for `2026-11-25..12-04` (KR, ULTA, DOCU, GWRE, S, AI, ZS…). Nasdaq lists KR pre-market and ULTA, DOCU, GWRE, S after hours.
- Three reads of `2026-11-30..12-04` 15 s apart at 19:03: `unchecked 1` (1 blank), then **`unchecked 10`, all five days in `uncheckedDays`, 17 blank**, then fully checked (1 blank). The cache flips between a checked and an unchecked answer.
- **The unfurl was built from the unchecked read:** the first fetch of `/t/ULTA`, `/t/DOCU` and `/t/GWRE` gave `og:title` "… earnings expected around Thu, Dec 3 (not yet confirmed)". A minute later all three read "reports Thu, Dec 3 after the close (expected)". Social platforms cache the first unfurl they fetch, so a link shared in that window says "not yet confirmed" for a company that announced its date (ULTA, DOCU; see 0113) for days.
- `/api/health` reports `nasdaq ok:true` (2.1 s) throughout, so the check isn't failing upstream; the window simply isn't loaded for this read.

The calendar UI copes (it retries an unchecked answer after 30 s and the drawer showed "Time expected" for Kroger), but the unfurl and any one-shot reader (the Ask panel, a shared `?day=`) do not retry.

## What
- Find why a read in the cross-check window comes back with `w.loaded` empty while a read seconds earlier was complete (per-colo cache miss of the Nasdaq window? the KV share from 0111/0110 not consulted on this path?). Log the colo and `w.loaded.length` per read with `wrangler tail` and paste a sample.
- A read that has a checked copy of a day (from KV or another colo) must use it rather than return `unchecked` for that day.
- The share-meta path (`og:title`/`og:description` for `/t/*` and `?day=`) must not render from an unchecked answer: wait for the check (bounded, e.g. 2 s) or fall back to the last checked copy; if neither exists, use the neutral "reports <day>" wording without "not yet confirmed".

## Acceptance criteria
- [ ] Script in the PR: 30 reads of `/api/calendar?from=2026-11-30&to=2026-12-04` (or the equivalent next week) 10 s apart; at most 1 returns any `uncheckedDays`, and blank-`h` counts never differ by more than 2 between reads. Paste the output with `cf-ray` colos.
- [ ] Live: 10 fetches of `/t/ULTA` (or the week's equivalent Nasdaq-timed company), 5 of them the first fetch after a deploy, all give the same `og:title`.
- [ ] Unit: share meta rendered from a response with `uncheckedDays` covering the row's day never contains "not yet confirmed".
- [ ] No new 1102s; Finnhub within 60/min; Nasdaq calls per minute not increased (state the before/after count).

## Test plan
Vitest: the worker with a Nasdaq window cached in KV but not in the colo cache; assert the read is checked. Vitest for the og builder with an unchecked input.

## Out of scope
Company-announced dates without overrides (0113).
