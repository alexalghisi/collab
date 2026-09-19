import { describe, expect, it } from 'vitest';
import { consoleText } from './consoleText';

describe('consoleText', () => {
  it('keeps printed output and names an empty stream so the console is never blank', () => {
    expect(consoleText('42\n')).toBe('42\n');
    expect(consoleText('')).toBe('(empty)');
  });
});
