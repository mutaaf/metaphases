import type { CalendarResponse, MacroResponse, TickerResponse } from "../../shared/types";
import { useEffect, useState } from "react";
import { BASE } from "./router";
import { retryDelay } from "./partial";
import { settleContested } from "../../shared/contestedTime";

const mem = new Map<string, Promise<unknown>>();
async function fetchJson(path: string) {
  const r = await fetch(path);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error ?? "We couldn't reach the market data service."), { status: r.status });
  return body;
}

const CAL_CHUNK_DAYS = 7;
const isoAdd = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
/** Long calendar ranges are fetched a week at a time: each Worker invocation then parses at most ~5 raw upstream
 *  days, which keeps a cold month well inside the free plan's CPU budget (Cloudflare 1102). Chunks merge and dedupe;
 *  a failed chunk becomes a warning instead of failing the month. */
async function fetchCalendar(path: string): Promise<CalendarResponse> {
  // 0062: a session the two calendars contest is shown as unconfirmed on every surface (`fh` keeps the feed's).
  const r = await fetchCalendarRaw(path);
  return { ...r, events: (r.events ?? []).map(settleContested) };
}
async function fetchCalendarRaw(path: string): Promise<CalendarResponse> {
  const u = new URL(path, location.origin);
  const from = u.searchParams.get("from")!, to = u.searchParams.get("to")!;
  if (!from || !to || isoAdd(from, CAL_CHUNK_DAYS) > to) return fetchJson(path);
  // A background re-read (`_r`) must reach the worker, not the browser's copy of the chunk it's re-reading.
  const r = u.searchParams.get("_r");
  const chunks: [string, string][] = [];
  for (let d = from; d <= to; d = isoAdd(d, CAL_CHUNK_DAYS)) { const e = isoAdd(d, CAL_CHUNK_DAYS - 1); chunks.push([d, e < to ? e : to]); }
  const parts = await Promise.allSettled(chunks.map(([f, t]) => fetchJson(`${BASE}/api/calendar?from=${f}&to=${t}${r ? `&_r=${r}` : ""}`) as Promise<CalendarResponse>));
  if (parts.every((p) => p.status === "rejected")) throw (parts[0] as PromiseRejectedResult).reason;
  const seen = new Set<string>();
  const out: CalendarResponse = { from, to, events: [], asOf: new Date().toISOString(), warnings: [] };
  parts.forEach((p, i) => {
    if (p.status === "rejected") { out.warnings.push(`Couldn't load ${chunks[i][0]}–${chunks[i][1]} — showing the rest.`); return; }
    out.warnings.push(...(p.value.warnings ?? []));
    if (p.value.pending) out.pending = Math.max(out.pending ?? 0, p.value.pending); // one global count, repeated per chunk
    if (p.value.unchecked) out.unchecked = Math.max(out.unchecked ?? 0, p.value.unchecked); // 0015: same, for the Nasdaq cross-check
    if (p.value.uncheckedDays?.length) out.uncheckedDays = [...new Set([...(out.uncheckedDays ?? []), ...p.value.uncheckedDays])].sort(); // 0061: per chunk
    for (const e of p.value.events ?? []) {
      const k = `${e.s}|${e.d}`;
      if (e.d < from || e.d > to || seen.has(k)) continue;
      seen.add(k); out.events.push(e);
    }
  });
  return out;
}

function get<T>(path: string): Promise<T> {
  if (!mem.has(path)) {
    const p = (path.startsWith(`${BASE}/api/calendar?`) ? fetchCalendar(path) : fetchJson(path)) as Promise<unknown>;
    p.catch(() => mem.delete(path));
    // 0061: a partial or not-yet-checked answer isn't kept for the tab's life, or a revisit would replay it.
    p.then((d) => { const v = d as { warnings?: unknown[]; uncheckedDays?: unknown[] } | null; if (v?.warnings?.length || v?.uncheckedDays?.length) mem.delete(path); }, () => {});
    mem.set(path, p);
  }
  return mem.get(path) as Promise<T>;
}

/** `status` is the HTTP status of a failed load (0 for a network failure): 404 means "not found", anything else
 *  means "busy", and a busy service must never be described as a fact about the thing we asked for (0026). */
export interface Loadable<T> {
  data: T | null; error: string | null; loading: boolean; status?: number; retry?: () => void;
  /** A quiet re-read is scheduled (a partial result, or days still being cross-checked). False once the answer is final. */
  retrying?: boolean;
}
/** `recheck`: also re-read while days on screen haven't been cross-checked with Nasdaq (0061; the calendar page only). */
export function useApi<T>(path: string | null, { recheck = false }: { recheck?: boolean } = {}): Loadable<T> {
  const [st, setSt] = useState<Loadable<T>>({ data: null, error: null, loading: !!path });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setSt((s) => ({ data: s.data, error: null, loading: true }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (p: string, attempt: number) =>
      get<T>(p).then(
        (data) => {
          if (!live) return;
          // Partial result (some upstream calls were rate-limited, or days on screen not cross-checked yet): quietly ask again.
          const wait = retryDelay(data as { warnings?: string[]; uncheckedDays?: string[] }, attempt, recheck);
          setSt({ data, error: null, loading: false, retrying: wait != null });
          if (wait != null) timer = setTimeout(() => load(`${path}${path.includes("?") ? "&" : "?"}_r=${attempt + 1}`, attempt + 1), wait);
        },
        (e) => {
          if (!live) return;
          // A transient edge failure (e.g. a cold cache over the CPU budget) usually succeeds a moment later: retry once quietly.
          if (attempt === 0) { timer = setTimeout(() => load(p, 1), 1200); return; }
          // A failed background retry of a partial result keeps what already loaded (0026).
          if (p !== path) { setSt((s) => (s.data ? { ...s, loading: false, retrying: false } : s)); return; }
          setSt({ data: null, error: String(e.message ?? e), loading: false, status: typeof e?.status === "number" ? e.status : 0 });
        },
      );
    load(path, 0);
    return () => { live = false; clearTimeout(timer); };
  }, [path, nonce, recheck]);
  return { ...st, retry: () => setNonce((n) => n + 1) };
}

export const calendarPath = (from: string, to: string) => `${BASE}/api/calendar?from=${from}&to=${to}`;
export const useCalendar = (from: string, to: string, recheck = false) => useApi<CalendarResponse>(calendarPath(from, to), { recheck });
export const useMacro = () => useApi<MacroResponse>(`${BASE}/api/macro`);
export const useTicker = (s: string | null) => useApi<TickerResponse>(s ? `${BASE}/api/ticker/${s}` : null);
export const prefetchTicker = (s: string) => { get(`${BASE}/api/ticker/${s}`).catch(() => {}); };
