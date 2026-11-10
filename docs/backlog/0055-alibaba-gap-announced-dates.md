---
id: 0055
title: Use the dates Alibaba (Thu Nov 19) and Gap (Thu Nov 19, after the close) announced; the sheet says Dec 1 and Wed Nov 18
status: shipped
priority: P0
size: S
lens: data-quality
created: 2026-11-10
pr: 85
by: critic
---

## Why
Critic check 2026-11-10 07:00 UTC. Two companies published their dates weeks ago, and Metaphases still shows Finnhub's projection.

**Alibaba (BABA).** Alibaba's 6-K of Nov 6 (Exhibit 99.1, HKEX "Date of Board Meeting", [SEC](https://www.sec.gov/Archives/edgar/data/1577552/000110465926123545/tm2629189d1_ex99-1.htm)) says the board meets Nov 18 and that the results "will further be approved by or on behalf of the Board and announced on November 19, 2026". Nasdaq's day calendar lists BABA on 2026-11-19, `time-pre-market` (last year's September-quarter release also came before the US open). Metaphases disagrees with itself:
- `/api/ticker/BABA` `next`: `{"date":"2026-12-01","session":"","quarter":2,"year":2027}`. The sheet reads "Tuesday, December 1 · Time TBD · in 21 days" (`shots/p__t_BABA.png`), The Read says "reports Q2 on Tuesday, Dec 1", and `/t/BABA` unfurls as **"BABA reports Tue, Dec 1"**.
- `/api/calendar?from=2026-11-01&to=2026-11-30` puts BABA on **Nov 19**, and `from=2026-11-30&to=2026-12-31` puts it on **Dec 1** as well. `from=2026-11-16&to=2026-12-12` has only the Dec 1 row. So the month grid shows one report in two months, and which one you see depends on the range you asked for.
- The sheet carries no `nasdaq` disagreement, because 0015 only reads Nasdaq's day for the sheet's own date (Dec 1, outside its 10-weekday window). An earlier Nasdaq date is invisible to the sheet.

**Gap (GAP).** Gap's release of Oct 29 ([company PDF](https://s204.q4cdn.com/320226404/files/doc_news/Gap-Inc--to-Report-Third-Quarter-Fiscal-2026-Results-on-November-19-2026.pdf)): results "on Thursday, November 19, 2026, at approximately 1:15 p.m. Pacific Time", with the call at 2:00 pm PT. That's after the close. Metaphases: `/api/ticker/GAP` `next` = `2026-11-18`, `session: ""`, `nasdaq: {date: 2026-11-19, session: amc}`. The sheet headline is a day early, with 0015's disagreement notice under it.

This is the third company-announced date in two days that Metaphases had wrong (ROST 0052 yesterday). A trader who sets an alarm for Wednesday misses Gap by a day, and Alibaba's sheet and share card are 12 days late.

## What
- `data/date-overrides.json`: add **BABA** (`date: 2026-11-19`, `hour: bmo` as Nasdaq lists it and as last year's release ran, with a `note` that the 6-K gives the day only; Finnhub labels `quarter: 2`, `year: 2027`; `source` = the SEC exhibit URL above) and **GAP** (`date: 2026-11-19`, `hour: amc`; Finnhub's labels for its row; `source` = the Gap PDF).
- Check that an override also removes the stale Finnhub row in *other* months: the Dec 1 BABA row must go once the override says Nov 19 (same symbol, same `q`/`y`). If the override path only moves rows within the requested range, fix it here (this is the cross-month case of 0041).
- Sheet: when the `symbol=` row and the calendar's day rows disagree for the same `q`/`y`, the override or the earlier, Nasdaq-agreeing date wins. Never show a sheet date the calendar doesn't show.

## Acceptance criteria
- [ ] `/api/ticker/BABA` `next.date` = `2026-11-19` with `confirmed` set; `/t/BABA` og:title reads "BABA reports Thu, Nov 19 …"
- [ ] `/api/calendar?from=2026-11-30&to=2026-12-31` has no BABA row; `from=2026-11-01&to=2026-11-30` has exactly one, on Nov 19
- [ ] `/api/ticker/GAP` `next` = `2026-11-19` · `amc` · `confirmed`; no "Two calendars disagree" notice on `/t/GAP`
- [ ] Unit test (worker): a symbol whose `symbol=` row says Dec 1 while an override says Nov 19 yields one row on Nov 19, in every range that includes either date (use a made-up symbol, LESSONS 2026-11-06)
- [ ] `npm test` (override validator) passes; works at 390×844 and 1440×900

## Test plan
The override validator covers the entries. Add a worker test for the cross-month case. Live check after deploy: the curl lines in critique 2026-11-10 07:00 "Reproduce".

## Out of scope
Taking Nasdaq's date over Finnhub's without a company notice (PDD Nov 16 vs Nasdaq Nov 17, WSM Nov 17 vs Nov 18, CPRT and SQM have no notice yet; 0015 flags them).

## Shipped (PR #85)
BABA and GAP overrides; the cross-month drop is proven through the worker (`overrideCrossMonth.test.ts`). The generic rule in "What" bullet 3 (a sheet date the calendar doesn't show, for a symbol with **no** override, when the `symbol=` date sits outside 0015's Nasdaq window) is not covered here; it needs its own ticket if the critic sees it recur.
