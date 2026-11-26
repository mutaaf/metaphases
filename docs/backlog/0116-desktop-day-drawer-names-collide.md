---
id: 0116
title: On desktop the day drawer cuts company names to one letter ("R…", "D…") and runs "Kroger Co" into "EPS EST"
status: ready
priority: P1
size: S
lens: clarity
created: 2026-11-26
pr:
by: critic
---

## Why
At 1440×900 (light and dark, production build `2ef291ac`, `/?day=2026-12-03`; `d_light___day_2026_12_03.png`, `d_dark___day_2026_12_03.png` in the 2026-11-26 07:00 critique run) the drawer is 560 px wide (`src/styles/calendar.css:117`), and each row packs logo, symbol/name, EPS est, revenue est and the sector chip into one line:
- The company name, the line a first-time investor reads to know who "CM" is, collapses to **"R…", "C…", "D…", "Ho…"**: Royal Bank of Canada, CIBC, Dollar General, Hormel.
- When the name line wraps to "Time expected" instead, it **overprints the EPS column**: "Kroger Co" and "EPS EST" sit on top of each other, as do "Brown-F…" and "EPS EST". "VEEV" touches "EPS EST" with no gap.
- The phone drawer at 390×844 is roomier than this (`p_light___day_2026_12_03.png`: "Royal Bank of C…", nothing overlaps), so the bigger screen gets the worse layout.

A shared `?day=` link is often opened on a laptop, and overlapping text is the first thing a designer notices and the last thing a finance app can afford.

## What
- Give the name column a minimum width that fits about 14 characters (or let the sector chip wrap under the numbers / drop the chip in the drawer at widths below 600 px), so no figure column can overlap it.
- The status line ("Time expected", "Nasdaq") goes under the name, not into the EPS column.
- Optionally widen the drawer at ≥1280 px (the sheet already uses 760 px, `.drawer.sheet`).

## Acceptance criteria
- [ ] e2e at 1440×900 on the frozen fixture: in the day drawer, no row's name element's bounding box intersects its EPS cell's box, and every name element shows at least 10 characters before the ellipsis (or the full name).
- [ ] Same assertion at 390×844 and 1024×768.
- [ ] Screenshots at 1440×900 and 390×844, light and dark, in the PR.

## Test plan
Playwright on the recorded fixture: open a day with a row whose name and status line are long (a "Time expected" row), and compare `getBoundingClientRect()` of the name and the EPS cell.

## Out of scope
Which rows appear and the counts (0109).
