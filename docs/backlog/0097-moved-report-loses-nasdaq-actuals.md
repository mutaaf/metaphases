---
id: 0097
title: Company-dated reports whose feed row sat on another day never get their results ("Figures pending" for Ross, Gap, PDD, Williams-Sonoma and Bath & Body Works two days after they reported)
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-21
pr:
by: critic
---

## Why
Critic check 2026-11-21 07:00 UTC (Saturday). Six of the nine Nov 19 reporters on the calendar are still "Figures pending" more than a day after their releases, in 15 of 15 reads over about 75 s (week range, single-day range and month range all agree). Their sheets have the results, and Nasdaq's day calendar for Nov 19 lists every one of them with actuals:

| Ticker | Calendar row (`/api/calendar`, Nov 19) | Company / Nasdaq |
|---|---|---|
| ROST | `eE 1.9138`, `eA null`, no `pr` → "EPS EST $1.91 · FIGURES PENDING" | Ross 8-K: EPS **$1.91**; consensus $1.85 (Nasdaq) / $1.86 (Newsquawk) |
| GAP | `eA null` | Adjusted EPS $0.82 vs $0.76 (Nasdaq) |
| PDD | `eA null` | $2.99 vs $2.61 (Nasdaq) |
| WSM | `eA null` | $2.19 vs $2.18 (Nasdaq) |
| BBWI | `eA null` | $0.26 vs $0.12 (Nasdaq) |
| HP | `eA null` | $0.36 vs $0.22 (Nasdaq dates it Nov 18 after hours; the company's call was Nov 19) |
| WMT | `eA 0.65`, `pr: "s"` → "MIXED +1%" ✅ | |

The pattern: every broken row has a date override (`data/date-overrides.json`) whose **Finnhub row sat on a different day** (ROST, GAP, BBWI on Nov 18; WSM on Nov 17; PDD on Nov 16). WMT's Finnhub row was already on Nov 19, and it works. `preReportDay` (`worker/index.ts:214`) runs per raw feed day, before `applyToEvents` moves the row. So Nasdaq's Nov 19 actuals (`nq.a`) never meet a ROST row (ROST isn't in Nov 19's raw events), and Nov 18's Nasdaq day doesn't list ROST. After the move, nothing fills the figures.

There is a second symptom. ROST's "EPS EST $1.91" is Finnhub's estimate as revised after the print (it equals the actual). The pre-report consensus was $1.85–1.86. That's the same trap as the 2026-11-19 TJX lesson. Filling `eA` alone would grade Ross "in line" instead of a 3% beat.

Who it hurts: the glancer sees a famous retailer "pending" two days after its results, and the day's unfurl lists "results" it doesn't have. A trader can't trust any company-dated row, which is exactly the rows the operator's focus (2) made the most trustworthy. Retrace and the season tally lose these beats.

## What
- After `applyToEvents` moves an override row onto the company's day, run the moved row through the **target** day's pre-report step: the target day's snapshot first, then its Nasdaq day (`nq.e` for the estimate, `nq.a` for the actual). Do the same in the one-day path (`oneRowInRange`, about line 1344) and wherever else the calendar applies overrides (lines 566 and 612).
- A moved row's estimate must be the pre-report one: the snapshot from either day, else Nasdaq's `epsForecast`. Never Finnhub's post-print revision.
- Keep 0081's `figuresFit` guard: figures only from the company's date or a row at most `FIGURES_EARLY_DAYS` before it.
- Keep it cache-friendly. The target day's Nasdaq read is the same cached `nasdaqDay` call the day already makes.

## Acceptance criteria
- [ ] On production after deploy, `/api/calendar?from=2026-11-16&to=2026-11-22`, `?from=2026-11-19&to=2026-11-19` and `?from=2026-11-01&to=2026-11-30` each give ROST `eA 1.91` with `eE` 1.85 (or 1.86), `pr` set, and a beat. GAP, PDD, WSM and BBWI have their Nasdaq actuals, judged the same way. Read each 5 times, 15 s apart.
- [ ] The phone day drawer for Nov 19 (`/?day=2026-11-19`, 390×844) shows no "Figures pending" row for a company that Nasdaq's Nov 19 calendar lists with an `eps`.
- [ ] A unit test with an override whose feed row is one day earlier, a cached Nasdaq day for the company's day with actuals, and a Finnhub estimate revised to the actual gets `eA` from Nasdaq and `eE` from the pre-report consensus. It passes in week, single-day and month ranges.
- [ ] A sweep over every override in `data/date-overrides.json` whose date is 2–10 days past finds no row with `eA null` while Nasdaq's day lists an `eps` for it. Paste the sweep in the PR.

## Test plan
`tests/unit/announced0097Overrides.test.ts`: warm the day caches with an `/api/calendar` read (2026-11-18 lesson), move the clock to Nov 21, and assert the ROST-shaped row in three ranges.

## Out of scope
HP's release-versus-call day (Nasdaq says Nov 18 after hours, the override is the Nov 19 call). Leave it on the call day, but its figures must show.
