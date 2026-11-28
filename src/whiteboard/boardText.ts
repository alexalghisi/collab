export const PASTED_TEXT_NAME = 'Pasted text.txt';
export const MAX_BOARD_TEXT_CHARS = 20000;

const TEXT_MIME_TYPES = new Set(['application/json', 'application/xml', 'application/x-yaml']);

const known = new Map<string, string>();

export function isTextMime(mimeType: string): boolean {
  const mime = mimeType.toLowerCase().split(';')[0].trim();
  return mime.startsWith('text/') || TEXT_MIME_TYPES.has(mime);
}

export function pastedText(raw: string): string | null {
  const text = raw.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  return text.trim() === '' ? null : text;
}

export function trimBoardText(text: string): string {
  return text.length > MAX_BOARD_TEXT_CHARS ? `${text.slice(0, MAX_BOARD_TEXT_CHARS)}\n…` : text;
}

export function rememberBoardText(id: string, text: string): void {
  known.set(id, trimBoardText(text));
}

export function forgetBoardText(): void {
  known.clear();
}

export async function loadBoardText(
  id: string,
  href: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const cached = known.get(id);
  if (cached !== undefined) {
    return cached;
  }
  const response = await fetcher(href);
  if (!response.ok) {
    throw new Error(`Text preview failed with ${response.status}`);
  }
  const text = trimBoardText(await response.text());
  known.set(id, text);
  return text;
}

export function pastePoint(count: number): { readonly x: number; readonly y: number } {
  const step = (count % 6) * 0.05;
  return { x: 0.22 + step, y: 0.2 + step };
}
