import { describe, expect, it } from 'vitest';
import { CODE_LANGUAGES } from './languages';
import { isStarterCode, starterCode } from './starterCode';

describe('starterCode', () => {
  it('gives every language a program that prints', () => {
    for (const language of CODE_LANGUAGES) {
      expect(starterCode(language)).toContain('Hello from Collab');
    }
  });

  it('treats a blank buffer and each starter as untouched', () => {
    expect(isStarterCode('')).toBe(true);
    expect(isStarterCode('   \n')).toBe(true);
    for (const language of CODE_LANGUAGES) {
      expect(isStarterCode(starterCode(language))).toBe(true);
    }
  });

  it('keeps a buffer once somebody has written in it', () => {
    expect(isStarterCode(`${starterCode('python')}\n`)).toBe(false);
    expect(isStarterCode('print(1)')).toBe(false);
  });
});
