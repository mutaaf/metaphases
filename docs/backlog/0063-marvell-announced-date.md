---
id: 0063
title: Use the date Marvell announced (Tue Dec 1); every surface puts it on Thanksgiving, Thu Nov 26
status: ready
priority: P0
size: S
lens: data-quality
created: 2026-11-13
pr:
by: critic
---

## Why
Critic check 2026-11-13 07:00 UTC, build `341dc9e0`. On **Nov 6** Marvell announced a conference call for its fiscal Q3 2027 results on **Tuesday, December 1, 2026 at 1:30 p.m. PT** ([Business Wire, Nov 6](https://www.businesswire.com/news/home/20261106322575/en/Marvell-Technology-Inc.-Announces-Conference-Call-to-Review-Third-Quarter-of-Fiscal-Year-2027-Financial-Results); same on [Yahoo Finance](https://finance.yahoo.com/markets/stocks/articles/marvell-technology-inc-announces-conference-140500096.html) and [Stock Titan](https://www.stocktitan.net/news/MRVL/marvell-technology-inc-announces-conference-call-to-review-third-b5i9e17446bh.html)). A week later Metaphases still has Finnhub's projection, **Thu Nov 26 (Thanksgiving)**:
- `/api/ticker/MRVL` `next`: `{"date":"2026-11-26","session":"","closed":"Thanksgiving"}`. The sheet says "Date not confirmed · The data feed projects Thursday, November 26, but markets are closed that day" (`shots/p_04_t_MRVL.png`). That's honest about the feed, but the date *is* confirmed, by the company, and we don't show it.
- `/api/calendar` row `{"s":"MRVL","d":"2026-11-26","h":"","c":"Thanksgiving"}`: the Nov 26 drawer lists MRVL under "Time TBD" as "Projected date" (`shots/p_21_thanksgiving_drawer.png`), and Dec 1 doesn't list it at all.
- Compass puts $2K of a sample portfolio on "NOV 26 MRVL" in its week-by-week list (`shots/p_30_compass.png`).
- `og:title` is "MRVL earnings: date not confirmed yet".

Marvell is a $172B chip name with a pending Lumentum deal; a trader planning around Dec 1 gets the wrong week from us. 0045 built the override path for exactly this.

## What
- Add `MRVL` to `data/date-overrides.json`: `date: 2026-12-01`, `quarter: 3`, `year: 2027`, `source` the Business Wire link, `checked` today. Add `hour: "amc"` only if you find Marvell's own wording for the release time (LESSONS 2026-11-10: a call time alone isn't a session; a 1:30 pm PT call strongly suggests after the close, so say that in `note`, not in `hour`).
- Nothing else; the override path does the rest.

## Acceptance criteria
- [ ] `/api/ticker/MRVL` `next.date` is `2026-12-01` with `confirmed` set, and no `closed`
- [ ] `/api/calendar?from=2026-11-23&to=2026-12-04` has MRVL on Dec 1 and not on Nov 26
- [ ] `/t/MRVL` at 390×844 and 1440×900 headlines Tuesday, December 1 (no "Date not confirmed"); `og:title` names Dec 1
- [ ] Compass with `MRVL 2000` lists it in the week of Nov 30
- [ ] `npm test` (validateOverrides) passes

## Test plan
`validateOverrides` covers the entry. Production check:
```sh
B=https://mutaafaziz.com/metaphases; UA="Mozilla/5.0 (Macintosh) Chrome/130"
curl -s -A "$UA" "$B/api/ticker/MRVL" | python3 -c "import sys,json;print(json.load(sys.stdin)['next'])"
curl -s -A "$UA" "$B/t/MRVL" | grep -o 'og:title" content="[^"]*'
```

## Out of scope
How the calendar draws a row on a closed day (0064). Veeva (also on Nov 26 in the feed) hasn't announced, so it gets no override.
