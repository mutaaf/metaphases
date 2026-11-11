---
id: 0057
title: Measure a before-the-open report's move on its own day (Walmart's "typical move ±1.0%" is really ±6.1%)
status: shipped
priority: P0
size: M
lens: data-quality
created: 2026-11-10
pr: 94
by: critic
---

## Why
Critic check 2026-11-10 19:00 UTC, build `1de09f28`. When Finnhub leaves a company's `hour` blank, `buildTicker` sets `habit = ""` (`worker/index.ts:488`), and the history loop (`:576–579`) treats a blank session like after the close. It measures **close(report day) → close(next day)**. For a company that reports before the open, that's the day *after* the reaction. So every past move, the "typical move", The Read, the share card and the Kids "last time" line are wrong for that company.

This week it hits the season's biggest retailers, which all report before the open and all have a blank Finnhub `hour`. Here are the true before-open moves, computed from the sheet's own `chart` closes (close of the day before → close of the report day):

| | Report | True move (bmo) | Metaphases `history[].move` |
|---|---|---|---|
| WMT | 2025-11-20 | **+6.46%** | −1.67% |
| WMT | 2026-05-21 | **−7.27%** | −0.88% |
| WMT | 2026-08-20 | **−9.15%** | −0.13% |
| HD | 2025-11-18 | **−6.02%** | −0.59% |
| TJX | 2026-05-20 | **+5.66%** | −1.10% |
| TGT | 2026-03-03 | **+6.74%** | −0.60% |

Typical move: **WMT shown ±1.0%, true ±6.1%**; TGT ±1.7% vs ±4.4%; TJX ±1.8% vs ±2.8%; HD ±1.9% vs ±2.3%. `/t/WMT` unfurls as "Walmart Inc. — … typical move **±1.0%** …", and The Read says "The stock has moved about ±1.0% on a typical report — that's the size of swing to be ready for." A trader sizing for Walmart's Nov 19 print is told to expect a sixth of the real swing, and several signs are flipped. After-close names with a blank `hour` (INTU) happen to come out right, because that's the branch they fall into.

Scale: 53 of the 103 calendar rows for Nov 11–24 have `h: ""` (HD, TGT, TJX, WMT, BBY, MDT, BURL, DKS, KSS, JD, BABA, …). `kidsWhy` (`worker/index.ts:922–927`) uses the same `habit` fallback.

## What
- Resolve a past report's session from the best source available, in this order: company override `hour` for that date (`data/date-overrides.json`); Finnhub's `hour` for that date; **Nasdaq's day calendar `time` for that date** (`api.nasdaq.com/api/calendar/earnings?date=`, already read and cached for past days by 0035 as `nq:cal`; `time-pre-market` → bmo, `time-after-hours` → amc); then the company's habit from those sources (the 0015/0050 Nasdaq-agreed upcoming session counts).
- If the session is still unknown, set `move: null` ("—") and leave the quarter out of `expectedMove`. Never default an unknown session to after the close.
- The same rule applies in `kidsWhy` and any other `closeOn(…, ±1)` pair (the `lastE` and `reported` branches at `:597`, `:606`).
- History rows carry the resolved session, so the sheet's history list shows the right glyph.
- Bump the sheet cache key (`tk:` and `tk:stale:`), so ±1.0% copies don't outlive the fix (LESSONS 2026-11-04).

## Acceptance criteria
- [ ] Worker unit test (made-up symbol, LESSONS 2026-11-06): Finnhub `hour: ""`, Nasdaq day `time-pre-market` on the report date, a chart with a +6% gap on the report day → `history[0].move ≈ +6`, `session: "bmo"`
- [ ] Unit test: no session from any source → `move: null`, and the quarter isn't counted in `expectedMove`
- [ ] On production after deploy: `/api/ticker/WMT` `history` has 2025-11-20 at +6.4% ±0.2 and `expectedMove` between 5 and 7; HD's 2025-11-18 row is −6.0% ±0.2; TGT's 2026-03-03 row is +6.7% ±0.2
- [ ] `/t/WMT` `og:description` doesn't say "typical move ±1.0%"
- [ ] No more than one extra Nasdaq day call per uncached past report date (shared `nq:cal` cache), and the sheet still builds under the 0043 degraded-sheet rules when Nasdaq fails (move `null`, not wrong)
- [ ] Works at 390×844 touch and 1440×900

## Test plan
Worker unit tests with mocked Finnhub, Nasdaq and Yahoo (`tests/unit/`). Live check: the true-move table above, recomputed from `/api/ticker/SYM` `chart` (close the day before vs close on the report day).

## Out of scope
Filling the *upcoming* session (0050). Intraday reactions (only daily closes). Changing `shared/grades.ts`.

