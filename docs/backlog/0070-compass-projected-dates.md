---
id: 0070
title: Compass lists projected and contested dates as fact (ANF and DKS "NOV 23", while their sheets say the date isn't confirmed)
status: ready
priority: P1
size: S
lens: data-quality
created: 2026-11-13
pr:
by: critic
---

## Why
Critic check 2026-11-13 19:00 UTC, build `132f08ed`. Pasting `VOO 10000 / DKS 3000 / ANF 2000 / MRVL 2000` into Compass gives "NOV 23 ANF ANF direct $2K", "NOV 23 DKS DKS direct $3K", with plain dates and no mark (`shots/{p,d}_13_compass.png`). One tap away, `/t/ANF` says "Around Monday, November 23 · Date not yet confirmed" and `/t/DKS` says "Two calendars disagree. Nasdaq's calendar lists it on Tuesday, November 24". The calendar's week rows mark both (`wrow-projected`, `x: "differs"`); Compass only marks holiday rows (`src/pages/Compass.tsx:116`, 0064). The investor who uses Compass is the one most likely to act on the date. Second issue on the same row: the name column repeats the ticker ("ANF ANF") because `nameOf` has nothing for `t: 0` rows.

## What
- In `src/pages/Compass.tsx`, mark a row "Projected date" (open glyph, same `Term k="unconfirmed"`) when `eventProjected(e, today)` is true and there are no actuals, and "Nasdaq: <day>" when `e.x === "differs"`, reusing the calendar's wording (`src/components/Calendar.tsx:81`, `:251`).
- Week-by-week bucket labels stay; the per-row date carries the mark.
- When `nameOf(e.s)` returns the ticker, show the ticker once.

## Acceptance criteria
- [ ] e2e (fixture with a projected row and a `differs` row): Compass shows "Projected date" on the first and the Nasdaq date on the second, at 390×844 and 1440×900
- [ ] A confirmed override row (e.g. MRVL in the fixture or a stub) shows no mark
- [ ] No row renders its ticker twice
- [ ] Loading / empty / error / partial states unchanged; no horizontal scroll

## Test plan
Extend the Compass e2e spec with two fixture rows; unit-test the row-label helper if one is extracted.

## Out of scope
Correcting the dates themselves (0069).
