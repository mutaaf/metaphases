export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MON3 = MONTHS.map((m) => m.slice(0, 3).toUpperCase());
export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI"];

/** "Now" in New York, the market's clock. */
export const nowNY = () => new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
export const todayISO = () => iso(nowNY());

export const isWeekend = (s: string) => { const w = parse(s).getDay(); return w === 0 || w === 6; };

/** Monday-start weeks covering a month (weekdays only), like a trading desk calendar. */
export function monthWeeks(year: number, month: number): string[][] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  const wd = (first.getDay() + 6) % 7; // 0 = Mon
  if (wd >= 5) start.setDate(first.getDate() + (7 - wd)); // month starts on a weekend → begin next Monday
  else start.setDate(first.getDate() - wd);
  const last = new Date(year, month + 1, 0);
  const weeks: string[][] = [];
  const cur = new Date(start);
  while (cur <= last || weeks.length === 0) {
    const w: string[] = [];
    for (let i = 0; i < 5; i++) { const d = new Date(cur); d.setDate(cur.getDate() + i); w.push(iso(d)); }
    weeks.push(w);
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

export const weekOf = (s: string) => { const d = parse(s); const wd = (d.getDay() + 6) % 7; return Array.from({ length: 5 }, (_, i) => addDays(s, i - wd)); };

export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

export const fmtLong = (s: string) => parse(s).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
/** "Tue, Nov 17" */
export const fmtDay = (s: string) => parse(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
export const fmtShort = (s: string) => `${MON3[parse(s).getMonth()]} ${String(parse(s).getDate()).padStart(2, "0")}`;
