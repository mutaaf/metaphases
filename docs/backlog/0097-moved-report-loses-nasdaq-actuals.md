---
id: 0097
title: Company-dated reports whose feed row sat on another day never get their results ("Figures pending" for Ross, Gap, PDD, Williams-Sonoma and Bath & Body Works two days after they reported)
status: shipped
priority: P0
size: M
lens: data-quality
created: 2026-11-21
pr: 172
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

## Build attempt 1 (#167, reverted)
`fillMovedFigures` took Nasdaq's Nov 19 pair from the worker's cached day read (`nq:cal:v2:2026-11-19`). The live result was correct for the before-open names (WSM $2.18 → $2.19, BBWI $0.12 → $0.26). It was wrong for the after-close names: **ROST $1.85 → $1.58, GAP $0.76 → $0.62**. Those actuals are last year's Q3 EPS. Nasdaq's live day calendar says $1.91 and $0.82. So the Worker's cached copy was read before the after-close actuals posted, and in that copy the `eps` column held a stale (prior-year) figure for not-yet-reported rows, cached 7 days. Before retrying:
- (a) Capture what Nasdaq's day calendar returns for an after-close name between the close and the posting (`eps`, `surprise`, `lastYearEPS` or similar), and only trust `eps` when `surprise` is present and consistent (`(eps − epsForecast)/|epsForecast|` ≈ `surprise` %).
- (b) Cross-check against `nq:surprise:<SYM>` (the sheet already shows ROST $1.85 → $1.91 correctly).
- (c) Bump `NQ_CAL` to v3, or cut the TTL, so the poisoned week-long copy is not reused.

## Build attempt 2
Re-applies #167's `preReportMoved` / `fillMovedFigures`, plus:
- (a) `nasdaqDayActuals` keeps an `eps` only when Nasdaq has judged it: `surprise` numeric and equal to `(eps − epsForecast)/|epsForecast|` within rounding, or `surprise` "N/A" with `eps` equal to the forecast (Nasdaq prints N/A for a 0% surprise: HD $3.86 vs $3.86 on Nov 17). Live Nov 17–20: no judged row failed the check; every unjudged `eps` (no forecast) is dropped. A pre-posting ROST $1.58 / GAP $0.62 with no surprise now stays "Figures pending", and the day's copy is kept an hour (the partial TTL), not a week. This also guards 0058's `nA` on every day.
- (c) `NQ_CAL` → `nq:cal:v3`, so the poisoned v2 copies are never read.
- HP: a company-dated row that Nasdaq's own day doesn't list at all takes the previous weekday's judged pair (release the evening before the call). A row Nasdaq lists on its day but hasn't judged waits for its day.
- (b) was not needed once (a) holds: the cached day's `eps` is now self-consistent by construction. PDD stays pending (estimates in yuan per share; Nasdaq's pair is dollars per ADR).

## Critic re-review 2026-11-21 19:00 UTC: reopened (bounce 1 of 2)
Live on the #170 build (deployed 18:51 UTC), all four other names pass: ROST $1.85 → $1.91, GAP $0.76 → $0.82, WSM $2.18 → $2.19, BBWI $0.12 → $0.26 and HP $0.22 → $0.36, all with `pr: "n"`, matching Nasdaq's live Nov 18/19 day calendars exactly. A sweep of Nov 11–20 (79 rows) finds no other `eA null` row that Nasdaq lists with an `eps`.

**PDD fails the first two criteria.** The ticket named it, and the PR body chose to leave it pending. `/api/calendar?from=2026-11-19&to=2026-11-19` gives PDD `eE 19.213`, `eA null`, no `pr`. The phone day drawer for Nov 19 (390×844) still reads "EPS EST CN¥19.21 · REV EST CN¥117B · **FIGURES PENDING**" two days after the report. Its own sheet shows "$2.61 → $2.99 +14.6%", and Nasdaq's Nov 19 day lists `$2.99 / $2.61 / 14.56`. The cause is `preReportMoved`'s `want()`, which requires `dollarFigures(e.s)` (`worker/index.ts:256`), as does `fillMovedFigures` (`shared/compare.ts:252`). So a non-dollar company-dated row can never fill.

Still to do (either way passes):
- (a) Fill a non-dollar moved row with Nasdaq's **own pair**: estimate and actual both in US dollars per ADR, `cur` set to USD for that row, and the verdict judged on that pair. Both figures come from one source on one basis, so this is safe (0094's same-source rule). Or
- (b) If (a) can't be done cleanly, the row must say what's true. Drop "Figures pending" for any company-dated row whose day has passed and that Nasdaq lists as judged. Show "Reported · see the sheet for figures" (or similar) with no grade.

Acceptance, on top of the above: the first two criteria hold for PDD too. A unit test has a CNY company-dated row whose feed row is three days earlier and a judged Nasdaq USD pair: it gets a judged USD pair or the "reported" state, never pending.

## Build attempt 3 (re-review fix, option a)
- `fillMovedFigures` no longer skips non-dollar rows. A row whose estimates aren't dollars (PDD, yuan per share) takes Nasdaq's pair whole: `eE` 2.61 and `eA` 2.99, both dollars per ADR from one table (0094's same-source rule), `pr: "n"`, and a new row field `ec: "USD"`. Its yuan revenue estimate is dropped (`rE: null`), so the row never shows a dollar EPS beside a yuan revenue.
- `preReportMoved` reads Nasdaq's day for non-dollar company-dated rows too.
- Client: `rowCur(e)` (`e.ec ?? curOf(e.s)`) replaces `curOf(e.s)` wherever a calendar row is shown or judged (EventRow, the day and month lists, `resultOf`, The Read's context, Today). The ticker sheet keeps its own `currency`.
- Known edge (self-review): if Finnhub later posts PDD's own yuan `eA`/`rA`, the fill stops (it only fills rows with no figures), and the row becomes Finnhub's yuan pair with revenue. Each pair is consistent with itself, but the verdict's source can change. If the Critic sees that live, it's a follow-up ticket.

## Critic re-check 2026-11-22 07:00 UTC (passes)
Production was still on build `c4d188d9` (deployed 2026-11-21 19:21 UTC, before #172). PDD's Nov 19 row now carries figures anyway: `eE 19.213 → eA 21.04`, `rA 108.3B` (CN¥). That is the company's adjusted RMB 21.04 per ADS and RMB 108.3B revenue. The phone drawer no longer says "Figures pending". #172 fills only rows with `eA == null`, so it shouldn't change this row once deployed. The calendar and the sheet still disagree on PDD's surprise; that's 0100.
