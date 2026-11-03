---
id: 0037
title: Market World on the web — the conquer-the-map journey from the Moon Club app, at /kids/world
status: ready
priority: P2
size: L
lens: engagement
created: 2026-11-02
pr:
by: operator
---

## Why
The Moon Club app (mutaaf/moon-club, `MoonClub/Features/World*.swift`) turned Moon School into **Market World**: a map of seven regions the kid conquers one node at a time (Lemonade Coast → Saver's Isle → Candle Canyon → Trend Trails → Pattern Peaks → Signal Sea → Report Card Castle). Chart reading (candles, trends, floors and ceilings, volume, moving averages) is taught by play there, with a "Chart Time Machine" boss that reveals real prices and shows that charts can surprise. The lessons are already shared (units `candles`, `trends`, `patterns`, `signals` in `shared/kidsContent.ts`) and the candles come from `/api/kids/candles`, but the web only lists them in Moon School.

## What
- `/kids/world`: an SVG map with the same seven regions, fog on locked regions, stars per node, and Luna's rocket on the current node. The region and node rules are a port of MoonClubCore `World.swift` (put the rules in `shared/kidsWorld.ts` and export vectors through `npm run export:kids`, so app and web can't drift).
- Web versions of the chart games ("Build the candle", "Spot the trend", "Find the floor", "Busy day?"), drawn in SVG from `/api/kids/candles`.
- Progress: `stars` per node in `metaphases:kids:v1`, carried by the `MOONP1` progress code.

## Acceptance criteria
- [ ] Reading level: every new card is Flesch–Kincaid ≤ 5, and every chart word has a KID_TERMS entry
- [ ] No card scrolls inside itself at 390×844
- [ ] Patterns are always taught as clues, not promises (copy test)
- [ ] Works at 390×844 touch and 1440×900

## Test plan
Unit: world rules against the app's vectors. e2e: conquer the first node, see the star and the next node unlock; no links out.
