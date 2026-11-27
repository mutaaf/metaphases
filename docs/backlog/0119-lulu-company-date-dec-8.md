---
id: 0119
title: Lululemon published Dec 8 after the close, but with no override the calendar leads with Finnhub's Dec 9
status: ready
priority: P1
size: S
lens: data-quality
created: 2026-11-27
pr:
by: scout
---

## Why
Focus (2): "company-published dates override Finnhub". On 2026-11-27 (14:45 UTC):

| Ticker | Company notice | Metaphases |
|---|---|---|
| **LULU** (US$12B) | Nov 24 Business Wire release: Q3 FY26 results on **Tuesday, December 8, 2026**, call 4:30 p.m. ET ([Yahoo Finance copy](https://ca.finance.yahoo.com/news/lululemon-athletica-inc-announces-third-113000424.html)) | `/api/calendar` row `d: "2026-12-09"`, `h: "amc"`, `x: "differs"`, `xd: "2026-12-08"`; `/api/ticker/LULU` `next.date` is Dec 9 with `nasdaq: {date: 2026-12-08, session: amc}`; no `o` link. |

The row is contested, so a checked read shows both dates, but an unchecked read (0114) shows Dec 9 as fact, and the day it lands on (Dec 9 vs Dec 8) decides which day's drawer, share card and .ics carry it. An override makes the row immune, as it did for TD, RY and CM.

## What
- Add LULU to `data/date-overrides.json` (date 2026-12-08, hour amc from the notice or `call: "4:30 p.m. ET"` per the file's readme, Finnhub's quarter/year labels from the live row, source link above, checked 2026-11-27). Prefer the company's own newsroom URL if the page is reachable; the readme requires a company release.
- Sweep: list every `x: "differs"` row in `/api/calendar?from=2026-12-07&to=2026-12-13` ($5B+), search each for a company notice (GME shows `xd: 2026-12-08` with no notice found on 2026-11-27, JBL a blank session with only an aggregator "confirmed"). Add an override only where a company release exists; write what was searched in the PR.

## Acceptance criteria
- [ ] Live: 10 reads of `/api/calendar?from=2026-12-07&to=2026-12-13`, including the first after deploy: LULU `d: "2026-12-08"`, `h: "amc"`, with `o`, on 10 of 10.
- [ ] `/t/LULU` links the company notice; `?day=2026-12-08` lists LULU and `?day=2026-12-09` does not.
- [ ] `npm test` override validation passes (https source, checked date).
- [ ] Works at 390×844 and 1440×900 (day drawer).

## Test plan
Existing override tests cover the format; add LULU to any fixture or assertion that company-dated rows win over a differing Finnhub date.

## Out of scope
The unchecked-read rate (0114), GME and JBL unless a company notice exists.
