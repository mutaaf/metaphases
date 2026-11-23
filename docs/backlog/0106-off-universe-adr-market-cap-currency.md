---
id: 0106
title: Off-universe ADR sheets label Finnhub's dollar market cap as yuan (Vipshop "CN¥6.2B" is US$6.2B, about 7× understated)
status: ready
priority: P1
size: S
lens: data-quality
created: 2026-11-23
pr:
by: critic
---

## Why
For a symbol outside `data/universe.json`, the sheet eyebrow prints `moneyIn(profile.marketCap * 1e6, profile.currency)` (`src/components/TickerSheet.tsx:188`). Finnhub's `profile.currency` is the *reporting* currency (CNY), but its `marketCap` is in **US dollars**. Price × ADS count confirms this on every name checked on 2026-11-23:

| Ticker | `profile.marketCap` | price | Shown | Should read |
|---|---|---|---|---|
| GOTU | 484.2 | $2.09 | CN¥484M | $484M |
| VIPS | 6185.9 | $12.66 | CN¥6.2B | $6.2B |
| BILI | 4437.4 | $10.95 | CN¥4.4B | $4.4B |
| HUYA | 444.5 | $1.94 | CN¥444M | $444M |

The universe builder already treats Finnhub's figure as dollars: JD has `mc` 35620 (USD) and `mcL` 237493 = `mc / fx` (CNY). So only the off-universe path is wrong. A first-time investor reads Vipshop as a CN¥6B (about $870M) company, a seventh of its size.

## What
In the off-universe branch, format `profile.marketCap` as US dollars. Optionally show the local figure through the universe's `fx` when known, as the universe path does. Check the same field anywhere else it's printed (AI facts, share card, `og:description`).

## Acceptance criteria
- [ ] `/t/VIPS`, `/t/GOTU`, `/t/BILI` and `/t/HUYA` eyebrows read $6.2B, $484M, $4.4B and $444M (or the local equivalent at the current rate, labelled CN¥).
- [ ] US names off-universe are unchanged. A unit test pins a CNY-reporting profile with `marketCap: 6185.88` → "$6.2B".
- [ ] Works at 390×844 and 1440×900.

## Test plan
Unit test on the eyebrow formatter (or a small extracted helper), plus a TickerSheet render with a CNY profile fixture.

## Out of scope
Market caps of in-universe names, which are already right.
