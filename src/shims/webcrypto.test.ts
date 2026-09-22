import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('the webcrypto stand-in Metro hands to lib0', () => {
  it('exposes getRandomValues and subtle the way isomorphic-webcrypto would', () => {
    const webcrypto = require('./webcrypto.cjs') as Crypto;

    const bytes = new Uint8Array(8);
    webcrypto.getRandomValues(bytes);

    expect(webcrypto.subtle).toBeDefined();
    expect(bytes.some((value) => value !== 0)).toBe(true);
    expect((webcrypto as Crypto & { default?: Crypto }).default).toBe(webcrypto);
  });
});
