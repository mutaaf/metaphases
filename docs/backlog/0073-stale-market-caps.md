---
id: 0073
title: Market caps are two weeks old (NVDA "$4.93T" at $162.85, really about $3.96T); the Nov 8 data refresh PR #73 never merged
status: ready
priority: P1
size: S
lens: data-quality
created: 2026-11-14
pr:
by: critic
---

## Why
Critic check 2026-11-14 07:00 UTC. The NVDA sheet header reads "NVDA · SEMICONDUCTORS · $4.93T" next to "$162.85 −2.01%" (`shots/p_b_sheet_nvda.png`). `profile.marketCap` is `4931824` ($M), straight from `data/universe.json` (`shared/marketCap.ts:10`). That figure matches NVDA at about $203, its close around Oct 30–Nov 3. The sheet's own `chart` has it at $162.85 on Nov 13, down 20%, so the cap is overstated by about $0.97T. Other names drift too (AMZN +9% since the refresh).

The cause: the Sunday Nov 8 `data-refresh.yml` run committed new data to `keep/data-refresh-20261108` and opened **PR #73**, whose `check` passed on Nov 8, but it is still open six days later (no auto-merge took it). The Nov 1 refresh (#4) was closed, not merged. So `universe.json` caps date from the Nov 1 build plus 0042's currency fix, and nothing refreshes them. Caps drive the sheet header, "largest" ranking, the "10 largest S&P 500" brief and Compass ordering.

## What
- **Code (this ticket):** keep a stored cap honest between refreshes. Store the price the cap was taken at (`px`, plus `mcAt`) in `universe.json` from `scripts/build_universe.py`, and scale `mc × lastClose / px` wherever a cap is shown or ranked for a symbol whose closes we hold (the sheet's `chart`). Where no close is at hand, show the stored cap with its "as of" date in the `title`.
- **Operator (not this ticket, frozen path):** PR #73 needs a merge or close, and the reason auto-merge didn't arm on a bot PR (`gh pr merge --auto … || true` swallows the failure) belongs in a `proposal/` note. The critique carries this for the operator.

## Acceptance criteria
- [ ] `/api/ticker/NVDA` `profile.marketCap` within 3% of `chart.c[-1] × shares` (≈ $3.96T at $162.85) on production
- [ ] Unit: a universe entry with `mc` 4,931,824 at `px` 203.00 and a last close of 162.85 yields ≈ 3,956,000
- [ ] The sheet header and `/t/NVDA` og description show the scaled figure; the "10 largest" brief ranks by it
- [ ] Main bundle ≤ 120 kB gzip

## Test plan
Unit test on the scaling helper in `shared/marketCap.ts`; worker test that `buildTicker` uses it.

## Out of scope
Changing `.github/workflows/data-refresh.yml` (frozen). Intraday caps.
