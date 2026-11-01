// Server-sent events from /api/ai/stream. Pure, so it's unit-testable without a browser.
export type StreamEvent = { t: string } | { done: true; provider: string; model: string } | { error: string };

/** Parse a buffer of SSE text into events. Returns [events, leftover] — the leftover is a partial event. */
export function parseSse(buf: string): [StreamEvent[], string] {
  const out: StreamEvent[] = [];
  let nl: number;
  while ((nl = buf.indexOf("\n\n")) >= 0) {
    const block = buf.slice(0, nl);
    buf = buf.slice(nl + 2);
    for (const line of block.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try { out.push(JSON.parse(line.slice(5).trim())); } catch {}
    }
  }
  return [out, buf];
}
