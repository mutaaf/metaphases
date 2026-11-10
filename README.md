# Metaphases

**Every earnings report, phase by phase.** An earnings calendar that reads the room: who reports when, how the stock has reacted before, whether it's set up well going in, and how much of *your* money rides on it.

→ **[mutaafaziz.com/metaphases](https://mutaafaziz.com/metaphases/)**

New here? Read the **[guide](https://mutaafaziz.com/metaphases/guide/)**: how to read the calendar, how the grades work, and why none of it is advice.

## What's inside

| Surface | What it does | Borrowed from |
|---|---|---|
| **Calendar** | Month / week / day views of ~650 popular companies (or every $1B+ reporter). Report timing drawn as moon phases: ◑ before open · ● during hours · ◐ after close. Reported days get beat / mixed / miss outlines and a result strip. Macro events (jobs, CPI, FOMC, GDP, PCE) are inline. | — |
| **Market Mood** | A fear↔greed gauge built from six signals you can inspect: momentum, VIX, breadth, junk-bond demand, safe-haven demand and RSI, plus a 60-day trace. | Market Digest sentiment scoring |
| **Ticker sheet** | Next report, the "read" in plain English, typical move, price reactions to the last four reports, analyst street view, and two explained grades. | — |
| ↳ **Setup grade** | Trend, momentum (RSI zone), 52-week range, volatility (ATR) and beat-rate track record, A+ to F. | Market Digest swing/daytrade scorers |
| ↳ **Compass quality** | Valuation, profitability, growth and health, A+ to F, each with its inputs. | Compass / `fundamentals.py` |
| **Compass** | Paste stocks *and funds*; ETF look-through shows which reports move your money, week by week. | Compass overlap + portfolio |
| **Retrace** | The month graded against consensus: beat rates, sector scorecard, biggest surprises. | Market Digest Retrace |
| **Learn** | Every dotted term on the site, in plain English. | Compass `<Term>` glossary |

Grades are rules-based and explained. They aren't advice.

## Run it

```bash
npm run up          # install, wire keys, build, serve on http://localhost:8811
npm run dev         # hot reload: vite :5188 → worker :8811
npm run deploy      # Cloudflare Workers
```

Needs two free keys in `.dev.vars` (`up` copies them from Market Digest's `.env` if present): `FINNHUB_API_KEY`, `FRED_API_KEY`.

## Architecture

- **`worker/`**: a Cloudflare Worker serving the SPA and `/api/{calendar,ticker,macro}`. Responses are edge-cached through the Cache API. It also rewrites `<head>` per URL, so shared links (`/t/NVDA`, `/?day=2026-11-04`) unfurl with that company's next report and track record.
- **`shared/`**: types and the grading engines (straight ports of Market Digest's thresholds), used by both the Worker and the client.
- **`src/`**: React 18 + Vite and hand-written CSS (no UI kit). Watchlist, holdings and prefs live in localStorage behind try/catch.
- **`data/`**: `universe.json` (≈627 tickers, built with `npm run universe`) and an ETF top-holdings snapshot from Compass's cache.

Data: Finnhub (calendar, fundamentals, ratings), Nasdaq (past report dates), Yahoo Finance (prices), FRED (economic release calendar).
