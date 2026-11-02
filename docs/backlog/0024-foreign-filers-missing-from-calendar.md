---
id: 0024
title: Toyota, Sony, Honda, Novo Nordisk and JD are missing from the calendar in the week their own sheets say they report
status: ready
priority: P0
size: M
lens: data-quality
created: 2026-11-02
pr:
by: critic
---

## Why
On 2026-11-02 at about 07:00 UTC, the critic compared each of the 150 largest universe names' `/api/ticker/:sym → next.date` with `/api/calendar?from=2026-11-02&to=2026-11-30`. Seven tracked companies have a November date on their sheet but **no row in the calendar at all**:

| Ticker | Sheet says | In calendar? |
|---|---|---|
| TM | Thu Nov 5 · after close · ¥64.50 | no |
| SONY | Thu Nov 5 · before open · ¥63.16 | no |
| HMC | Nov 5 | no |
| NVO | Nov 4 (DKK) | no |
| JD | Nov 12 | no |
| SQM | Nov 18 | no |
| BRK.B | Nov 2 | no |

`/api/calendar?from=2026-11-05&to=2026-11-05` returns 88 rows and none of them are TM, SONY or HMC. The share card for `/t/TM` says "TM reports Thu, Nov 5 after the close", but the calendar, Today, Compass and the watchlist (which all read the calendar) say nothing. Every one of these is a foreign filer or a dotted share class, which is the population the Everyday investor holds through ADRs and wouldn't think to search. A calendar that silently omits Toyota is wrong data. All 143 other names agreed exactly (0 date mismatches), so the per-day pipeline is otherwise sound.

## What
- Find where the rows drop. Hypotheses, in order: (a) Finnhub's per-day `/calendar/earnings?from=D&to=D` doesn't list these symbols while `symbol=` does; (b) a dotted symbol (`BRK.B`) fails the `/[.\-]/` filter or Finnhub uses `BRK-B`; (c) the stale-copy fallback in `calendarDay()` (`worker/index.ts:74`) served a day cached before the dates were set.
- Fix the root cause. If it's (a), add a cheap supplement: for tracked names whose `c ≠ US` (about 60, from `universe.json`), fetch `calendar/earnings?symbol=` through `pool()` and edge-cache it 12 h, then merge rows the per-day call lacks, keeping the per-day row when both exist.
- Rows merged this way carry the estimate's currency (see 0021), so the calendar never shows a bare `$` for them.

## Acceptance criteria
- [ ] A script `scripts/calendar-vs-sheet.mjs` (or an equivalent recorded loop) compares sheet `next.date` with the calendar for the 150 largest names over the next 30 days and reports 0 missing and 0 mismatched; run it against production and record the result in the PR
- [ ] TM, SONY and HMC appear on Nov 5 in `/api/calendar?from=2026-11-05&to=2026-11-05` (or on whatever date their sheets show), with a non-`$` estimate
- [ ] Unit test: a fixture where the per-day response lacks a tracked symbol that the `symbol=` response has → the merged calendar contains it once
- [ ] Finnhub calls stay within 60/min (the supplement is pooled and cached), and no new 1102s (see 0012)
- [ ] Works at 390×844 touch and 1440×900: the TM tile shows in Thursday's cell

## Test plan
Unit: merge logic (missing row added, duplicate kept once, dotted symbol normalised). e2e: the November fixture gains a TM row only in the `symbol=` fixture, and the Nov 5 day drawer shows Toyota.

## Out of scope
Confirming foreign dates against company IR (0013 overrides cover that). Ranking by market cap in local currency (separate lesson).
