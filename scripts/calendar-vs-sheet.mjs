#!/usr/bin/env node
// 0024 sweep: for the N largest universe names, does every sheet `next.date` in the next D days have a
// calendar row on that date? Read-only against production (or BASE=...). Usage:
//   node scripts/calendar-vs-sheet.mjs [N=150] [D=30]
// A share class whose sibling (same company name) has the row counts as present: one report, one row (0041).
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "https://mutaafaziz.com/metaphases";
const N = Number(process.argv[2] ?? 150), D = Number(process.argv[3] ?? 30);
const U = JSON.parse(readFileSync(new URL("../data/universe.json", import.meta.url), "utf8"));
const iso = (d) => d.toISOString().slice(0, 10);
const today = iso(new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })));
const end = iso(new Date(Date.parse(today + "T12:00:00Z") + D * 86400000));
const get = async (p) => { for (let i = 0; i < 3; i++) { const r = await fetch(BASE + p); if (r.ok) return r.json(); await new Promise((ok) => setTimeout(ok, 1500)); } throw new Error(`${p} failed`); };

// The calendar a week at a time, the way the app loads it.
const rows = new Map(); // symbol -> Set(dates)
const warnings = [];
for (let d = today; d <= end; d = iso(new Date(Date.parse(d + "T12:00:00Z") + 7 * 86400000))) {
  const to = iso(new Date(Math.min(Date.parse(d + "T12:00:00Z") + 6 * 86400000, Date.parse(end + "T12:00:00Z"))));
  const c = await get(`/api/calendar?from=${d}&to=${to}`);
  warnings.push(...c.warnings);
  for (const e of c.events) (rows.get(e.s) ?? rows.set(e.s, new Set()).get(e.s)).add(e.d);
}
const names = Object.entries(U).sort((a, b) => (b[1].mc ?? 0) - (a[1].mc ?? 0)).slice(0, N).map(([s]) => s);
const missing = [], mismatched = [], failed = [];
let inWindow = 0, i = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (i < names.length) {
    const s = names[i++];
    let t;
    try { t = await get(`/api/ticker/${encodeURIComponent(s)}`); } catch { failed.push(s); continue; }
    const nd = t.next?.date;
    if (!nd || nd < today || nd > end) continue;
    inWindow++;
    const siblings = Object.keys(U).filter((x) => x === s || U[x].n === U[s].n);
    const dates = new Set(siblings.flatMap((x) => [...(rows.get(x) ?? [])]));
    if (!dates.size) missing.push(`${s} ${nd}`);
    else if (!dates.has(nd)) mismatched.push(`${s} sheet ${nd} · calendar ${[...dates].join(",")}`);
  }
}));
console.log(`${today}..${end}: ${names.length} names, ${inWindow} with a sheet date in the window`);
console.log(`missing ${missing.length}: ${missing.join("; ") || "-"}`);
console.log(`mismatched ${mismatched.length}: ${mismatched.join("; ") || "-"}`);
if (failed.length) console.log(`sheet failed ${failed.length}: ${failed.join(", ")}`);
if (warnings.length) console.log(`calendar warnings: ${warnings.join(" | ")}`);
process.exit(missing.length || mismatched.length ? 1 : 0);
