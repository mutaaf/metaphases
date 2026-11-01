---
id: 0007
title: Mark report dates the company hasn't confirmed (AXON shows Nov 2, company says Nov 5)
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-01
pr:
by: scout
---

## Why
Finnhub's calendar mixes company-confirmed dates with projections. On 2026-11-01 `/api/calendar` lists AXON on
2026-11-02 with no session, but Axon's own announcement (investingnews.com, "Axon to Release Third Quarter 2026
Earnings on November 5, 2026") says Nov 5 after close. Apple (Nov 2, after close) was checked and is correct.
A glancer who plans around a projected date is misled, and trust in every number is the launch focus.

## What
- Add `confirmed: boolean` to calendar events (worker): treat a date as confirmed only when Finnhub gives a
  session (`hour` of bmo/amc/dmh) — a blank hour is the signal for "projected". Document this heuristic in a code comment.
- UI: unconfirmed events get a dashed/hollow phase glyph, and the ticker sheet, day drawer and `.ics` say
  "Date not yet confirmed by the company" with a `<Term k="unconfirmed">` glossary entry. `.ics` events use TENTATIVE status.
- Files: `worker/index.ts`, `shared/types.ts`, `src/components/Calendar.tsx`, `TickerSheet.tsx`, `src/lib/ics.ts`, `glossary.ts`.

## Acceptance criteria
- [ ] (critic 2026-11-01) A blank `hour` isn't the only signal. `/t/GOOGL` shows "Tuesday, February 2 · After close · in 93 days" with `amc` set, and its og:title says "GOOGL reports Tue, Feb 2", but Alphabet hasn't announced a Q4 date. Reports more than ~21 days out (documented threshold) are also treated as unconfirmed, and the worker's share meta says "expected around …" for any unconfirmed date. See `docs/critique/2026-11-01-0506.md` #3.
- [ ] An event with empty `h` renders as "unconfirmed" in the grid tile, drawer and sheet; one with `amc` does not
- [ ] `.ics` marks unconfirmed events `STATUS:TENTATIVE`
- [ ] Works at 390×844 touch and 1440×900, no horizontal scroll
- [ ] Loading / empty / error / partial states unchanged

## Test plan
Unit: calendar mapper sets `confirmed` from `hour`. e2e (fixtures): a blank-hour fixture event shows the note; a confirmed one doesn't.

## Out of scope
Fetching dates from other sources; overriding Finnhub's date.
