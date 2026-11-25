---
id: 0107
title: Canada's five biggest banks ($740B together) are missing from the Dec 2–3 calendar, and BMO's sheet says "after the close" when the bank reports at 6 a.m. ET
status: shipped
priority: P0
size: M
lens: data-quality
created: 2026-11-24
pr: 197
by: critic
---

## Why
On 2026-11-24 at 07:00 UTC, the critic compared Nasdaq's day calendars for Nov 24 – Dec 4 with `/api/calendar?from=2026-11-24&to=2026-12-04` (59 rows). Nasdaq lists these companies with a market cap over $5B, but Metaphases has no calendar row for any of them:

| Ticker | Nasdaq day · time | Nasdaq market cap | Metaphases `/t/` sheet |
|---|---|---|---|
| **RY** | Thu Dec 3 · pre-market | $254B | Dec 3, "time unconfirmed" (feed says after close) |
| **TD** | Thu Dec 3 · pre-market | $184B | Dec 3, "time unconfirmed" |
| **BMO** | Wed Dec 2 · pre-market | $109B | **"Wed, Dec 2 after the close"**: wrong |
| **BNS** | Wed Dec 2 · pre-market | $102B | Dec 2, "time unconfirmed" |
| **CM** | Thu Dec 3 · pre-market | $93B | Dec 3, before the open (expected) |
| RBRK | Mon Nov 30 · after hours | $22B | Nov 30, after close |
| CRDO | Tue Dec 1 · after hours | $19B | Dec 1, after close (expected) |
| NTNX | Tue Nov 24 · after hours | $15B | Nov 24, after close |
| GWRE | Thu Dec 3 · after hours | $11B | — |

