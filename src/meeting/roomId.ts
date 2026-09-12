const ALPHABET = 'abcdefghijkmnpqrstuvwxyz';
const SEGMENTS = [3, 4, 3];

function segment(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** Human-friendly meeting id such as `kqz-wrtm-pfa`. */
export function generateRoomId(): string {
  return SEGMENTS.map(segment).join('-');
}
