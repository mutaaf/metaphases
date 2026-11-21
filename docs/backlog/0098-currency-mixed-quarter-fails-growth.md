---
id: 0098
title: A quarter the feed reports in dollars beside yuan quarters reads as an 85% revenue collapse and grades Growth F (PDD, Alibaba, NetEase, Full Truck, Futu)
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-21
pr:
by: critic
---

## Why
Critic check 2026-11-21 19:00 UTC. For several Chinese ADRs, Finnhub's quarterly series (`metric=all` → `series.quarterly`) reports the **newest** quarter in US dollars per ordinary share and every earlier quarter in yuan. Metaphases passes this through twice:

1. **"The last 8 quarters"** (`quartersFrom`, `shared/depth.ts:79`). PDD's sheet reads "Revenue ≈ CN¥15.6B (**−85% vs a year ago**)", with EPS "CN¥0.75". PDD's Sep '26 quarter in `/api/ticker/PDD` `quarters` is `rev 15601575318, eps 0.747`, against `rev 108537475529, eps 4.6118` the quarter before. $0.747 is $2.99 per ADR ÷ 4 shares per ADR, in dollars, and $15.6B is about CN¥111B. PDD's revenue did not fall.
2. **Compass quality.** The grade reads Finnhub's `revenueGrowthTTMYoy` / `epsGrowthTTMYoy` (`shared/grades.ts:56`), which are computed over the same mixed series. PDD shows "Revenue growth (TTM) −14.3% · EPS growth (TTM) −34.0%", and recomputing from the mixed `quarters` gives exactly those figures: (0.747+4.61+2.12+3.90)/(4.93+5.19+2.49+4.63) − 1 = −34.0%. So the sheet says "**Growth F · Revenue or earnings are shrinking year over year**", and the share unfurl and Compass carry the depressed quality grade (BABA's unfurl: "Compass quality D").

A sweep of 31 foreign filers on production finds the same newest-quarter ratio of about 0.12–0.16 (the USD/CNY rate) on **PDD, BABA, NTES, YMM and FUTU**, all graded Growth F (BABA −17.2% / −51.2%, NTES −17.4% / −30.9%, YMM −48.2%). **LI** has it in an older pair of quarters (×0.13 then ×6.58). Dollar reporters (TSM, SAP, SE, MELI, NU, SHOP and others) are clean.

Who it hurts: the first-time investor reads "shrinking" about companies that grew. The quality grade is the long-run number this product leads with for "I invest for the long run". It breaks "never invent data": a number we can't trust must be "—", not an F.

## What
- In the worker, before `quartersFrom` and before `compassGrade` (`shared/grades.ts:38`) reads the metric, detect a currency break in the quarterly `salesPerShare` (and `eps`) series. Two neighbouring quarters at a ratio below about 0.25 or above 4, where the company's reporting currency isn't USD (the profile's `currency` / the calendar's `cur`), is a break. Don't hard-code a list.
- On a break: drop the off-currency quarters from "The last 8 quarters", or convert them only if a rate source we already use gives it. In Compass, treat `revenueGrowthTTMYoy` and `epsGrowthTTMYoy` as unavailable, so the factor reads "Growth history unavailable", not F. **`shared/grades.ts` is frozen**: sanitize the inputs in the worker, don't change the grader.
- Apply the same guard wherever else these two metrics or the quarterly series are read (Compass portfolio, share card, `/api/kids/why` if it reads them).

## Acceptance criteria
- [ ] Live: `/api/ticker/PDD`, `BABA`, `NTES`, `YMM` and `FUTU`: no two neighbouring `quarters` entries differ by more than 4× in `rev`, and the growth factor is not F on a currency break. It reads "—" / "Growth history unavailable", or a growth recomputed on one currency.
- [ ] Live: the PDD sheet at 390×844 shows no "−85% vs a year ago" (or any change of 70% or more) for a company whose filings don't show it.
- [ ] TSM, SAP, SHOP and MELI keep their growth grade unchanged (no false positives).
- [ ] Unit test with PDD's eight live `salesPerShare`/`eps` points (newest in USD) and a clean USD series.

## Test plan
`tests/unit/currencyBreak0098.test.ts`: the detector on PDD's live series (break), on a clean series with a real 60% one-quarter drop in a USD reporter (no break unless ratio < 0.25), and the sanitized metric giving a null growth factor.

## Out of scope
Converting historical quarters into another currency. Changing grade thresholds (`shared/grades.ts` is frozen).
