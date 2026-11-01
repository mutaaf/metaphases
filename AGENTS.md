# AGENTS.md: operating manual

Read this before you change anything. Autonomous agents (scout, critic, builder, keeper) and humans follow the same rules. Agent protocol: `agents/prompts/common.md`. Operator steering: `agents/control.json`.

## Product vision

**Metaphases: every earnings report, phase by phase.** It's the calmest, deepest earnings calendar on the web: as simple to read as a wall calendar, as deep as a desk terminal when you tap.

Three kinds of people use it, and every change should serve at least one:
1. **The glancer** wants to know who reports this week and when. The month grid must stay scannable in two seconds.
2. **The trader** wants to know how a stock moved last time, how it's set up and what the street expects. That lives in the ticker sheet.
3. **The investor** (Compass's user) wants to know whether this report touches their money and whether it's a quality company. That lives in Compass look-through and quality grades.

Sibling of **Market Digest** and **Compass** (`github.com/mutaaf`, private `market-digest`). Their ideas are first-class here:
- **Setup grade** comes from Market Digest's scorers.
- **Compass quality** comes from `fundamentals.py`.
- **Market Mood** comes from Market Digest's sentiment scoring.
- **Retrace** comes from Market Digest's pick grading.
- **`<Term>`** comes from Compass's glossary.
- **Graceful states** come from Compass UX principle #2.

The thresholds in `shared/grades.ts` must stay identical to Market Digest's `GRADE_SCALE`; a unit test enforces it.

### UX principles (non-negotiable)
1. **Phone first.** Design and judge at 390×844 touch, then 1440×900. Touch targets are ≥ 40px and there's no horizontal scroll (an e2e test enforces this).
2. **Graceful in failure.** Every view has loading (skeleton), empty (guidance), error (plain words) and partial states (show what loaded, plus a note). Never show a blank screen or a stack trace.
3. **Plain English.** Wrap any jargon in `<Term k="...">` with a glossary entry in `src/lib/glossary.ts`, and give numbers context.
4. **Explained, never advice.** Grades are rules-based and every factor shows its inputs. Never write "buy", "sell", a price target or a confidence %.
5. **The aesthetic is a lunar almanac.** Paper and ink, ultramarine `--accent`, Schibsted Grotesk + Instrument Serif italic + Martian Mono, and moon-phase glyphs for timing (waxing = before open, full = during hours, waning = after close). No UI kits, no generic gradients, no Inter or Roboto. New surfaces reuse the tokens in `src/styles.css`.
6. **Every surface is shareable and looks good shared.** New routes get an entry in `PAGES` (worker `shareMeta`), a `document.title`, and an engaging, specific title and description. Icons and favicons stay on-brand.

## Invariants
- **Allowed runtime hosts:**
  - Worker side: `finnhub.io`, `api.stlouisfed.org`, `query1/query2.finance.yahoo.com`, `api.nasdaq.com`.
  - Worker side, AI only (BYOK): `api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`, `api.x.ai`. Base URLs are fixed in `worker/ai/providers.ts`; the browser never calls them directly.
- **AI (`worker/ai/*`, `src/components/ai/*`):**
  - The default brain is Workers AI (binding `AI`), free and limited to 30 requests per IP per hour.
  - BYOK keys travel only as the `x-mp-key` header and are never stored, cached, logged or echoed (unit tests enforce this).
  - The model sees only facts we pass it (`buildMessages`). The system prompt forbids advice, price targets, confidence % and invented data.
  - AI never auto-spends: previews generate only on a tap. AI UI is lazy-loaded.
  - Client side: `static2.finnhub.io` (logos), `fonts.googleapis.com`, `fonts.gstatic.com`.
  - Adding a host requires an operator `proposal/`.
- **No analytics, trackers, ads, accounts or paid services.** User state stays in localStorage behind try/catch.
- **Free tiers only.** Finnhub allows 60 req/min, so per-day calendar calls go through `pool()`, and everything is edge-cached via `cached()`.
- **API responses carry `warnings: string[]`.** Partial data beats a 500.
- **Main JS bundle ≤ 120 kB gzip** (CI enforces). Heavy features ship as lazy chunks (`import()`).
- **Never commit secrets.** Keys live in Worker secrets, `.dev.vars` (gitignored) and the GitHub secret `FINNHUB_API_KEY`.

## Map
| Path | What |
|---|---|
| `worker/index.ts` | API (`/api/calendar`, `/api/ticker/:sym`, `/api/macro`, `/api/health`), edge cache, per-URL share meta (HTMLRewriter) |
| `shared/` | types, grading engines (`grades.ts`), FOMC + NYSE holidays (`market.ts`, update yearly; a unit test fails when it runs out) |
| `src/components/Calendar.tsx` | month/week/day grid, filters, day drawer |
| `src/components/TickerSheet.tsx` | the deep sheet |
| `src/components/MacroStrip.tsx` | Market Mood + macro events |
| `src/components/Pages.tsx` | Watchlist, Compass, Retrace, Learn, ⌘K search |
| `src/lib/` | api hooks, dates, data (universe, ETF look-through, results), store (localStorage), glossary, router |
| `data/` | `universe.json` (≈627 tickers), `etf_holdings.json`; both refreshed weekly by `.github/workflows/data-refresh.yml` |
| `tests/unit`, `tests/e2e` | Vitest + Playwright (recorded fixtures, frozen clock 2026-10-31) |

## Commands
- `npm run check`: the gate (backlog validator, typecheck, unit, build, e2e). `npm run check:fast` skips e2e for sandboxes without a browser.
- `npm run up`: local server on :8811 (needs `.dev.vars`). `npm run dev` runs it with hot reload.
- `npm run deploy`: manual deploy (normally Workers Builds deploys `main`).

## Production
- **Live:** https://mutaafaziz.com/metaphases/ (Worker route `mutaafaziz.com/metaphases*`; the base path `/metaphases/` is an invariant, so never hard-code root-relative URLs: use `href()` and `BASE` from `src/lib/router.ts`).
- **Health:** `GET /metaphases/api/health` returns 200 with `{ok, build, sources[]}` when every upstream answers, otherwise 503 naming the broken source.
- **Deploys:** every green commit on `main` deploys automatically within about 10 minutes. Today that's the operator's Mac: launchd job `com.mutaaf.metaphases.autodeploy` runs `scripts/autodeploy.sh` from `~/projects/.bin/`, using a dedicated clone at `~/projects/metaphases-deploy`. It will be Cloudflare Workers Builds once connected. To verify a merge, wait up to 15 minutes for `build` in `/api/health` to change. If it hasn't changed after 30 minutes, say so in your final line and don't retry.

## Definition of done (every PR)
- [ ] `npm run check` green, including a new or changed test that proves the change
- [ ] Looked at it in screenshots at 390×844 and 1440×900
- [ ] Loading, empty, error and partial states handled; new jargon wrapped in `<Term>`
- [ ] New route or surface has share meta + title
- [ ] `docs/CHANGELOG.md` line; ticket set to `shipped` with its PR number
- [ ] **Launcher registration** for any new public surface: deep links in mutaafaziz.com ⌘K and Digital Craft /labs (operator PRs)
