// Pure helpers behind the "data depth" features: chart shaping, peers, ICS feed, season scoreboard,
// quarterly series and the share-card SVG. Shared by the worker and the client, and unit-tested.
import type { EarningsEvent, Quarter, Reaction, Session } from "./types";
import { epsIn } from "./currency";

// ── Chart ──────────────────────────────────────────────────────────────
/** Evenly downsample to at most `max` items, always keeping the first and last. */
export function downsample<T>(xs: T[], max: number): T[] {
  if (xs.length <= max) return xs.slice();
  const out: T[] = [];
  const step = (xs.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(xs[Math.round(i * step)]);
  return out;
}

/** Rolling simple moving average aligned to `xs` (null until there is enough history). */
export function rollingSma(xs: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(xs.length).fill(null);
  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    sum += xs[i];
    if (i >= n) sum -= xs[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** Shape ~2 years of candles into the sheet's 1-year chart payload (averages use the full history). */
export function shapeChart(t: number[], c: number[], days = 252, max = 260) {
  if (c.length < 30) return null;
  const s50 = rollingSma(c, 50), s200 = rollingSma(c, 200);
  const from = Math.max(0, c.length - days);
  const idx = downsample(Array.from({ length: c.length - from }, (_, i) => from + i), max);
  const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
  return { t: idx.map((i) => t[i]), c: idx.map((i) => r2(c[i]) as number), s50: idx.map((i) => r2(s50[i])), s200: idx.map((i) => r2(s200[i])) };
}

export const nyDate = (t: number) => new Date(t * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/** Place each past report on the chart: the first chart point on/after the report date. */
export function placeMarkers(chartT: number[], history: Reaction[]) {
  const dates = chartT.map(nyDate);
  const out: { i: number; r: Reaction }[] = [];
  for (const r of history) {
    if (r.date.length !== 10 || !dates.length) continue;
    if (r.date < dates[0] || r.date > dates[dates.length - 1]) continue; // outside the chart window
    const i = dates.findIndex((d) => d >= r.date);
    if (i >= 0) out.push({ i, r });
  }
  return out;
}

// ── Peers ──────────────────────────────────────────────────────────────
const shift = (s: string, n: number) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Same-sector tracked companies reporting within ±days of `date`: the biggest `max`, in date order. */
export function peersFor(sym: string, date: string, events: EarningsEvent[], sectorOf: (s: string) => string | undefined, mcapOf: (s: string) => number, days = 7, max = 6): EarningsEvent[] {
  const sec = sectorOf(sym);
  if (!sec || sec === "Other") return [];
  const lo = shift(date, -days), hi = shift(date, days);
  const seen = new Set<string>();
  return events
    .filter((e) => {
      if (!e.t || e.s === sym || e.d < lo || e.d > hi || sectorOf(e.s) !== sec || seen.has(e.s)) return false;
      seen.add(e.s);
      return true;
    })
    .sort((a, b) => mcapOf(b.s) - mcapOf(a.s))
    .slice(0, max)
    .sort((a, b) => a.d.localeCompare(b.d) || mcapOf(b.s) - mcapOf(a.s));
}

// ── Quarterly series (Finnhub metric=all → series.quarterly) ───────────
type Pt = { period: string; v: number };
export function quartersFrom(series: Record<string, Pt[]> | undefined, sharesMillions: number | null, max = 8): Quarter[] {
  if (!series) return [];
  const by = (k: string) => new Map((series[k] ?? []).map((p) => [p.period, p.v] as const));
  const eps = by("eps"), sps = by("salesPerShare"), gm = by("grossMargin"), om = by("operatingMargin");
  const periods = Array.from(new Set([...eps.keys(), ...sps.keys()])).sort().slice(-max);
  // Finnhub reports margins as fractions (0.48); normalize to percent.
  const pctOf = (v: number | undefined) => (v == null ? null : Math.round((Math.abs(v) <= 1.5 ? v * 100 : v) * 10) / 10);
  return periods.map((p) => {
    const s = sps.get(p);
    return { period: p, eps: eps.get(p) ?? null, rev: s != null && sharesMillions ? s * sharesMillions * 1e6 : null, gm: pctOf(gm.get(p)), om: pctOf(om.get(p)) };
  });
}

// ── ICS (RFC 5545) ─────────────────────────────────────────────────────
export interface IcsItem { symbol: string; name: string; date: string; session: Session; quarter: number; year: number; epsE: number | null; cur?: string; url: string }
const SESSION_TEXT: Record<Session, string> = { bmo: "before the open", amc: "after the close", dmh: "during market hours", "": "time not yet confirmed" };
const escText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold content lines at 75 octets (RFC 5545 §3.1); continuation lines start with one space. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  for (const ch of line) {
    const limit = parts.length ? 74 : 75; // the leading space counts toward the 75
    if (enc.encode(cur + ch).length > limit) { parts.push(cur); cur = ch; } else cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

export function buildIcs(items: IcsItem[], stamp: Date): string {
  const dt = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Metaphases//Earnings//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Metaphases · earnings", "X-PUBLISHED-TTL:PT6H", "REFRESH-INTERVAL;VALUE=DURATION:PT6H"];
  for (const it of items) {
    const est = it.epsE != null ? ` Street expects ${epsIn(it.epsE, it.cur)} EPS.` : "";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${it.symbol}-${it.year}Q${it.quarter}@metaphases`,
      `DTSTAMP:${dt}`,
      `DTSTART;VALUE=DATE:${it.date.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${shift(it.date, 1).replace(/-/g, "")}`,
      `SUMMARY:${escText(`${it.symbol} earnings · ${SESSION_TEXT[it.session]}`)}`,
      `DESCRIPTION:${escText(`${it.name} reports Q${it.quarter} ${it.year} ${SESSION_TEXT[it.session]}.${est} Full read: ${it.url}`)}`,
      `URL:${it.url}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

// ── Season scoreboard ──────────────────────────────────────────────────
export interface Season { members: number; reported: number; reportedPct: number; epsBeatPct: number | null; revBeatPct: number | null; medianSurprise: number | null; from: string; to: string; enough: boolean }

/** Aggregate S&P 500 members' reported results inside [from, to] (latest report per company). */
export function seasonScore(events: EarningsEvent[], isMember: (s: string) => boolean, memberCount: number, from: string, to: string): Season {
  const seen = new Map<string, EarningsEvent>();
  for (const e of events) if (e.eA != null && e.d >= from && e.d <= to && isMember(e.s)) seen.set(e.s, e);
  const done = [...seen.values()];
  const epsJ = done.filter((e) => e.eE != null);
  const revJ = done.filter((e) => e.rA != null && e.rE != null);
  const sur = epsJ
    .filter((e) => e.eE !== 0)
    .map((e) => (((e.eA as number) - (e.eE as number)) / Math.abs(e.eE as number)) * 100)
    .filter((x) => Math.abs(x) < 500)
    .sort((a, b) => a - b);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
  return {
    members: memberCount,
    reported: done.length,
    reportedPct: memberCount ? Math.round((done.length / memberCount) * 100) : 0,
    epsBeatPct: pct(epsJ.filter((e) => (e.eA as number) >= (e.eE as number)).length, epsJ.length),
    revBeatPct: pct(revJ.filter((e) => (e.rA as number) >= (e.rE as number)).length, revJ.length),
    medianSurprise: sur.length ? Math.round(sur[Math.floor(sur.length / 2)] * 10) / 10 : null,
    from, to, enough: done.length >= 20,
  };
}

// ── Share card (SVG; the worker rasterizes it to PNG) ──────────────────
export interface CardData { symbol: string; name: string; when: string | null; session: Session; move: number | null; beats: number | null; total: number | null; epsE: number | null; cur?: string }
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function phaseGlyph(h: Session, cx: number, cy: number, r: number, fill: string) {
  const ring = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${fill}" stroke-width="${(r * 0.16).toFixed(1)}"${h === "" ? ` stroke-dasharray="${(r * 0.35).toFixed(1)} ${(r * 0.3).toFixed(1)}"` : ""}/>`;
  if (h === "dmh") return ring + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
  if (h === "bmo") return ring + `<path d="M${cx} ${cy - r}a${r} ${r} 0 0 1 0 ${2 * r}a${r / 2} ${r} 0 0 0 0-${2 * r}z" fill="${fill}"/>`;
  if (h === "amc") return ring + `<path d="M${cx} ${cy - r}a${r} ${r} 0 0 0 0 ${2 * r}a${r / 2} ${r} 0 0 1 0-${2 * r}z" fill="${fill}"/>`;
  return ring;
}

export function cardSvg(d: CardData): string {
  const sess = { bmo: "before the open", amc: "after the close", dmh: "during market hours", "": "time TBD" }[d.session];
  const name = d.name.length > 34 ? d.name.slice(0, 33) + "…" : d.name;
  const stat = (x: number, label: string, value: string) =>
    `<text x="${x}" y="500" font-family="Martian Mono" font-size="17" letter-spacing="3" fill="#7d796f">${label}</text>` +
    `<text x="${x}" y="556" font-family="Schibsted Grotesk" font-weight="800" font-size="48" fill="#111114">${xml(value)}</text>`;
  const symSize = d.symbol.length > 4 ? 120 : 150;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#edeae2"/>
<rect x="28" y="28" width="1144" height="574" fill="none" stroke="#111114" stroke-width="2"/>
<g transform="translate(76 78)"><circle cx="15" cy="15" r="12.5" fill="none" stroke="#2346d8" stroke-width="2.6"/><path d="M15 2.5a12.5 12.5 0 0 1 0 25a7.6 12.5 0 0 1 0-25z" fill="#2346d8"/></g>
<text x="120" y="102" font-family="Martian Mono" font-size="18" letter-spacing="4" fill="#111114">METAPHASES · EARNINGS, PHASE BY PHASE</text>
<text x="72" y="252" font-family="Schibsted Grotesk" font-weight="900" font-size="${symSize}" letter-spacing="-5" fill="#111114">${xml(d.symbol)}</text>
<text x="80" y="312" font-family="Schibsted Grotesk" font-weight="700" font-size="38" fill="#3b3a37">${xml(name)}</text>
<text x="80" y="392" font-family="Instrument Serif" font-style="italic" font-size="54" fill="#2346d8">${xml(d.when ? `Reports ${d.when}, ${sess}` : "No report date yet")}</text>
<line x1="76" y1="440" x2="1124" y2="440" stroke="#c6c0b1" stroke-width="2"/>
${stat(80, "STREET EPS EST", d.epsE != null ? epsIn(d.epsE, d.cur) : "—")}
${stat(440, "TYPICAL MOVE", d.move != null ? `±${d.move.toFixed(1)}%` : "—")}
${stat(780, "BEAT RECORD", d.beats != null && d.total ? `${d.beats} of ${d.total}` : "—")}
${phaseGlyph(d.session, 1030, 205, 80, "#2346d8")}
<text x="1124" y="588" text-anchor="end" font-family="Martian Mono" font-size="16" letter-spacing="3" fill="#2346d8">MUTAAFAZIZ.COM/METAPHASES</text>
</svg>`;
}
