---
id: 0113
title: Ulta, DocuSign, SentinelOne and Five Below announced their dates and times, but their sheets say "the company hasn't said"
status: shipped
priority: P1
size: S
lens: data-quality
created: 2026-11-25
pr: 202
by: critic
---

## Why
Four companies reporting next week have published the date and session, and Metaphases has the right day but tells the reader the opposite of the truth about where it came from:

| Ticker | Company notice | Metaphases at 19:00 UTC on 2026-11-25 (build `be43859d`) |
|---|---|---|
| ULTA ($27B) | [Ulta notice](https://finviz.com/news/425518/ulta-beauty-to-report-third-quarter-fiscal-2026-results-and-participate-in-an-upcoming-investor-conference): Thu Dec 3, after the close | `/t/ULTA` hero: "After close (expected) · The time is from Nasdaq's calendar; our data feed left it blank **and the company hasn't said**." `og:title` read "ULTA earnings expected around Thu, Dec 3 (not yet confirmed)" on the first read, then "(expected)" |
| DOCU ($15B) | [Docusign, Nov 19](https://www.placera.se/pressmeddelanden/docusign-docusign-to-announce-third-quarter-fiscal-2027-financial-results-on-december-3-2026-20261119): Thu Dec 3, after the close | same pattern: first `og:title` "not yet confirmed", then "(expected)"; no `o` link |
| S ($8B) | [SentinelOne, Nov 12](https://finviz.com/news/422106/sentinelone-announces-date-of-fiscal-third-quarter-2027-financial-results-conference-call-and-participation-in-upcoming-investor-conference): Thu Dec 3, after the close, call 5 p.m. ET | "after the close (expected)", no link |
| FIVE ($12B) | [Five Below, Nov 18](https://www.helpareporter.com/news-releases/five-below-inc-announces-third-quarter-fiscal-2026-earnings-release): Wed Dec 2, after the close, call 4:15 p.m. ET | "after the close (expected)", no link |

None of the four is in `data/date-overrides.json`. 0112 asked for exactly this sweep ("look for other company-announced dates in the next 10 days that have no override") and it wasn't done. The trader reads "(expected)" and "the company hasn't said" as "this could still move", for dates that were fixed a week or two ago. Operator focus (2): company-published dates override Finnhub.

## What
- Add ULTA, DOCU, S and FIVE to `data/date-overrides.json` with the session, the notice link and a note.
- Sweep every row in the next 10 days whose sheet says "expected", "not yet confirmed" or "hasn't said" and is $5B+; for each, search for a company notice and add an override when one exists. List the sweep (ticker, found / not found, link) in the PR.
- Never print "the company hasn't said" as a fact: we only know that *we* have no notice on file. Reword to "we haven't found a company announcement yet" in the hero sentence (find it with `grep -rn "hasn't said" src/`).

## Acceptance criteria
- [ ] Live: `/t/ULTA`, `/t/DOCU`, `/t/S`, `/t/FIVE` `og:title` read "reports <day> after the close" with no "(expected)" or "not yet confirmed", on 5 reads each; each sheet links the notice.
- [ ] Live: `/api/calendar?from=2026-12-02&to=2026-12-03` has `o` on all four rows, `h: "amc"`.
- [ ] The phrase "the company hasn't said" no longer appears anywhere in `src/` (unit or grep test).
- [ ] PR body lists the sweep of $5B+ "expected" rows in the next 10 days with a found/not-found result for each.
- [ ] Works at 390×844 and 1440×900.

## Test plan
`npm test` covers the override file shape. Add a unit test that the hero copy for a Nasdaq-filled session never claims the company's silence.

## Out of scope
Cold reads that drop the Nasdaq check (0114). Missing rows (0110).

## Sweep (builder, 2026-11-25)
$5B+ rows Nov 25–Dec 5 whose sheet read "expected", "not yet confirmed" or had a blank session (production reads 21:25 UTC):

| Ticker | Result |
|---|---|
| ULTA | found: Nov 19, Thu Dec 3 after the close → override |
| DOCU | found: Nov 19, Thu Dec 3 after the close → override |
| S | found: Nov 12, Thu Dec 3 after the close → override |
| FIVE | found: Nov 18, Wed Dec 2 after the close → override |
| KR | not found (no Q3 2026 call notice yet; Nasdaq's pre-market stays "expected") |
| BF.B | not found (no fiscal Q2 2027 notice yet) |
| ZS | not found (no Q1 FY27 date notice yet; session stays blank) |
