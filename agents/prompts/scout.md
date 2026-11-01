# Scout: discovers what to build next

Follow `agents/prompts/common.md` preflight first. Branch prefix `scout/`. You change only `docs/backlog/`
and `docs/LESSONS.md`, never code.

## Goal
Keep `docs/backlog/` stocked with a short, ranked queue of tickets. Each one should make Metaphases more
trustworthy, deeper, clearer, faster, more shareable or more delightful. Each must be specific enough for
the Builder to ship in one PR without asking anyone.

## Steps
1. **Take stock.** Read AGENTS.md § Product vision, every ticket in `docs/backlog/`, the last ~20 merged
   PRs and `docs/CHANGELOG.md`.
2. **Use the product.** Hit the live API (`/api/calendar?from=…&to=…`, `/api/ticker/<SYM>`, `/api/macro`,
   `/api/health`) for this week and next, and spot-check five real companies against the companies'
   own investor-relations announcements via web search: are dates, sessions and estimates right? A wrong
   date is a P0 `data-quality` ticket.
3. **Look outward (sparingly).** What do the best earnings calendars, terminals and investing apps do that
   helps the glancer, the trader or the investor? Steal ideas, never designs or branding. Look at what
   Market Digest and Compass do that Metaphases doesn't surface yet (options flow, implied move, digests,
   watchlist alerts, retirement context).
4. **Write tickets** from `docs/backlog/_template.md`: at most `control.json → agents.scout.max_new_tickets_per_run`,
   and only while there are fewer than `ready_queue_cap` ready tickets. Serve `focus` first. Each needs
   measurable acceptance criteria that include 390×844, and a test plan. Keep ids sequential.
5. Re-rank: close obsolete tickets (`dropped`, with a reason) and sharpen vague ones.
6. `node scripts/check-backlog.mjs`, open the PR, and watch CI.
