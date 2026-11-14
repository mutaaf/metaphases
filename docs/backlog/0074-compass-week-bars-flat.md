---
id: 0074
title: Compass "Week by week" draws every week as the same 3 px line ($8K week and $183 week look identical)
status: ready
priority: P1
size: S
lens: clarity
created: 2026-11-14
pr:
by: critic
---

## Why
Critic check 2026-11-14 07:10 UTC, build `430b6842`. In Compass, with `VOO 10000 / ANF 2000 / DKS 3000 / BJ 1200`, the bars' inline heights are 40.78%, 100%, 5.08% and 3.66%, but every `.wk-fill` renders 3 px tall (`getBoundingClientRect`), inside 220 px columns. The chart's whole job, "which weeks matter most to you" (`src/pages/Compass.tsx:86`), is lost: the $8K week of Nov 23 and the $183 week of Dec 14 look the same at 390×844 and 1440×900 (`shots/{p,d}_e_compass.png`).

Cause: `.wk-bar` is `display: grid; align-content: end` (`src/styles/pages.css:23`), so the fill sits in an auto-sized grid row and its percentage `height` has nothing definite to resolve against. It falls back to `min-height: 3px`.

## What
Give the fill a definite track: for example `.wk-bar { grid-template-rows: 1fr auto auto auto; }` with the fill in a wrapper that takes the `1fr` row and the fill aligned to its bottom, or a flex column with the fill in a `flex: 1` box. Keep the grow animation and the labels below.

## Acceptance criteria
- [ ] e2e (Compass sample portfolio, 390×844 and 1440×900): the tallest `.wk-fill` is at least 150 px, and each bar's rendered height is within 4 px of `(dollars / max) × track height`
- [ ] Labels ($, date, names) still sit under each bar; no horizontal page scroll
- [ ] e2e at 390×844 and 360×800 **after mapping a portfolio that spans 5+ weeks** (see the re-check below): `document.documentElement.scrollWidth === innerWidth`, and `innerWidth` stays 390 (or 360)
- [ ] Reduced motion still shows final heights

## Test plan
Add the height assertion to the Compass e2e spec.

## Out of scope
Changing what the weeks count (0070 already marks projected rows).

## Critic re-check 2026-11-14 19:00 UTC (still flat, and it now widens the phone page)
Build `883f126d`. With `NVDA 10000 / WMT 4000 / LI 2000 / CRWD 3000 / VOO 25000 / DELL 1500`, the five `.wk-fill`s have inline heights of 100%, 21.7%, 18.6%, 3.9% and 2.8%, and every one still renders 3 px tall.

**New:** after "Map my exposure" at 390×844 (and at 360), the phone's layout viewport grows from 390 to **495 px**, in light and dark. The page is then zoomed out or pans sideways: the stat labels read "REPORTS TOUCHI…" and the fund list runs off the right edge (`shots/p_09_compass_dark.png`). Before mapping, `scrollWidth` is 390. The elements past the edge are the `.wk-bar` columns (right edge 476) and every `.ex-amt` (right edge 472). `.wk-bars` is `grid-auto-columns: minmax(80px, 1fr)` with `overflow-x: auto` (`src/styles/pages.css:22`): five weeks need 5 × 80 + 4 × 10 = 440 px, and its container isn't width-bounded (`min-width: 0`), so it widens the whole section instead of scrolling inside. The existing no-scroll e2e doesn't catch this because it checks routes before a portfolio is mapped. UX principle 1 (no horizontal scroll) fails on the core Compass flow. Fix both in the same pass: a definite track for the fill, and `min-width: 0` (or narrower columns) so the chart fits or scrolls inside its own box.
