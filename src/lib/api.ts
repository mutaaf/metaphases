import type { CalendarResponse, MacroResponse, TickerResponse } from "../../shared/types";
import { useEffect, useState } from "react";

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

export interface Loadable<T> { data: T | null; error: string | null; loading: boolean }
export function useApi<T>(path: string | null): Loadable<T> {
  const [st, setSt] = useState<Loadable<T>>({ data: null, error: null, loading: !!path });
  useEffect(() => {
    if (!path) return;
    let live = true;
    setSt((s) => ({ data: s.data, error: null, loading: true }));
    get<T>(path).then((data) => live && setSt({ data, error: null, loading: false }), (e) => live && setSt({ data: null, error: String(e.message ?? e), loading: false }));
    return () => { live = false; };
  }, [path]);
  return st;
}

export const calendarPath = (from: string, to: string) => `/api/calendar?from=${from}&to=${to}`;
export const useCalendar = (from: string, to: string) => useApi<CalendarResponse>(calendarPath(from, to));
export const useMacro = () => useApi<MacroResponse>("/api/macro");
export const useTicker = (s: string | null) => useApi<TickerResponse>(s ? `/api/ticker/${s}` : null);
export const prefetchTicker = (s: string) => { get(`/api/ticker/${s}`).catch(() => {}); };
