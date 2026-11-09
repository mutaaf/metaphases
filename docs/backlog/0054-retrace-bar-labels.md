---
id: 0054
title: Retrace's "month in one bar" clips "25 miss" to "25 MI" on phones, and its labels fail contrast in dark mode
status: ready
priority: P1
size: S
lens: accessibility
created: 2026-11-09
pr:
by: critic
---

## Why
Critic check 2026-11-09 19:00 UTC, 390×844, `/retrace` (`src/pages/Retrace.tsx:80-84`, `.big-strip`). The bar's segments are sized by `flex: count`, and their labels are inside them. At 122 / 46 / 25 the miss segment is 55 px wide, but its label needs 86 px (`scrollWidth 86 / clientWidth 55`), so it reads **"25 MI"** (`shots/p_retrace_bar_dark.png`). "46 mixed" is clipped too (94 vs 81 px). Misses are the signal the caption itself points to ("the interesting signal is who *doesn't*"), and that's the label that gets cut. In dark mode the white labels on the light segment colours measure **2.20:1** (beat), **2.08:1** (mixed) and **2.91:1** (miss) at 11 px, against a WCAG AA bar of 4.5:1. That was first reported in critique 2026-11-06 07:00 and never filed.

## What
- Put the counts in a legend row under the bar (or outside the segment when it is narrower than its label), and keep the segments as pure colour. Never truncate a number.
- Label colours that reach 4.5:1 on each segment in both themes (dark text on the light dark-mode fills).

## Acceptance criteria
- [ ] At 390×844 with a 122/46/25 split (and with a 190/2/1 split), every label's `scrollWidth <= clientWidth` and the full text "25 miss" is visible
- [ ] Every bar label is ≥ 4.5:1 against its actual background in light and dark (e2e contrast check)
- [ ] Works at 390×844 touch and 1440×900; empty month (0 reports) shows no bar

## Test plan
e2e on fixtures: measure label overflow and computed contrast at 390×844 in both colour schemes.

## Out of scope
Other Retrace sections.
