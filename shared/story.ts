// 9:16 story cards (1080×1920) for sharing to Instagram / WhatsApp stories. Pure SVG builders —
// the worker rasterizes them with resvg-wasm (worker/og.ts). Same brand as the 1200×630 card.
import type { Session } from "./types";
import { epsIn } from "./currency";

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const INK = "#111114", PAPER = "#edeae2", ACCENT = "#2346d8", MUTED = "#6b675e";

function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    if ((line + " " + w).trim().length > max) { if (line) out.push(line); line = w; } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out;
}

function phase(h: Session, cx: number, cy: number, r: number) {
  const ring = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ACCENT}" stroke-width="${(r * 0.14).toFixed(1)}"${h === "" ? ` stroke-dasharray="${(r * 0.35).toFixed(1)} ${(r * 0.3).toFixed(1)}"` : ""}/>`;
  if (h === "dmh") return ring + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ACCENT}"/>`;
  if (h === "bmo") return ring + `<path d="M${cx} ${cy - r}a${r} ${r} 0 0 1 0 ${2 * r}a${r / 2} ${r} 0 0 0 0-${2 * r}z" fill="${ACCENT}"/>`;
  if (h === "amc") return ring + `<path d="M${cx} ${cy - r}a${r} ${r} 0 0 0 0 ${2 * r}a${r / 2} ${r} 0 0 1 0-${2 * r}z" fill="${ACCENT}"/>`;
  return ring;
}

