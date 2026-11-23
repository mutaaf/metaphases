---
id: 0103
title: JD's calendar row shows CN¥2.94 per ordinary share instead of the company's RMB 5.88 per ADS, so the sheet falls back to Nasdaq's off-basis dollars
status: shipped
priority: P1
size: S
lens: data-quality
created: 2026-11-23
pr: 185
by: critic
---

## Shipped 2026-11-23 (builder)
The ticket's suggested check (the per-ADS actual within 3% of Nasdaq's dollars) can't pass for JD: even the right
CN¥5.88 is 12% off Nasdaq's $0.77 at 6.71, the same Nasdaq gap 0100 found. So the basis is told apart by distance
instead. A per-share row sits about the ADS ratio away from Nasdaq's per-ADS pair (JD estimate 1.98×, actual 1.76×), and
a per-ADS row sits near 1×. `shared/adsBasis.ts`:
- `ADS_SHARES` is a published table (20-F cover pages): JD 2, LI 2, XPEV 2, TME 2, PDD 4, NTES 5, BIDU 8, BABA 8. It
  holds only companies that headline per ADS. TM, SONY, HMC, TSM and NVO headline per share and are never scaled.
- `adsScale` scales only when the estimate and the actual each sit at least n/1.5 away from Nasdaq's as given and
  within 1.5× once scaled, with Nasdaq's figures at least $0.10 (cent rounding near breakeven, LI/XPEV, can't decide
  it). Two independent signals, per LESSONS 2026-11-21. Any figure, rate or Nasdaq row missing, a sign change or a
  dollar row (`ec: "USD"`) leaves the row unchanged, and so does a mixed row (one figure per share, one per ADS).
- Calendar: `settlePast` reads Nasdaq's `earnings-surprise` for past ADR rows with figures (at most 4 names, newest
  rows first; up to 2 fetched ahead of the rest in the 8-fetch budget, cached 12 h), at the universe's CNY rate, and
  after the suspect (`nx`) check too.
- Sheet: `companyCurrencyPairs(…, symbol)` applies the same check to the cached calendar row at the quarter-end rate,
  so `/t/JD` and the calendar show the same CN¥6.035 → CN¥5.88 (−2.6%).
- No cache key bump: the fix runs on every read, so the day caches that hold the per-share row are corrected as served.
Follow-ups (not built, from the self-review): an aliased home-listing row (9618.HK, 2015.HK) is probably per share
by construction, so JD's *next* estimate can still read about half the per-ADS figure on the calendar, sheet `next`,
ICS and story card. And a stored pre-report estimate (`pr: "s"`) on the other basis leaves a mixed row that is shown as
the feed gave it. Both need Finnhub's raw labels checked before scaling by provenance.
Tests: `tests/unit/adsBasis0103.test.ts` (JD fixture 3.0175/2.94 → 6.035/5.88; per-ADS JD, BIDU, NTES, TME, PDD, BABA,
XPEV controls from live Nasdaq pairs unchanged; no-guess cases; worker calendar via the 9618.HK alias, and the sheet).

## Why
Critic check on 2026-11-23 at 07:00 UTC. JD's Nov 17 calendar row (`/api/calendar?from=2026-11-10&to=2026-11-21`) now reads `eE 3.0175 → eA 2.94` (CN¥). That is per **ordinary share** (1 ADS = 2 shares). The headline the company and every outlet use is non-GAAP **RMB 5.88 (US$0.88) per ADS** ([JD release](https://finviz.com/news/423748/jdcom-announces-third-quarter-2026-results); consensus $0.98 per [Newsquawk](https://www.newsquawk.com/headlines/jdcom-jd-q3-2026-usd-eps-088-exp-098-revenue-462bln-exp-46bln)). The same row read CN¥4.52 → CN¥5.87 on 2026-11-22 (critique 2026-11-22 07:00 and ticket 0100). The feed rewrote it overnight, with a new estimate and a halved actual.

Every other ADR checked is per ADS and matches its company: BIDU CN¥6.78 ([release](https://finviz.com/news/422901/baidu-announces-third-quarter-2026-results)), NTES CN¥14.21, BABA CN¥8.10, PDD CN¥21.04. JD is the odd one out, so a trader comparing it with any headline sees half the number.

There's a knock-on effect. 0100's check (Nasdaq's newest actual within 3% of the calendar pair at the company's rate) fails for JD because CN¥2.94 ≈ $0.44 while Nasdaq has $0.77. So `/t/JD` keeps Nasdaq's $0.89 → $0.77. That's the pair 0100 found off the company's US$0.88, and it differs from the calendar row. The verdict agrees today (miss), but the figures disagree in two views of one report.

## What
- Detect an ADR row whose figures are on a per-share basis. The check: the calendar actual × the ADS ratio is within 3% of Nasdaq's dollar actual at the quarter-end rate (`ADR_FX_MAX`), while the raw figure is not. Scale the row's `eE`/`eA` by the ADS ratio (`data/` ADS ratio table, or derive it from that check only when the ratio is an integer 2–100).
- If the ratio can't be established, keep the row's figures but label them "per share", never unlabelled beside per-ADS figures.
- Bump any cache key that stored the halved row.

## Acceptance criteria
- [ ] Live: JD's Nov 17 calendar row reads CN¥5.88 (±1%) actual, and `/t/JD`'s newest report shows the same estimate, actual and surprise as the calendar row, in CN¥ (0100's bar).
- [ ] Live: BIDU, NTES, BABA, PDD and XPEV calendar actuals are unchanged (each within 1% of its company's per-ADS figure).
- [ ] Unit: the JD fixture (calendar 3.0175/2.94 CN¥, Nasdaq 0.89/0.77 $, CNY=X 6.71) yields a per-ADS pair 6.035/5.88. A BIDU control is unchanged.
- [ ] Works at 390×844 and 1440×900. With no Nasdaq actual, the row is unchanged (no guessing).

## Test plan
Vitest beside the 0100 tests (`calendarRowNear` / ADR sheet assembly), with the JD and BIDU fixtures above.

## Out of scope
Disagreements between consensus sources (Finnhub vs LSEG vs Newsquawk), for example BIDU and HD. Those are a source choice, not a basis error.
