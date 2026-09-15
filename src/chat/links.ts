export type MessagePart =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'link'; readonly value: string; readonly href: string };

const CANDIDATE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING = /[.,;:!?]+$/;

/**
 * Splits chat text into plain runs and http(s) links. Only those schemes are
 * kept, so a javascript: or file: URL stays ordinary text.
 */
export function splitMessageLinks(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(CANDIDATE)) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push({ kind: 'text', value: text.slice(cursor, index) });
    }
    const trimmed = raw.replace(TRAILING, '');
    const href = toHttpHref(trimmed);
    if (href && trimmed.length > 0) {
      parts.push({ kind: 'link', value: trimmed, href });
      cursor = index + trimmed.length;
    } else {
      parts.push({ kind: 'text', value: raw });
      cursor = index + raw.length;
    }
  }
  if (cursor < text.length) {
    parts.push({ kind: 'text', value: text.slice(cursor) });
  }
  return parts.length > 0 ? parts : [{ kind: 'text', value: text }];
}

function toHttpHref(value: string): string | null {
  const candidate = value.startsWith('www.') ? `https://${value}` : value;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}
