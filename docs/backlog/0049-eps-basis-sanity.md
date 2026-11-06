---
id: 0049
title: Never call an EPS a +377% beat when the actual and the estimate are different measures (REIT FFO vs GAAP EPS, per-ADR vs per-share)
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-06
pr:
by: critic
---

## Why
Critic check 2026-11-06 07:00 UTC, build `8e01b3a3`. Retrace's **Biggest beats** at 390×844 opens with **UDR "$0.14 → $0.65, +377%"**, then OSCR, RUN, **HST "$0.10 → $0.39, +286%"**, AMC and **CPT "$0.53 → $1.71, +221%"**. Its sector table says **Real Estate: median surprise +147.7%**.

They aren't beats. The estimate is GAAP net income per share and the actual is the REIT's funds-from-operations figure:
- **UDR** Q3 2026 ([8-K ex. 99.1](https://www.sec.gov/Archives/edgar/data/0000074208/000007420826000084/udr-ex99d1.htm)): FFO as Adjusted **$0.65**, at the top of its own $0.63–0.65 guide and flat year on year. Net income per share was $0.67, against GAAP guidance of $0.13–0.15, which is where Finnhub's $0.14 "estimate" comes from. Nasdaq's `earnings-surprise` has it on one basis: **0.65 vs 0.64, +1.6%**.
- **CPT** Q3 2026 ([8-K ex. 99.1](https://www.sec.gov/Archives/edgar/data/0000906345/000162828026071117/exhibit991earningsrelease3.htm)): Core FFO **$1.71** (vs $1.70 a year ago). GAAP EPS was $8.71 because of a property-sale gain.
- **HST**: Nasdaq gives **0.39 vs 0.38, +2.6%**.
- **TM** (Nov 5) has `eE 64.4986` (yen per share) and `eA 649.358`, ten times larger (per ADR = 10 shares). The currency guard keeps it out of Retrace, but `surprise()` (`src/lib/data.ts:48`) would call it +907%.

Over Oct 19–Nov 5, **25 tracked rows have actual/estimate outside 0.4–2.5×** (UDR, CPT, HST, O, BP, TM, COIN, EIX, MOS, CORZ…). A few are real (UBER's GAAP miss, 0040), but most are basis mixes, and they're exactly the rows the "biggest" lists pick. A trader who knows UDR landed in line stops trusting every other number on the page. `REV_BASIS_MAX` (0011) guards revenue; EPS has no such guard.

## What
- `shared/compare.ts`: add an `epsVerdict(e, nasdaq?)` that mirrors `revenueVerdict`. When `eA/eE` falls outside a basis band (a starting point is 0.5–2×, or a sign flip with |eE| ≥ $0.10, tuned on the Oct 19–Nov 5 rows), first try Nasdaq's `consensusForecast` for the same quarter. If Nasdaq is within `EPS_BASIS_MAX` of the actual's scale, judge against it (UDR → +1.6%). Otherwise return `"not-comparable"`.
- Every EPS judgment goes through it: `surprise()` / `verdict()` in `src/lib/data.ts`, Retrace's beat rate, biggest beats and misses, sector medians (`src/pages/Retrace.tsx`), the season strip (`Depth.tsx`), `aiContext.ts` and the sheet history. A not-comparable row shows "EPS basis differs from the estimate (e.g. FFO vs net income)" with no %, no tint, and isn't counted in a rate or median.
- REITs (sector Real Estate, or `ind` containing REIT): the upcoming estimate in the sheet, The Read and `og:description` shouldn't say "Street expects $0.14 EPS" when the company's own measure is FFO. Say "—" with the basis note, or show Nasdaq's figure labelled "FFO".

## Acceptance criteria
- [ ] Unit tests with these exact rows: UDR `eE 0.14, eA 0.65, nasdaq 0.64` → beat by +1.6%; CPT `0.5319 / 1.71`, no Nasdaq → not-comparable; TM `64.4986 / 649.358` → not-comparable; UBER `0.9838 / 0.25, nasdaq 0.94` → miss (a real GAAP miss stays a miss)
- [ ] On production after deploy and a cache roll-over: none of the top 5 entries in Retrace's Biggest beats or Biggest misses has |surprise| > 100% unless Nasdaq's figure agrees within 20%
- [ ] Retrace's Real Estate median surprise is between −20% and +20%
- [ ] `/t/UDR` `og:description` doesn't say "Street expects $0.14 EPS"
- [ ] Works at 390×844 touch and 1440×900

## Test plan
Vitest on `epsVerdict` with the rows above and on `seasonScore` / Retrace selectors with a REIT fixture row. e2e: the November fixture gets a UDR-shaped row; assert it isn't in Biggest beats and has the basis note in the day drawer.

## Out of scope
Parsing SEC filings for FFO. A paid estimates feed. Revenue (0011 already guards it).
