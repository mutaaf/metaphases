---
id: 0057
title: Measure a before-the-open report's move on its own day (Walmart's "typical move ±1.0%" is really ±6.1%)
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-10
pr:
by: critic
---

## Why
Critic check 2026-11-10 19:00 UTC, build `1de09f28`. When Finnhub leaves a company's `hour` blank, `buildTicker` sets `habit = ""` (`worker/index.ts:488`), and the history loop (`:576–579`) treats a blank session like after the close. It measures **close(report day) → close(next day)**. For a company that reports before the open, that's the day *after* the reaction. So every past move, the "typical move", The Read, the share card and the Kids "last time" line are wrong for that company.

This week it hits the season's biggest retailers, which all report before the open and all have a blank Finnhub `hour`. Here are the true before-open moves, computed from the sheet's own `chart` closes (close of the day before → close of the report day):

| | Report | True move (bmo) | Metaphases `history[].move` |
|---|---|---|---|
| WMT | 2025-11-20 | **+6.46%** | −1.67% |
| WMT | 2026-05-21 | **−7.27%** | −0.88% |
| WMT | 2026-08-20 | **−9.15%** | −0.13% |
| HD | 2025-11-18 | **−6.02%** | −0.59% |
| TJX | 2026-05-20 | **+5.66%** | −1.10% |
| TGT | 2026-03-03 | **+6.74%** | −0.60% |

Typical move: **WMT shown ±1.0%, true ±6.1%**; TGT ±1.7% vs ±4.4%; TJX ±1.8% vs ±2.8%; HD ±1.9% vs ±2.3%. `/t/WMT` unfurls as "Walmart Inc. — … typical move **±1.0%** …", and The Read says "The stock has moved about ±1.0% on a typical report — that's the size of swing to be ready for." A trader sizing for Walmart's Nov 19 print is told to expect a sixth of the real swing, and several signs are flipped. After-close names with a blank `hour` (INTU) happen to come out right, because that's the branch they fall into.

Scale: 53 of the 103 calendar rows for Nov 11–24 have `h: ""` (HD, TGT, TJX, WMT, BBY, MDT, BURL, DKS, KSS, JD, BABA, …). `kidsWhy` (`worker/index.ts:922–927`) uses the same `habit` fallback.

## What
- Resolve a past report's session from the best source available, in this order: company override `hour` for that date (`data/date-overrides.json`); Finnhub's `hour` for that date; **Nasdaq's day calendar `time` for that date** (`api.nasdaq.com/api/calendar/earnings?date=`, already read and cached for past days by 0035 as `nq:cal`; `time-pre-market` → bmo, `time-after-hours` → amc); then the company's habit from those sources (the 0015/0050 Nasdaq-agreed upcoming session counts).
- If the session is still unknown, set `move: null` ("—") and leave the quarter out of `expectedMove`. Never default an unknown session to after the close.
- The same rule applies in `kidsWhy` and any other `closeOn(…, ±1)` pair (the `lastE` and `reported` branches at `:597`, `:606`).
- History rows carry the resolved session, so the sheet's history list shows the right glyph.
- Bump the sheet cache key (`tk:` and `tk:stale:`), so ±1.0% copies don't outlive the fix (LESSONS 2026-11-04).

## Acceptance criteria
- [ ] Worker unit test (made-up symbol, LESSONS 2026-11-06): Finnhub `hour: ""`, Nasdaq day `time-pre-market` on the report date, a chart with a +6% gap on the report day → `history[0].move ≈ +6`, `session: "bmo"`
- [ ] Unit test: no session from any source → `move: null`, and the quarter isn't counted in `expectedMove`
- [ ] On production after deploy: `/api/ticker/WMT` `history` has 2025-11-20 at +6.4% ±0.2 and `expectedMove` between 5 and 7; HD's 2025-11-18 row is −6.0% ±0.2; TGT's 2026-03-03 row is +6.7% ±0.2
- [ ] `/t/WMT` `og:description` doesn't say "typical move ±1.0%"
- [ ] No more than one extra Nasdaq day call per uncached past report date (shared `nq:cal` cache), and the sheet still builds under the 0043 degraded-sheet rules when Nasdaq fails (move `null`, not wrong)
- [ ] Works at 390×844 touch and 1440×900

## Test plan
Worker unit tests with mocked Finnhub, Nasdaq and Yahoo (`tests/unit/`). Live check: the true-move table above, recomputed from `/api/ticker/SYM` `chart` (close the day before vs close on the report day).

## Out of scope
Filling the *upcoming* session (0050). Intraday reactions (only daily closes). Changing `shared/grades.ts`.
