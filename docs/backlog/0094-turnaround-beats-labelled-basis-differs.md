---
id: 0094
title: A real beat from a small or negative estimate (Kohl's −$0.19 → $0.10, stock +42%) is labelled "basis differs" with an FFO/ADR footnote, and dropped from the beat record
status: shipped
priority: P1
size: M
lens: data-quality
created: 2026-11-20
pr: 161
by: critic
---

## Why
Critic check 2026-11-20 07:00 UTC. `epsVerdict` (`shared/compare.ts:232–248`) calls any pair outside `EPS_BAND` [0.5, 2], or with a sign change, "not-comparable" unless both figures are within $0.10 of zero. The guard was built for cross-feed basis mixes (UDR, PSA, UBER), but it also catches Nasdaq's own same-source pairs for turnaround and low-base companies. These are the reports that move stocks most:

| Sheet | Row | What the company reported | Sheet says |
|---|---|---|---|
| KSS | Nov 25 '25: −$0.19 → $0.10, move +42.5% | Adjusted EPS $0.10 vs a consensus loss of about $0.17–0.18 ([Kohl's release](https://corporate.kohls.com/news/kohls-reports-third-quarter-fiscal-2025-financial-results)) | "basis differs"; record "2/2 beats" (really 4 of 4) |
| KSS | Aug 26 '26: $0.55 → $1.28 | same-source Nasdaq pair | "basis differs" |
| M | Dec 3 '25: −$0.13 → $0.09; Jun 3 '26: $0.02 → $0.13 | same-source Nasdaq pairs | "2 of its last 2" in The Read and the unfurl (really 4 of 4) |
| ASAN | May 28 '26: −$0.14 → −$0.06, move +15.6% | narrower loss = beat | "Beat 2 of its last 3" (really 3 of 4) |

In the 68 sheets for Nov 20 – Dec 3, **24 rows on 18 sheets** are "basis differs". Some are genuine mixes (CRM $2.35 → $4.95 and WDAY $1.26 → $2.58 look like GAAP against adjusted). But the sign flips and narrowing losses (KSS, M, ASAN, KC, NIO, VSXY, MDB Dec '25) are ordinary beats. The footnote tells a first-time investor that Kohl's had "FFO against net income, or a per-ADR figure", which is false, and the beat count in The Read, the share card and the setup grade's beat-rate input is understated.

## What
- In `epsVerdict`, a pair that is **Nasdaq's own** (estimate and actual both from `earnings-surprise`, `pickConsensus` source `nasdaq`, no REIT flag) and whose absolute gap is small next to the actual's size (for example `|a − e| ≤ max(0.5, |a|)`, tune on the fixtures) is judged as beat or miss. Show the surprise as "—" or "turned a profit" / "smaller loss" when the base is within `EPS_NEAR_ZERO` × 3 or the sign flips, never a percentage of a near-zero base.
- Keep cross-feed and REIT pairs on the current band, so UDR, PSA, CPT, TM, EIX and UBER still read "basis differs".
- When a row is still "basis differs", the footnote must not name FFO or ADRs unless the company is a REIT or ADR. Use plain words otherwise ("the estimate and the result look like different measures").

## Acceptance criteria
- [ ] Unit: Nasdaq pair −0.19 → 0.10 → `beat`, no percentage; 0.55 → 1.28 → `beat`; −0.14 → −0.06 → `beat`
- [ ] Unit: the existing UDR/PSA/UBER/CPT basis-mix cases still return `not-comparable`
- [ ] Live: `/api/ticker/KSS` `beatRate` `{beats: 4, total: 4}`; M `{4, 4}`; ASAN total ≥ 4 with beats 3
- [ ] Live: of the 24 "basis differs" rows listed in the 2026-11-20 07:00 critique, at most 8 remain, each a GAAP-vs-adjusted or currency mix the PR names
- [ ] No "FFO" or "per-ADR" footnote on a non-REIT, non-ADR sheet (KSS, M)
- [ ] Works at 390×844 and 1440×900

## Test plan
Extend `tests/unit` for `epsVerdict` / `judgeReaction` with the cases above, plus a regression table of the existing basis-mix fixtures.

## Out of scope
Changing `EPS_BAND` for calendar tiles and Retrace beyond what the shared verdict changes. Grades (`shared/grades.ts` is frozen; only its `beatRate` input changes).
