---
id: 0011
title: Never compare revenue actuals and estimates on different bases (or currencies)
status: shipped
priority: P0
size: M
lens: data-quality
created: 2026-11-01
pr: 21
by: critic
---

## Why
Metaphases told users that Alphabet missed revenue by 15.8% ($111.2B vs $132.0B est). Alphabet's 8-K reports $127.6B against a ≈$128B consensus. Finnhub's actual looks net of traffic-acquisition costs while the estimate is gross. In Oct 26–30, 17 of 183 tracked reports show a revenue surprise of ±8% or more, including GLXY −42.9%, EXE −28.6% and HIG −27.6%. These rows feed Retrace's revenue beat rate, the season scoreboard (`shared/depth.ts:137`), `resultOf()` (`src/lib/data.ts:34`) and the AI context. Non-USD filers also show local-currency numbers with a `$`: KSPI shows a $1.27T revenue estimate and an EPS estimate of 1571.76. Wrong numbers presented with confidence are the fastest way to lose a trader. See `docs/critique/2026-11-01-0506.md` #2.

## What
- A pure helper in `shared/` (e.g. `revenueComparable(e)`) returns `false` when `|rA/rE − 1|` exceeds a documented threshold (start at 12%, tuned against the fixtures) or when the company's reporting currency isn't USD. Use `currency` from the Finnhub profile already fetched for the sheet, or a `cur` field added to `universe.json` at refresh time.
- Where it's false: in the sheet and day drawer, show the revenue with a "not comparable: different basis" note (a `<Term>`), don't colour it as a beat or miss, and exclude it from every revenue beat rate (Retrace, scoreboard, AI context, `resultOf`).
- For non-USD filers, show the currency code instead of `$`, or "—" with an explanation. Never show a `$` figure that isn't dollars.

## Acceptance criteria
- [ ] A unit test with the GOOGL Q3 2026 row (`rE 132020419167`, `rA 111211000000`) shows it's excluded from revenue beat rates and not judged a miss
- [ ] A unit test with a KSPI-like row shows no `$` formatting
- [ ] Retrace's and the scoreboard's revenue beat rates state how many reports were excluded as not comparable
- [ ] On production, `/t/GOOGL` and the Oct 28 day drawer don't call GOOGL a revenue miss
- [ ] (critic 2026-11-01 0700) The same quarter shows one consensus everywhere. META Q3 2026 shows EPS est **$5.79** in `/api/calendar` (Finnhub) but **$6.52** in the sheet's reaction history (Nasdaq `consensusForecast`, `worker/index.ts` history join). That gives a +28% beat in one place and +13.5% in the other for the same $7.40 print. Its actual $7.40 excludes a $9.89B legal charge (GAAP $3.83). Pick one estimate source per quarter, prefer Finnhub when present, and say which basis (adjusted or GAAP) the actual is on.
- [ ] Works at 390×844 touch and 1440×900

## Test plan
Vitest for the helper and for `seasonScore` / `resultOf` with the mismatched rows; an e2e assertion on the recorded October fixture that the GOOGL tile isn't marked "mixed" or "miss" because of revenue.

## Out of scope
Sourcing a second revenue feed. If one is needed, that's an operator `proposal/` (new host).
