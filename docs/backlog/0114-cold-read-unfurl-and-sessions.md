---
id: 0114
title: One read in three skips the Nasdaq check (17 of 43 sessions blank), and a link shared on that read unfurls as "not yet confirmed"
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-25
pr: 205
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

## Builder notes (2026-11-26)
- Cause: the Nasdaq window's days (`nq:x:v1:<day>`) lived only in each colo's `caches.default`, and a colo fills at most two missing days per request with one builder a minute. A cold colo (YYZ, read every few requests from Ohio) answered most of the window `unchecked` while CMH, seconds earlier, had all of it. Same per-colo trap as 0110/0111.
- Fix: every fetched window day is offered to one KV record (`nqw:v1`, day → sessions + fetch time; read-merge-write, a write only when a day is missing, stale or over an hour old; 24 writes/colo/day cap). `nasdaqWindow` takes a fresh shared day before reporting it unchecked, seeds its own cache with it for the copy's remaining life, and doesn't fetch it again. So Nasdaq calls per minute go down (a cold colo makes none for days another colo fetched); Finnhub calls are unchanged.
- Sheet/unfurl: a timeless date inside the window whose Nasdaq day couldn't be read on this request carries `next.unchecked`: the share title reads "<SYM> earnings on <day>, time being checked", the description and Read say the time is still being checked, the edge keeps it 30 s and the client re-reads it (`retryDelay`).
- Review of #205:
  - Each shared day carries that call's untracked caps (`c`). A colo seeded from the share has sized the day, both in `nasdaqCaps` and in its own `NQX_CAP`, so 0110's gate never falls back and no short-lived unsized day adds Finnhub calls.
  - A fresh shared day is never rewritten.
  - The record counts its own writes for all colos together (`w`, at most 120 a day), on top of a per-colo cap of 12 and one offer per isolate.
  - The unfurl says "around <day>", never "reports".
- Not done here: `wrangler tail` sampling (no Cloudflare access from the sandbox) and the 30-read live script; the Critic re-checks on production.

## Critic re-check, 2026-11-26 (bounce 1: reopened at P0, because an unchecked read still shows a contested session as fact)
**Before #205** (build `2ef291ac`, colo ORD, 06:52–06:58 UTC): 26 consecutive week reads. The first 6 (`11-26..12-04`) had every day in `uncheckedDays`, and the next 20 took **six minutes** to decay to 0 (`uncheckedDays` 3 → 2 → 1 → 0). On those reads TD (feed `amc`; Nasdaq and TD's own 9:30 a.m. ET call say before the open) carried no `x`/`xh`, so `settleContested` couldn't blank it and the calendar filed **TD under "After close" as fact**. The one-day `12-03` read gave KR/GWRE/SAIC/BF.B their Nasdaq sessions while the covering week read had them blank, so the union was broken.

**After #205** (build `57f9ea30`, deployed 07:14, colo ORD, 07:55 UTC): much better but still failing. Of 6 reads 8 s apart, **the first 2 returned `unchecked: 10` with every day in `uncheckedDays`, 7 blank sessions and TD `amc` with no contest marker**; reads 3–6 were checked (TD `x: "differs", xh: "bmo"`, 0–1 blank). The `/t/TD` unfurl read "time unconfirmed" (✅ for the share-meta half). Warming now takes about 16 s rather than 6 min, but 2 of 6 is over the "at most 1 of 30" bar, and the visitor who opens the calendar first gets the wrong TD session.

Add to the bar: **on the first read after a deploy and after a 30-minute idle, no row carries a session that the same row's checked read contests.** If the check can't be done in time, a row whose day is unchecked must use any remembered contest (`xc:v1`) or Nasdaq's cached session for that day, or else show Time TBD; never the feed's session alone. TD's own row is fixed by 0115; this ticket owns the general rule.
