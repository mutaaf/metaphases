---
id: 0062
title: A contested session isn't headlined as fact (ROAD and DE read "After close" while their own moves, and ROAD's 10:00 am call, say before the open)
status: in-progress
priority: P0
size: S
lens: data-quality
created: 2026-11-12
pr:
by: critic
---

## Why
Critic check 2026-11-12 19:00 UTC, build `2f9b62d2`. 0060 fixed the *numbers* on a contested session: DE's typical move is now ±7.9% and ROAD's ±10.3%, measured on the report day because that's where the stock has moved. The *headline* still states Finnhub's session as fact. The sheet's next-report card shows the waning-moon glyph and **"After close"** in large type. Two lines below it says the moves are measured "as for a report before the open". The calendar tile carries the same waning glyph. Meanwhile `og:title` says "time unconfirmed". So the product says three different things about one session, and the biggest one is the one it has the least reason to believe.

| Ticker | Sheet headline · calendar `h` | Nasdaq | Stock's own closes (0060 rule) | Company |
|---|---|---|---|---|
| ROAD Thu Nov 19 | **After close** · `amc` | pre-market | before the open, in 4 of 4 (+19.5/+6.9/+11.2/−3.6 on the report day vs −1.3/−3.6/−0.5/+0.7 the day after) | **Conference call Thu Nov 19 at 10:00 a.m. ET** for the quarter and year ended Sep 30 ([Construction Partners, Nov 5, wire copy](https://finviz.com/news/416986/construction-partners-inc-announces-preliminary-fiscal-2026-financial-results-and-introduces-fiscal-2027-outlook)). A morning call on the report day rules out "after close". |
| DE Wed Nov 25 | **After close** · `amc` | pre-market | before the open, in 3 of 3 | not announced yet; FY25 Q4 came out the morning of Nov 26, 2025 |
| WMG Thu Nov 19 | After close · `amc` | pre-market | after the close (4 of 4) | — (the headline happens to match the inferred session here) |

The copy also says "Treat the **date** as unconfirmed until the company announces it", but the date isn't in dispute on these rows (`xd` equals the row's date). Only the time is.

The moon glyph is the product's core idea (principle 5), and focus item (2) is "every date and session correct". A trader who reads "After close" on ROAD will be flat at the open when the stock historically moves 10%.

## What
- **Sheet** (`TickerSheet.tsx` next-report card; `next.nasdaq.session` differs from `next.session` on the same date, no override): headline the time as **"Time unconfirmed"** with the neutral/unknown glyph, followed by both claims ("our data feed: after the close · Nasdaq: before the open"). If `moveSession.session` is set, add "Past moves point to before the open." The disagreement note says "time", not "date", when `nasdaq.date === next.date`.
- **Calendar** (`DayCell`, `EventRow`, week brief): a same-date `x: "differs"` row with `xh` set shows the unknown glyph (or both half-glyphs), not Finnhub's, and keeps the "Nasdaq: before open" marker.
- **The Read and og:** already say "unconfirmed"; keep them consistent with the headline. `.ics` items for such rows don't state a session in the summary.
- **ROAD override** in `data/date-overrides.json`: date Nov 19 with the Nov 5 notice as `source`. Add `hour` only if you find the company's own release time (LESSONS 2026-11-10: a call time alone isn't a session). With the override in place, the "two calendars disagree" note goes away for ROAD by design.
- Don't change which session the *moves* use; 0060 owns that and passes.

## Acceptance criteria
- [ ] `/t/DE` at 390×844 and 1440×900: the next-report card doesn't contain the text "After close" as the headline session; it reads "Time unconfirmed" and names both sessions; no waning glyph in the card
- [ ] The disagreement note on DE says the *time* is unconfirmed, not the date
- [ ] The calendar tile for DE on Wed Nov 25 (month and week views) doesn't render Finnhub's session glyph; the day drawer lists DE under an "unconfirmed time" group or with both sessions
- [ ] `/api/ticker/ROAD` `next` carries the override (`source` set, date 2026-11-19); `/t/ROAD` og:title no longer says "after the close"
- [ ] WMG, whose inferred session matches the feed, still shows the disagreement (not a confident "After close")
- [ ] Unit/e2e (made-up symbol): feed `amc`, Nasdaq `bmo`, same date, no override → the sheet card and the calendar tile both render the unconfirmed state at 390×844 and 1440×900
- [ ] Loading / empty / error / partial states unchanged

## Test plan
e2e on `xcheck.spec.ts` (extend the 0059/0060 fixture: a same-date differs row) asserting the headline text and glyph class on the sheet and the tile. `validateOverrides` gated on the ROAD entry only at its own day (LESSONS 2026-11-10). Production check:

```sh
B=https://mutaafaziz.com/metaphases; UA="Mozilla/5.0 (Macintosh) Chrome/130"
for s in DE ROAD WMG; do curl -s -A "$UA" "$B/api/ticker/$s" | python3 -c "import sys,json;d=json.load(sys.stdin);print('$s',d['next'].get('session'),d['next'].get('nasdaq'),d['next'].get('source'),d.get('moveSession'))"; sleep 4; done
for s in DE ROAD; do curl -s -A "$UA" "$B/t/$s" | grep -o '<meta[^>]*og:title[^>]*>'; sleep 3; done
```

## Out of scope
Which session the past moves use (0060). Rows whose *date* differs (0059 already handles those). Rows with no Nasdaq session.
