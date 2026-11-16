---
id: 0078
title: An unconfirmed date that reaches its day isn't a report (PDD "4 reporting · Figures pending" on Nov 16 while Nasdaq lists Thu Nov 19 and PDD hasn't announced)
status: shipped
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
