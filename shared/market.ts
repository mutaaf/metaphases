// Static market calendar facts. Update once a year (the Fed publishes its schedule each summer).
export const FOMC: { date: string; sep?: boolean; tentative?: boolean }[] = [
  { date: "2026-01-28" }, { date: "2026-03-18", sep: true }, { date: "2026-04-29" }, { date: "2026-06-17", sep: true },
  { date: "2026-07-29" }, { date: "2026-09-16", sep: true }, { date: "2026-10-28" }, { date: "2026-12-09", sep: true },
  { date: "2027-01-27", tentative: true }, { date: "2027-03-17", sep: true, tentative: true }, { date: "2027-04-28", tentative: true },
  { date: "2027-06-16", sep: true, tentative: true },
];

// NYSE full-day closures.
export const HOLIDAYS: { date: string; name: string }[] = [
  { date: "2026-01-01", name: "New Year's Day" }, { date: "2026-01-19", name: "MLK Day" }, { date: "2026-02-16", name: "Presidents' Day" },
  { date: "2026-04-03", name: "Good Friday" }, { date: "2026-05-25", name: "Memorial Day" }, { date: "2026-06-19", name: "Juneteenth" },
  { date: "2026-07-03", name: "Independence Day (obs.)" }, { date: "2026-09-07", name: "Labor Day" }, { date: "2026-11-26", name: "Thanksgiving" },
  { date: "2026-12-25", name: "Christmas" }, { date: "2027-01-01", name: "New Year's Day" }, { date: "2027-01-18", name: "MLK Day" },
  { date: "2027-02-15", name: "Presidents' Day" }, { date: "2027-03-26", name: "Good Friday" }, { date: "2027-05-31", name: "Memorial Day" },
  { date: "2027-06-18", name: "Juneteenth (obs.)" }, { date: "2027-07-05", name: "Independence Day (obs.)" }, { date: "2027-09-06", name: "Labor Day" },
  { date: "2027-11-25", name: "Thanksgiving" }, { date: "2027-12-24", name: "Christmas (obs.)" },
];
export const EARLY_CLOSE: Record<string, string> = { "2026-11-27": "Closes 1:00 PM", "2026-12-24": "Closes 1:00 PM", "2027-11-26": "Closes 1:00 PM" };
