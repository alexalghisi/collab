import { describe, expect, it } from 'vitest';
import { qualityFromStats } from './linkQuality';

describe('qualityFromStats', () => {
  it('calls a clean short path good and a lossy one poor', () => {
    expect(qualityFromStats(0, 40)).toBe('good');
    expect(qualityFromStats(0.03, 80)).toBe('fair');
    expect(qualityFromStats(0.1, 50)).toBe('poor');
    expect(qualityFromStats(0, 500)).toBe('poor');
  });
});