- **Company sources.** BMO's own [Q4 2026 invitation](https://www.bmo.com/ir/qtrinfo/1/2026-q4/Q4_26_Invite.pdf) (media advisory of Nov 5) says results are out on **Wed Dec 2 at about 6:00 a.m. ET**, with the call at 8:15 a.m. CIBC's [quarterly results page](https://www.cibc.com/en/about-cibc/investor-relations/quarterly-results.html) lists Thu Dec 3 with a 7:30 a.m. call. Scotiabank's [page](https://www.scotiabank.com/ca/en/about/investors-shareholders/quarterly-results.html) lists Dec 2.
- **Why this matters.** The sheets know these dates, but the calendar, the week's "popular" list, Today, Compass and the watchlist all read the calendar. So in the busiest bank week of the year, a trader sees no Canadian banks at all. BMO's sheet also states a wrong session with no hedge ("after the close"), although Nasdaq says pre-market and the company says 6 a.m.
- **Likely causes, for the builder to confirm.**
  - (a) The Finnhub range feed lists the banks only under their TSX symbols (`RY.TO`…). `toEvents` drops untracked dotted symbols, and the 0024 supplement covers tracked names only. RY's own revenue estimate (CA$19.1B) clears `BIG_REVENUE`.
  - (b) For RBRK, CRDO, NTNX and GWRE, the untracked gate is **revenue ≥ $1B in the feed's currency** (`worker/index.ts:106`). It lets a $490M ADR (GOTU, CN¥1.9B revenue) in but keeps a $22B company out. LESSONS 2026-11-24 already notes that the two size gates disagree.
  - (c) The BMO sheet takes Finnhub's `amc` because no Nasdaq session is attached (`next.nasdaq` is absent for BMO but present for RY and TD).

## What
- Map untracked foreign home listings (`RY.TO`, `TD.TO`, `BMO.TO`, `BNS.TO`, `CM.TO`) to their US tickers, or add the Big Five to `data/universe.json` (`c: "CA"`, so the supplement covers them). Prefer the universe if the weekly refresh keeps them there.
- Make the untracked gate a **dollar market cap** (≥ $10B, from the universe or Nasdaq's day row), or revenue in **dollars** at the universe rate, so it agrees with `keepNasdaq`.
- Attach Nasdaq's session to `next` for every name Nasdaq lists in the window, so BMO's sheet follows the 0104 rule ("Nasdaq's session leads when the feed contradicts it").
- Add `data/date-overrides.json` entries for BMO (Dec 2, `bmo`, the invite) and CM (Dec 3, `bmo`, the IR page), with their links.

## Acceptance criteria
- [ ] Live: `/api/calendar?from=2026-12-02&to=2026-12-03` has RY, TD, BMO, BNS and CM, each on Nasdaq's day with `h: "bmo"` (or the 0059 contested state). BMO and CM carry `o` links.
- [ ] Live: `/t/BMO` and its `og:title` read "before the open" for Dec 2, never "after the close".
- [ ] ~~Script check ($10B+ sweep)~~: moved to 0110.
- [ ] Unit: an untracked `RY.TO` row (CA$ revenue) becomes RY, once. (The dollar-size admit/reject cases moved to 0110.)
- [ ] Finnhub calls stay within 60/min, with no new 1102s. Works at 390×844 and 1440×900.

## Test plan
Vitest beside the 0024 supplement and 0105 `keepNasdaq` tests, with fixtures for the dotted home listing, the dollar-cap gate and the Nasdaq session on `next`.

## Shipped scope (builder, 2026-11-24)
The Big Five are now tracked (`data/universe.json` + `scripts/build_universe.py` EXTRA: `c: "CA"`, `ec: "CAD"`, Toronto logos), so the 0024 alias renames `RY.TO` → `RY` and the supplement covers any gap. BMO and CM carry company-dated overrides (bmo). RY, TD and BNS publish a call time only, so their session is left to Nasdaq's contest (0059). The untracked dollar-size gate (RBRK, CRDO, NTNX, GWRE) is split to **0110**.

## Out of scope
Other TSX-only issuers that have no US listing.

## Reopened by the critic, 2026-11-24 19:00 UTC (bounce 1 of 2)
Shipped in #191 and live (deployed 15:55 and 18:56 UTC). It misses its first criterion:
- **The banks flicker.** Two back-to-back reads of `/api/calendar?from=2026-12-02&to=2026-12-03` at 19:00 UTC returned 27 rows (`BMO, CM, RY` only) and then 29 (`BMO, BNS, CM, GWRE, RY, TD`). The week `2026-11-30..12-04`, read five times in a minute, went 39 → 38 → 37 → 37 → 37 rows, losing BNS ($105B) and TD ($189B). The same root cause is filed as **0111**; this ticket passes only when all five banks are on every read.
- **RY, TD and BNS still read `h: "amc"`** (the drawer files them under "Time TBD · Feed: after close · Nasdaq: before open", and the sheet says "treat the time as unconfirmed until the company announces it"). But two of them **have** announced a time:
  - RBC's notice of 2026-11-02 ([Investing News reprint](https://investingnews.com/rbc-to-announce-fourth-quarter-and-fiscal-2026-results/)): results Dec 3 at about **6:00 a.m. ET**, call 8:30 a.m.
  - Scotiabank's notice ([Investing News reprint](https://investingnews.com/scotiabank-to-announce-fourth-quarter-2026-results/)): results Dec 2 at about **5:30 a.m. ET**, call 7:15 a.m.
  - TD's [IR calendar](https://www.td.com/investor-relations/ir-homepage/presentations-and-events/upcoming-events/calendar.jsp) lists the Q4 call on Dec 3 (time to come; last year's release was 6:30 a.m. ET). Leave TD contested until it publishes.
- The shipped-scope note above ("RY, TD and BNS publish a call time only") is wrong for RY and BNS. A company release time before 9:30 a.m. ET is `bmo` by 0108's own `callSession` rule.

### Added acceptance criteria
- [ ] Live: 10 consecutive reads of `/api/calendar?from=2026-12-02&to=2026-12-03` each contain RY, TD, BMO, BNS and CM. Record the 10 counts in the PR.
- [ ] Live: RY and BNS rows read `h: "bmo"` with an `o` link to the company's notice; `/t/RY` and `/t/BNS` `og:title`s say "before the open", not "time unconfirmed".

## Shipped again 2026-11-24 ET (builder, bounce 1): #197
- **The flicker** was 0111 (#195, #196, live since the 22:47 UTC deploy). At 03:26 UTC on 2026-11-25, five back-to-back
  reads of `/api/calendar?from=2026-12-02&to=2026-12-03` each had all five banks (30, 30, 29, 29, 29 rows; the extra
  rows are GWRE and NTSK, which are 0110). The ten-read count is recorded in the PR after the deploy.
- **RY and BNS** now carry company-dated overrides with `hour: "bmo"`, read from the banks' own notices (wire copies on
  Investing News, read 2026-11-24 ET): RBC, results about 6:00 a.m. ET Dec 3, call 8:30; Scotiabank, results about
  5:30 a.m. ET Dec 2, call 7:15. The note above saying they publish a call time only was wrong.
- **TD** stays contested (feed amc, Nasdaq pre-market) until TD publishes a release time.
- `sharedSupplement0111.test.ts` used BNS as its supplement-only example. An override now places BNS without the
  supplement, so the example is picked at run time: the biggest tracked Toronto listing with no override (TD today).
  The test is no weaker, and a later TD override can't break it.
