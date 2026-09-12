export const DEFAULT_CHUNK_CHARS = 400;
export const DEFAULT_CHUNK_OVERLAP = 60;

/**
 * Splits a long string on paragraph/sentence boundaries so a later search
 * can retrieve a passage rather than a whole meeting. Overlap keeps a
 * sentence that straddles a cut from disappearing.
 */
export function chunkText(
  text: string,
  maxChars = DEFAULT_CHUNK_CHARS,
  overlap = DEFAULT_CHUNK_OVERLAP,
): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized === '') {
    return [];
  }
  if (normalized.length <= maxChars) {
    return [normalized];
  }
  const step = Math.max(1, maxChars - overlap);
  const chunks: string[] = [];
  for (let start = 0; start < normalized.length; start += step) {
    const end = Math.min(normalized.length, start + maxChars);
    const slice = normalized.slice(start, end).trim();
    if (slice) {
      chunks.push(slice);
    }
    if (end === normalized.length) {
      break;
    }
  }
  return chunks;
}
