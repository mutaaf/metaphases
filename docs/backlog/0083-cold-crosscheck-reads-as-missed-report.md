---
id: 0083
title: When the Nasdaq cross-check is cold, a contested date turns back into "results expected, none in yet" (WSM, PDD flip between reads)
status: shipped
priority: P0
size: M
lens: data-quality
created: 2026-11-17
pr: 142
by: critic
---

## Why
Critic check 2026-11-17 18:51–19:05 UTC, build `d5177411`. 0078's logic works whenever the Nasdaq window is loaded, but during peak week the window keeps going cold, and each time it does, the honest "Date not confirmed" falls back to a stated failure:

- `/api/calendar?from=2026-11-16&to=2026-11-22` polled 11 times in 14 minutes. `unchecked` went 10 → 10 → 8 → 10 → 4 → 3 → 3 → 3 → **8** → 3 → 2. On the cold reads (18:51, 18:53, 18:58, 19:00:31) PDD, WSM and CPRT had no `x`/`xd`, and only 9 rows carried a cross-check flag instead of 29.
- `/api/ticker/PDD`: 3 reads 15 s apart → `nasdaq: {2026-11-19}`, `nasdaq: {2026-11-19}`, then **`status: "results-pending"` with no `nasdaq`**.
- `/api/ticker/WSM`: 3 of 3 reads at 18:55 → `results-pending`, no `nasdaq`. 4 of 4 at 19:03 → `nasdaq: {2026-11-19}`. The sheet at 390×844 on a cold read: "Results were expected before open today. None are in our data yet" (`shots/p_t_WSM.png`), with og:title "WSM's Q3 results expected: none in yet". The company reports Thu Nov 19 (0082).

A likely cause: `readJson`/`putJson` (`worker/index.ts:241`) use `caches.default`, which is per data center. The `nq:x:*` days and the folded index exist only where they were built, `NQX_PER_BUILD = 2` days per read, and a fill runs only when `NQX_LOCK` is clear. So a request served from another colo (or after an eviction) starts cold again. Whatever the cause, the failure mode is what matters: **missing evidence is read as "no disagreement"**, and a passed, figure-less row becomes a stated miss. That's focus item 1.

## What
- **Fail closed.** A figure-less, non-override row whose day has passed (`d <= today`) must not reach `results-pending` / "Results were expected" while the cross-check hasn't covered the days it could be contested by (today through `windowEnd`). Show the neutral state instead (for example "Waiting on the company's figures; we're still comparing the date with Nasdaq's calendar"), in the sheet, the og title and description, the drawer and the AI facts.
- **Keep the evidence warm.** Make the contest survive a cold read. For example, keep the last known `x`/`xd`/`xh` per symbol in a store every colo can read (the worker already has KV bindings), or fold the contest into the cached calendar day itself so a later cold read doesn't drop it. Don't add upstream calls: Nasdaq stays at most 2 days per read.
- Write a `LESSONS.md` row on the per-colo scope of `caches.default` if that turns out to be the cause.

## Acceptance criteria
- [ ] Unit: the PDD-shaped row (`d` yesterday, `h: bmo`, no figures, no `o`) with **no Nasdaq window at all** (`nasdaqWindow` → null, or a window missing the later days) → not `results-pending`, and `ogTitle` contains no "results expected"
- [ ] Unit: the same row with a window that lists it 2 days later → `nasdaq: {date, session}` as today (0078 unchanged)
- [ ] Live: 10 reads of `/api/ticker/WSM` (or another contested symbol) and `/api/calendar?from=<Mon>&to=<Fri>` over 5 minutes, spread across cold and warm reads. None says "results expected" for a contested row, and a symbol flagged `x: differs` once stays flagged on every later read that day
- [ ] Works at 390×844 touch and 1440×900
- [ ] Loading / empty / error / partial states handled

## Test plan
Vitest on `shared/pending.ts` / the sheet's next-builder with a null and a partial window. If the contest is persisted, a worker test that a second read with an empty Nasdaq cache keeps `x`/`xd`.

## Out of scope
The specific WSM/CPRT dates (0082). Raising the Nasdaq fetch rate.
