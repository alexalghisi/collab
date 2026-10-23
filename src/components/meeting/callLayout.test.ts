import { describe, expect, it } from 'vitest';
import { codeFillsScreen, isCompactCall } from './callLayout';

describe('call layout', () => {
  it('keeps the code tab full screen at 360, 390 and 768', () => {
    for (const width of [360, 390, 768]) {
      expect(isCompactCall(width)).toBe(true);
      expect(codeFillsScreen(width, 'code')).toBe(true);
      expect(codeFillsScreen(width, 'grid')).toBe(false);
    }
  });

  it('gives a wider landscape frame the regular stage', () => {
    expect(isCompactCall(844)).toBe(false);
    expect(codeFillsScreen(844, 'code')).toBe(false);
  });
});
