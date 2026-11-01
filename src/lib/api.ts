import type { CalendarResponse, MacroResponse, TickerResponse } from "../../shared/types";
import { useEffect, useState } from "react";
import { BASE } from "./router";

const mem = new Map<string, Promise<unknown>>();
function get<T>(path: string): Promise<T> {
  if (!mem.has(path)) {
    const p = fetch(path).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "We couldn't reach the market data service.");
      return body;
    });
    p.catch(() => mem.delete(path));
    mem.set(path, p);
  }
  return mem.get(path) as Promise<T>;
}

export interface Loadable<T> { data: T | null; error: string | null; loading: boolean; retry?: () => void }
export function useApi<T>(path: string | null): Loadable<T> {
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
          setSt({ data, error: null, loading: false });
          // Partial result (some upstream calls were rate-limited): quietly retry twice.
          const w = (data as { warnings?: string[] })?.warnings;
          if (w?.length && attempt < 2) timer = setTimeout(() => load(`${path}${path.includes("?") ? "&" : "?"}_r=${attempt + 1}`, attempt + 1), 4000 * (attempt + 1));
        },
        (e) => {
          if (!live) return;
          // A transient edge failure (e.g. a cold cache over the CPU budget) usually succeeds a moment later: retry once quietly.
          if (attempt === 0) { timer = setTimeout(() => load(p, 1), 1200); return; }
          setSt({ data: null, error: String(e.message ?? e), loading: false });
        },
      );
    load(path, 0);
    return () => { live = false; clearTimeout(timer); };
  }, [path, nonce]);
  return { ...st, retry: () => setNonce((n) => n + 1) };
}

export const calendarPath = (from: string, to: string) => `${BASE}/api/calendar?from=${from}&to=${to}`;
export const useCalendar = (from: string, to: string) => useApi<CalendarResponse>(calendarPath(from, to));
export const useMacro = () => useApi<MacroResponse>(`${BASE}/api/macro`);
export const useTicker = (s: string | null) => useApi<TickerResponse>(s ? `${BASE}/api/ticker/${s}` : null);
export const prefetchTicker = (s: string) => { get(`${BASE}/api/ticker/${s}`).catch(() => {}); };
