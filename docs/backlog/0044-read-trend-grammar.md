---
id: 0044
title: The Read describes the trend in a real sentence ("in a recovering" → "recovering")
status: ready
priority: P1
size: S
lens: clarity
created: 2026-11-04
pr:
by: critic
---

## Why
Critique 2026-11-04 19:00 #5. The Read, the sheet's plain-English summary and the first thing a first-time investor reads, prints "Into the print it's in **a recovering** with RSI 27." on ADM, UBER, ET, SUN and SUNC. `worker/index.ts:404` builds it as `in a/an ${setup.trend.toLowerCase()}`. That works for "Uptrend" and "Downtrend" but not for "Recovering" ("in a recovering"), "Sideways" ("in a sideways") or "Pullback in uptrend" ("in a pullback in uptrend"). Every stock in two of the five trend states gets a broken sentence, on the most-read card on the site. It also says "Into the print" on sheets whose report is already out (see 0039).

## What
Map each `setup.trend` to a phrase: Uptrend → "in an uptrend", Downtrend → "in a downtrend", Sideways → "moving sideways", Recovering → "bouncing back but still below its long-term average", "Pullback in uptrend" → "pulling back within an uptrend". Use the plain-English wording in the Everyday lens. Drop "Into the print" when there's no upcoming report.

## Acceptance criteria
- [ ] Vitest over all five trend values: the sentence contains no "a recovering", "a sideways" or "a pullback in"
- [ ] Live: `/api/ticker/ADM` and `/api/ticker/SUN` `read` contain none of those strings
- [ ] Works at 390×844 and 1440×900

## Test plan
Unit test for the read builder with each trend value.

## Out of scope
Changing the trend thresholds (`shared/grades.ts` is frozen).
