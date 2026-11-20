---
id: 0090
title: A next report with no session never blanks the past reports' sessions and moves (DELL, KSS, ASAN and 12 more of this week's reporters show no "last time" at all)
status: shipped
priority: P0
size: S
lens: data-quality
created: 2026-11-19
pr: 156
by: critic
---

## Why
Critic check 2026-11-19 19:00 UTC, build deployed 18:56 UTC (includes #153, 0088). 0088 fixed the branch where a *projected* session couldn't be settled. The same blanking still happens whenever the next report's session is unknown for any other reason, and `lastE` (the last dated report) has already dropped out of Finnhub's `symbol=` feed, which happens the day after every print. `habit` is then `sessionHabit("", undefined, undefined)` = `""` (`worker/index.ts:821`, the non-`nextFix` branch), so every past report loses its session and its move, and the sheet's "Typical move", The Read, the unfurl and the AI preview all have nothing to say.

Of the 67 companies on `/api/calendar?from=2026-11-19&to=2026-12-01`, **15 have history sessions `____` and 0 measured moves** on `/api/ticker/SYM` (read sequentially, 4 s apart, empty `warnings`):

| Why the next session is unknown | Symbols |
|---|---|
| Company-dated, date-only override (0056/0084: a call time isn't a session) | DELL, ADSK, INTU, DE, HP, MRVL |
| Just reported on a date-only override, next one projected with no time | ROAD |
| Two calendars disagree on the date (0060 memo) | KSS, URBN, AEO |
| Feed time blank | ASAN, FIVE, PVH, XP, WOOF |

A trader opening Dell's sheet five days before the print sees "Time TBD" and "Typical move —" (`shots/p__t_DELL.png`). From the sheet's own `chart` closes, Dell's moves on the day after each of its last four reports were +15.8%, +32.8%, +21.9% and +5.8% (same-day moves −6.8, +3.8, −1.6, −1.0): the after-close reaction wins 4 of 4, so the honest typical move is about **±19%**, the single most useful number on that sheet this week. Same test: KSS before-open wins 3 of 4, ASAN after-close wins 3 of 4. ADSK splits 2–2 and should stay unknown.

The 0088 lesson says an unknown projection is no evidence against dated reports. The same holds for an unknown *next* session of any kind: it says nothing about when the last four reports came out.

## What
- `worker/index.ts` ~819–821 (and the `/api/kids/why` twin at ~1413): when the next row's session is unknown (`""`, whether from an override, a date contest or a blank feed time), past moves don't take their day from it. Fall back, in order, to: `lastReportedHour(...)` (cache only, as 0088 does), Nasdaq's session for the next day if it lists one, then the stock's own reaction test, `contestedSession("bmo", "amc", pastDates, closeOn)` (at least 3 of 4 measured reports, else `""`).
- The next row's displayed session stays `""` (Time TBD). This ticket only changes which day past moves are measured on.
- `typicalMove()` keeps its 3-report minimum. Make no new upstream calls.

## Acceptance criteria
- [ ] Unit: override with no `hour`, no `lastE`, closes where the after-close move is larger in 4 of 4 → `history[].session` all `amc`, 4 non-null moves, `expectedMove` non-null; `next.session` still `""`
- [ ] Unit: a 2–2 split leaves `history[].session` `""` and `expectedMove` null (no guess)
- [ ] Live: `/api/ticker/DELL` `history[0..3].session` are `amc` and `expectedMove` is between 15 and 23; KSS is `bmo` with ≥3 moves; ASAN is `amc` with ≥3 moves
- [ ] Live: of the 15 symbols above, at most 3 still have zero measured moves, and each of those is a genuine 2–2 split
- [ ] Live: TJX, TGT, JD, XPEV unchanged from 0088 (all `bmo`, typical move 3–6%)
- [ ] Works at 390×844 and 1440×900

## Test plan
Extend the 0088 tests (`tests/unit/*projected*` / `typicalMove`) with a date-only-override case and a date-contest case, each with no `lastE`.

## Out of scope
What the sheet's "Time TBD" label says for the upcoming report (0091), and adding sessions to overrides.
