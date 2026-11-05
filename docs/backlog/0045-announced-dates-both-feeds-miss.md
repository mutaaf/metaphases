---
id: 0045
title: Use the dates Cisco, Honda and Tyson announced (both feeds are wrong), and never project a report onto a market holiday
status: ready
priority: P0
size: S
lens: data-quality
created: 2026-11-05
pr:
by: critic
---

## Why
Critic check 2026-11-05 07:00 UTC, build `8d4fca50`. Three companies have published their own date or session, and Metaphases shows something else on the sheet, the calendar and the share card:

| Ticker | Metaphases (sheet, calendar, og:title) | Company | Nasdaq |
|---|---|---|---|
| CSCO | Wed Nov 18, time TBD ("CSCO reports Wed, Nov 18") | **Thu Nov 12, after the close**, call 4:30 pm ET ([Cisco IR, Nov 3](https://investor.cisco.com/news/news-details/2026/Cisco-Schedules-Conference-Call-for-Q1-Fiscal-Year-2027-Financial-Results/default.aspx)) | Nov 11 (also wrong) |
| HMC | Thu Nov 5, "Time TBD · **today**" | **Tue Nov 10, 15:35 JST** (01:35 ET, before the US open) ([Honda IR](https://global.honda/en/investors)) | Nov 6 (also wrong) |
| TSN | Mon Nov 16, **after the close** ("TSN reports Mon, Nov 16 after the close") | Mon Nov 16, **before the open**, call 9:00 am ET ([Tyson, Sep 24](https://finviz.com/news/395441/tyson-foods-announces-fourth-quarter-earnings-conference-call-and-webcast)) | pre-market |

Cisco is a $405B company, and its sheet says the report is a week later than it is. Honda's sheet says "today". A trader who trusts either one misses the print. Nasdaq is wrong on two of the three, so the 0015 cross-check alone wouldn't fix these; they need company overrides (`data/date-overrides.json`, the 0013 mechanism).

Separately, **MRVL** shows **Thu Nov 26**, which is Thanksgiving (`shared/market.ts` lists it as an NYSE holiday). It's a Finnhub projection with a blank session. No company date is out yet, but a report on a closed-market day is certainly not confirmed.

## What
- Add `CSCO`, `HMC` and `TSN` entries to `data/date-overrides.json` with the sources above, `checked: 2026-11-05` and a `note` naming Finnhub's and Nasdaq's dates. Use Finnhub's quarter/year labels from `/api/ticker/:sym` `next` (CSCO Q1 2027, HMC Q2 2027, TSN Q4 2026). HMC's 15:35 JST release is `bmo` for a US reader.
- Re-check before you commit, because an override is only as good as its source: open each link (or confirm against Nasdaq's per-day calendar as LESSONS 2026-11-04 says, noting that Nasdaq disagrees for CSCO/HMC) and record what you saw in the PR.
- A calendar event or sheet `next` whose date is in `HOLIDAYS` (or a weekend) and isn't an override gets a small flag (`proj: true` or similar). The sheet's date line says "Date not confirmed · markets are closed that day" instead of a plain date, and The Read and og:title don't state the day as fact. Keep it minimal; 0007 (still ready) owns the general "unconfirmed date" treatment and can reuse the flag. Files: `shared/dateOverrides.ts` or `worker/index.ts`, `shared/types.ts`, `src/components/TickerSheet.tsx`, `shared/market.ts` (read only).

## Acceptance criteria
- [ ] Production `/api/ticker/CSCO` `next` = `2026-11-12` `amc`; `/api/ticker/HMC` = `2026-11-10` `bmo`; `/api/ticker/TSN` = `2026-11-16` `bmo`
- [ ] `/api/calendar?from=2026-11-05&to=2026-11-18` has exactly one row each for CSCO (Nov 12), HMC (Nov 10) and TSN (Nov 16 bmo), and none on the old dates
- [ ] `og:title` on `/t/CSCO`, `/t/HMC` and `/t/TSN` says the company's day and session
- [ ] Unit test: an event projected onto `2026-11-26` is flagged; the same event with an override is not. The flagged sheet shows "Date not confirmed" at 390×844
- [ ] `npm test` passes the override validator (https source, `checked` ≤ 30 days)
- [ ] Works at 390×844 touch and 1440×900: HMC's tile is in Tuesday Nov 10's cell, and its sheet no longer says "today" on Nov 5

## Test plan
Unit: the overrides apply to fixtures for the three symbols. Holiday rule: a fixture row on Thanksgiving gets the flag and the sheet copy. e2e: unchanged fixtures still pass.

## Out of scope
The Nasdaq cross-check itself (0015). Finding the MRVL date (no company notice yet).
