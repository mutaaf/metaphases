// A deliberately tiny Markdown subset for model output: paragraphs, "- " bullets, **bold**, _italic_.
// Builds React nodes (never innerHTML), so nothing a model writes can inject markup.
import type { ReactNode } from "react";

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_\n]+_|\*[^*\n]+\*)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<b key={`${keyBase}-${i++}`}>{tok.slice(2, -2)}</b>);
    else out.push(<em key={`${keyBase}-${i++}`}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`ul-${blocks.length}`}>{list.map((l, i) => <li key={i}>{inline(l, `li${blocks.length}-${i}`)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim().replace(/^#{1,6}\s+/, "");
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) { list.push(bullet[1]); continue; }
    flush();
    if (line) blocks.push(<p key={`p-${blocks.length}`}>{inline(line, `p${blocks.length}`)}</p>);
  }
  flush();
  return <div className="md">{blocks}</div>;
}
