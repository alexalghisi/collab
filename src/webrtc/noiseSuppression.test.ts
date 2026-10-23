import { afterEach, describe, expect, it } from 'vitest';
import { noiseSuppressionSupported, openNoiseSuppression } from './noiseSuppression';

describe('openNoiseSuppression', () => {
  afterEach(() => {
    delete (globalThis as { MediaStreamTrackProcessor?: unknown }).MediaStreamTrackProcessor;
    delete (globalThis as { MediaStreamTrackGenerator?: unknown }).MediaStreamTrackGenerator;
  });

  it('leaves the microphone untouched where RNNoise cannot run', async () => {
    expect(noiseSuppressionSupported()).toBe(false);
    const track = { id: 'mic', kind: 'audio' } as MediaStreamTrack;
    await expect(openNoiseSuppression(track)).resolves.toBeNull();
  });
});
