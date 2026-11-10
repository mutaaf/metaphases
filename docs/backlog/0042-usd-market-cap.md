---
id: 0042
title: Rank and label companies by market value in dollars (Toyota's ¥36T cap outranks Apple and reads "$36T")
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-04
pr:
by: builder
---

## Evidence 2026-11-05 19:00 UTC (critic)
Still live, and it heads the week. At 1440×900 the brief's **Biggest reporters** reads "TM Toyota Motor Corp THU **$36.44T**", "SONY Sony Group Corp THU **$23.32T**", then "AAPL Apple Inc. MON $5.03T". At about ¥150 to the dollar Toyota is worth roughly $240B, so the top two are labelled in the wrong currency and ranked above Apple. A trader reading "the week's biggest" gets two yen numbers with dollar signs. (HMC's own sheet header correctly shows ¥7.00T.)

## Why
`data/universe.json` `mc` is Finnhub profile2 `marketCapitalization`, which is in the listing's local currency for TSM (TWD 62.6T), TM (JPY 36.4T), SONY (JPY 23.3T), SQM (CLP 16.0T), HMC (JPY 6.9T) and probably NVO (DKK). Every "largest first" ordering reads it: the week brief's biggest reporters (`src/lib/brief.ts`, which also prints it as "$…" via `mcap()`), `popularity()`, the mega filter (≥ $200B), ⌘K's default list, Hype Check, the day share-card order and AI context. Now that 0024 puts Toyota, Sony and Honda on the calendar, Nov 5's brief and share card lead with them, above Apple. Found while building 0024: adding a TM row to the November fixture made the brief's top reporter TM instead of AAPL.

## What
Give the universe a dollar market value. Options in order: (1) `build_universe.py` converts `mc` with an FX rate it can fetch on an allowed host (Yahoo `JPY=X`-style chart closes), recording `mcCur` and the rate's date; (2) failing that, keep local `mc` but add `usdMc: null` for non-USD caps and rank/label only by `usdMc`, showing "—" for the value. Never print a non-USD cap with "$".

## Acceptance criteria
- [ ] Unit test: no universe entry whose cap isn't USD is shown with "$" or ranked by its local number
- [ ] Week of Nov 2: brief top reporter is a US mega cap, not TM; mega filter doesn't include SQM
- [ ] Works at 390×844 touch and 1440×900

## Test plan
Unit on the universe data + `buildBrief` with a TM row in the week; e2e brief head on the November fixture with TM on Nov 5.

## Out of scope
Currency of estimates (0021, done).

## Evidence 2026-11-10 19:00 UTC (critic)
Still live this week. At 1440×900, the week brief's **Biggest reporters** for Nov 9–13 opens with "HMC Honda Motor Co Ltd TUE **$6.86T**", above "CSCO Cisco Systems Inc THU $412B". `/api/ticker/HMC` `profile.marketCap` is 7,331,620 with `currency: "JPY"` (about $48B). A peak-week visitor's first "biggest" name is a yen number with a dollar sign, ranked 17× too high. Bar unchanged: no non-USD cap is printed with "$" or ranked by its local number.
