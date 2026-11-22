---
id: 0101
title: ADRs whose feed switched currency show a price-to-book 5–6× too high (Alibaba 9.7× vs about 1.6×, NetEase 19.5× vs about 3.1×), which drags Valuation to F
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-22
pr:
by: critic
---

## Why
Critic check 2026-11-22 19:00 UTC. 0098 (#174) stopped grading *growth* on the currency-mixed quarterly series, but the same mid-series currency switch also corrupts Finnhub's `pbQuarterly`. `compassGrade` reads it directly (`shared/grades.ts:40`), and `sanitizeMetric` (`shared/currencyBreak.ts`) only drops the two growth keys. Every name live with the 0098 warning has an impossible P/B, and the one ADR without the warning (JD) looks right:

| Ticker | 0098 warning | Metaphases P/B (`/api/ticker/…` → `compass.factors[valuation]`) | Public sources | Ratio |
|---|---|---|---|---|
| BABA | yes | **9.7×**, Valuation **F**, "Investors are paying a premium" | 1.58 (Tickertape, Nov 8, at ~$109; the price is now $81), 1.90 (Fox Business, Nov 6), 1.79 (companiesmarketcap, Aug) | ≈ 5–7× |
| NTES | yes | **19.5×** | 3.09 (MarketCapOf, Sep 2026), 3.03 (Macrotrends, Jun), 3.07 (Yahoo key statistics, 6/30/2026) | ≈ 6.3× |
| PDD | yes | **10.4×** | Equity of about RMB 400B against a ~$119B market cap puts it near 2–3× | ≈ 4× |
| JD | no | 1.1× | ≈ 1.0–1.5× | ✅ |

The multiple roughly matches each ADS ratio (BABA 8, NTES 5, PDD 4). That fits a book value per share taken from the off-currency quarter (USD per ordinary share) against the ADS price. On a phone, Alibaba's sheet says "Valuation **F** · Investors are paying a premium; a lot of good news is already in the price" for a stock trading near 1.5× book. The unfurl repeats "Compass quality C". It's a wrong number presented as a fact, the operator's trust focus (1).

BABA's `EV/EBITDA 38.2×` is suspicious for the same reason (public sources put it near 10–15×), and so is NIO's P/B of 20.6×. Check both while you're in there.

## What
- Extend the 0098 path in the worker, because `shared/grades.ts` is frozen. When `currencyBreak` finds an off-currency quarter among the newest quarters (or always when `growthBroken`), `sanitizeMetric` also drops `pbQuarterly`. It falls back to `pbAnnual` only if that agrees with an independent check:
  - Compute P/B from the series itself, using the latest home-currency `bookValue` per share (or equity ÷ shares) converted at the quarter's rate, against `quote.price` ÷ the ADS ratio.
  - If no figure can be checked, drop P/B and let the factor average the other inputs.
- Apply the same test to `evEbitdaTTM` (and any other per-share-derived valuation key the grade reads) when the break is inside the TTM window.
- A dropped input shows "—" with the existing partial-picture warning line. No new copy is needed beyond "and price-to-book isn't graded" when it applies.

## Acceptance criteria
- [ ] Live: `/api/ticker/BABA`, `/t/NTES` and `/t/PDD` show P/B either "—" or within ×1.5 of the public figure (BABA ≤ 2.6×, NTES ≤ 4.7×).
- [ ] Live: BABA's Valuation grade is no longer driven by a P/B above 5×. Its factor inputs and `why` agree with each other.
- [ ] JD, TCOM, BIDU, TM and SHEL (no currency break) keep exactly today's P/B (unit test on recorded metric maps).
- [ ] The `og:description` "Compass quality" for `/t/BABA` follows the corrected grade.
- [ ] 390×844 and 1440×900 screenshots of BABA's Compass block show the corrected inputs.

## Test plan
Unit: `tests/unit/currencyBreak.test.ts` gets a BABA-shaped fixture (yuan quarters plus one USD quarter, `pbQuarterly: 9.7`) and asserts that `sanitizeMetric` removes or corrects P/B. A JD-shaped fixture with no break keeps it. An e2e fixture sheet asserts "P/B —" (or the corrected value) for an ADR fixture.

## Out of scope
Changing grade thresholds (frozen). The 0100 surprise mismatch.
