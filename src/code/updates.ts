import { mergeUpdates } from 'yjs';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const REVERSE = new Uint8Array(128);
for (let index = 0; index < ALPHABET.length; index += 1) {
  REVERSE[ALPHABET.charCodeAt(index)] = index;
}

/**
 * Yjs updates are binary and both transports carry JSON, so updates travel as
 * base64. Encoded here rather than through `btoa`/`Buffer`, neither of which is
 * available on every platform the app ships to.
 */
export function encodeUpdate(bytes: Uint8Array): string {
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const chunk = (bytes[index] << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    const remaining = bytes.length - index;
    out += ALPHABET[(chunk >> 18) & 63];
    out += ALPHABET[(chunk >> 12) & 63];
    out += remaining > 1 ? ALPHABET[(chunk >> 6) & 63] : '=';
    out += remaining > 2 ? ALPHABET[chunk & 63] : '=';
  }
  return out;
}

/**
 * Squashes a backlog of updates into one, so a transport that stores updates
 * individually can replace them without replaying the whole history to every
 * late joiner.
 */
export function mergeEncodedUpdates(updates: string[]): string {
  return encodeUpdate(mergeUpdates(updates.map(decodeUpdate)));
}

export function decodeUpdate(encoded: string): Uint8Array {
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((encoded.length / 4) * 3 - padding);
  let cursor = 0;
  for (let index = 0; index < encoded.length; index += 4) {
    const chunk =
      (REVERSE[encoded.charCodeAt(index)] << 18) |
      (REVERSE[encoded.charCodeAt(index + 1)] << 12) |
      (REVERSE[encoded.charCodeAt(index + 2)] << 6) |
      REVERSE[encoded.charCodeAt(index + 3)];
    for (let offset = 16; offset >= 0 && cursor < bytes.length; offset -= 8) {
      bytes[cursor] = (chunk >> offset) & 255;
      cursor += 1;
    }
  }
  return bytes;
}
