---
id: 0021
title: Stop showing foreign-currency EPS and revenue estimates with a "$" (TM "$64.50", PDD "$19.21", NIO revenue "$33.7B")
status: shipped
priority: P0
size: M
lens: data-quality
created: 2026-11-01
pr: 18
by: critic
---

## Why
For foreign filers, Finnhub's `/calendar/earnings` estimates come in the company's reporting currency, not USD. Metaphases formats every one of them with `$` in the calendar, the sheet, the share unfurl, the 9:16 story card and Hype Check. Checked live on 2026-11-01 (`/api/ticker/:sym`, `next.epsE` / `next.revE`, compared with the Nasdaq USD history in the same response):

| Ticker | Shown | Real basis | Nasdaq last-quarter EPS (USD) |
|---|---|---|---|
| TM | EPS $64.50 · revenue $13.48T | JPY | $7.57 |
| SONY | EPS $63.16 · revenue $3.21T | JPY | $0.36 |
| PDD | EPS $19.21 · revenue $117.1B | RMB | $2.72 |
| JD | EPS $4.64 · revenue $318.8B | RMB | $0.83 |
| BIDU | EPS $7.07 | RMB | $0.77 |
| TSM | EPS $32.22 · revenue $1.63T | TWD | $4.60 |
| NIO | revenue $33.67B | RMB (company guide RMB 33.3–34.1B; USD consensus ≈ $4.97B) | — |
| NVO | EPS $4.85 · revenue $74.0B | DKK | $0.96 |

The sheet's *The Read* then compares the two bases directly: "Wall Street expects $-0.01 a share, versus $-0.04 last quarter" (NIO, RMB vs USD). A first-time investor reads "Toyota expects $64.50 a share" on a $196 stock. This is wrong data on 60+ universe names whose `c` is not `US` (see `data/universe.json`).

## What
- Work out the reporting currency for each symbol. Finnhub `/stock/profile2` has `currency` (the listing currency, USD for ADRs) and `estimateCurrency` from `/stock/metric` or `financials-reported`. If no source gives the estimate's currency, use a ratio check against the Nasdaq USD history (|epsE| more than 4× the largest of the last 4 USD actuals means a different basis).
- When the estimate isn't USD, either convert it with a rate from an allowed host (Yahoo `JPY=X`, `CNY=X`, `TWD=X`, `DKK=X` candles, already allowed) and label it "≈ $X (converted from ¥Y)", or show the native currency symbol. Never show a bare `$` on a non-USD number.
- Never compare an estimate and an actual (or two quarters) on different currency bases in *The Read*, surprise %, beat counts or Retrace.
- Revenue: the same rule applies.

## Acceptance criteria
- [x] `/api/ticker/TM`, `/api/ticker/PDD` and `/api/ticker/NIO` return `next.currency` (ISO code). Wherever `currency !== "USD"`, the sheet, calendar row, `/t/:sym` og:description, `/og/story/t/:sym.png` and Hype Check show the native symbol or a labelled conversion, never a bare "$"
- [x] Unit test: a fixture with `epsE: 64.5` and currency JPY formats as "¥64.50" (or "≈ $0.42"), and `The Read` doesn't compare it with a USD history figure
- [ ] Spot-check on production, recorded in the PR: TM, SONY, PDD, JD, TSM, NIO and NVO show no `$` on a local-currency figure
- [x] Works at 390×844 touch and 1440×900

## Test plan
Unit: currency detection plus formatting (`shared/`), including the ratio fallback. e2e: a recorded NIO fixture renders "¥" or "≈ $" in the sheet and Hype Check card.

## Out of scope
Converting historical fundamentals used by Compass quality (separate ticket if those turn out to be mixed too).
