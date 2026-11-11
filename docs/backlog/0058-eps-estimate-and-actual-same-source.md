---
id: 0058
title: Judge a beat with an estimate and an actual from the same source (Lumentum, Vertex and Apollo misses shown as beats)
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-11
pr:
by: critic
---

## Why
Critic check 2026-11-11 07:00 UTC, build `2c914c67`. For a reported row with no snapshot, 0035 swaps in Nasdaq's pre-report `consensusForecast` as the estimate (`shared/compare.ts:153`, `pr: "n"`) but keeps **Finnhub's** actual. The two feeds often report EPS on different bases: Nasdaq's actual and consensus are on one (Zacks-style) basis, while Finnhub's actual is usually the company's own non-GAAP figure. The calendar row then sets one source's actual against the other source's estimate.

`/api/calendar?from=2026-11-02&to=2026-11-07`: 138 of 352 rows are `pr: "n"`. I checked the first 25 against Nasdaq's `earnings-surprise` (same quarter, same source for both numbers), and 7 disagree:

| Row | Calendar (Finnhub actual vs Nasdaq estimate) | Nasdaq (actual vs its own estimate) |
|---|---|---|
| LITE Nov 2 | 4.57 vs 3.82 = **+19.6% beat** | 3.76 vs 3.82 = **−1.6% miss** |
| VRTX Nov 2 | 4.76 vs 4.36 = **+9.2% beat** | 4.21 vs 4.36 = **−3.4% miss** |
| APO Nov 3 | 2.07 vs 2.04 = **+1.5% beat** | 1.82 vs 2.04 = **−10.8% miss** |
| AMD Nov 3 | 2.09 vs 1.68 = +24.4% | 1.84 vs 1.68 = +9.5% (company non-GAAP $2.09 vs street ≈$1.94: about +7.5%) |
| ANET Nov 3 | 1.20 vs 0.99 = +21.2% | 1.11 vs 0.99 = +12.1% |
| AAPL Nov 2 | 2.10 vs 1.98 = +6.1% | 2.05 vs 1.98 = +3.5% |
| WMB Nov 2 | 0.51 vs 0.55 = −7.3% | 0.54 vs 0.55 = −1.8% |

Three verdicts flip from miss to beat, and the rest overstate the surprise. The mix also pushes up the headline numbers every visitor sees: Retrace's scoreboard reads **EPS beat rate 85%**, median surprise **+6.0%**, against roughly 75% in a normal season (LESSONS 2026-11-02). `0.5–2×` (`sameEpsBasis`) can't catch this, because the gap is 5–25%. The sheet itself is consistent (AMD's history row is 1.84 vs 1.68, both from Nasdaq), so the calendar and the sheet now disagree about the same quarter. AMD's Read also says "expects $2.95 a share, versus $1.84 last quarter", a company-basis estimate set against a Nasdaq-basis actual.

## What
- When the estimate comes from Nasdaq (`pr: "n"`), judge it against **Nasdaq's actual for that quarter** too (the `earnings-surprise` row whose `dateReported` matches, or the day calendar's `eps` field, already fetched for 0035). Keep showing Finnhub's actual as the figure, but take the verdict and `surprisePct` from the same-source pair. If Nasdaq's actual isn't there, the row's verdict is "not comparable" (no tint), never a mixed pair.
- Alternatively, if Finnhub's and Nasdaq's actuals differ by more than 3%, mark the row `basis: "differs"` (0049's flag) and leave it out of the beat-rate and median-surprise counts.
- Apply it wherever `pr: "n"` rows are judged: calendar tint, Retrace lists and scoreboard (`seasonScore`), the Today and Hype Check lines, and share meta (all through `epsVerdict`, LESSONS 2026-11-11).
- In The Read's "versus $X last quarter", use the actual on the same basis as the upcoming estimate (Finnhub's), or drop the comparison.
- Bump the day cache key for judged rows (LESSONS 2026-11-06), so settled days pick up the fix.

## Acceptance criteria
- [ ] Unit test with these rows: LITE `eA 4.57, nasdaq est 3.82, nasdaq actual 3.76` → miss (or not comparable), never beat; VRTX `4.76 / 4.36 / 4.21` → miss; APO `2.07 / 2.04 / 1.82` → miss; AMD `2.09 / 1.68 / 1.84` → beat with `surprisePct` ≈ +9.5, not +24.4
- [ ] On production after deploy (and after the day cache turns over), none of LITE, VRTX or APO is tinted a beat in the Nov 2–3 day drawers or listed among Retrace's beats
- [ ] Re-run the Reproduce loop below over all `pr: "n"` rows for Nov 2–7: verdict matches Nasdaq's own pair in ≥ 95% of rows, and any disagreement is shown as not comparable
- [ ] `/t/AMD` The Read doesn't compare $2.95 with $1.84
- [ ] Works at 390×844 touch and 1440×900

## Test plan
Vitest on `pickConsensus` / `epsVerdict` with the rows above; `seasonScore` on a fixture with one mixed row (must not count it as a beat). Worker test: the calendar row carries a verdict from the same-source pair.

## Out of scope
Snapshotted rows (`pr: "s"`), which are already same-source (Finnhub before and after). Revenue (Nasdaq gives no revenue forecast). Changing `shared/grades.ts`.

## Reproduce
```sh
B=https://mutaafaziz.com/metaphases; UA="Mozilla/5.0 (Macintosh) Chrome/130"
curl -s -A "$UA" "$B/api/calendar?from=2026-11-02&to=2026-11-07" > calp.json
# for each row with pr == "n": curl -s -A "$UA" https://api.nasdaq.com/api/company/$SYM/earnings-surprise
# compare (eA-eE)/|eE| with (rows[0].eps - rows[0].consensusForecast)/|consensusForecast| (1 call/s, Nasdaq only)
```
