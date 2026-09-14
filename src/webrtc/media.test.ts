import { describe, expect, it, vi } from 'vitest';
import { MICROPHONE_CONSTRAINTS, acquireLocalStream } from './media';

function fakeMediaDevices() {
  const getUserMedia = vi.fn(async () => ({}) as MediaStream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  return getUserMedia;
}

describe('acquireLocalStream', () => {
  it('asks for a microphone with echo cancellation and noise suppression', async () => {
    const getUserMedia = fakeMediaDevices();

    await acquireLocalStream({ video: true, audio: true });

    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'user' },
      audio: MICROPHONE_CONSTRAINTS,
    });
    expect(MICROPHONE_CONSTRAINTS).toMatchObject({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  });

  it('leaves both tracks out when neither was asked for', async () => {
    const getUserMedia = fakeMediaDevices();

    await acquireLocalStream({ video: false, audio: false });

    expect(getUserMedia).toHaveBeenCalledWith({ video: false, audio: false });
  });
});
