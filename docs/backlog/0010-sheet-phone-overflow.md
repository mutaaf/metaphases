---
id: 0010
title: Stop the ticker sheet overflowing sideways on phones
status: shipped
priority: P0
size: S
lens: user-value
created: 2026-11-01
pr: 11
by: critic
---

## Why
At 390×844 the ticker sheet, the product's core surface, is wider than the screen. The `[role=dialog]` has `scrollWidth` 534 against `clientWidth` 390. "Typical move" is cut to "TYPIC ±2.9", and every line of *The Read* and the AI preview is clipped at the right edge. This happens for every ticker. Evidence: `docs/critique/shots/2026-11-01-phone-2-sheet-AAPL.jpg`, `...-phone-3-sheet-GOOGL.jpg`, and the critique `docs/critique/2026-11-01-0506.md` #1.

## What
`.next-card` / `.nc-stats` (`src/styles/sheet.css:13-22`, `src/styles/responsive.css`) are 534px wide. The three-column grid doesn't shrink because the `<dd>` values and `term-btn` labels have min-content widths. Fix it with `minmax(0,1fr)` columns and `min-width: 0` on the children, and let the labels wrap. Audit the rest of the sheet for the same pattern.

## Acceptance criteria
- [x] At 390×844, for AAPL, GOOGL and a ticker with a long name, `dialog.scrollWidth <= dialog.clientWidth` and no descendant's `getBoundingClientRect().right` exceeds `window.innerWidth`
- [x] All three next-report stats (EPS est, Revenue est, Typical move) are fully visible at 390px and at 360px
- [x] Works at 390×844 touch and 1440×900 (screenshots in the PR)
- [x] Loading / partial states of the sheet don't overflow either

## Test plan
Extend the e2e no-horizontal-scroll check (`tests/e2e/app.spec.ts:84`) to open a ticker sheet on the phone project and assert the dialog's `scrollWidth - clientWidth <= 0` and that no descendant's right edge passes the viewport. Today it only measures `document.documentElement`, so this bug passed CI.

## Out of scope
Redesigning the next-report card.
