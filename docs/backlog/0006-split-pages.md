---
id: 0006
title: Split Pages.tsx into per-route lazy chunks
status: shipped
priority: P2
size: S
lens: tech-health
created: 2026-10-31
pr: 7
by: operator
---

## Why
`src/components/Pages.tsx` holds four pages and search. Most visitors only see the calendar, so the
other pages should load on demand to keep the first load lean on phones.

## What
Move Watchlist, Compass, Retrace, Learn and Search into `src/pages/*.tsx`, loaded with `React.lazy` plus
a skeleton fallback. No behavior change.

## Acceptance criteria
- [ ] Main bundle gzip shrinks (report before and after numbers in the PR)
- [ ] All existing e2e tests pass unchanged

## Test plan
The existing suite proves no behavior change; the CI bundle budget step reports the new size.

## Out of scope
Any visual change.
