---
id: 0009
title: Mark projected report dates as expected, not confirmed
status: ready
priority: P1
size: M
lens: data-quality
created: 2026-11-01
pr:
by: critic
---

## Why
`/t/GOOGL` says "Tuesday, February 2 · After close · in 93 days", and its share unfurl says "GOOGL reports Tue, Feb 2 after the close". Alphabet hasn't announced a Q4 date; this is a provider projection. Companies usually confirm 2–4 weeks ahead. An exact date three months out reads as fact, and when it moves, the trader blames us. Invariant: never present invented data as fact. See `docs/critique/2026-11-01-0506.md` #3.

## What
- A pure rule in `shared/` (e.g. `dateConfidence(event, today)`) returns `"expected"` for reports more than N days out (start at 21, documented). If the worker can cheaply tell that a date is confirmed (Nasdaq's earnings-date endpoint or similar), use that instead.
- The sheet shows "Expected · around Tue, Feb 2" with a `<Term k="expected-date">`. Calendar tiles beyond the horizon get a subtle marker. The worker's `shareMeta` og:title/description say "expected around Feb 2" instead of "reports Tue, Feb 2".
- `.ics` events for expected dates say "(expected)" in the summary.

## Acceptance criteria
- [ ] With the clock frozen, a report more than 21 days out renders "Expected" in the sheet, and its og:title contains "expected"
- [ ] A report inside the window renders exactly as today
- [ ] A glossary entry explains confirmed vs expected dates in plain English
- [ ] Works at 390×844 touch and 1440×900

## Test plan
A Vitest test for `dateConfidence`; a worker unit test for the `shareMeta` text; an e2e test that opens a far-dated ticker from the fixture and checks the "Expected" label.

## Out of scope
Scraping company IR pages.
