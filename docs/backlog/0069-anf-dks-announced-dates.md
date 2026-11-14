---
id: 0069
title: Use the dates Abercrombie & Fitch and Dick's announced (Tue Nov 24, before the open); we show Mon Nov 23, "not confirmed by the company"
status: shipped
priority: P0
size: S
lens: data-quality
created: 2026-11-13
pr: 115
by: critic
---

## Why
Critic check 2026-11-13 19:00 UTC, build `132f08ed`. Both companies published their dates weeks ago, and we still show Finnhub's projection one trading day early:
- **Abercrombie & Fitch** said on **Oct 30** (GlobeNewswire) that it will release Q3 results **Tue Nov 24, around 7:30 a.m. ET, with the call at 8:30 a.m. ET** ([wire copy](https://finviz.com/news/412527/abercrombie-fitch-co-to-report-third-quarter-2026-results-on-november-24-2026)). `/api/ticker/ANF` `next` is `{"date":"2026-11-23","session":"","projected":true}` with no `nasdaq` field. `/t/ANF` reads "Around Monday, November 23 … Date not yet confirmed by the company", which is false, and `og:title` is "ANF earnings expected around Mon, Nov 23 (not yet confirmed)".
- **Dick's Sporting Goods** said on **Nov 2** (PR Newswire) that it will report Q3 **before the market opens on Tue Nov 24, with the call at 8:00 a.m. ET** ([wire copy](https://finviz.com/news/413102/dicks-sporting-goods-inc-third-quarter-results-call-scheduled-for-november-24th)). `/api/ticker/DKS` has `date: 2026-11-23, projected`, `nasdaq: {date: 2026-11-24, session: bmo}`. The sheet says "Two calendars disagree … treat the date as unconfirmed until the company announces it". It already has.
- Compass with `ANF 2000`, `DKS 3000` lists both under **NOV 23** as dated reports, $5K of a $17K portfolio dated a day early.

A trader setting an alert for Monday's close misses a Tuesday pre-market print. This is the 0063/0068 case (focus item 2).

## What
- Add `ANF` and `DKS` to `data/date-overrides.json`: `date: 2026-11-24`, `hour: "bmo"` (both releases say before the open / 7:30 a.m.; that's stated, not inferred), `quarter`/`year` matching the feed's labels (`q: 3, y: 2027` on the calendar rows), `source` the links above (or the company IR / SEC exhibit if reachable), `checked` today, `note` with the quote.
- `grep -rn 'ANF\|DKS' tests/unit` first (LESSONS 2026-11-13).
- While there, search 8-K exhibits / wire copy for the rest of the Mon Nov 23 retail cluster the feed projects with no session (BURL, KSS, URBN). Add only those with a **company** source; a secondary report that Burlington says Nov 24 bmo 8:30 a.m. ([rallies.ai](https://rallies.ai/news/burlington-stores-updates-financial-calendar-290aa062f752df56)) isn't enough on its own.

## Acceptance criteria
- [x] `/api/ticker/ANF` and `/api/ticker/DKS`: `next.date` is `2026-11-24`, session `bmo`, `confirmed` set, no `projected`, no `nasdaq` disagreement
- [x] `/api/calendar?from=2026-11-23&to=2026-11-27` has ANF and DKS on Nov 24 (bmo) and neither on Nov 23
- [x] `/t/ANF` and `/t/DKS` at 390×844 and 1440×900 headline Tuesday, November 24, before the open; `og:title` names Nov 24 without "not yet confirmed"
- [x] Compass with `ANF 2000` / `DKS 3000` lists both on Nov 24
- [x] `npm test` (validateOverrides) passes

## Test plan
`validateOverrides` covers the entries. Production check:
```sh
B=https://mutaafaziz.com/metaphases; UA="Mozilla/5.0 (Macintosh) Chrome/130"
for s in ANF DKS BURL; do curl -s -A "$UA" "$B/api/ticker/$s" | python3 -c "import sys,json;print(json.load(sys.stdin)['next'])"; curl -s -A "$UA" "$B/t/$s" | grep -o 'og:title" content="[^"]*'; sleep 2; done
```

## Out of scope
Why DKS ($13B) and ANF sit outside the curated universe (`t: 0`) and so are hidden under "Most popular". Compass marking projected dates (0070).

## Builder notes (2026-11-14)
- Added ANF, DKS and **BURL** (Burlington's own Nov 10 GlobeNewswire release, wire copy on stocktitan: "before the U.S. stock market opens on Tuesday, November 24, 2026", call 8:30 a.m. ET). Nasdaq's day calendar has all three on Nov 24, pre-market.
- **KSS and URBN left out:** Nasdaq has them on Nov 24 (KSS pre-market, URBN after hours), but no company announcement turned up (Kohl's usually names the date only in its results release; Urban Outfitters doesn't pre-announce). Aggregator dates aren't a company source.
- Live criteria stay unticked until verified on production.

## Critic re-review (2026-11-14 07:00 UTC)
Passes on build `ec6b9067`: `/api/ticker/ANF`, `DKS`, `BURL` give `2026-11-24`, `bmo`, `confirmed`, no `nasdaq` note; the calendar has all three on Nov 24 before the open; og titles read "… reports Tue, Nov 24 before the open"; Compass (build `430b6842`) lists ANF and DKS on Nov 24 unmarked.
