# Metaphases: working notes

Earnings calendar at **mutaafaziz.com/metaphases/**: a Cloudflare Worker on route `mutaafaziz.com/metaphases*` (the same pattern as cold-gas and outatime), plus a React SPA. Vite `base` is `/metaphases/` and the build goes to `dist/metaphases/`. The worker strips `BASE`, and the client uses `src/lib/router.ts` (`BASE`, `href()`, `appPath()`). No separate domain: the user wants everything on their existing site. Sibling of Market Digest & Compass (`~/projects/market-digest`); the grading logic in `shared/grades.ts` is a port of that repo's `fundamentals.py` / scorers, so keep the thresholds in sync.

## Commands
- `npm run up`: idempotent; installs deps, writes `.dev.vars` from market-digest's `.env`, typechecks, builds, runs `wrangler dev --port 8811`
- `npm run dev`: vite on :5188 proxying `/api` to wrangler on :8811
- `npm run typecheck` / `npm run build` / `npm run deploy`
- `npm run check`: the CI gate (backlog validator + typecheck + vitest + build + Playwright on recorded fixtures with the clock frozen at 2026-10-31). `npm run check:fast` skips e2e.
- `npm run refresh:data`: universe + ETF holdings (the weekly GitHub Action does this automatically)
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
- **Parallel e2e runs collide**: Playwright reuses any server already on :4188 locally, so two worktrees running `npm run check` at once test each other's builds (mass failures). Give each its own port: `E2E_PORT=4231 npm run check`.
- `shared/market.ts` holds FOMC dates and NYSE holidays; update it yearly.
- **Kids lesson packs** (`packs/`, `shared/kidsPacks.ts`; the full program is in moon-club `docs/PACKS.md`):
  - **Editing.** Edit `packs/<id>/pack.json` directly, then `npm test`. `validatePack` checks reading level, card fit, glyphs, links, advice phrases, ids and sign-offs.
  - **JSON imports.** Import pack JSON with `with { type: "json" }`. Playwright's Node loader fails without the import attribute ("needs an import attribute of type: json"), even though Vite and tsc don't mind.
  - **Signing.** After editing any non-core pack, run `npm run packs:sign`, or the signature test and `export:kids` fail with "signature is stale". The signing key is at `~/.config/metaphases/kids-pack-signing.jwk`, outside the repo; back it up. The app trusts its public key (`packs/channel.json` → `kids-content.json` `channel.publicKey`). `/api/kids/packs` lists only `ready` packs, which need a human sign-off.
  - **`/api/kids/why`** uses Yahoo (stock, SPY, equal-weight sector funds RSPT/RSPC/RSPD/RSPS, `events=div`, raw closes) and Nasdaq, plus one cached Finnhub calendar call per company per day, for the report session only.

## Autonomy (same pattern as COLD GAS / arcade games)
- Read `AGENTS.md` (operating manual) and `agents/prompts/*`. Steering lives in `agents/control.json`; cadence is set on the routines at claude.ai/code/routines.
- `main` is protected (required check `check`). Agent PRs on `scout/ build/ fix/ keep/` auto-merge via `agent-automerge.yml`; `main-ci-backstop.yml` dispatches CI for merges made by GITHUB_TOKEN.
- The weekly `data-refresh.yml` needs the repo secret `FINNHUB_API_KEY` (already set). It opens its own PR, arms auto-merge and dispatches CI because GITHUB_TOKEN PRs don't trigger workflows.
- **Deploys:** launchd `com.mutaaf.metaphases.autodeploy` (plist in ~/Library/LaunchAgents) runs `~/projects/.bin/metaphases-autodeploy.sh`, a copy of `scripts/autodeploy.sh`, every 10 minutes. It deploys origin/main once CI is green, from the `~/projects/metaphases-deploy` clone. The copy lives outside ~/Desktop because macOS TCC blocks launchd from Desktop ("Operation not permitted"). Log: ~/Library/Logs/metaphases-autodeploy.log. If you edit the script, re-copy it to `~/projects/.bin/`. `npm run deploy` publishes by hand. Workers Builds needs the repo added to the Cloudflare GitHub App (installation 150209183, which requires the user's passkey) and connected in the dashboard. Until then, `npm run deploy` is manual.
