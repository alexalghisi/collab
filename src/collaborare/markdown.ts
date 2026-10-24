/**
 * The small Markdown subset collaborare.ro statements use, turned into blocks
 * the panel can render with plain Text: headings, paragraphs, bullet items and
 * fenced code, with **bold** and `code` inside a line. Images and math markup
 * are handled elsewhere (statement.ts lists them; this drops their markup).
 */
export type StatementSpan =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'bold'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string };

export type StatementBlock =
  | { readonly kind: 'heading'; readonly level: number; readonly spans: StatementSpan[] }
  | { readonly kind: 'paragraph'; readonly spans: StatementSpan[] }
  | { readonly kind: 'bullet'; readonly spans: StatementSpan[] }
  | { readonly kind: 'code'; readonly text: string };

function stripMarkup(statement: string): string {
  return statement
    .replace(/\r\n/g, '\n')
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/\$\$([\s\S]+?)\$\$/g, '\n$1\n')
    .replace(/\\\[([\s\S]+?)\\\]/g, '\n$1\n')
    .replace(/\\\(([\s\S]+?)\\\)/g, ' $1 ')
    .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, '$1$2');
}

export function inlineSpans(line: string): StatementSpan[] {
  const spans: StatementSpan[] = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) {
      spans.push({ kind: 'text', text: line.slice(last, at) });
    }
    if (match[1] !== undefined) {
      spans.push({ kind: 'code', text: match[1] });
    } else if (match[2] !== undefined) {
      spans.push({ kind: 'bold', text: match[2] });
    }
    last = at + match[0].length;
  }
  if (last < line.length) {
    spans.push({ kind: 'text', text: line.slice(last) });
  }
  return spans;
}

export function parseStatement(statement: string): StatementBlock[] {
  const blocks: StatementBlock[] = [];
  const lines = stripMarkup(statement).split('\n');
  let paragraph: string[] = [];
  const flush = (): void => {
    const text = paragraph.join(' ').replace(/\s+/g, ' ').trim();
    if (text !== '') {
      blocks.push({ kind: 'paragraph', spans: inlineSpans(text) });
    }
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const fence = /^\s*```/.test(line);
    if (fence) {
      flush();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index] ?? '')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({
        kind: 'heading',
        level: heading[1]?.length ?? 1,
        spans: inlineSpans((heading[2] ?? '').trim()),
      });
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      blocks.push({ kind: 'bullet', spans: inlineSpans((bullet[1] ?? '').trim()) });
      continue;
    }
    if (line.trim() === '') {
      flush();
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}
