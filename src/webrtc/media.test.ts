import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_CONSTRAINTS, acquireLocalStream, acquireScreenTrack } from './media';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('media capture', () => {
  it('asks the microphone for echo cancellation and noise suppression', async () => {
    const getUserMedia = vi.fn(async () => ({
      getVideoTracks: () => [],
      getAudioTracks: () => [],
    }));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

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
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia } });

    await acquireScreenTrack();

    expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false });
  });
});
