# Lessons

One dated row per mistake already paid for. Read before every run.

| Date | Lesson | What happened |
|---|---|---|
| 2026-10-31 | Fetch Finnhub's earnings calendar **per day**; it silently caps at 1500 rows per request. | Nov 2–6 returned exactly 1500 rows and was missing companies. |
| 2026-10-31 | Never fire more than ~6 Finnhub calls at once (`pool()`); bursts get 429s and whole days vanish. | 25 parallel day fetches → 3 days missing from November. |
| 2026-10-31 | Finnhub free history only reaches back about a month, and `symbol=` returns future dates only. Past report dates come from Nasdaq. | Reaction history was empty until Nasdaq's earnings-surprise endpoint was used. |
| 2026-10-31 | Don't spread `res.headers` into a plain object and add `Content-Type` again; duplicate casing breaks HTMLRewriter ("Unknown character encoding"). Use `new Headers()` + `set`. | Every HTML page returned 502 after adding share meta. |
| 2026-10-31 | e2e fixtures are routed by the request's `to` date; a page that asks for a forward range needs the November fixture. | Compass showed no exposure in tests because it got October's (already reported) data. |
| 2026-10-31 | Metaphases lives at **mutaafaziz.com/metaphases/**, not its own domain (operator decision). Never write root-relative URLs (`/api/…`, `/compass`): use `BASE` and `href()` from `src/lib/router.ts`; the e2e suite checks nav and manifest hrefs. | The first build assumed a root domain, and every link and API call had to be re-based. |
| 2026-10-31 | In the worker, fetch the SPA shell as `${BASE}/`, never `/index.html`: the asset layer answers index.html with a 307, and rewriting a redirect gives an empty 200. Check pages with `curl` + byte count, not just status. | Every HTML route went blank on the first mutaafaziz.com deploy. |
| 2026-11-01 | In the cloud sandbox, Playwright 1.64's expected Chromium build isn't installed; don't `playwright install`. Run e2e with a throwaway config that sets `launchOptions.executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome"` (and don't commit it). | `npm run check` failed all 24 e2e tests with "Executable doesn't exist". |
| 2026-11-01 | When a dialog opens from a keystroke, move focus into it on the next frame, not synchronously. Chrome fires the Enter keypress at whatever is focused after keydown, so a synchronously focused close button gets "clicked". `useDialog` defers focus with requestAnimationFrame. | Enter in ⌘K search opened the ticker sheet and immediately closed it. |
