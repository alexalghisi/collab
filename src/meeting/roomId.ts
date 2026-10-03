const ALPHABET = 'abcdefghijkmnpqrstuvwxyz';
const SEGMENTS = [3, 4, 3];
const SKIP = new Set(['meeting', 'call', 'sync', 'chat', 'standup', 'with', 'and', 'the', 'a']);

function segment(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function generateRoomId(): string {
  return SEGMENTS.map(segment).join('-');
}

function labelOf(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return '';
  }
  const local = trimmed.includes('@') ? trimmed.slice(0, trimmed.indexOf('@')) : trimmed;
  const untagged = local.split('+')[0] ?? local;
  return untagged.replace(/^(meeting|call|sync|chat|standup)\s+(with\s+)?/i, '').trim();
}

export function roomSlugFromText(raw: string): string | null {
  const label = labelOf(raw);
  if (!label) {
    return null;
  }
  const spaced = label
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[\d_./]+/g, ' ')
    .replace(/[^a-zA-Z\s-]/g, ' ');
  const words = spaced
    .toLowerCase()
    .split(/[\s-]+/)
    .filter((word) => word.length > 0 && !SKIP.has(word));
  if (words.length === 0) {
    return null;
  }
  const slug = words.join('-');
  return slug.length < 2 ? null : slug.slice(0, 48);
}

export function roomIdFromGuests(guests: readonly string[], title = ''): string {
  for (const guest of guests) {
    const slug = roomSlugFromText(guest);
    if (slug) {
      return slug;
    }
  }
  return roomSlugFromText(title) ?? generateRoomId();
}

export function normalizeRoomId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  return roomSlugFromText(trimmed) ?? trimmed.toLowerCase().replace(/\s+/g, '-');
}
