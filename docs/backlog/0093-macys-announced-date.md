---
id: 0093
title: Macy's announced Wednesday Dec 2 (8 a.m. ET call); the sheet's headline still says Thursday Dec 3 and tells people to wait for the company
status: ready
priority: P0
size: S
lens: data-quality
created: 2026-11-20
pr:
by: critic
---

## Why
Critic check 2026-11-20 07:00 UTC. On Nov 17 (Business Wire, 5:55 a.m.), Macy's said it "will report its third quarter 2026 sales and earnings results on Wednesday, December 2", with the call at 8:00 a.m. ET ([finviz wire](https://finviz.com/news/423868/macys-inc-to-report-third-quarter-2026-results-on-december-2-2026)). Earnings Whispers also lists Dec 2 before the open. Metaphases still leads with the feed's date:

- `/api/calendar?from=2026-11-20&to=2026-12-03`: `{"s":"M","d":"2026-12-03","h":"","x":"differs","xd":"2026-12-02","xh":"bmo"}`, with no `o`.
- `/t/M` at 390×844 (`shots/p__t_M.png`): "Thursday, December 3 · Time TBD · Two calendars disagree… Treat the date as unconfirmed **until the company announces it**." The company announced it three days ago.
- Unfurl `og:title`: "M reports Thu, Dec 3 (unconfirmed; Nasdaq lists Wed, Dec 2)".
- Because the row is contested, 0060 keeps the session unknown, so all four past reports have `session: ""`, no moves and no typical move. Macy's reported before the open on all four (Dec 3 '25, Mar 18, Jun 3, Sep 10).

This is operator focus (2): company-published dates override Finnhub.

## What
- Add `M` to `data/date-overrides.json`: `date: 2026-12-02`, quarter 3 / year 2027 (the feed's labels), `source` = the company notice above, `checked` (New York date), `call: "8 a.m. ET"`. The notice names no release time, so set no `hour` (0084 lesson). The 8 a.m. call means the release can't come after the close, but a call time alone isn't a session.
- While you're there, check URBN, KSS, AEO and KR (all contested this week) against their IR pages. None had a company notice on Nov 20; add any that has appeared since.

## Acceptance criteria
- [ ] `/api/calendar` lists `M` on 2026-12-02 with `o` set and no `x: "differs"`; nothing on 2026-12-03
- [ ] `/t/M` reads "Wednesday, December 2", "Confirmed by the company", "Earnings call 8 a.m. ET, per the company's notice", and no "two calendars disagree"
- [ ] `/t/M` `og:title` starts "M reports Wed, Dec 2" with no "unconfirmed"
- [ ] `/api/ticker/M` `history[].session` all `bmo` (0090 fallback) with ≥3 moves, or `""` only if the reaction test genuinely splits; say which in the PR
- [ ] Override unit tests (`dateOverrides.test.ts`) pass with the new row
- [ ] Works at 390×844 and 1440×900

## Test plan
The existing override validation test covers the new row. Add M to the e2e/unit fixture only if a test needs it.

## Out of scope
Automating company-notice discovery.
