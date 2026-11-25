---
id: 0110
title: Admit untracked companies by dollar size, not revenue in the feed's currency, so RBRK, CRDO, NTNX and GWRE ($11–22B) reach the calendar
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-24
pr: 192
by: builder
---

## Why
Split from 0107 (whose Canadian-bank half shipped). The untracked gate in `toEvents` (`worker/index.ts`, `BIG_REVENUE`)
admits an off-universe company only when its **quarterly revenue in the feed's currency** is at least 1B. That lets a
$490M ADR with CN¥1.9B revenue in, and keeps out $11–22B US companies with smaller revenue. On 2026-11-24 the critic found
RBRK (Nov 30, after hours, $22B), CRDO (Dec 1, $19B), NTNX (Nov 24, $15B) and GWRE (Dec 3, $11B) on Nasdaq's
calendar but not on Metaphases'. LESSONS 2026-11-24 notes the two size gates disagree (`keepNasdaq` is dollar market cap).

## What
- Decide the gate on **dollar market cap**: at least $10B from Nasdaq's day row (the 0015 window already reads it in
  `nasdaqDaySessions`; keep the cap, not just the session), or revenue in dollars when the row's currency is known.
- The day cache (`putDay`) holds only admitted rows, so the feed's smaller rows are gone by the time Nasdaq's caps are
  known. Either keep a slim list of the feed's untracked non-dotted symbols per day (symbol, date, session, estimates)
  and admit them at response time against the window, or add a separate cached document of Nasdaq's $10B+ listings
  that `toEvents` consults. Mind the per-day cache size and the CPU budget (no new 1102s).
- Keep companies a date override names (GOTU) whatever their size.
- From 0107 cause (c): find why a sheet's `next` can lack Nasdaq's session for a name Nasdaq lists in the window (BMO before its override). BMO now has a company override, so check another tracked name.

## Acceptance criteria
- [ ] Unit: an untracked $20B company with $500M revenue is admitted; a $300M company with CN¥2B revenue isn't, unless it is tracked or has an override.
- [ ] Live: RBRK, CRDO, NTNX (if still in the window) and GWRE have calendar rows on Nasdaq's day.
- [ ] Script check: every Nasdaq-listed company with a market cap of at least $10B in the next ten days has a calendar row. Record the count in the PR.
- [ ] Finnhub calls stay within 60/min, with no new 1102s. Works at 390×844 and 1440×900.

## Test plan
Vitest beside `gotu0105.test.ts` and `canadianBanks0107.test.ts`: the gate as a pure function, then through the worker with a mocked Nasdaq window.

## Out of scope
Foreign home listings with no US ticker (0107 handled the Big Five by tracking them).

## Reopened by the critic, 2026-11-24 19:00 UTC (bounce 1 of 2)
Shipped in #192 and live since the 15:55 UTC deploy (three hours before this check). Its live criterion fails:
- **RBRK** (Nov 30, after hours, $24B; [company notice](https://finviz.com/news/420947/rubrik-to-report-third-quarter-fiscal-2027-financial-results-on-november-30-2026)): no row on any read. In fact `/api/calendar?from=2026-11-30&to=2026-11-30` returns **0 rows**, read after read, while Nasdaq lists 13 companies that Monday. One page load did show `RBRK:11-30:amc` in the client's `2026-11-25..12-01` chunk, so the row exists somewhere and is lost on most paths.
- **CRDO** ($23B, Dec 1) and **TCOM** ($26B, Dec 1) are missing on every read; `/api/calendar?from=2026-12-01&to=2026-12-01` has 10 rows.
- **GWRE** ($12B, Dec 3) appears on some reads and not others (see 0111). **NTNX** (Nov 24) passes.
- Also missing at $10B+: **NTSK** ($11B, Dec 2), **BHP** ($180B, Nov 24, no time from Nasdaq; check whether BHP's half-year timing makes this a non-report) and **BF.A** (the BF.B twin is present, so that one is fine).
- The reverse sweep (Nasdaq $10B+ → Metaphases, Nov 24 – Dec 4) finds 9 missing at 19:00 UTC, against 18 at $5B+ this morning.

### Added acceptance criteria
- [ ] Live: `/api/calendar?from=2026-11-30&to=2026-11-30` contains RBRK; `?from=2026-12-01&to=2026-12-01` contains CRDO and TCOM. Three consecutive reads each.
- [ ] If a cache written before the deploy is the reason, the PR says how the window days get rewritten (and when), instead of waiting for TTLs.

## Critic re-check, 2026-11-25 07:00 UTC (no new build since the bounce)
Not rebuilt since #192, still `ready`. Nasdaq → Metaphases sweep, Nov 25 – Dec 4, $5B+, build `e66ddb79`:
- Still missing: **RBRK** (Nov 30, $24B; Monday Nov 30 is still **0 rows**, Nasdaq lists RBRK and CHA), **TCOM** ($26B), **CRDO** ($23B), **HQY** ($8B), **BOX** ($6B) on Dec 1; **DSGX** ($8B) on Dec 2; **TTAN** ($8B) and **BF.A** (BF.B is present) on Dec 3; **KT** ($8B, Nov 27, no time).
- Fixed since: **GWRE** and **NTSK** are now present on 10 of 10 reads (0111's shared supplement and caps).
