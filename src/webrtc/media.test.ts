import { describe, expect, it, vi } from 'vitest';
import { AUDIO_CONSTRAINTS, acquireLocalStream, acquireScreenTrack } from './media';

describe('media capture', () => {
  it('asks the microphone for echo cancellation and noise suppression', async () => {
    const getUserMedia = vi.fn(async () => ({
      getVideoTracks: () => [],
      getAudioTracks: () => [],
    }));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    await acquireLocalStream({ video: true, audio: true });

    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'user' },
      audio: AUDIO_CONSTRAINTS,
    });
    expect(AUDIO_CONSTRAINTS).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  });

  it('does not capture tab audio when sharing the screen', async () => {
    const getDisplayMedia = vi.fn(async () => ({
      getVideoTracks: () => [{ kind: 'video' }],
      getAudioTracks: () => [],
    }));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia },
    });

    await acquireScreenTrack();

    expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false });
  });
});
