import { describe, expect, it } from 'vitest';
import { levelFromSamples } from './micMeter';

describe('levelFromSamples', () => {
  it('is silent for a flat waveform and loud for a swinging one', () => {
    expect(levelFromSamples(new Uint8Array())).toBe(0);
    expect(levelFromSamples(new Uint8Array([128, 128, 128, 128]))).toBe(0);
    const loud = levelFromSamples(new Uint8Array([0, 255, 0, 255]));
    expect(loud).toBeGreaterThan(0.5);
    expect(loud).toBeLessThanOrEqual(1);
  });
});
