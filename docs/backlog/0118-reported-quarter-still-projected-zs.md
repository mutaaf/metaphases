---
id: 0118
title: Zscaler (US$40B) reported on Nov 23 but the calendar, sheet and share card still call it "expected around Wed, Dec 2"
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-27
pr:
by: scout
---

## Why
The operator's focus (2) is "every date and session correct". On 2026-11-27 (14:40 UTC, build `7bea7612`) Metaphases shows a second Zscaler report next week for a quarter it has already reported:

- `/api/calendar?from=2026-11-30&to=2026-12-06` carries `{"s":"ZS","d":"2026-12-02","h":"","q":1,"y":2027,"eE":1.1944,"rE":965816528,"eA":null}`.
- `/api/ticker/ZS` has `next` = `{date: 2026-12-02, quarter 1, year 2027, projected: true}` **and** `history[0]` = `{date: 2026-11-23, session: "amc", period: "Oct 2026", epsE: 0.12, epsA: -0.03, basis: "differs"}`. The same quarter (Q1 FY27, ended Oct 31) is both the next report and the last one.
- `/t/ZS` unfurls as "ZS earnings expected around Wed, Dec 2 (not yet confirmed)".
- Company evidence: Zscaler announced Q1 FY27 results on Nov 23 (revenue $949.3M, ARR $3.882B), [GlobeNewswire release](https://www.globenewswire.com/news-release/2026/11/23/3408129/0/en/zscaler-announces-first-quarter-fiscal-year-2027-financial-results.html); the same release announced a definitive agreement to be acquired by CrowdStrike and withdrew guidance, so there may be no further report to project.

Dec 2 is counted in the day total ("N report on Wed") and in "This week", and a social share of that day names a company that is not reporting. Finnhub's calendar still lists the old projected date because it hasn't dropped it, and 0080 only guards a report that *never happened*; this is the reverse, a report that happened and is projected again.

## What
- In the worker's calendar and sheet paths (where `next` and the per-day rows are built), drop a Finnhub projected row whose fiscal quarter/year label (or Nasdaq `period`) matches a report already in the company's history, within the last 60 days. Keep it when the history row is the projection itself (same date).
- When a company has no further upcoming row, the sheet's next-report block says "No upcoming report on our calendar" instead of "expected around"; the share meta follows (`/t/ZS`, `?day=2026-12-02`).
- Do not add a company-specific rule: a generic "this quarter already reported" guard. Sweep `/api/calendar` for Dec 1–11 and list every other row whose `q`/`y` matches a history row in the PR.
- The `basis: "differs"` EPS on the Nov 23 row (0096's family) is out of scope; just don't let it confuse the guard.

## Acceptance criteria
- [ ] Live after deploy: `/api/calendar?from=2026-11-30&to=2026-12-06` has no ZS row on 10 of 10 reads, and `?day=2026-12-02` counts exclude it.
- [ ] `/api/ticker/ZS` `next` is absent or not Dec 2, and `/t/ZS` `og:title` does not say "expected around Wed, Dec 2" (check on the first fetch, per LESSONS).
- [ ] A company whose Q1 genuinely reports twice (a restated or corrected release on a later date with a different quarter label) is unaffected: unit test with a different `q`/`y`.
- [ ] Works at 390×844 and 1440×900 (the sheet's empty next-report state and the Dec 2 day drawer).
- [ ] Loading, partial and error states unchanged; an unchecked read must not bring the row back.

## Test plan
Unit: a Finnhub row (q1 y2027, projected) with a Nasdaq/history row of period "Oct 2026" reported Nov 23 is dropped; one with a different period stays; a row on the same date as history stays. e2e: fixture sheet whose history already holds the projected quarter renders the empty next-report state.

## Out of scope
The CrowdStrike acquisition itself (no deal copy), the `basis: "differs"` EPS history (0096), and GAAP/adjusted rules.
