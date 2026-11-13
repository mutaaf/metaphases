---
id: 0068
title: Use the date Dollar Tree announced (Tue Nov 24, before the open); we show a projected Dec 1
status: shipped
priority: P0
size: S
lens: data-quality
created: 2026-11-13
pr: 112
by: scout
---

## Why
Scout check 2026-11-13, build `3611c272`. On **Nov 3** Dollar Tree filed an 8-K (exhibit 99.1, "Q3 FY2026 earnings call announcement") saying it will release third-quarter fiscal 2026 results **Tuesday, November 24, 2026, before the stock market opens**, with a call at 8 a.m. ET ([SEC exhibit](https://www.sec.gov/Archives/edgar/data/0000935703/000093570326000128/ex991q3-26earningscallanno.htm)). Nasdaq's day calendar agrees (Nov 24, $26B). Metaphases still has the feed's projection:
- `/api/ticker/DLTR` `next`: `{"date":"2026-12-01","session":"","projected":true}`.
- `/api/calendar?from=2026-11-16&to=2026-11-27` has no DLTR row on Nov 24, so a user planning the Thanksgiving week doesn't see it.

A $26B retailer reporting a week before we say it will is the 0045 case: the company published the date, both our feed and the cross-check miss it.

## What
- Add `DLTR` to `data/date-overrides.json`: `date: 2026-11-24`, `hour: "bmo"` (the 8-K says "before the stock market opens", so the session is stated, not inferred), `quarter: 3`, `year: 2027` (Finnhub's label for this fiscal-2026 quarter, per `/api/ticker/DLTR` `next`), `source` the SEC link, `checked` today, `note` with the quote.
- `grep -rn DLTR tests/unit` first (LESSONS 2026-11-13) so no worker test that mocks DLTR turns red.
- Nothing else; the override path does the rest.

## Acceptance criteria
- [ ] `/api/ticker/DLTR` `next.date` is `2026-11-24`, session before the open, `confirmed` set, not projected
- [ ] `/api/calendar?from=2026-11-23&to=2026-11-27` has DLTR on Nov 24 (before open) and `to=2026-12-04` has none on Dec 1
- [ ] `/t/DLTR` at 390×844 and 1440×900 headlines Tuesday, November 24; `og:title` names Nov 24
- [x] `npm test` (validateOverrides) passes

## Test plan
`validateOverrides` covers the entry. Production check:
```sh
B=https://mutaafaziz.com/metaphases; UA="Mozilla/5.0 (Macintosh) Chrome/130"
curl -s -A "$UA" "$B/api/ticker/DLTR" | python3 -c "import sys,json;print(json.load(sys.stdin)['next'])"
curl -s -A "$UA" "$B/t/DLTR" | grep -o 'og:title" content="[^"]*'
```

## Out of scope
Other names the scout diff flagged that haven't announced (WSM Nov 17 vs Nasdaq Nov 18, CPRT, PDD, VEEV): the 0015 cross-check already covers disagreeing feeds. Foreign filers absent from the calendar (BHP Nov 17, TCOM, BEKE, ESLT) belong to 0024's follow-up.
