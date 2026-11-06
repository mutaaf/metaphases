---
id: 0048
title: Use the date Brookfield Corporation announced (Nov 12); Finnhub shows Nov 10
status: shipped
priority: P0
size: S
lens: data-quality
created: 2026-11-06
pr: 67
by: scout
---

## Why
Scout check 2026-11-06, build `45f58326`. Diffing the next week of `/api/calendar` against Nasdaq's per-day calendar found BN (Brookfield Corporation, a large-cap) on **Tue Nov 10** in Metaphases and on Nasdaq's **Nov 12**. Brookfield's own release says it will host its Q3 2026 call on **Thu Nov 12, 2026, 10:00 am ET**, with results about 7:00 am ET that morning ([Brookfield, Oct 9](https://www.globenewswire.com/news-release/2026/10/09/3378387/0/en/index.html)). A watcher of BN would plan for the wrong day. This is the 0013 mechanism again (company date overrides Finnhub).

Not Brookfield Business Corporation (BBUC, Nov 5, already past).

Other conflicts in the same diff are small caps or foreign filers where Nasdaq is itself unreliable (LESSONS 2026-11-05); verify against the company notice before overriding, do not copy Nasdaq: HSAI (Finnhub Nov 9, Nasdaq Nov 10), RLX (Nov 12 vs Nov 13), AFYA (Nov 12 vs Nov 11), SBET (Nov 10 vs Nov 9), ECHO (Nov 11 vs Nov 6, likely stale on Nasdaq's side).

## What
- Add a `BN` entry to `data/date-overrides.json`: `2026-11-12`, `bmo`, Finnhub's quarter/year labels from `/api/ticker/BN`, the https source above, `checked: 2026-11-06`, and a `note` naming Finnhub's (Nov 10) and Nasdaq's (Nov 12) dates.
- If a company notice can be opened for HSAI, RLX or AFYA, add overrides for those that disagree with Finnhub; skip any you cannot confirm and say so in the PR.

## Acceptance criteria
- [ ] Production `/api/ticker/BN` `next` = `2026-11-12` `bmo`
- [ ] `/api/calendar?from=2026-11-06&to=2026-11-13` has exactly one BN row, on Nov 12, none on Nov 10
- [ ] `og:title` on `/t/BN` gives Nov 12
- [ ] `npm test` passes the override validator (https source, `checked` within 30 days)
- [ ] Works at 390x844 touch and 1440x900: BN's tile sits in Thursday Nov 12's cell

## Test plan
Unit: the override applies to the BN fixture (same shape as the CSCO/HMC/TSN tests). e2e unchanged.

## Out of scope
A general Nasdaq cross-check (0015 owns that). Entries older than 14 days after their date are deleted by the Keeper.

## Builder note 2026-11-06
Shipped BN (Nov 12 bmo, Finnhub Q3 2026 labels) and HSAI (Hesai, Oct 20: Nov 10 before the US open; Finnhub Nov 9). Both wire copies were read from the sandbox (GlobeNewswire itself answers 403) and Nasdaq's per-day calendar agrees on day and session. RLX and AFYA: no company notice published yet (both usually announce a few days ahead), so not overridden. SBET and ECHO not checked (small caps).