## Built (builder, 2026-11-11)
`shared/reaction.ts` (`reactionMove`, `sessionHabit`), used by every move in `buildTicker` (the Nasdaq history rows, the `lastE` row, the 0039 reported row) and by `kidsWhy`'s habit. Before the open or during hours: close the day before → close on the day. After the close: close on the day → close the next day. An unknown session gives `move: null` and stays out of `expectedMove`; it's never read as after the close. A past report's session comes from that date's calendar row (Finnhub, with company overrides applied), else the habit: Finnhub's next session, then **Nasdaq's listing for the next report date** (the 0015 window, or the single cached `nq:x:v1:<date>` day; cache only, no new upstream call on the sheet path), then Finnhub's last.

**Nasdaq's day calendar doesn't help for past dates.** Checked 2026-11-11: it returns `time-not-supplied` for every row once a date is about a week old (Nov 5: 568 of 573; Oct 28, Oct 21, Jul 23: all), including WMT 2025-11-20, 2026-05-21 and 2026-08-20, and HD, TGT and TJX's past dates. So no per-date Nasdaq call was added (it would cost calls and give nothing). WMT's upcoming Nov 19 *is* `time-pre-market` on Nasdaq (the calendar already shows it as bmo with `x: agree`), and that habit now measures WMT's past moves. TGT and TJX have no session in either feed, so their moves read "—" until one does. That's honest, where before they were wrong.

Sheet cache keys bumped (`tk:v4`, `tk:stale:v3`, OG `v5`). Tests: `tests/unit/reactionSession.test.ts`.

## Critic re-check 2026-11-11 07:00 UTC (bounce 1 of 2: WMT misses its bar)
Build `2c914c67` has #90. **HD and TGT pass:** HD 2025-11-18 is −6.02% (bar −6.0 ±0.2), TGT 2026-03-03 is +6.74% (bar +6.7 ±0.2), and TGT's typical move is ±4.4%. The wrong-day numbers are gone everywhere I looked.

**WMT fails the bar.** `/api/ticker/WMT` has `next.session: ""`, every `history[].move` is `null`, and `expectedMove` is `null` (bar: 2025-11-20 at +6.4% ±0.2 and `expectedMove` between 5 and 7). The phone sheet's TYPICAL MOVE reads "—" (`shots/p__t_WMT.png`), and the og description no longer mentions a typical move at all. It's honest now, but the season's most-watched retailer has a blank swing. The fix relied on the 0015 window for the habit, and at 06:30 UTC the calendar had no `x` on Nov 19 (15 of 56 Nov 16–20 rows had `x`; Nov 18's TGT and TJX had `x: agree, xh: bmo`, Nov 19's WMT and INTU had none). Nasdaq's day calendar for Nov 19 already says `time-pre-market` for WMT and `time-after-hours` for INTU, so the window hasn't filled yet, or skips that day.

INTU is the same case for the after-close side: Intuit's own release (Oct 29, [Business Wire](https://www.businesswire.com/news/home/20261029032784/en/Intuit-to-Announce-First-Quarter-Fiscal-Year-2027-Results-on-Nov.-19)) says Nov 19 after the close, and the sheet's typical move is "—".

Still to meet: the habit mustn't depend on whether the 0015 window happens to have reached the date. Use a company override `hour` when there is one (0050 adds WMT, TGT, TJX and INTU), and otherwise the cached Nasdaq day for the upcoming date, read on demand once per day.

## Built again (builder, 2026-11-11, after bounce 1)
The habit no longer waits for the 0015 window. When the next report's row has no session and the window hasn't loaded that day (no window in this colo, or the date isn't in it yet), the sheet (and `kidsWhy`) reads **that one Nasdaq day on demand** (`nasdaqDayOnDemand`, `worker/index.ts`). This deliberately lifts the 0015 rule "no upstream call on the sheet path" for this one read, which is bounded:
- It shares the window's `nq:x:v1:<day>` cache (6 h) and its 15-minute failure memory, so a day's reporters cost about one Nasdaq call per colo per 6 h.
- It only reads upcoming days within 45 days. Past days' sessions are wiped (LESSONS 2026-11-11).
- It has a 2.5 s timeout. A Nasdaq failure leaves the move "—", never the after-close guess.
- No promise is shared across requests: a cancelled request mustn't strand another.

A company override's `hour` comes first, on the sheet and now in `kidsWhy` too (`applyToRows`; a `source` row skips Nasdaq), so 0050's WMT/TGT/TJX/INTU overrides win once they land.

No cache key bump: the sheet lives 5 minutes, and cached copies hold "—", not a wrong number.

Tests in `tests/unit/reactionSession.test.ts`:
- nothing cached, Nasdaq pre-market → +6% from one shared call
- Nasdaq 503 → `move: null`, no retry
- a folded window that hasn't loaded the day still reads it
- a loaded day without the company makes no call
- more than 45 days out makes no call

Known limit (design, not new): the upcoming session is applied to past reports that have no row of their own, so a company that switched sessions this quarter would have older moves measured on the new session's day.
