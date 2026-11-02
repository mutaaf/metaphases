---
id: 0033
title: Moon School as micro-lessons — 28 one-minute lessons in 7 units, emoji cards, quick checks and sorting games
status: shipped
priority: P1
size: M
lens: user-value
created: 2026-11-02
pr: 0
by: operator
---

## Why
The operator: "make things extremely detailed and broken down like micro lessons." Nine 3-screen lessons left big gaps (money itself, needs vs wants, budgets, owners, tickers, the grown-ups' guess, interest, the snowball, risk, dividends, scams) and read like pages, not play.

## What
- `shared/kidsContent.ts`: `UNITS` (Money basics, Companies, Shares and the market, Report cards, Saving and investing, Dividends, Money-smart) and 28 `LESSONS` built from `Step`s: `say` (one emoji + one short sentence), `check` (quick multiple choice) and `sort` (two-bucket sorting game). `screens`/`quiz` are derived, so worksheets and the quiz of the day keep working; old lesson ids are kept so progress survives.
- Lesson player: one step per card, step dots (checks/sorts turn green), big emoji cards, sorting with gentle corrections. Moon School groups lessons by unit with per-unit progress and an "Up next" card. Worksheets print sort items with answer blanks.
- Badge toast is now compact and auto-dismisses.

## Acceptance criteria
- [x] ≥ 24 lessons, every unit ≥ 3 lessons, 3–7 steps each with at least one check or sort (unit)
- [x] Each lesson reads at grade ≤ 5; no single card above grade 9 (unit)
- [x] A sort game plays end to end with feedback; units and Up next render (e2e, phone + desktop); worksheets incl. a sort lesson print on one page

## Test plan
Unit: `tests/unit/kids.test.ts` content shape + reading level. E2E: `tests/e2e/kids-quest.spec.ts` (micro-lessons), `kids-followups.spec.ts` (worksheets one page for share, prices, needs, baskets).

## Out of scope
Audio per step beyond read-aloud (voices are 0032); translations.