function frame(eyebrow: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
<rect width="1080" height="1920" fill="${PAPER}"/>
<rect x="40" y="40" width="1000" height="1840" fill="none" stroke="${INK}" stroke-width="3"/>
<g transform="translate(96 120) scale(1.6)"><circle cx="15" cy="15" r="12.5" fill="none" stroke="${ACCENT}" stroke-width="2.6"/><path d="M15 2.5a12.5 12.5 0 0 1 0 25a7.6 12.5 0 0 1 0-25z" fill="${ACCENT}"/></g>
<text x="170" y="160" font-family="Martian Mono" font-size="26" letter-spacing="6" fill="${INK}">METAPHASES</text>
<text x="96" y="300" font-family="Martian Mono" font-size="26" letter-spacing="5" fill="${MUTED}">${xml(eyebrow.toUpperCase())}</text>
${body}
<line x1="96" y1="1700" x2="984" y2="1700" stroke="#c6c0b1" stroke-width="2"/>
<text x="96" y="1770" font-family="Instrument Serif" font-style="italic" font-size="44" fill="${INK}">Every earnings report, phase by phase.</text>
<text x="96" y="1830" font-family="Martian Mono" font-size="24" letter-spacing="5" fill="${ACCENT}">MUTAAFAZIZ.COM/METAPHASES</text>
</svg>`;
}

const lines = (ls: string[], x: number, y: number, size: number, lh: number, attrs: string) =>
  ls.map((l, i) => `<text x="${x}" y="${y + i * lh}" font-size="${size}" ${attrs}>${xml(l)}</text>`).join("\n");

export interface StoryTicker { symbol: string; name: string; does: string; when: string; session: Session; epsE: number | null; cur?: string; move: number | null; grade: string | null; beats: number | null; total: number | null }

export function storyTickerSvg(d: StoryTicker): string {
  const symSize = d.symbol.length > 4 ? 190 : 240;
  const stat = (y: number, label: string, value: string) =>
    `<text x="96" y="${y}" font-family="Martian Mono" font-size="26" letter-spacing="5" fill="${MUTED}">${xml(label)}</text>` +
    `<text x="96" y="${y + 78}" font-family="Schibsted Grotesk" font-weight="800" font-size="74" fill="${INK}">${xml(value)}</text>`;
  const body = `
<text x="84" y="560" font-family="Schibsted Grotesk" font-weight="900" font-size="${symSize}" letter-spacing="-8" fill="${INK}">${xml(d.symbol)}</text>
${phase(d.session, 880, 470, 92)}
${lines(wrap(d.name, 26), 96, 650, 52, 62, `font-family="Schibsted Grotesk" font-weight="700" fill="#3b3a37"`)}
${lines(wrap(d.does, 34), 96, 770, 40, 54, `font-family="Schibsted Grotesk" fill="#3b3a37"`)}
${lines(wrap(`Reports ${d.when}`, 26), 96, 960, 72, 80, `font-family="Instrument Serif" font-style="italic" fill="${ACCENT}"`)}
${stat(1180, "WALL STREET EXPECTS", d.epsE != null ? `${epsIn(d.epsE, d.cur)} a share` : "—")}
${stat(1350, "USUALLY MOVES", d.move != null ? `±${d.move.toFixed(1)}%` : "—")}
${stat(1520, "QUALITY GRADE · BEAT RECORD", `${d.grade ?? "—"} · ${d.beats != null && d.total ? `${d.beats} of ${d.total}` : "—"}`)}`;
  return frame("This week's report", body);
}

export function storyMoodSvg(score: number, headline: string, line: string): string {
  const x = 96 + (888 * Math.max(0, Math.min(100, score))) / 100;
  const tones = ["#B23A2E", "#D0805A", "#C9B48F", "#8FB59E", "#2F7D57"];
  const bar = tones.map((c, i) => `<rect x="${96 + i * 179}" y="1060" width="173" height="34" fill="${c}"/>`).join("");
  const body = `
<text x="84" y="720" font-family="Schibsted Grotesk" font-weight="900" font-size="360" letter-spacing="-14" fill="${INK}">${score}</text>
<text x="96" y="800" font-family="Martian Mono" font-size="28" letter-spacing="5" fill="${MUTED}">OUT OF 100 · 0 FEAR → 100 GREED</text>
${bar}<rect x="${x - 5}" y="1040" width="10" height="74" fill="${INK}"/>
${lines(wrap(headline, 20), 96, 1260, 84, 92, `font-family="Instrument Serif" font-style="italic" fill="${ACCENT}"`)}
${lines(wrap(line, 36), 96, 1440, 40, 54, `font-family="Schibsted Grotesk" fill="#3b3a37"`)}`;
  return frame("The market's mood today", body);
}

export function storyMacroSvg(name: string, when: string, blurb: string): string {
  const body = `
${lines(wrap(name, 14), 84, 560, 150, 150, `font-family="Schibsted Grotesk" font-weight="900" letter-spacing="-5" fill="${INK}"`)}
${lines(wrap(when, 24), 96, 980, 72, 80, `font-family="Instrument Serif" font-style="italic" fill="${ACCENT}"`)}
${lines(wrap(blurb, 36), 96, 1180, 42, 58, `font-family="Schibsted Grotesk" fill="#3b3a37"`)}`;
  return frame("The big event this week", body);
}

/** Metaphases Kids invite card: friendly, no prices, no tickers — just the idea. */
export function storyKidsSvg(): string {
  const moons = [0, 1, 2, 3, 4].map((k) => {
    const cx = 180 + k * 180, cy = 1180, r = 62;
    const ring = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#f5f3ee" stroke="${ACCENT}" stroke-width="8"/>`;
    if (k === 0) return ring;
    if (k === 4) return ring + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ACCENT}"/>`;
    if (k === 2) return ring + `<path d="M${cx} ${cy - r}a${r} ${r} 0 0 1 0 ${2 * r}z" fill="${ACCENT}"/>`;
    const rx = (r * 0.6).toFixed(1);
    const sweep = k === 1 ? 0 : 1;
    return ring + `<path d="M${cx} ${cy - r}a${r} ${r} 0 0 1 0 ${2 * r}a${rx} ${r} 0 0 ${sweep} 0-${2 * r}z" fill="${ACCENT}"/>`;
  }).join("");
  const body = `
${lines(["Learn how the", "market works."], 84, 520, 132, 140, `font-family="Schibsted Grotesk" font-weight="900" letter-spacing="-4" fill="${INK}"`)}
${lines(["With pretend money,", "real prices and a", "moon called Luna."], 96, 820, 68, 80, `font-family="Instrument Serif" font-style="italic" fill="${ACCENT}"`)}
${moons}
${lines(["Guess company report cards. Build a", "pretend piggy bank. Learn what a share is.", "No real money. No ads. Nothing to buy."], 96, 1400, 38, 54, `font-family="Schibsted Grotesk" fill="#3b3a37"`)}`;
  return frame("Metaphases Kids · Market Moon Club", body);
}
