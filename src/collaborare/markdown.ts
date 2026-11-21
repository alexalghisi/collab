/**
 * The small Markdown subset collaborare.ro statements use, turned into blocks
 * the panel can render with plain Text: headings, paragraphs, bullet items and
 * fenced code, with **bold** and `code` inside a line. Images and math markup
 * are handled elsewhere (statement.ts lists them; this drops their markup).
 */
export type StatementSpan =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'bold'; readonly text: string }
  | { readonly kind: 'italic'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string };

export type StatementBlock =
  | { readonly kind: 'heading'; readonly level: number; readonly spans: StatementSpan[] }
  | { readonly kind: 'paragraph'; readonly spans: StatementSpan[] }
  | { readonly kind: 'bullet'; readonly spans: StatementSpan[] }
  | { readonly kind: 'code'; readonly text: string };

const COMMANDS: Record<string, string> = {
  in: '∈',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  neq: '≠',
  ne: '≠',
  times: '×',
  cdot: '·',
  dots: '…',
  ldots: '…',
  cdots: '⋯',
  to: '→',
  pm: '±',
  sigma: 'σ',
  ell: 'ℓ',
  oplus: '⊕',
  lfloor: '⌊',
  rfloor: '⌋',
  bmod: ' mod ',
  min: 'min',
  max: 'max',
  gcd: 'cmmdc',
  quad: ' ',
  circ: '°',
};

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

const SUBSCRIPT: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  a: 'ₐ',
  e: 'ₑ',
  h: 'ₕ',
  i: 'ᵢ',
  j: 'ⱼ',
  k: 'ₖ',
  l: 'ₗ',
  m: 'ₘ',
  n: 'ₙ',
  o: 'ₒ',
  p: 'ₚ',
  r: 'ᵣ',
  s: 'ₛ',
  t: 'ₜ',
  u: 'ᵤ',
  v: 'ᵥ',
  x: 'ₓ',
};

function script(table: Record<string, string>, value: string): string {
  return [...value].map((character) => table[character] ?? character).join('');
}

export function readableMath(text: string): string {
  const withCommands = text
    .replace(/\^\\circ\b/g, '°')
    .replace(/\\text\{([^{}]*)\}/g, '$1')
    .replace(/\\color\{[^{}]*\}/g, '')
    .replace(/\\sqrt\{([^{}]*)\}/g, '√$1')
    .replace(/\\sqrt\s*([0-9a-zA-Z])/g, '√$1')
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2')
    .replace(/\\(?:begin|end)\{[^{}]*\}/g, '')
    .replace(/\\([a-zA-Z]+)\b/g, (full, name: string) => COMMANDS[name] ?? full)
    .replace(/\\[,;]/g, ' ')
    .replace(/\\ /g, ' ')
    .replace(/\\[{}]/g, '')
    .replace(/&/g, ' ');
  const withScripts = withCommands
    .replace(/_\{([^{}]+)\}/g, (_, value: string) => script(SUBSCRIPT, value))
    .replace(/_([0-9a-z])/g, (_, value: string) => script(SUBSCRIPT, value))
    .replace(/\^\{(\d+)\}/g, (_, value: string) => script(SUPERSCRIPT, value))
    .replace(/\^(\d)/g, (_, value: string) => script(SUPERSCRIPT, value))
    .replace(/\\([a-zA-Z]+)/g, '$1');
  return spaceSigns(withScripts)
    .replace(/⌊\s+/g, '⌊')
    .replace(/\s+⌋/g, '⌋')
    .replace(/[ \t]{2,}/g, ' ');
}

function spaceSigns(text: string): string {
  let current = text;
  const jammed = /([^\s])([=+\u00b7×≤≥≠→⊕])([^\s])/g;
  const numeric = /[0-9⁰¹²³⁴⁵⁶⁷⁸⁹·×]/;
  for (let pass = 0; pass < 8; pass += 1) {
    const next = current.replace(jammed, (full, left: string, sign: string, right: string) => {
      if (
        sign === '+' &&
        (left === '+' || right === '+' || (!numeric.test(left) && !numeric.test(right)))
      ) {
        return full;
      }
      return `${left} ${sign} ${right}`;
    });
    if (next === current) {
      break;
    }
    current = next;
  }
  return current.replace(/([0-9⁰¹²³⁴⁵⁶⁷⁸⁹])-(?=[0-9])/g, '$1 - ');
}

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

function present(spans: StatementSpan[]): StatementSpan[] {
  return spans.map((span) =>
    span.kind === 'code' ? span : { ...span, text: readableMath(span.text) },
  );
}

export function inlineSpans(line: string): StatementSpan[] {
  const spans: StatementSpan[] = [];
  const pattern =
    /`([^`]+)`|\*\*([^*]+)\*\*|(?<!\*)\*([^*\n]+)\*(?!\*)|(?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])/g;
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
    } else if (match[3] !== undefined) {
      spans.push({ kind: 'italic', text: match[3] });
    } else if (match[4] !== undefined) {
      spans.push({ kind: 'italic', text: match[4] });
    }
    last = at + match[0].length;
  }
  if (last < line.length) {
    spans.push({ kind: 'text', text: line.slice(last) });
  }
  return present(spans);
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
