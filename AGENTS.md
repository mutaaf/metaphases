# AGENTS.md: operating manual

Read this before you change anything. Autonomous agents (scout, critic, builder, keeper) and humans follow the same rules. Agent protocol: `agents/prompts/common.md`. Operator steering: `agents/control.json`.

## Product vision

**Metaphases: every earnings report, phase by phase.** It's the calmest, deepest earnings calendar on the web: as simple to read as a wall calendar, as deep as a desk terminal when you tap.

Four kinds of people use it, and every change should serve at least one:
1. **The glancer** wants to know who reports this week and when. The month grid must stay scannable in two seconds.
2. **The trader** wants to know how a stock moved last time, how it's set up and what the street expects. That lives in the ticker sheet.
3. **The investor** (Compass's user) wants to know whether this report touches their money and whether it's a quality company. That lives in Compass look-through and quality grades.
4. **The social-first everyday investor** — the operator's own household: a medium investor who gets her market news from Instagram, TikTok and X, on her phone. She doesn't want a terminal; she wants to know *does this affect me?* and *is this hyped stock real?* That lives in the **Everyday lens** (plain English, trader jargon one tap away), **Today** (60-second story cards that share as 9:16 images), **Hype Check** (`/check`, also the PWA share target — share a post from any app straight into it) and the phone **tab bar** (Today · Calendar · Hype Check · My Money). Design for her at 390×844 first; nothing she sees should need a glossary, and nothing may read as advice. "A viral post isn't research" is the stance.
5. **Kids learning with a grown-up** (about 8–12). **Metaphases Kids — the Market Moon Club** (`/kids`, chosen as "We're learning with our kid" in the lens picker) teaches how markets and trading *work* with **pretend money that follows real prices**. Kids don't know the words yet, so it teaches by doing first: **Luna's Quests** (`/kids/start`: Ch1 Lemonade Stand company → shares → price → report card; Ch2 Save or Grow? jar vs money tree; Ch3 Your Slice Pays You, dividends — micro-lessons with fixed, unit-tested math in `shared/kidsQuestContent.ts`) and **tap-a-word** picture cards (`KID_TERMS`, `<W>`/`<WordChips>` in `src/pages/KidsQuest.tsx`) — any new kid-facing jargon needs a `KID_TERMS` entry. Then: a Today's Market Story (market mood as weather, report cards from companies kids know, a word and a quiz of the day, read-aloud on every card), Guess the Report Card (beat or miss, badges, streaks), the Pretend Piggy Bank (🌙 $1,000 pretend coins across up to 5 companies, teaching eggs-in-baskets), Moon School (93 one-minute micro-lessons in 20 units built from say / check / sort / worked-example / grow steps, three tracks with an optional Full Moons challenge, a grown-up "dinner table talk" per unit, Flesch–Kincaid grade ≤ 5 per lesson, each with a one-page printable worksheet at `/kids/school/<id>/print`). **The curriculum is a Lesson Pack**: `packs/core/pack.json` (format `shared/kidsPacks.ts`, schema `packs/pack.schema.json`), written with and signed off by two expert reviewers (`packs/<id>/reviews/`). Edit the JSON, never `kidsContent.ts`; `validatePack` (unit-tested) enforces reading level, glyph coverage, no links and no advice/promotion phrases. Guest/creator packs (`packs/guest-*`) extend Core and reach the app only through the signed channel (`/api/kids/packs`, `npm run packs:sign`, private key outside the repo) after a human sign-off. **Why did it move?** (`shared/kidsWhy.ts`, `/api/kids/why`) explains a kid company's day or week from data we already have (report card, SPY, an equal-weight sector ETF, dividend cut-off, normal move size) and says "we're not sure" rather than invent news, Ask Luna (kid-safe AI), a Friday **weekly recap** and a **Family League** (emoji players, `MOON-…` codes carrying only company + date + pick; `shared/kidsWeek.ts`). It has its own shell: no trader UI, no macro strip, no links out; a "For grown-ups" parental gate guards the way back to the full site. Design for a 9-year-old at 390×844: huge tap targets, short sentences, no jargon.

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
- **Kids surfaces (`/kids*`, `src/pages/Kids.tsx`, `shared/kids*.ts`) are child-directed:**
  - Pretend money only. Never a buy/sell/broker link, a payment, or anything a kid could spend.
  - No data: no accounts, no names, no analytics; progress lives in `localStorage` (`metaphases:kids:v1`) only.
  - **The one inbound exception is the grown-ups support form** (`/kids/support`, `src/pages/KidsSupport.tsx`, `POST /api/kids/support` in `worker/support.ts`): a parent's question plus optional reply email and device, stored in KV `SUPPORT` for 180 days only to reply (read with `npm run support:inbox`). Hashed-IP rate limit, honeypot, no third parties. It's the App Store Support URL (Guideline 1.5): keep its FAQ true to the moon-club code, and keep `/kids/privacy` in step.
  - No ads and no click-outs: no external `<a href>` anywhere in kids mode (an e2e test enforces it). Leaving kids mode goes through the parental gate.
  - AI is the **free brain only** with the kid-safe `KIDS_SYSTEM` prompt (`FREE_ONLY` in `worker/ai/prompts.ts`): the worker ignores any BYOK key for the `kids` task and the client never sends one (unit + e2e tests).
  - **Read-aloud voice is the one exception, and it's TTS only.** A grown-up may, behind the parental gate, choose a friendlier OpenAI or Gemini voice on their own key (`src/lib/voice.ts`, `src/pages/KidsVoice.tsx`, `POST /api/ai/speak` in `worker/ai/speak.ts`). The key stays in `metaphases:kids:voice:v1` and travels only as `x-mp-key` on `/api/ai/speak`; it's never stored, logged or echoed server side. Only app copy and Luna's answers may be spoken by a provider, never kid-typed text (`markKidTyped`; on any match or error it falls back to the device voice). Voices and base URLs are fixed allowlists (unit + e2e tests).
  - Anything that leaves the device is built from counts or codes only, and only behind the parental gate: the recap image (`/og/story/kids-recap.png`, `parseRecapQuery` drops everything but bounded counts) and League codes (no names or free text, unit-tested). Worksheets are gated too.
  - **Deep links** (`shared/kidsLinks.ts`, `src/pages/KidsLinks.tsx`; full map in mutaaf/moon-club `docs/LINKS.md`): `/kids/school[/<id>]`, `/guess`, `/gamenight`, `/piggy`, `/garden`, `/ask`, `/league/<code>`, `/pack/<id>` are universal links into Moon Club. The `apple-app-site-association` file is served by mutaafaziz-site, not this worker. Every one must stay a working web page. League and pack links only act after the parental gate. `?ref=` is an allow-listed channel slug (`REFS`), never free text. It becomes App Store `ct=` only through `appLink(ref)` (`isAppleAppLink` pins the exact shape). No cookies, no storage, no analytics.
  - **Grown-up picks** (`shared/kidsPartners.ts`) ship EMPTY. Picks render only in the gated grown-up corner, with the disclosure and `rel="sponsored noopener noreferrer"`. Adding partners is the operator's call (money).
  - Kid copy stays at Flesch–Kincaid grade ≤ 5 (`fkGrade`, unit-tested). Nothing is advice.
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
- [ ] `docs/CHANGELOG.md` line; ticket set to `shipped` with its PR number. **House style for every update and release note:** clear about what changed, then a little fun, with a family-friendly pop-culture nod (Pixar, Star Wars, Marvel, Mario, Pokémon, Back to the Future, Apollo 13…). Rules: a name-drop or a famous line under 15 words; never song lyrics; no logos; nothing PG-13. The native kids app follows the same style (`mutaaf/moon-club` `release-notes/README.md`).
- [ ] **Launcher registration** for any new public surface: deep links in mutaafaziz.com ⌘K and Digital Craft /labs (operator PRs)
