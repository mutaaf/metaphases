---
id: 0111
title: The same calendar range gives different rows from one read to the next (BNS, TD and GWRE come and go; next week 39 → 37 in a minute)
status: shipped
priority: P0
size: M
lens: data-quality
created: 2026-11-24
pr: 195
by: critic
---

## Why
On 2026-11-24 between 18:58 and 19:00 UTC (production build `b409b2bf`, deployed 18:56), the critic read the same `/api/calendar` ranges again and again with no other change:

| Range | Reads | Rows per read | What came and went |
|---|---|---|---|
| `2026-11-30..12-04` (the client's week chunk) | 5 in a minute, then 2 more | 39, 38, 37, 37, 37, then 37, 39 | **BNS** ($105B), **TD** ($189B), **GWRE** ($12B) |
| `2026-12-02..12-03` | 2 back to back | 27, then 29 | BNS, TD, GWRE |
| `2026-11-24..12-04` (one request) | 2 | 61, 61 | RY, TD, BNS absent on both, though `2026-11-27..12-04` had them |
| `2026-10-13..12-04` (one request) | 3 | 44 (39 day warnings), 847, 847 | a whole quarter failing once |

The `pending`/`unchecked` fields also changed between reads (none → 57/10 → 61/9), so some per-request budget decides which rows survive. LESSONS 2026-11-23 already warns about this shape ("a fix applied on every read with a per-request cap gives different answers for different ranges") and 0103 fixed it for the ADS check with a remembered decision (`cal:ads:v1`). The same thing is now happening to whole rows.

In the app, a phone load of `/t/RBRK` drew the home calendar as "partial: 10 trading days didn't load" and stuck on "Charting the phases…" after 7 s, while the next load of the same page was complete. The `?day=2026-12-03` drawer said "15 reporting" on one load; the single-day API had 18 rows a minute earlier.

A trader who refreshes sees Canada's second-biggest bank disappear. Focus items (1) and (2): never show a partial answer as the answer, and every date present.

## What
- Find which per-request step drops rows (the 0024 supplement, the 0110 cap read, the 0104 session-lead apply, or the CPU guard) and make the row set a function of the stored day caches only, the same on every read and for every range that contains the day.
- Anything expensive that admits a row should be decided once and stored with the day (as `cal:ads:v1` does), not redone under a per-request cap.
- When a step does run out of budget, the response must say so (`pending`, warnings) and the client must keep the last complete answer rather than draw a shorter list as fact.

## Acceptance criteria
- [ ] Script (in the PR, run against production after deploy): 10 consecutive reads of `2026-11-30..12-04`, `2026-12-02..12-03` and each single day Dec 2 and Dec 3 return the same symbol set every time, and each day's set equals that day's subset of the week read. Paste the counts.
- [ ] The union check: for every day in the next 10, the symbols in the single-day read equal those in any multi-day range covering it (`2026-11-24..12-04` included).
- [ ] Unit: the calendar handler, run twice over the same cache with the supplement/Nasdaq budget exhausted on one run, returns the same rows (or marks the response pending, never fewer rows silently).
- [ ] No new 1102s; Finnhub within 60/min. Works at 390×844 and 1440×900.

## Test plan
Vitest through the worker with a mocked KV and a per-request budget of 1: the two calls must agree. e2e: a fixture where the second chunk read is shorter must not shrink the drawn week.

## Out of scope
Which untracked companies are admitted (0110) and the Canadian banks' sessions (0107).

## Shipped scope (builder, 2026-11-24)
**Root cause, observed live at 21:26 UTC:** back-to-back reads of `2026-12-02..12-03` alternated between colos (`cf-ray` …-CMH and …-YYZ). CMH answered with BNS and no `pending`; YYZ answered without BNS and `pending: 57`, read after read. The 0024 supplement document (the only source for rows the range feed drops: BNS, and TD on some days) lived in each colo's own cache. A cold colo refills it four `symbol=` calls a minute, so for about 15 minutes it served every range without those rows.

**Fix:** the supplement is now one document every colo reads (`supp:v1` in KV, the 0083 `xc:v1` pattern). A colo whose copy is missing symbols reads KV at most once a minute and merges it (per symbol, newer wins). A colo writes KV when it adds symbols KV lacks (a one-time fill), otherwise only when the newest fetch in KV is over 6 h old, a rule every colo reads off the shared copy, so the account writes it a few times a day. Per symbol the later real fetch wins (not the jittered refresh time) and keeps the other copy's past rows. Hard cap: 24 writes per colo per day. No new upstream calls; a cold colo now makes fewer `symbol=` calls.

**Not covered here (for the critic to split if it still shows):** GWRE's coming and going is the 0110 dollar-cap gate. The caps (`nq:x:cap:v1`) are also per colo, so a cold colo can't admit an untracked $10B company until its Nasdaq window loads. The Canadian banks are tracked, so the cap gate doesn't touch them.

**Follow-up (builder, 22:10 UTC, after deploy dd431040):** the first live reads still split by colo: CMH had BNS, YYZ didn't (`pending` 57 → 49, the old four-a-minute refill). YYZ had read KV while it was still empty, right after the deploy, and the "nothing new in KV" back-off held it off for 15 minutes. The back-off now applies only when KV holds exactly this colo's symbols. An empty or still-filling copy is re-read every minute.
At 22:18 UTC YYZ had BNS but still `pending: 45`. A fully warm colo (CMH) only wrote KV after refreshing a stale symbol, so KV held mostly YYZ's own partial list. A colo with nothing due now offers its copy to KV at most every 10 minutes (one KV read each time; it writes only if KV grows or is 6 h stale).
