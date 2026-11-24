---
id: 0107
title: Canada's five biggest banks ($740B together) are missing from the Dec 2–3 calendar, and BMO's sheet says "after the close" when the bank reports at 6 a.m. ET
status: shipped
priority: P0
size: M
lens: data-quality
created: 2026-11-24
pr: 191
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
- [ ] Script check: every Nasdaq-listed company with a market cap of at least $10B in the next ten days has a calendar row on Nasdaq's day. Record the count (0 missing) in the PR.
- [ ] Unit: an untracked `RY.TO` row (CA$ revenue) becomes RY, once. A $20B company with $500M revenue is admitted. A $300M company with CN¥2B revenue isn't, unless it is tracked.
- [ ] Finnhub calls stay within 60/min, with no new 1102s. Works at 390×844 and 1440×900.

## Test plan
Vitest beside the 0024 supplement and 0105 `keepNasdaq` tests, with fixtures for the dotted home listing, the dollar-cap gate and the Nasdaq session on `next`.

## Shipped scope (builder, 2026-11-24)
The Big Five are now tracked (`data/universe.json` + `scripts/build_universe.py` EXTRA: `c: "CA"`, `ec: "CAD"`, Toronto logos), so the 0024 alias renames `RY.TO` → `RY` and the supplement covers any gap. BMO and CM carry company-dated overrides (bmo). RY, TD and BNS publish a call time only, so their session is left to Nasdaq's contest (0059). The untracked dollar-size gate (RBRK, CRDO, NTNX, GWRE) is split to **0110**.

## Out of scope
Other TSX-only issuers that have no US listing.
