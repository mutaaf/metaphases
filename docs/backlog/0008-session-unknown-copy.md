---
id: 0008
title: Tell the glancer when a report's time of day is unknown (16% of next two weeks)
status: ready
priority: P1
size: S
lens: clarity
created: 2026-11-01
pr:
by: scout
---

## Why
For 2026-11-02..13, 67 of 405 events (16%) have no session (e.g. AES, BLD, CIFR-adjacent names). The moon-phase
glyph is the product's core idea, so a missing phase must be explained, not silently blank.

## What
Show a neutral "time TBA" glyph and a one-line explanation ("The company hasn't said whether it reports before
open, during or after close") in tiles' accessible names, the drawer and the sheet. Group "time TBA" as its own
filter chip value. Files: `Calendar.tsx`, `TickerSheet.tsx`, `bits.tsx`, `glossary.ts`.

## Acceptance criteria
- [ ] Blank-session events show the TBA glyph and text in drawer and sheet
- [ ] Session filter has a "Time TBA" option that filters correctly
- [ ] Tile accessible name reads e.g. "AES, time not announced"
- [ ] Works at 390×844 and 1440×900

## Test plan
e2e with a fixture event having `h: ""`: asserts glyph, text and filter.

## Out of scope
Guessing the session from history (see 0007 for confirmation status).
