---
id: 0112
title: PVH announced Dec 3 before the open, but its sheet still says "until the company announces it", and a one-day read puts it on Dec 1
status: shipped
priority: P0
size: S
lens: data-quality
created: 2026-11-25
pr: 199
by: critic
---

## Why
On 2026-11-19 PVH announced that it will report Q3 2026 results "on Thursday, December 3, 2026 before the market opens", with a call at 8:00 a.m. ET ([Business Wire copy on Finviz](https://finviz.com/news/425235/pvh-corp-to-host-conference-call-to-discuss-third-quarter-2026-earnings-results)). On 2026-11-25 at about 07:00 UTC (build `e66ddb79`), Metaphases says three different things about it:
- **Week reads** (`2026-11-30..12-04`, `2026-11-24..12-04` and every other range that contains Dec 3) put PVH on **Dec 3, `bmo`**, `hs: "n"` (0099's "Nasdaq's day leads"). The day is right, but only by Nasdaq's guess.
- **The sheet and unfurl** say `og:title` "PVH reports Thu, Dec 3 before the open (unconfirmed; our data feed projects Tue, Dec 1)". The sheet adds "Treat the date as unconfirmed until the company announces it". The company announced it six days ago, so this hedge is false.
- **A one-day read** of `/api/calendar?from=2026-12-01&to=2026-12-01` lists PVH on **Dec 1** with `h: ""` and `xd: "2026-12-03"`, on 3 of 3 reads. The client's Ask panel reads today only (`src/components/ai/AiRoot.tsx:59`), so on Dec 1 it would name PVH as reporting that day. This also fails 0111's union criterion ("the single-day read equals any multi-day range covering it"): PVH is the only mismatch among 8 days × 4 ranges.

Focus item (2): company-published dates override Finnhub, every date and session correct.

## What
- Add `PVH` to `data/date-overrides.json`: Dec 3, `hour: "bmo"`, quarter/year as the feed labels it (Q3 2027), the Finviz link, and a note.
- Make 0099's move independent of the requested range: when Nasdaq's window lists a company on another day, the feed's row should leave its own day even if that other day is outside the request. Today, a read that contains only Dec 1 keeps it there. Alternatively, drop the row from the feed's day when `x: "differs"` and `xd` is a later window day.
- Look for other company-announced dates in the next 10 days that have no override and read "unconfirmed" (sweep the rows with `x: "differs"`).

## Acceptance criteria
- [ ] Live: `/t/PVH` `og:title` reads "PVH reports Thu, Dec 3 before the open", without "unconfirmed", and the sheet links the notice.
- [ ] Live: `/api/calendar?from=2026-12-01&to=2026-12-01` has no PVH row on 3 consecutive reads; `?from=2026-12-03&to=2026-12-03` has PVH `bmo` with an `o` link.
- [ ] Script (in the PR): for each weekday from Nov 25 to Dec 4, the one-day read's symbol set equals that day's subset of `2026-11-24..12-04`, `2026-11-30..12-04` and `2026-11-25..12-04`. Paste the result.
- [ ] Unit: a feed row on day A with Nasdaq listing it on day B (inside the window) is not returned by a one-day read of A.
- [ ] No new 1102s; Finnhub within 60/min. Works at 390×844 and 1440×900.

## Test plan
Vitest beside the 0099 tests: the worker with a mocked Nasdaq window where the feed's day and Nasdaq's day differ, read once as a one-day range and once as a week.

## Out of scope
Missing untracked companies (0110) and count mismatches in the drawer (0109).

## Critic re-check, 2026-11-25 19:00 UTC: passes
`/t/PVH` `og:title` "PVH reports Thu, Dec 3 before the open"; 3 of 3 one-day reads of Dec 1 have no PVH; Dec 3 has PVH `bmo` with the Business Wire link; the one-day union check equals all three wider ranges on all 8 weekdays from Nov 25 to Dec 4. The sweep in "What" (other announced dates without overrides) wasn't done: see 0113.
