---
id: 0064
title: The calendar says "2 reporting" on Thanksgiving and lists Veeva "After close" as fact; the sheet says the date isn't confirmed
status: shipped
priority: P0
size: S
lens: data-quality
created: 2026-11-13
pr: 110
by: critic
---

## Why
Critic check 2026-11-13 07:00 UTC, build `341dc9e0`. 0045 taught the worker that a projected report on a market holiday is almost surely not the real date: `flagClosed` (`shared/dateOverrides.ts:120`) adds `c: "Thanksgiving"` to such rows, and the sheet reads it ("Date not confirmed · … markets are closed that day"). **The client calendar never reads `c`** (no reference in `src/`). So the two halves of the product contradict each other:

| Surface | VEEV (Thu Nov 26) | MRVL (Thu Nov 26) |
|---|---|---|
| `/api/calendar` row | `h: "amc", c: "Thanksgiving"` | `h: "", c: "Thanksgiving"` |
| Month grid cell (`DayCell`, `Calendar.tsx:98`) | count **"02"** next to "Market closed · Thanksgiving" (`shots/p_25_home_full.png`) | same cell |
| Day drawer `/?day=2026-11-26` | eyebrow **"2 REPORTING"**, VEEV under **"After close"** with the waning moon, *not* marked projected (`shots/p_21_thanksgiving_drawer.png`) | "Time TBD · Projected date" |
| Sheet `/t/VEEV` | "Date not confirmed: the data feed projects Thursday, Nov 26, when the market is closed" | same |
| Compass | — | "NOV 26 MRVL" as a plain date |

VEEV's row escapes the "projected" mark because `eventProjected` (`shared/projected.ts:26`) treats a row with a session as dated. A first-time investor opening Thanksgiving sees "the market is closed" and "2 reporting · Veeva after close" on the same screen. Focus item (1): no unknown shown as fact.

## What
- Calendar rows with `c` (grid `DayCell`, `WeekColumn`, `DayView`, `DayDrawer`, `EventRow`, week brief, Compass week list): don't count them as reporting that day and don't draw their session glyph. Group them under a "Date not confirmed" heading with one line: "Our data feed projects these on {holiday}, when markets are closed. The real date is likely the next trading days." (or similar; it must say the market is closed).
- `eventProjected` (or the row's render) treats `c` as projected regardless of `h`.
- The drawer's eyebrow on a holiday reads "Market closed", even when there are `c` rows.

## Acceptance criteria
- [x] `/?day=2026-11-26` at 390×844 and 1440×900: the eyebrow doesn't contain "reporting"; no "After close" heading; VEEV and MRVL (if MRVL is still there) sit under "Date not confirmed" with the open/dashed glyph and the sentence names Thanksgiving
- [x] The Nov 26 month cell shows no event count; the week view's Thursday column says "Market closed · Thanksgiving" and lists the rows only as unconfirmed
- [x] Compass week list marks a `c` row as "date not confirmed" (or leaves it out of a dated week)
- [x] Unit: a row `{d: holiday, h: "amc", c}` is projected by `eventProjected`; e2e on a fixture holiday row with a session asserts the drawer text at both sizes
- [x] Loading / empty / error / partial states unchanged; 0051's empty-holiday copy still holds

## Test plan
Vitest on `eventProjected` with `c`. e2e (fixtures, frozen clock): add a fixture row on 2026-11-26 with `h: "amc"`, `c: "Thanksgiving"`; open `?day=2026-11-26` and assert the eyebrow, the heading and the absence of "After close".

## Out of scope
Moving the row to a guessed date. Marvell's real date (0063).
