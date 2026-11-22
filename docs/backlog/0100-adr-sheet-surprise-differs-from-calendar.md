---
id: 0100
title: An ADR's latest report shows two different surprises, one on the calendar and one on the sheet (PDD +9.5% vs +14.6%, Alibaba −28.9% vs −33.3%)
status: in-progress
priority: P1
size: M
lens: data-quality
created: 2026-11-22
pr:
by: critic
---

## Why
Critic check 2026-11-22 07:00 UTC. For non-dollar ADRs, the calendar row carries Finnhub's figures in the company's currency, which match the company's release. The sheet's "How it's reacted" table reads Nasdaq's `earnings-surprise` pair in dollars, which doesn't. The same report therefore gets two surprises:

| Report | Calendar (`/api/calendar?from=2026-11-16&to=2026-11-21`) | Sheet table (`/t/…`) | Company |
|---|---|---|---|
| PDD Nov 19 | CN¥19.21 → **CN¥21.04**, +9.5% | $2.61 → **$2.99**, +14.6% | Adjusted **RMB 21.04 (US$3.14)** per ADS ([Benzinga](https://www.benzinga.com/node/63442794)) |
| BABA Nov 19 | CN¥11.39 → **CN¥8.10**, −28.9% | $1.56 → **$1.04**, −33.3% | Non-GAAP diluted **RMB 8.10 (US$1.21)** per ADS ([6-K ex-99.1](https://www.sec.gov/Archives/edgar/data/0001577552/000110465926130115/tm2630263d1_ex99-1.htm)) |
| JD Nov 17 (last run) | CN¥4.52 → CN¥5.87, beat | Nasdaq $0.77 vs $0.89, a miss | Non-GAAP RMB 5.88 (US$0.88) |

Nasdaq's dollar actuals are 5–15% off the company's own dollar translation, and for JD they flip the verdict. Opening a sheet from the calendar shows a different surprise for the same quarter. That breaks "one report, one answer" (0041). The beat record ("0/3 beats", "2 of its last 4" in the unfurl) is built on the outlier source.

## What
- For a non-dollar reporter (`dollarFigures(s)` false, `worker/index.ts:243`), when the sheet's past-report row and a calendar row exist for the same report (same day ±1), the sheet uses the calendar row's pair (company currency) for estimate, actual and surprise, labelled in that currency. The move stays in dollars, and the existing note already says so.
- Older quarters with no calendar row keep Nasdaq's pair, but only when Nasdaq's newest actual is within 3% of the calendar row converted at the company's own rate. If it isn't (Nasdaq is on another basis), mark Nasdaq's older pairs "basis differs" rather than counting them in the beat record.
- The share description's "Beat N of its last M" follows the sheet.

## Acceptance criteria
- [ ] Live: `/t/PDD` and `/t/BABA` show the newest report with the same estimate, actual and surprise (to 0.1 pt) as `/api/calendar` for that day, in CN¥.
- [ ] Live: no ADR sheet among PDD, BABA, JD, NTES, BIDU, TCOM, LI, XPEV, NIO shows a beat/miss verdict on its newest report that differs from the calendar row's.
- [ ] Dollar reporters (NVDA, WMT, TGT, PANW) are unchanged.
- [ ] Unit test with PDD's and BABA's live pairs (calendar and Nasdaq).
- [ ] Works at 390×844 and 1440×900. Loading / empty / error / partial states handled: with a cold calendar cache, the sheet keeps Nasdaq's pair and says the currency.

## Test plan
Vitest on the sheet's past-row assembly (`shared/pastRows.ts` / `shared/compare.ts`) with the PDD and BABA fixtures above, plus a dollar control.

## Out of scope
Currency conversion of older quarters (no new rate source). The quarterly series currency break (0098).
