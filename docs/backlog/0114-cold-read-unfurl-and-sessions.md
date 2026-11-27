---
id: 0114
title: One read in three skips the Nasdaq check (17 of 43 sessions blank), and a link shared on that read unfurls as "not yet confirmed"
status: shipped
priority: P0
size: M
lens: data-quality
created: 2026-11-25
pr: 214
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

## Builder notes, bounce 1 (2026-11-26)
- Cause of the remaining cold reads: every copy of a Nasdaq day (each colo's `nq:x:v1:<day>` and the `nqw:v1` share) carries the same 6 h life from the same fetch, so they all expire together. The next read after that mark found no fresh copy anywhere and answered the whole window `unchecked` until the two-a-minute fill caught up: the "first 2 of 6" the Critic saw.
- (First pass: #205.) Fix 1 (stale while revalidate): each fetched day is also kept 24 h as a stale copy (`nq:x:stale:v1:<day>`; the share's entries count as stale up to 24 h, `staleDays`). A day with no fresh copy serves its stale one and stays in `missing`, so the same fill re-fetches it (same cap, no extra Nasdaq calls). A window with any stale day is never folded into the hour-long index, which would skip the refresh.
- Fix 2 (the Critic's rule): on a day still unchecked after that, a row whose session is the feed's alone (no `x`, no remembered contest, no Nasdaq fill `hs`, no 0104 lead, no company override) is held: `h: ""` (Time TBD), the feed's in `fh`, marked `hu: 1` (`holdUnchecked`, `shared/contestedTime.ts`). The edge keeps it 30 s and the client re-reads it, as before.
- Nasdaq calls per minute: unchanged (the fill is the same; stale days only change what a read answers while it runs). Finnhub: unchanged. KV writes: unchanged (stale copies are colo cache only).
- Tests: `tests/unit/staleWindow0114.test.ts` (all copies past 6 h with Nasdaq failing: 4 reads checked, TD contested; a cold colo from the share's stale copy; no folding; no copy anywhere: TD held, never `amc`). Four older tests asserted the feed's session on an unchecked read and now assert the hold.
- Not done here: the 30-read live script needs the deploy; the Critic re-checks on production.
- Self-review fixes: a stale day rides on `NqWindow.stale`. It is enough to compare a row, but it is never evidence of absence (`windowCovered`, crossCheck's `unknown`). A read with a stale day neither writes nor clears the `xc:v1` memos (calendar and sheet). The sheet still fetches its next day on demand when that day is only stale. An empty answer is never kept as a stale copy. `dmh` is held too.
- Known gaps, for a follow-up: the ICS feed doesn't apply the hold. Surfaces other than the calendar (Today, Compass, Ask) don't re-read an unchecked answer, so a held row reads Time TBD for that view. With stale copies this only happens when there is no Nasdaq copy anywhere in the last 24 h.

## Critic re-check, 2026-11-27 07:00 (bounce 2: reopened. One more failure goes to the operator)
Build `9416f364` (deployed 04:18 UTC; it includes #207), colo ORD, Nasdaq `ok:true`.
- **What now holds:** the hold works. Across 30 reads TD read `bmo` with its company link every time, and no unchecked row showed a session that a checked read contests. An unchecked row reads "CHECKING TIME…" in the drawer, not as fact. That's the honest state the bar asked for.
- **What still fails, the rate and the duration:** the acceptance script (30 reads of `2026-11-30..12-04`, 10 s apart, 06:51:39–06:56:39) returned `uncheckedDays` on **13 of 30** (bar: at most 1). `12-01` stayed unchecked from the first read through 06:53:13, at least **94 s** (bar: 30 s), and `11-30` came back unchecked at 06:53:44 after a checked read. Blank-`h` counts swung **1 ↔ 7** between consecutive reads (bar: within 2). A phone load of `?day=2026-12-01` at about 07:00 was unchecked again: "CHECKING TIME… · 4" held **TCOM (US$30.6B, company-announced after the close)**, GTLB, NIO and ASAN, while a load 3 minutes earlier showed "AFTER CLOSE · 8". In the same minute the TCOM sheet read "After close". So a row changes section between loads, and the drawer and the sheet disagree.
- From this sandbox at the same time, Nasdaq answered `2026-12-01` with 27 rows (TCOM, GTLB `time-after-hours`; NIO `time-pre-market`), so the upstream is fine.
- The builder notes say stale copies live in the colo cache only. A quiet overnight colo (ORD, Thanksgiving) may have evicted them, which would put the read back to "no copy anywhere". Check whether the 24 h stale copy must also be in KV (`nqw:v1` keeps its fetch time already) so a cold colo after a quiet night still serves something.
- **Bar (unchanged):** at most 1 unchecked read in 30, the first read after a 30-minute idle included, and no day unchecked longer than 30 s. Paste the 30-read output from production with `cf-ray` colos, taken at least 6 h after the deploy, so the stale path is actually exercised.

## Builder notes, bounce 2 (2026-11-27)
- **Root cause (finally):** Workers Free allows **50 subrequests per invocation, and Cache API and KV calls count** ("Calls per request: 50 … share the same quota as subrequests (`fetch()`)", developers.cloudflare.com/workers/platform/limits). Counted on the unit harness, a week read made **71–146** (79 cache matches, 29 puts, 7 KV reads on a cold week; 89 warm-but-unfolded). The window's day reads came late in the read, so in production they were the calls refused: `readJson` swallows the error and returns null, so the day read as **missing**, i.e. `unchecked`, while Nasdaq was fine. The fill's Nasdaq `fetch` was refused the same way ("Too many subrequests") and was then **remembered as a Nasdaq failure for 15 minutes**, and the KV share was written only from that fill, so it rarely got new days. That explains every symptom: the flicker (which reads were refused depended on how many calls came first), days stuck unchecked for minutes, a new window day (Dec 10) never loading at ORD while the lighter sheet request loaded it at once (`/api/ticker/COST` at 09:34 UTC, then the one-day read was checked).
- Before (production, build `b7303adf`, colo ORD, 09:28–09:32 UTC): `2026-11-30..12-04` alternated `uncheckedDays ["2026-11-30"]` / none every third read; `2026-11-27..12-11` carried 2–4 unchecked days on 9 of 9 reads (`11-27` and `12-10` on every one); `12-10` alone stayed unchecked for 61 s+ over 4 reads.
- Fix:
  - `nasdaqWindow` reads the KV share **first** (one per-colo cached read holds every day) and this colo's day copies only for days the share lacks fresh; stale copies come from the share before the colo. Warm-but-unfolded, the window now costs 1–3 calls instead of ~20.
  - The calendar reads the window, contest memos and session leads **before** the week reads start (awaited, so a KV miss can't lose out to the weeks' bursts; unit-tested on a three-week range).
  - A day **no colo has** (fresh or stale) is fetched inside the calendar read, before the week reads (same lock, two days, range first, wait bounded by the 4 s timeout), and written to the KV share then and there. So curl readers, unfurls and quiet periods still fill new days (Dec 10 type). It costs at most one waiting read per colo per minute, and only when a day has no copy anywhere.
  - **Stale** days (past 6 h, up to 24 h) are served as before, and refreshed by `GET /api/xcheck/fill?from&to`, an invocation of its own. The calendar answers `fill: 1` and the browser calls it (`askFill`, at most once a minute per tab). The endpoint checks the lock first (a burst costs one cached read each).
  - Review fixes: a shared day's **caps** count past its 6 h (they're 45-day data; colos no longer copy the share into their own cache, so 0110's sizing would have lapsed). The sheet's on-demand day read takes a fresh shared copy before calling Nasdaq. A colo's own copy wins over a share entry older than an hour.
  - A call refused for the budget is never remembered as a Nasdaq failure.
- Nasdaq calls per minute: unchanged or fewer (same lock and two-day cap; no calls spent whose results couldn't be stored; on-demand sheet reads use the share). Finnhub: unchanged. KV writes: same caps.
- Tests: `tests/unit/subrequestBudget0114.test.ts` runs the worker on a cache/KV/fetch that refuses the 51st call per invocation, as Cloudflare does (all 6 fail on main). The eight suites that warmed the window through calendar reads now do what the browser does with `fill` (the fill ran after the response before, too). `tests/unit/askFill0114.test.ts` covers the client's throttle.
- Known gap, for a follow-up ticket: the rest of the calendar read still makes far more than 50 calls on a cold week (the feed's day caches, the 0024 supplement, settle/neighbour reads). Anything read late, such as other KV-shared documents (`supp:v1`, `nqcap:v1`) and the `xc:v1` write, can still be refused. It needs a per-range cache of the finished answer or batched day caches. Stale-day refreshes depend on a browser calling the fill: a curl-only period longer than 24 h after a day's last fetch would read that day unchecked again (new days are still fetched inline). A Cron Trigger would remove that dependency, but `wrangler.jsonc` is frozen: an operator call. The sheet path (`/api/ticker`, `/t/*`) sits near 50 calls on a stale share in the harness, and its own `tk:v10` cache write was the refused call there.

## Fix after #214 (2026-11-27, fix PR)
- Live right after the deploy (build `b8b26b69`, ORD, 10:30 UTC): the 5-day week read checked on 8 of 8, but 4 reads of `11-27..12-11` carried "Couldn't load 2026-11-27 / 12-07 / 12-08…", self-healing within a minute. Cause: #214 fetched days no colo had **inside** the read, ahead of the week reads, and awaited the writes. That fetch plus about 20 day-by-day colo reads took the budget the week reads need. On the harness, a cold colo's 7-day chunk (the SPA's shape) returned 5 warnings on #214 and none before it.
- Fix:
  - The window read is cheap again: the share, plus this colo's own day copies **only for the days on screen** (every day when there is no share document, as before). That is ≤6 calls, all ahead of the first week read (unit-tested).
  - The fetch for a day no colo has runs **after** the response, last in the invocation. It succeeds when the read left budget, and a refusal isn't memoized. The browser's `/api/xcheck/fill` remains the dependable path for new and stale days.
- Not fixed (pre-existing, also red before #214 on the harness): a cold **three-week** read (`/api/calendar?from=…&to=…` over 15 weekdays) overruns 50 in its week reads alone. The SPA never sends one; it chunks by 7 days.
