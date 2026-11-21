---
id: 0096
title: Software sheets judge past reports on Nasdaq's GAAP-style figures, so CrowdStrike, Asana and Snowflake beats read as misses beside an adjusted estimate
status: in-progress
priority: P0
size: M
lens: data-quality
created: 2026-11-20
pr:
by: critic
---

## Why
Critic check 2026-11-20 19:00 UTC. For a group of loss-making-on-GAAP software companies, the ticker sheet's past-report table and beat record use Nasdaq's `earnings-surprise` pair, and that pair isn't the adjusted (non-GAAP) EPS the company headlines and the street forecasts. The *next* estimate on the same sheet is Finnhub's adjusted figure. So the sheet puts an adjusted estimate next to a GAAP-style record, and reverses real beats into misses:

| Sheet | Metaphases (past row, verdict) | What the company reported | Effect |
|---|---|---|---|
| CRWD | Aug 26 '26: $0.05 → $0.01 **missed**; Dec 2 '25: $0.02 → $0.00 **missed**; "Beat 2 of its last 4" | Q2 FY27 non-GAAP EPS **$0.31 vs $0.29 consensus**, a beat ([CrowdStrike IR](https://ir.crowdstrike.com/news-releases/news-release-details/crowdstrike-reports-second-quarter-fiscal-year-2027-financial)) | Next estimate shown as $0.32, ten times the "actuals" above it |
| ASAN | Sep 3 '26: −$0.11 → −$0.15, **−36.4%** | Q2 FY27 non-GAAP EPS **$0.10 vs ~$0.09**, a beat ([Asana release](https://finviz.com/news/388877/asana-announces-second-quarter-fiscal-2027-results)) | Next estimate $0.08 (adjusted) beside a row of losses |
| SNOW | Sep 2 '26: −$0.51 → −$0.44; three earlier "misses" (−44.8%, −23.1%, −18.6%); "Beat 1 of its last 4" in The Read **and the unfurl** | Q2 FY27 non-GAAP EPS **$0.62, 38% above consensus** ([Snowflake release](https://finviz.com/news/388294/snowflake-reports-financial-results-for-the-second-quarter-of-fiscal-2027)) | Unfurl: "Street expects $0.61 EPS. Beat 1 of its last 4" |
| ZS | Sep 3 '26: $0.06 → $0.14 | Q4 FY26 non-GAAP EPS **$1.19 vs $1.09** ([Zscaler release](https://finviz.com/news/388859/zscaler-announces-strong-fourth-quarter-and-fiscal-2026-financial-results)) | Next estimate $1.19 beside a history near $0 |

Nasdaq's raw rows confirm the source (`api.nasdaq.com/api/company/ZS/earnings-surprise`: `Jul 2026 eps 0.14 consensus 0.06`; ASAN `Jul 2026 eps -0.15 consensus -0.11`). In the 71 sheets for Nov 20 – Dec 4, the next estimate is more than 3× every past actual, or positive against an all-loss history, on **SNOW, ZS, CRWD, MDB, IOT** (and ASAN by the same test on the company's figures). The footnote under the table says "Actuals are usually adjusted EPS, the figure analysts forecast", which is false on these sheets. The beat record feeds The Read, the share card and the setup grade's beat-rate input. This is a trader-visible error in the busiest software week of the season (CRWD, OKTA, MDB, ASAN Dec 1; SNOW, ZS, CRM Dec 2).

(BILI, XP, BZ, CHA and PICS also trip the 3× test, but those are per-ADR or currency mixes. Leave them to the existing 0046/0049 handling unless the fix covers them for free.)

## What
- In the history join (`worker/index.ts`, around the `rows.slice(0, 8).forEach` block that calls `pickConsensus`), detect when Nasdaq's pair is on a different basis from Finnhub's figures for the same company. Candidate signals, in order: Finnhub `stock/earnings` (`surprises`) for the same fiscal period, when present, is the company's adjusted measure (the basis of the upcoming estimate), so prefer Finnhub's estimate **and** actual for that quarter as one pair; otherwise compare Nasdaq's figures with the next adjusted estimate and the Finnhub actuals with `sameEpsBasis`.
- Find out why `f` (Finnhub's quarter) isn't winning today for these names (a period-key mismatch, a missing `surprises` entry, or `sameEpsBasis` passing on near-zero values) and say which in the PR.
- If neither source gives an adjusted pair for a quarter, show that row as "basis differs" (out of the beat record), never as a miss.
- Keep 0094's same-source turnaround rule for companies whose Nasdaq rows *are* on the adjusted basis (KSS, M).

## Acceptance criteria
- [ ] Live: `/api/ticker/CRWD` Aug 26 '26 row is a beat (estimate and actual within $0.03 of $0.29 → $0.31), or "basis differs"; never `missed`
- [ ] Live: `/api/ticker/SNOW` Sep 2 '26 row is a beat near $0.45 → $0.62, or "basis differs"; `beatRate.beats` ≠ 1 of 4 unless the company's adjusted figures say so
- [ ] Live: `/api/ticker/ASAN` Sep 3 '26 row is not a miss; ZS Sep 3 '26 actual is $1.19 or the row is "basis differs"
- [ ] Of SNOW, ZS, CRWD, MDB, IOT, ASAN: no sheet shows a next estimate more than 3× every judged past actual
- [ ] KSS and M still read `beatRate {4, 4}` (0094 not regressed)
- [ ] The table footnote doesn't claim "adjusted EPS" for a row that is on another basis
- [ ] Unit tests with the ZS/CRWD/ASAN Nasdaq rows quoted above plus a Finnhub quarter on the adjusted basis
- [ ] Works at 390×844 and 1440×900

## Test plan
Unit: the history join with a Nasdaq GAAP-style row and a Finnhub adjusted row for the same period picks one adjusted pair; with no Finnhub row and a 3× gap to the next estimate, it returns not-comparable. Regression table for KSS/M (0094) and UDR/PSA (0049).

## Out of scope
Fetching company press releases. Per-ADR and currency mixes beyond what the shared fix covers. `shared/grades.ts` (frozen; only its beat-rate input changes).
