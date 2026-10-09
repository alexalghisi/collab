const ALPHABET = 'abcdefghijkmnpqrstuvwxyz';
const SEGMENTS = [3, 4, 3];
const WORDS = 2;
const WORD_LIMIT = 12;
const DIGITS = 6;

const FOLD: Record<string, string> = {
  ă: 'a',
  â: 'a',
  á: 'a',
  à: 'a',
  ä: 'a',
  å: 'a',
  ã: 'a',
  ç: 'c',
  ć: 'c',
  č: 'c',
  è: 'e',
  é: 'e',
  ê: 'e',
  ë: 'e',
  î: 'i',
  í: 'i',
  ì: 'i',
  ï: 'i',
  ñ: 'n',
  ó: 'o',
  ò: 'o',
  ô: 'o',
  ö: 'o',
  õ: 'o',
  ø: 'o',
  ș: 's',
  ş: 's',
  š: 's',
  ț: 't',
  ţ: 't',
  ú: 'u',
  ù: 'u',
  û: 'u',
  ü: 'u',
  ý: 'y',
  ž: 'z',
  æ: 'ae',
  ß: 'ss',
};

function fold(text: string): string {
  let out = '';
  for (const letter of text.toLowerCase()) {
    out += FOLD[letter] ?? letter;
  }
  try {
    return out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    return out;
  }
}

function segment(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

function digits(count: number): string {
  let out = '';
  for (let i = 0; i < count; i += 1) {
    out += Math.floor(Math.random() * 10);
  }
  return out;
}

export function nameSlug(name: string): string {
  return fold(name)
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 0)
    .slice(0, WORDS)
    .map((word) => word.slice(0, WORD_LIMIT))
    .join('-');
}

export function generateRoomId(name?: string): string {
  const slug = nameSlug(name ?? '');
  if (slug === '') {
    return SEGMENTS.map(segment).join('-');
  }
  return `${slug}-${digits(DIGITS)}`;
}

/** Short enough to read down a phone, long enough for a name and a number. */
const ID_LIMIT = 48;

/** Below this an id is too easy to land on by accident. */
export const ROOM_ID_MIN_LENGTH = 3;

/**
 * Narrows an id to the shape it has to keep while someone is still typing it.
 * The id travels in a join link and names a room on the server, so only
 * lowercase letters, digits and single dashes come through. A dash left at
 * the end survives: taking it away between keystrokes would make `team-sync`
 * impossible to type.
 */
export function roomIdWhileTyping(value: string): string {
  return fold(value)
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, ID_LIMIT);
}

/** The same id once it is finished with, so no dash is left dangling. */
export function normalizeRoomId(value: string): string {
  return roomIdWhileTyping(value).replace(/-+$/, '');
}

export function isUsableRoomId(value: string): boolean {
  return normalizeRoomId(value).length >= ROOM_ID_MIN_LENGTH;
}
