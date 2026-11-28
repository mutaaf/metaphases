---
id: 0117
title: Trip.com (US$30.6B) and NIO have published their Dec 1 report times, but with no override both fall to "Checking time…" on every unchecked read
status: shipped
priority: P1
size: S
lens: data-quality
created: 2026-11-27
pr: 219
by: critic
---

## Why
The operator's focus (2) is "company-published dates override Finnhub". Two of next week's companies have published theirs, and Metaphases doesn't carry either:

| Ticker | Company notice | Metaphases at 06:51–07:00 UTC, 2026-11-27 (build `9416f364`) |
|---|---|---|
| **TCOM** (US$30.6B) | Nov 19: Q3 results "on Tuesday, December 1, 2026, U.S. Time, after the market closes", call 7:00 p.m. ET ([wire copy](https://www.plataformamedia.com/en/2026/11/19/trip-com-group-limited-to-report-third-quarter-of-2026-financial-results-on-december-1-2026-u-s-time/)) | `h: ""`, `fh: "amc"`, `hu: 1` on unchecked reads; no `o` link. The phone drawer lists it under "CHECKING TIME… · 4". |
| **NIO** (US$7.6B) | Nov 17: Q3 results on Tuesday, December 1, 2026, before US markets open, call 7:00 a.m. ET ([finviz copy](https://finviz.com/news/423745/nio-inc-to-report-unaudited-third-quarter-2026-financial-results-on-tuesday-december-1-2026), [CnEVPost](https://cnevpost.com/2026/11/17/nio-schedules-q3-earnings-dec-1/)) | same: blank session, `fh: "bmo"`, no `o` |

Nasdaq agrees with both (TCOM `time-after-hours`, NIO `time-pre-market` on 2026-12-01). A company-dated row is immune to the unchecked state (0114): TD, RY, BMO, BNS and CM read their sessions on 30 of 30 reads this morning, while TCOM and NIO lost theirs on 13 of 30. The sheet says "After close" while the drawer in the same minute says "Checking time…".

## What
- Add `TCOM` and `NIO` to `data/date-overrides.json` with the sources above, `call` times and Finnhub's quarter/year labels (check them against `/api/calendar`).
- Sweep the rest of Dec 1–4 for $5B+ rows with no `o` and a company notice: ZS (none found on 2026-11-27), KR (none found), GTLB, ASAN, CRDO and the 0115 list. Record what was searched in the PR.

## Acceptance criteria
- [ ] Live: 10 reads of `/api/calendar?from=2026-11-30&to=2026-12-04`, including the first after the deploy: TCOM `h: "amc"` and NIO `h: "bmo"`, each with `o`, on 10 of 10 (unchecked reads included).
- [ ] `/t/TCOM` and `/t/NIO` sheets link the company notice, and the phone drawer for `?day=2026-12-01` never lists either under "Checking time…".
- [ ] `npm test` override validation passes (https source, checked date).
- [ ] Works at 390×844 and 1440×900.

## Test plan
The existing override tests cover the format. Add both symbols to whatever override fixture or e2e asserts that company-dated rows survive an unchecked read, if one exists.

## Out of scope
The unchecked-read rate itself (0114).

## Shipped (builder, 2026-11-28)
- `TCOM` (amc, call 7:00 p.m. ET) and `NIO` (bmo, call 7:00 a.m. ET) added to `data/date-overrides.json`, quarter labels Q3 2026 as `/api/calendar` serves them. Both wire copies read on 2026-11-27 (ET; `checked` is an ET date).
- Sweep of the other $5B+ Dec 1–4 rows with no `o` (production read 2026-11-28 03:2x UTC): GTLB, ZS, BF.B, KR. No company notice found for any of them in a web search (ZS's last call was in late November; KR and BF.B announced last year's dates about two weeks ahead). ZS is the one still blank-session ($40B): re-sweep it.
- Test: `tests/unit/announced0117Overrides.test.ts` (gate, `applyToRows`, share title, and `/api/calendar` over three ranges plus `/api/ticker` with Nasdaq unread).
