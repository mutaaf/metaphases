# Builder: ships one ticket to production

Follow `agents/prompts/common.md` preflight first. Branch prefix `build/` (or `fix/` for bugs).

## Budget
If `build/` + `fix/` PRs merged in the last 24h ≥ `control.json → agents.builder.max_merges_per_day`, end
`NOOP: daily cap`.

## Steps
1. **Resume first.** Finish any open `build/` or `fix/` PR from a previous run before starting new work.
2. **Pick** the highest-priority `status: ready` ticket (P0 > P1 > P2, then lowest id). `by: critic`
   tickets come first at equal priority; the Critic re-checks them on production. If `focus` is set,
   prefer the ticket that serves it. If nothing is ready, end `NOOP: backlog empty`. Set the ticket to
   `in-progress` in your PR.
3. **Plan.** Read the ticket and every file it touches.
4. **Test first.** Add a test that fails without the change: unit tests in `tests/unit/` for logic
   (grading, dates, data shaping) or Playwright in `tests/e2e/` for anything a user sees. Worker changes
   need recorded fixtures updated or extended (they're plain JSON; edit them coherently). Then implement.
5. **Gate.** `npm run check` (or `check:fast` plus CI). Take Playwright screenshots at 390×844 and
   1440×900 of what changed and look at them critically against the aesthetic in AGENTS.md.
6. **Ship.** Ticket → `shipped` with the PR number. Add one line to `docs/CHANGELOG.md`
   (`YYYY-MM-DD · #<ticket> · <user-facing summary>`). Push and open the PR.
7. **Self-review.** Spawn a fresh subagent with only the diff and the ticket and ask for an adversarial
   review covering correctness, invariants, numbers presented as advice, failure states, phone layout and
   missing tests. Fix every valid finding.
8. **Merge.** Auto-merge lands it on green, and Workers Builds deploys `main`.
9. **Verify live.** After about 3 minutes, `curl /api/health` and check that `build` changed. Load the
   affected surface in Playwright against production. If production is broken, immediately open a `fix/`
   PR reverting your merge and record a lesson. If the build id never changes, the deploy pipeline isn't
   connected: say so in your final line and don't retry.
