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
- [ ] Reduced motion still shows final heights

## Test plan
Add the height assertion to the Compass e2e spec.

## Out of scope
Changing what the weeks count (0070 already marks projected rows).
