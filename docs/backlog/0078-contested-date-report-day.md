---
id: 0078
title: An unconfirmed date that reaches its day isn't a report (PDD "4 reporting · Figures pending" on Nov 16 while Nasdaq lists Thu Nov 19 and PDD hasn't announced)
status: ready
priority: P0
size: S
lens: data-quality
created: 2026-11-16
pr: 132
by: critic
---

## Why
Critic check 2026-11-16 19:00 UTC, build `2674bacd`. Yesterday PDD's share title said "PDD reports Mon, Nov 16 (unconfirmed; Nasdaq lists Thu, Nov 19)", which was honest. Today, on the feed's projected day, every surface says PDD was due this morning:

- `/?day=2026-11-16` at 390×844: "4 REPORTING · BEFORE OPEN · 4 · PDD … FIGURES PENDING" (`shots/p_day16c.png`).
- The sheet (`/t/PDD`): "THIS REPORT · Q3 2026 · Monday, November 16 · Results were expected before open today. None are in our data yet." and "The estimate going in was CN¥19.21" (`shots/p_pdd.png`). The Nasdaq disagreement is gone.
- og:title "PDD's Q3 results expected: none in yet"; og:description "Q3 results expected, none in our data yet".
- The AI facts (`worker/ai/prompts.ts:82`) tell the model the results "were expected on 2026-11-16".

But PDD has not announced a date, and Nasdaq's day calendar lists PDD on **Nov 19, pre-market** (`api.nasdaq.com/api/calendar/earnings?date=2026-11-19`). Our own calendar row knows this: `/api/calendar?from=2026-11-16&to=2026-11-20` carries `x: "differs", xd: "2026-11-19", xh: "bmo"`. The sheet's report-day branch (`worker/index.ts:897`, `next.status: "results-pending"`) rebuilds `next` without `nasdaq`, and the client's `figuresPending` chip doesn't look at `x`. A trader reads that PDD went quiet on its report day; it hasn't reported yet. Focus item 2: every date correct.

## What
- A row the cross-check contests on **date** (`x: "differs"` with an `xd` other than its own day), with no company override (`o`), never turns into a report-day or results-pending state on the feed's day. It stays "Date not confirmed: the feed says Mon Nov 16, Nasdaq lists Thu Nov 19", counted under "Date not confirmed" (as 0072's `od` rows), not in "N reporting".
- The sheet keeps `next.nasdaq` in the results-pending branch and, when it's set with another date, shows the contested headline (0062's wording) instead of "Results were expected".
- Share title and AI facts follow the sheet: no "results expected, none in yet" for a contested date.
- Once Nasdaq's day passes too with no figures, the existing overdue rules apply.

## Acceptance criteria
- [x] Unit: a PDD-shaped row (`d` today, `h: bmo`, `x: differs`, `xd` +3 days, no `o`, clock 19:00Z) → not results-pending, not counted as reporting; the same row with `o` set → results-pending as today
- [x] e2e on fixtures at 390×844 and 1440×900: the day drawer lists the contested row under "Date not confirmed" with both dates, and the day's count excludes it
- [x] `ogTitle` for that sheet names both dates ("unconfirmed; Nasdaq lists …"), never "results expected"
- [x] The AI facts for that sheet don't say results were expected that day
- [x] Loading / empty / error / partial states handled

## Test plan
Vitest on `shared/reported.ts` (outcome), `shared/pending.ts` (og title, `figuresPending`) with the contested row. Extend the closed/overdue day-drawer e2e spec with a contested report-day fixture row.

## Out of scope
Deciding which date is right (that needs the company). Rows contested only on session (0062 already covers those).

## Re-review 2026-11-17 07:00 UTC (critic, bounce 1 of 2)
Build `ec1b5d00` (deployed 00:54 UTC, includes #132). The **calendar half passes**: `/?day=2026-11-16` at 390×844 reads "3 REPORTING … DATE NOT CONFIRMED · 1 · PDD · Nasdaq: Thu, Nov 19, before open", and PDD isn't counted. The **sheet half fails one trading day later**:

- `/api/ticker/PDD` → `next: null`. The sheet at 390×844 has no Next report card at all, no "+ Calendar" button, and The Read never mentions a report (`shots/p_PDD.png`). og:title is the generic "PDD Holdings Inc. (PDD) earnings"; og:description has no date.
- Meanwhile PDD **announced** on Nov 12 that it reports Thu Nov 19 before the open, call 7:30 a.m. ET ([GlobeNewswire via Quiver](https://www.quiverquant.com/news/PDD+Holdings+to+Report+Third+Quarter+2026+Financial+Results+on+November+19)), and Nasdaq lists it Nov 19 pre-market. Two days before a $113B company reports, its sheet says nothing about a report.
- The calendar row on Nov 16 also lost `x`/`xd` in `/api/calendar?from=2026-11-16&to=2026-11-22` (the drawer re-derives it client side, so the screen is right, but the API, the AI facts and Compass read the bare row).

Bar: on the feed's day **and every day after it until Nasdaq's day passes**, `/api/ticker/<SYM>` keeps a `next` with the feed's date and `nasdaq: {date, session}`, and the sheet shows the contested headline. A PDD override (0081) fixes PDD itself, but the code path needs a fixture test for "day after the feed's day, contested, no figures, no override" → `next` not null.
