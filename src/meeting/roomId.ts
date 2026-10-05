const ALPHABET = 'abcdefghijkmnpqrstuvwxyz';
const SEGMENTS = [3, 4, 3];

/** Two words are enough to recognise a person or a meeting. */
const WORDS = 2;
/** A long surname should not push the number off the end of a line. */
const WORD_LIMIT = 12;
/** Short enough to read out, long enough that two of the same name differ. */
const DIGITS = 6;

/**
 * Letters that names in this part of the world carry and an id cannot. The
 * table is the first pass because a phone's JavaScript engine does not always
 * ship the Unicode tables `normalize` needs; what it misses, `normalize` and
 * then the alphabet filter clean up.
 */
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
    return out.normalize('NFD');
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

/**
 * The readable half of a meeting id: a person's name or a meeting's title,
 * folded down to what a URL and a phone keyboard can carry. Empty when there
 * is nothing left to read, which is what a name written in another script
 * leaves behind.
 */
export function nameSlug(name: string): string {
  return (
    fold(name)
      // An apostrophe joins a name rather than breaking it: O'Brien, not o-brien.
      .replace(/['’`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter((word) => word.length > 0)
      .slice(0, WORDS)
      .map((word) => word.slice(0, WORD_LIMIT))
      .join('-')
  );
}

/**
 * A meeting id somebody can read out loud: who is hosting, or what the meeting
 * is called, and a number that keeps two of them apart — `alghisi-raluca-481937`.
 *
 * Without a name to work from it falls back to the old `kqz-wrtm-pfa`, which is
 * also what a name in a script this cannot carry comes to.
 */
export function generateRoomId(name?: string): string {
  const slug = nameSlug(name ?? '');
  if (slug === '') {
    return SEGMENTS.map(segment).join('-');
  }
  return `${slug}-${digits(DIGITS)}`;
}
