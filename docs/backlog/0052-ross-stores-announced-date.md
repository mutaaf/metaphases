---
id: 0052
title: Use the date Ross Stores announced (Thu Nov 19, after the close); every surface says Wed Nov 18, time TBD
status: shipped
priority: P0
size: S
lens: data-quality
created: 2026-11-09
pr: 80
by: critic
---

## Why
Critic check 2026-11-09 19:00 UTC. On Nov 5, Ross Stores announced that it "plans to release its third quarter 2026 earnings results on **Thursday, November 19, 2026 at approximately 4:00 p.m. Eastern time**", with a call at 4:15 pm ET ([wire copy on Finviz, published Nov 5 4:01 PM](https://finviz.com/news/417559/ross-stores-inc-announces-third-quarter-2026-earnings-release-and-conference-call)). Nasdaq's day calendar agrees (`2026-11-19`, `time-after-hours`). Metaphases is a day early with no session on every surface:
- `/api/ticker/ROST` `next`: `{"date":"2026-11-18","session":""}`. The sheet's headline is "Wednesday, November 18 · Time TBD · in 9 days" (`shots/p__t_ROST.png`), and The Read says "reports Q3 on Wednesday, Nov 18 (time not yet confirmed)".
- `/api/calendar?from=2026-11-16&to=2026-11-20`: ROST sits on Nov 18 with `h: ""`.
- Compass with ROST in a portfolio puts it under "NOV 18 · ROST · Ross Stores Inc".
0015 works here: the sheet already says "Two calendars disagree. Nasdaq's calendar lists it on Thursday, November 19, after close." But the company has spoken, so the headline should be the company's date, not a disagreement notice. A trader who sets an alarm for Wednesday's close misses the print by a day.

## What
- Add ROST to `data/date-overrides.json`: Finnhub labels (`quarter: 3`, `year: 2027`), `date: 2026-11-19`, `session: amc`, the Finviz wire copy as `source`, and a `note` saying Nasdaq agrees.
- While the file is open, also confirm PANW (0050: Palo Alto announced after the close on Nov 18), since only its session is missing.
- No code change expected. If the override doesn't move the calendar row out of Nov 18, that's a bug in the override path and belongs in this PR.

## Acceptance criteria
- [x] `/api/ticker/ROST` `next` = `2026-11-19` · `amc` · `confirmed` set to the source URL
- [x] The calendar row for ROST is on Thu Nov 19 with `h: "amc"` and `o` set, and isn't on Nov 18
- [x] `/t/ROST` og:title reads "ROST reports Thu, Nov 19 after the close"
- [x] The sheet shows no "Two calendars disagree" notice for ROST
- [x] `npm test` (override validator) passes; works at 390×844 and 1440×900

## Test plan
The existing override validator covers the entry. Live check after deploy: the curl lines above.

## Out of scope
A general rule that takes Nasdaq's date over Finnhub's (0015 deliberately only flags it).
