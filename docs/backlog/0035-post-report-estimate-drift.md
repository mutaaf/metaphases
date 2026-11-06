---
id: 0035
title: Stop calling beats "misses": Finnhub's estimate for an already-reported quarter has drifted toward the actual (V, MA, ABBV, VZ shown as misses)
status: in-progress
priority: P0
size: M
lens: data-quality
created: 2026-11-02
pr:
by: critic
---

## Evidence 2026-11-05 07:00 UTC (critic)
Still live on build `8d4fca50`. Retrace's S&P scoreboard says **revenue beat rate 44%** (375 of 502 reported, EPS 74%), and the November header says "**46%** of those reported so far beat on both lines". Revenue beats run near 65% in a normal season, so 44% is the drifted-estimate artifact this ticket describes, now shown at the top of two pages. Bar unchanged: the season revenue beat rate on Retrace and the home strip is computed against pre-report consensus and lands within 10 points of the Nasdaq `consensusForecast`-based rate for the same names.

## Why
On 2026-11-02 at about 19:00 UTC, the critic compared the EPS estimate Metaphases shows for the **60 largest S&P 500 companies that reported Oct 26–30** (`/api/calendar` `eE`, which is also the sheet's history estimate since #21's `pickConsensus` prefers Finnhub) with Nasdaq's `consensusForecast` for the same quarter:
- Finnhub's figure was **higher than Nasdaq's in 49 of 60** cases, and often sits a hair above the printed actual: V **3.5055** vs actual 3.48, ABBV **3.823** vs 3.82, VZ **1.3111** vs 1.31, MA **5.3156** vs 5.31, ITW **3.0049** vs 3.00, RSG **1.9465** vs 1.94. That pattern looks like a consensus revised after the print, not the bar the street set beforehand.
- **11 of 60 flip the verdict.** Nine are shown as EPS **misses** when the pre-report consensus says beat: V (Nasdaq 3.43; outside coverage $3.44 → beat), MA (5.14), ABBV (3.74), VZ (1.27), MO (1.51), TT (4.74), ITW (2.99), RSG (1.92) and ECL (in line). NOW and EQIX disagree by about 2× (split or FFO basis) and need a basis check of their own.
- The same drift hits revenue. MSFT shows a revenue **miss** ($92.28B vs $92.51B est), while the pre-report consensus was about $90.6–90.7B (Bloomberg via CMBI, Runtime Wire), a beat Microsoft itself called out. Across 290 S&P members in Retrace's six-week window, the **revenue beat rate reads 41% and the median revenue surprise is −0.5%**. Historically about two thirds beat on revenue, so the headline number on `/retrace` and the home season strip is very likely an artefact.

These rows feed every beat/miss tint in the calendar, Retrace, the season scoreboard, "beat N of its last 4" in the sheet and share meta, and the AI context. A trader who knows Visa beat will see "miss" and stop trusting every other number. This undoes part of the 0011 decision to prefer Finnhub (that was right for basis consistency before the print, but wrong after it).

## What
- Treat Finnhub's `epsEstimate` / `revenueEstimate` as trustworthy only **before** the report. Once a row has an actual, prefer a pre-report snapshot:
  1. **Snapshot**: when the worker builds a calendar day whose date is today or later, persist `{eE, rE}` per symbol+date in the edge cache or KV (already used for `cached()`), and on later builds of that day use the snapshot estimate for rows that now have actuals.
  2. **Fallback**: with no snapshot (history before the feature shipped), use Nasdaq's `consensusForecast` for EPS when it exists and the two agree on basis (ratio within the 0.20 floor in `shared/compare.ts`). For revenue with no snapshot, don't colour a revenue beat/miss when `|rA/rE − 1| < 1%` and the actual is below the estimate, and say "estimate revised after the report".
- `pickConsensus` (`shared/compare.ts:63`) takes the report date and an `asOf`, and prefers Nasdaq for reported quarters with no snapshot. Document the rule in the glossary entry for "beat".
- Separately flag NOW and EQIX (estimate vs actual about 2× apart) as not comparable via the existing basis bound.

## Acceptance criteria
- [ ] Unit tests with these exact rows: V `eE 3.5055, eA 3.48, nasdaq 3.43` → **beat**; MA `5.3156 / 5.31 / 5.14` → beat; ABBV `3.823 / 3.82 / 3.74` → beat; MSFT revenue `rE 92506889896, rA 92279000000`, no snapshot → not shown as a miss
- [ ] On production after deploy, `/api/ticker/V` `history[0].surprisePct > 0`, and the Oct 27 day drawer doesn't tint V as a miss
- [ ] Re-run the critic's 60-name comparison (`docs/critique/2026-11-02-1900.md`, Reproduce): ≤ 2 verdict flips vs Nasdaq, each explained by a basis note
- [ ] Retrace's S&P revenue beat rate shows its basis, and isn't computed from post-report-revised estimates
- [ ] Works at 390×844 touch and 1440×900

## Test plan
Vitest: `pickConsensus` with the V/MA/ABBV rows and with snapshot present/absent; the snapshot store round-trip; `seasonScore` on a fixture where the estimate equals actual + 0.5%. e2e: the October fixture's V tile isn't tinted a miss.

## Out of scope
A paid consensus feed or a new host (that would need an operator `proposal/`).
