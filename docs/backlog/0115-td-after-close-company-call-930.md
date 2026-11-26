---
id: 0115
title: TD reads "after the close" on the calendar although TD's own IR calendar sets a 9:30 a.m. ET call on Dec 3, and the sheet says "until the company announces it"
status: ready
priority: P0
size: S
lens: data-quality
created: 2026-11-26
pr:
by: critic
---

## Why
Toronto-Dominion (US$191B, the second-biggest report next week) publishes its Q4 2026 conference call on its own investor-relations calendar: **Thursday, December 3, 2026, 9:30 a.m. ET** ([TD IR calendar](https://www.td.com/investor-relations/ir-homepage/presentations-and-events/upcoming-events/calendar.jsp), read 2026-11-26 07:00 UTC). A 9:30 a.m. call on the report day means the results are out before the session ends, so they can't come "after the close". Nasdaq lists TD pre-market. TD has released Q4 before the open every year.

Metaphases at 06:52–06:58 UTC on 2026-11-26 (build `2ef291ac`, colo ORD):
- `/api/calendar?from=2026-11-26&to=2026-12-04` and `?from=2026-11-30&to=2026-12-04`: TD `h: "amc"` on **26 of 26 reads**. On the unchecked reads (the first 20, see 0114) the row has no `x`/`xh`, so the client's `settleContested` can't blank it, and the calendar shows **TD under "After close" as fact**. Only the later checked reads carry `x: "differs", xh: "bmo"`.
- `/api/calendar?from=2026-12-03&to=2026-12-03`: TD `amc` on 3 of 3 reads.
- `/t/TD` sheet (`p_light__t_TD.png`): "Time unconfirmed … Treat the time as unconfirmed **until the company announces it**". The company has published a call time. That's the same false claim of company silence 0113 removed for "hasn't said", in different words.
- `data/date-overrides.json` has no TD entry; BNS's note still says "TD has named no time yet".

A trader who reads "after close" plans around a 4 p.m. print that comes at roughly 6 a.m. Operator focus (2): every session correct, with company-published dates overriding Finnhub.

## What
- Add TD to `data/date-overrides.json`: date 2026-12-03, `call: "9:30 a.m. ET"`, the IR calendar link, and a note. Under 0108's `overrideSession`, a 9:30 call is market hours, so the session comes from Nasdaq's same-day listing (`bmo`, expected) unless a TD notice states the release time. If it does (TD's media advisory usually comes about three weeks ahead), set `hour: "bmo"` and quote it.
- Update BNS's note so it no longer says TD has named no time.
- Reword the contested-time copy: replace "until the company announces it" (and any similar claim about what the company has or hasn't done) with what *we* know, e.g. "until we find the company's announcement". Grep `src/`, `shared/` and `worker/` for `company announces`. Extend 0113's grep test to cover the phrase.
- Sweep the $40B+ rows in the next 10 days that have a company notice but no `o` link, and add overrides with links: CRM ([Salesforce, Nov 10](https://investor.salesforce.com/news/news-details/2026/Salesforce-Announces-Date-of-Third-Quarter-Fiscal-2027-Earnings-Release-and-Webcast/default.aspx): Dec 2 after the close), SNOW ([Snowflake](https://www.snowflake.com/en/news/press-releases/fy27-q3-earnings-date-announcement/): Dec 2, call 2 p.m. PT, after the close) and VEEV ([Veeva, Nov 12](https://finviz.com/news/422121/veeva-to-release-fiscal-2027-third-quarter-results-on-december-3-2026): Dec 3 after the close). Their sessions are already right; the link makes them company-confirmed rather than feed-reported. List the sweep in the PR.

## Acceptance criteria
- [ ] Live: TD's row in `/api/calendar?from=2026-11-30&to=2026-12-04` and `?from=2026-12-03&to=2026-12-03` never reads `h: "amc"` on 10 consecutive reads, including the first read after the deploy; it carries `o`.
- [ ] Live: `/t/TD` `og:title` reads "TD reports Thu, Dec 3" with either "before the open" or no session, never "after the close", on 5 reads.
- [ ] The phrases "until the company announces" and "hasn't said" appear nowhere in `src/`, `shared/` or `worker/` (the grep test).
- [ ] CRM, SNOW and VEEV rows carry `o` with the company link.
- [ ] Works at 390×844 and 1440×900.

## Test plan
`npm test` covers the override file shape and `overrideSession` (9:30 a.m. → no session, then the Nasdaq fill). Extend the 0113 grep test with the new phrase.

## Out of scope
Unchecked reads in general (0114). This ticket fixes TD's own row and the copy.
