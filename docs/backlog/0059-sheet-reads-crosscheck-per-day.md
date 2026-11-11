---
id: 0059
title: The sheet and its unfurl see the Nasdaq cross-check the calendar already shows (PDD "reports Mon, Nov 16 before the open" while the calendar flags Nasdaq Nov 17)
status: shipped
priority: P0
size: S
lens: data-quality
created: 2026-11-11
pr: 96
by: critic
---

## Why
Critic check 2026-11-11 19:00 UTC, build `87346568`. The calendar and the sheet tell a trader two different things about the same report:

| | Calendar `/api/calendar?from=2026-11-12&to=2026-11-24` (second read) | `/api/ticker/SYM` and `/t/SYM` og |
|---|---|---|
| PDD | Nov 16 bmo, `x: differs`, `xd: 2026-11-17` | `next: Nov 16 bmo`, no `nasdaq` field. og:title **"PDD reports Mon, Nov 16 before the open"**. The Read: "reports Q3 on Monday, Nov 16 before the opening bell." |
| WSM | Nov 17 bmo, `differs`, Nasdaq Nov 18 | "reports Q3 on Tuesday, Nov 17 before the opening bell." |
| CPRT | Nov 18 `""`, `differs`, Nasdaq Nov 19 | "Wednesday, Nov 18 (time not yet confirmed)" with no flag |
| BBWI | Nov 18 `""`, `differs`, Nasdaq Nov 19 bmo | same, with no flag |
| WMT | Nov 19 **bmo**, `x: agree` | `next.session: ""`, "Time TBD", "(time not yet confirmed)" |

None of these companies has announced a date (PDD reported on a Tuesday last year, and a third-party calendar has Nov 23), so the honest answer on the sheet is "unconfirmed: Nasdaq says Nov 17". The share card is the surface people actually send around, and it states a contested date as fact.

**Cause** (`worker/index.ts:271–296`, `:514`): the sheet reads only the *folded* window `NQX_IDX(today)`, and that's written only when **every** window day has loaded (`w.loaded.length === days.length`). On production the calendar stayed at `unchecked: 1` across three reads over ~5 minutes, so the fold never happened and every sheet got `nqWin = null`. Nasdaq's day calendar answers in 1.2–3.3 s from the sandbox (Nov 12: 3.24 s, Nov 19: 3.26 s, Nov 23: 3.18 s), against a 2.5 s `fetchNasdaqDay` timeout, so one slow day failing (then remembered for 15 minutes) is enough to keep the fold away indefinitely. The calendar doesn't have this problem, because it reads the per-day caches directly.

0057 already reads one day on demand (`nasdaqDayOnDemand`) for the habit. It fetched WMT's `time-pre-market` (its moves are now right), but that answer is used only for past moves, never for `next.session` or a date disagreement. So the sheet measures WMT as before the open and says "Time TBD" in the same breath.

## What
- In `buildTicker` (and `kidsWhy`), cross-check the next report against **that day's** cached Nasdaq listing (`NQX_DAY`), plus Nasdaq's day for any date the index would match, without waiting for a fully folded window. A partly loaded window is still evidence for the days it has.
- Use the `nasdaqDayOnDemand` answer for `next.session` (agreement fill, as 0015 does on the calendar) as well as for the habit.
- A disagreement sets `next.nasdaq` exactly as the calendar's `x: differs` does, and the sheet, The Read and og:title/description say the date is unconfirmed (for example "PDD reports Mon, Nov 16 (unconfirmed; Nasdaq lists Tue, Nov 17)").
- Either fold whatever has loaded, or make a missing day not block the others. Consider a timeout nearer the measured latency (say 4 s) for the background fill only.

## Acceptance criteria
- [ ] Unit test (made-up symbol): window with 9 of 10 days loaded, the missing day being a *different* day, Nasdaq lists the symbol a day later → the sheet's `next.nasdaq` is set and the Read and og say unconfirmed
- [ ] Unit test: no folded window, `NQX_DAY` for the report day says pre-market, Finnhub `hour: ""` → `next.session === "bmo"` (expected, not confirmed)
- [ ] On production: for every row in `/api/calendar?from=<today>&to=<today+13>` with `x`, `/api/ticker/SYM` agrees (same session on `agree`; a `nasdaq` field on `differs`). Check PDD, WSM, CPRT, BBWI, WMT, or whichever names carry `x` that day.
- [ ] `/t/PDD` og:title doesn't state a single date as fact while the calendar says `differs`
- [ ] No more than one Nasdaq call per day per colo per 6 h on the sheet path (shared cache), and a Nasdaq failure leaves the sheet as Finnhub has it, never as a warning
- [ ] Works at 390×844 touch and 1440×900

## Test plan
Worker unit tests with mocked caches and Nasdaq (`tests/unit/`). Live: the table above, re-read after deploy.

## Out of scope
Company overrides for WMT/TGT/TJX/INTU (0050). Changing which source wins on a disagreement: Finnhub stays, and the row is flagged.
