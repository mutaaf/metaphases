---
id: 0080
title: Intuit announced Thu Nov 19 (we say Fri Nov 20) and Deere reports before the open (we say after the close)
status: ready
priority: P0
size: S
lens: data-quality
created: 2026-11-17
pr:
by: scout
---

## Why
Scout check 2026-11-17 02:40 UTC, build `ec1b5d00`. Two companies in the next ten days are wrong or contested on the calendar and the sheet:

- **INTU**: Intuit's Business Wire notice (Oct, [wire copy](https://finviz.com/news/412066/intuit-to-announce-first-quarter-fiscal-year-2027-results-on-nov-19)) says Q1 FY27 results come **Nov 19 after the close**, call 1:30 p.m. PT. `/api/ticker/INTU` `next` is `{date: 2026-11-20, session: amc}` and the calendar has the row on **Fri Nov 20**. A user planning around Friday misses the report by a day. It is the third-largest name reporting Nov 19–20 ($91B).
- **DE**: Deere's PRNewswire notice (Nov 11, [wire copy](https://finviz.com/news/421094/deere-to-announce-fourth-quarter-2026-financial-results)) gives the call for **Wed Nov 25, 9:00 a.m. CT**. Our row is `amc` (feed), while Nasdaq lists `bmo` (`next.nasdaq.session`). Deere releases before the open, so the glyph and "after the close" copy are wrong. The date itself is right.

Same class as 0052, 0055, 0063, 0068, 0069, 0075 and 0079 (announced dates the feed missed or got wrong).

## What
- Add INTU (2026-11-19, `amc`) to the company-date overrides with the Intuit URL above. Add DE (2026-11-25, `bmo`) with the Deere URL; for DE, confirm the release time in Deere's own release (the notice gives only the call time) and, if it can't be confirmed, say so in the PR and use the Nasdaq session as an expected one rather than a confirmed one.
- Check `grep -rn "INTU\|DE" tests/unit` for tests that mock these symbols' feed before adding the entries (LESSONS 2026-11-13).
- Sweep the other Nov 23–Dec 4 rows once more for a wire notice that disagrees with the feed (HPE Nov 23 amc matches; WDAY, DE-like cases excluded); list the ones without a notice in the PR.
- Use the New York date for `checked` (LESSONS 2026-11-17).

## Acceptance criteria
- [ ] `/api/ticker/INTU` → `{date: 2026-11-19, session: amc, confirmed: <Intuit URL>}`; the calendar row for INTU is on Nov 19 with `o` in every range that includes Nov 19 or 20 (Nov 16–20 week, Nov 19 alone, a month range), and Nov 20 has no INTU row
- [ ] `/api/ticker/DE` shows the before-open session, and the calendar row is `bmo`; og:title for both matches the sheet
- [ ] 390×844 and 1440×900: INTU sits in the Nov 19 cell/drawer and DE shows the before-open glyph
- [ ] Nothing shows "Date not yet confirmed" for either; a cold or partial read keeps the override

## Test plan
Extend the company-date override unit tests (`dateOverrides.test.ts`, as 0079's `announcedNov24Overrides.test.ts` does) with INTU (feed Nov 20 → Nov 19 amc) and DE (feed amc, Nasdaq bmo → bmo), and a worker test that Nov 20's range drops the INTU row.

## Out of scope
Changing how overrides are validated; the Hype Check or Today copy.
