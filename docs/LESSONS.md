# Lessons

One dated row per mistake already paid for. Read before every run.

| Date | Lesson | What happened |
|---|---|---|
| 2026-10-31 | Fetch Finnhub's earnings calendar **per day**; it silently caps at 1500 rows per request. | Nov 2–6 returned exactly 1500 rows and was missing companies. |
| 2026-10-31 | Never fire more than ~6 Finnhub calls at once (`pool()`); bursts get 429s and whole days vanish. | 25 parallel day fetches → 3 days missing from November. |
| 2026-10-31 | Finnhub free history only reaches back about a month, and `symbol=` returns future dates only. Past report dates come from Nasdaq. | Reaction history was empty until Nasdaq's earnings-surprise endpoint was used. |
| 2026-10-31 | Don't spread `res.headers` into a plain object and add `Content-Type` again; duplicate casing breaks HTMLRewriter ("Unknown character encoding"). Use `new Headers()` + `set`. | Every HTML page returned 502 after adding share meta. |
| 2026-10-31 | e2e fixtures are routed by the request's `to` date; a page that asks for a forward range needs the November fixture. | Compass showed no exposure in tests because it got October's (already reported) data. |
