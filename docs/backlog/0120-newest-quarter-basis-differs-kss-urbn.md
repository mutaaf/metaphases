---
id: 0120
title: Kohl's turnaround (−$0.01 → $0.32, stock +19.5%) and Urban Outfitters' 1-cent beat read "basis differs", so their share cards say "Beat 3 of its last 3"
status: ready
priority: P1
size: S
lens: data-quality
created: 2026-11-28
pr:
by: critic
---

## Why
Critic check 2026-11-28 07:00 UTC (build `61993394`). The newest quarter on two sheets is labelled "basis differs" and left out of the beat record, although Nasdaq gives the estimate and the actual in the same table:

| Sheet | Newest history row | Expected |
|---|---|---|
| `/api/ticker/KSS` | `2026-11-24 bmo · epsE −0.01 → epsA 0.32 · surprisePct null · basis "differs"` · move +19.5% | a beat (0094's "turned a profit" case), record **4 of 4** |
| `/api/ticker/URBN` | `2026-11-24 amc · 1.53 → 1.54 · basis "differs"` · move −10.3% | a beat by 1 cent (+0.7%); the pair is plainly on one basis |

The older three quarters on both sheets are judged normally. The record reads `beatRate {beats: 3, total: 3}`, and it travels to The Read ("It has beaten the estimate in 3 of its last 3 reports") and the unfurl (`/t/KSS` `og:description`: "Kohl's Corporation. Beat 3 of its last 3 · typical move ±10.8%…"). A first-time investor is told the latest report, the biggest mover of the week for Kohl's, isn't comparable.

Both companies also sit on the wrong day in the calendar (0119: Nov 23 there, Nov 24 at Nasdaq). The likely cause: `lastE.date !== date` in the history join (`worker/index.ts` around 1565–1591), so the row falls into `nasdaqOnly`, and `nasdaqHistoryOffBasis` then marks it. Fixing 0119 may fix this too, but the sheet must be right even when the calendar row is misdated.

## What
- In the history join, match the calendar's last row to Nasdaq's quarter by fiscal period (or ±3 days), not by exact date, so a misdated Finnhub row still counts as the same report.
- A Nasdaq pair whose estimate and actual are within 0094's same-table rule is never turned into "basis differs" by `nasdaqHistoryOffBasis` just because Finnhub's row is on another day.

## Acceptance criteria
- [ ] Live: `/api/ticker/URBN` newest row has `surprisePct` ≈ 0.65 and no `basis`; `/api/ticker/KSS` newest row is judged a beat (surprise words, no `basis`); both `beatRate.total` = 4.
- [ ] Live: the `/t/KSS` unfurl and The Read say "4 of its last 4" (or whatever the four judged rows give), never "3 of its last 3".
- [ ] Unit: a history whose calendar row is dated a day before Nasdaq's `dateReported` judges the Nasdaq pair; 0096's CRWD/SNOW off-basis vectors still read "basis differs".
- [ ] Works at 390×844 and 1440×900.

## Test plan
Extend the 0094/0096 vitest vectors with KSS and URBN as served on 2026-11-28 (calendar Nov 23, Nasdaq Nov 24).

## Out of scope
Moving the calendar row (0119).
