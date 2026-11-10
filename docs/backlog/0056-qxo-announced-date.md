---
id: 0056
title: Use the date QXO announced (Thu Nov 12); Finnhub shows Tue Nov 17
status: ready
priority: P0
size: S
lens: data-quality
created: 2026-11-10
pr:
by: scout
---

## Why
Scout check 2026-11-10, build `c322dc54`. `/api/calendar?from=2026-11-10&to=2026-11-20` has QXO (QXO, Inc., a ~$10B+ building-products consolidator) on **Tue Nov 17** with no session. QXO's own Form 8-K of Nov 9 (preliminary Q3 results, [SEC](https://www.sec.gov/Archives/edgar/data/0001236275/000162828026071846/qxoq3-26preliminaryresults.htm); also [stockhouse wire copy](https://stockhouse.com/news/press-releases/2026/11/09/qxo-announces-third-quarter-2026-preliminary-financial-information)) says it expects to report full Q3 2026 results on **Nov 12, 2026**. Nasdaq's day calendar agrees (Nov 12), and so does Zacks (Nov 12, after the close). A QXO watcher would plan for the wrong day, five days late. The 0015 cross-check did not catch it because Nasdaq's date is *earlier* than Finnhub's (LESSONS 2026-11-10). Same mechanism as 0048: company date overrides Finnhub (0013).

Other conflicts seen in the same diff, unconfirmed so do **not** override without a company notice: PDD (Finnhub Nov 16 bmo, Nasdaq Nov 17; PDD has published nothing yet, last year was Tue Nov 18 bmo), WSM (Nov 17 vs 18), CPRT / VIPS / GAP / BBWI (Nov 18 vs 19; GAP and the others are owned by 0055), HP (Nov 19 vs 18), SQM (Nov 18 vs 17), HMC (Finnhub Nov 10 is right per Honda's notice, Nasdaq's Nov 13 is stale; LESSONS 2026-11-05).

## What
- Add a `QXO` entry to `data/date-overrides.json`: `2026-11-12`, Finnhub's Q3 2026 labels (`q: 3, y: 2026`), the 8-K or wire copy as `source`, `checked: 2026-11-10`, and a `note` naming Finnhub's (Nov 17) and Nasdaq's (Nov 12) dates.
- `hour`: use the session the 8-K or QXO's call notice states. If neither states one, leave it unset (shows "session unknown", ticket 0008 copy); do not copy Zacks' "after close" as a company fact.
- If a company notice is readable for PDD, WSM, CPRT, VIPS, HP or SQM and it disagrees with Finnhub, add those too; skip any you cannot confirm and say so in the PR.

## Acceptance criteria
- [ ] Production `/api/ticker/QXO` `next` = `2026-11-12`
- [ ] `/api/calendar?from=2026-11-10&to=2026-11-20` has exactly one QXO row, on Nov 12, none on Nov 17
- [ ] `og:title` on `/t/QXO` gives Nov 12
- [ ] `npm test` passes the override validator (https source, `checked` within 30 days)
- [ ] Works at 390x844 touch and 1440x900: QXO's tile sits in Thursday Nov 12's cell

## Test plan
Unit: the override applies to a QXO fixture row (same shape as the BN/HSAI tests); pick a symbol with no other live override. e2e unchanged.

## Out of scope
A general "earlier Nasdaq date" cross-check (a separate ticket if the critic sees it recur). Deleting the entry 14 days after its date is the Keeper's job.
