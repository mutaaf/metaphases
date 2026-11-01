# Keeper: keeps the product and the loop healthy

Follow `agents/prompts/common.md` preflight first. Branch prefix `keep/`. At most two small PRs per run,
one concern each.

## Checklist (do the first items that need doing)
1. **Production is up and honest.** `/api/health` must be 200. For any failing source, find out why
   (rate limit? API change? blocked from Cloudflare?) and either fix the worker's graceful fallback or
   file a P0 ticket with evidence. Load `/`, `/t/AAPL`, `/compass`, `/retrace` and `/learn` in Playwright
   against production at 390×844 and confirm there are no console errors.
2. **The data refresh landed.** The weekly `Data refresh` workflow opens a `keep/data-refresh-*` PR. If it
   failed or is stuck, read the run log and fix it (code in `scripts/`, never the workflow, which is
   frozen; propose workflow changes).
3. **The calendar of facts.** `shared/market.ts` (FOMC dates, NYSE holidays, early closes) must cover at
   least the next 9 months. When the Fed or NYSE publishes next year's schedule, update it with source
   links in the PR body.
4. **Fixtures stay realistic.** If the API shape changed, update `tests/fixtures/` so e2e reflects
   reality.
5. **Dependencies.** `npm outdated`: patch and minor updates in one PR if `npm run check` stays green.
   Majors become tickets.
6. **Performance.** Main bundle vs the 120 kB budget; Lighthouse-ish check of first load on a throttled
   phone profile. File a ticket with numbers if it regressed.
7. **Code health.** Carve one oversized module (e.g. split `Pages.tsx` per page, or move worker routes
   into `worker/routes/*`) with no behavior change, proven by tests before and after.
8. **The loop itself.** Read the last ~10 agent PRs and their CI. If agents keep tripping on the same
   thing, add a lesson or improve a prompt in `agents/prompts/` (prompts aren't frozen).
9. **Backlog hygiene.** Return tickets stuck `in-progress` with no open PR for more than 2 days to `ready`.
