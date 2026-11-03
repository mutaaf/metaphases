# "Why did it move?" engine review (shared/kidsWhy.ts)

## Dr. Okafor (markets): three rounds, approved
- **E1: the sector clue was circular.** Apple and Microsoft are about 40% of XLK, so "its group went down too" partly meant Apple explaining itself. Groups now use the equal-weight funds RSPT, RSPC, RSPD and RSPS.
- **E2: the report window ignored the report's timing.** A before-the-open report counts on its own day. An after-the-close report counts on the next trading day. The worker passes each company's report time from one cached Finnhub call a day, and an unknown time is handled conservatively.
- **E3: an exact match counted as a beat.** Results are now beat, in line, or miss, with a 1% tolerance (`reportResult`).
- **E4: the market clue could over-explain.** If the market moved less than half as much as the stock, the line says "not nearly this much". If the market moved the other way, a "Not the whole market… probably about X itself" clue appears.
- **E5: the dividend clue had a bug and loose wording.**
  - The "previous close" could come from 3 months earlier; it is now guarded.
  - Prices are raw closes, never `adjclose`, which hides the dividend drop.
  - The clue now names the cut-off day and the payout as a % of the price; it no longer says "paid out".
- **E6: the time words could be false.**
  - "today" only when the last close was today; otherwise "on Friday". "Over the past week" covers 5 days.
  - The stock, the market and the group are measured over the same dates.
- **Round 3:** the 5-day dividend line says "in the past week".

## Ms. Rivera (teacher): approved
- **Group names.** McDonald's sat among "fun extras like shoes and toys", while the "everyday" group said "food and drinks". The groups now use the words from the needs and wants lesson: things people want, and things people need.
- **Wording fixes.**
  - The sector line no longer nests a list inside a comma aside.
  - The miss-and-down line is hedged.
  - The market line is no longer circular.
- **Note for the app:** percentage headlines suit Big Moons.

Sign-off: approved by both reviewers, 2026-11-03.
