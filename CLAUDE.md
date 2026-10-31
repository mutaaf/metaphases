# Metaphases: working notes

Earnings calendar at metaphases.com. Cloudflare Worker + React SPA. Sibling of Market Digest & Compass (`~/projects/market-digest`); the grading logic in `shared/grades.ts` is a port of that repo's `fundamentals.py` / scorers, so keep the thresholds in sync.

## Commands
- `npm run up`: idempotent; installs deps, writes `.dev.vars` from market-digest's `.env`, typechecks, builds, runs `wrangler dev --port 8811`
- `npm run dev`: vite on :5188 proxying `/api` to wrangler on :8811
- `npm run typecheck` / `npm run build` / `npm run deploy`
- `npm run universe`: rebuild `data/universe.json` (needs FINNHUB_API_KEY in env, about 11 min at 60 req/min; resumable)

## Environment nuances (found the hard way)
- **Port 8799 is taken** by another local workerd on this machine, so Metaphases uses 8811.
- `@cloudflare/workers-types` must be v5 (wrangler 4.156 peer dep) or `npm install` hits ERESOLVE.
- **Finnhub free tier**: `/calendar/earnings` caps at 1500 rows/request, so fetch **per day**. History only reaches back about a month, and `symbol=` queries return future dates only. Price targets and the economic calendar are premium (403). Bursts of more than ~20 parallel calls get 429s, so `pool()` caps concurrency at 6 with retry.
- Past report dates come from **Nasdaq** `api.nasdaq.com/api/company/{SYM}/earnings-surprise` (last 4). Report session isn't given, so we assume the company's habit from Finnhub's upcoming `hour`.
- **CNN Fear & Greed blocks bots** ("I'm a teapot"), which is why Market Mood is computed from Yahoo candles (SPY, ^VIX, RSP, HYG, LQD, TLT).
- Yahoo chart API needs a browser User-Agent. It may rate-limit from Cloudflare IPs; every route degrades to partial data plus `warnings`.
- `run_worker_first: true` so the Worker can inject per-URL share meta; asset requests (with an extension) go straight to `env.ASSETS`.
- Headless Chrome won't screenshot below about 500px wide, so render icons at 1024 and downscale with `sips` (`scripts/brand/`).
- `shared/market.ts` holds FOMC dates and NYSE holidays; update it yearly.
