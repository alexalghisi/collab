import { describe, expect, it } from 'vitest';
import { STDIN_MAX_HEIGHT, stdinFieldHeight } from './stdinField';

describe('stdin field height', () => {
  it('stays one line tall until the text wraps onto more lines', () => {
    const one = stdinFieldHeight('');
    expect(stdinFieldHeight('42')).toBe(one);
    expect(stdinFieldHeight('1\n2')).toBeGreaterThan(one);
    expect(stdinFieldHeight('1\n2\n3')).toBeGreaterThan(stdinFieldHeight('1\n2'));
  });

  it('stops growing and leaves the rest to scroll', () => {
    expect(stdinFieldHeight('x\n'.repeat(80))).toBe(STDIN_MAX_HEIGHT);
  });
});
