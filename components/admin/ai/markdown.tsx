import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Minimal, safe Markdown for AI output: headings, bullets, numbered lists, bold/italic, inline code, fenced code and
 * links. Renders React elements only (never raw HTML). Links are allowed only to /admin paths and https URLs.
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|_[^_]+_|\/admin\/[A-Za-z0-9/_\-?=&#.%]+)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k} className="font-semibold text-fg">{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k} className="rounded bg-ink-850 px-1 font-mono text-[12px]">{t.slice(1, -1)}</code>);
    else if (t.startsWith("_")) out.push(<em key={k}>{t.slice(1, -1)}</em>);
    else if (t.startsWith("[")) {
      const [, label, href] = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? [];
      if (href?.startsWith("/admin/")) out.push(<Link key={k} href={href} className="text-brand-blue hover:underline">{label}</Link>);
      else if (href?.startsWith("https://")) out.push(<a key={k} href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-blue hover:underline">{label}</a>);
      else out.push(label ?? t);
    } else {
      const href = t.replace(/[.,;:)]+$/, "");
      out.push(<Link key={k} href={href} className="text-brand-blue hover:underline">{href}</Link>, t.slice(href.length));
    }
    last = m.index! + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const k = `l${blocks.length}`;
    const items = list.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}`)}</li>);
    blocks.push(list.ordered ? <ol key={k} className="ml-5 list-decimal space-y-0.5">{items}</ol> : <ul key={k} className="ml-5 list-disc space-y-0.5">{items}</ul>);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
      blocks.push(<pre key={`c${i}`} className="max-h-96 overflow-auto rounded-md border border-line bg-ink-850 p-2.5 font-mono text-[11.5px] leading-relaxed">{code.join("\n")}</pre>);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const b = line.match(/^\s*[-*•]\s+(.*)$/);
    const n = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) {
      flush();
      blocks.push(<p key={`h${i}`} className="mt-2 font-semibold text-fg">{inline(h[2], `h${i}`)}</p>);
    } else if (b || n) {
      const ordered = !!n;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((b ?? n)![1]);
    } else if (!line.trim()) flush();
    else {
      flush();
      blocks.push(<p key={`p${i}`}>{inline(line, `p${i}`)}</p>);
    }
  }
  flush();
  return <div className="space-y-1.5 text-[13.5px] leading-relaxed text-fg/90">{blocks}</div>;
}
