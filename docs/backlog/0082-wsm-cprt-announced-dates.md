---
id: 0082
title: Williams-Sonoma and Copart have announced dates the feed gets wrong (WSM shown as "results expected today, Nov 17"; it reports Thu Nov 19)
status: shipped
priority: P0
size: S
lens: data-quality
created: 2026-11-17
pr: 141
by: critic
---

## Why
Critic check 2026-11-17 19:00 UTC, build `d5177411`. Two more companies have published dates that the feed has wrong:

| Ticker | Metaphases | Company | Source |
|---|---|---|---|
| **WSM** | Tue **Nov 17**, before open. Whenever the Nasdaq cross-check is cold (0083), the sheet reads "Results were expected before open today. None are in our data yet" and og:title reads "WSM's Q3 results expected: none in yet" (`shots/p_t_WSM.png`, 18:52 UTC). When it's warm: "WSM reports Tue, Nov 17 (unconfirmed; Nasdaq lists Thu, Nov 19)" | **Thu Nov 19, before the open**; call 10:00 a.m. ET (announced Nov 12) | [company release via StockTitan](https://www.stocktitan.net/news/WSM/williams-sonoma-inc-announces-release-date-for-third-quarter-results-mai48begxnh3.html); Nasdaq: Nov 19, pre-market |
| **CPRT** | Wed **Nov 18**, time TBD (projected); x-check says Nasdaq lists Nov 19 | **Tue Dec 1, before the open**; call 8:00 a.m. ET (announced today, Nov 17, 7:00 a.m. CT) | [Business Wire via Yahoo Finance](https://finance.yahoo.com/markets/stocks/articles/copart-inc-release-first-quarter-130000894.html) |

Both disagree with the company, and Copart's real date is neither the feed's nor Nasdaq's. Focus item 2: company-published dates override the feed.

Also: since this morning the feed itself moved **INTU** to Thu Nov 19 (`x: agree`), so 0081's Intuit row now only adds "confirmed".

## What
- Add to `data/date-overrides.json`: WSM (2026-11-19, bmo, stated "before the market opens"), CPRT (2026-12-01, bmo, stated "before the market opens"). Use the feed's quarter/year labels (WSM Q3 2027, CPRT Q1 2027).
- Make sure the WSM row leaves Nov 17 (and doesn't stay behind as a figure-less "past" row on Nov 17) and CPRT leaves Nov 18.
- If it fits in the same PR, sweep the Nov 18–Dec 4 rows that Nasdaq contests on date for a company notice. At 19:00 UTC that's PDD, WSM, CPRT plus the rows in 0081. List any you checked and left alone in the PR.

## Acceptance criteria
- [x] `/api/ticker/WSM` → next `{2026-11-19, bmo, confirmed}`; the Nov 17 drawer no longer lists WSM; og:title has no "results expected"
- [x] `/api/ticker/CPRT` → next `{2026-12-01, bmo, confirmed}`; the Nov 18 and Nov 19 cells don't list CPRT; the Dec 1 cell does
- [x] Unit: the override validator accepts both rows (https source, `checked` in New York time)
- [x] Works at 390×844 touch and 1440×900 (Critic 2026-11-18: sheet checked at both sizes, no overflow)

## Test plan
Override-table unit tests; e2e unchanged (live data).

## Out of scope
Why a contested row reads "results expected" when the cross-check is cold (0083).

## Shipped notes
- Both releases re-read 2026-11-18 UTC: WSM "on Thursday, November 19th, 2026 before the market opens" (call 10:00 AM ET); CPRT "before the market opens" on Tuesday, December 1, 2026 (call 8:00 a.m. ET, Q1 fiscal 2027).
- `tests/unit/announced0082Overrides.test.ts`: the gate accepts both rows; through the worker at Nov 17 8 pm ET, WSM leaves Nov 17 (no figure-less leftover, no "results pending"), CPRT leaves Nov 18/19 and sits on Dec 1, both `next` confirmed with the company link.
- Layout criterion left open: data-only change, no UI touched; checked on production after deploy.
- The optional Nov 18–Dec 4 contested-date sweep was not done in this PR (one concern per PR); the Critic's next pass should list any remaining contested rows.
