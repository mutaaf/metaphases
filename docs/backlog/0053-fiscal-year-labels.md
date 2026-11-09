---
id: 0053
title: "Q3 2027" for Ross and Home Depot's fiscal 2026 quarter: name the quarter the way the company does, or by the months it covers
status: ready
priority: P1
size: M
lens: clarity
created: 2026-11-09
pr:
by: critic
---

## Why
Critic check 2026-11-09 19:00 UTC. The sheet header says **"NEXT REPORT · Q3 2027"** for Ross Stores (`shots/p__t_ROST.png`), but Ross calls it its "third quarter 2026" ([release](https://finviz.com/news/417559/ross-stores-inc-announces-third-quarter-2026-earnings-release-and-conference-call)). `/api/ticker/HD`, `LOW` and `TGT` also carry `year: 2027`, while Home Depot calls the quarter ending Nov 1, 2026 "fiscal 2026 third quarter". Other retailers name their fiscal year by the year it ends: TJX calls it "third quarter Fiscal 2027" ([Business Wire](https://www.businesswire.com/news/home/20260506932788/en)), and so does Walmart (FY27). Finnhub's `year` label follows the second convention for everyone. So for about half of next week's biggest retail reporters, our label names a year that the company's release, its call and every headline will not use. A trader searching "Home Depot Q3 2027" finds nothing. A first-time investor reading "Q3 2027" in November 2026 thinks it's a typo. The label is also in The Read ("reports Q3 on…"), the share card and `justReported` ("Reported Q3 2027").

## What
Pick one, and say which in the PR:
- (a) **Label by the months the quarter covers**, the unambiguous choice: "Quarter ending Oct 2026", which needs no per-company table. History rows already carry `period: "Sep 2026"` from Nasdaq's `fiscalQtrEnd`. For `next`, derive it from the last period + 3 months.
- (b) Keep "Q3 FY…" but add a per-company fiscal-year naming convention (by year end vs year start) to `data/universe.json`, seeded for the retailers whose fiscal year ends in late January or early February.
In both cases, never print a bare "Q3 2027" for a quarter that ends in calendar 2026.

## Acceptance criteria
- [ ] `/t/ROST`, `/t/HD`, `/t/LOW`, `/t/TGT` headers: no "2027" for the quarter reporting in Nov 2026; `/t/TJX` and `/t/WMT` aren't contradicted by their own releases either
- [ ] The same label shows in the sheet header, The Read, `justReported`, the og title and the share card (one helper in `shared/`)
- [ ] Calendar-year companies (NVDA's "Q3 FY2027" is NVIDIA's own name) are unchanged or still read correctly
- [ ] Vitest: label for HD (FY end ~Feb 1), ROST, TJX, WMT, NVDA, AAPL
- [ ] Works at 390×844 and 1440×900

## Test plan
Unit tests on the label helper; the e2e sheet snapshot asserts the header text for one retailer fixture.

## Out of scope
Changing Finnhub's quarter/year keys used for matching (overrides, caches). This is display only.
