import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acquireLocalStream,
  acquireScreenTrack,
  MICROPHONE_CONSTRAINTS,
  toggleTrack,
} from './media';

function stubMediaDevices() {
  const track = { kind: 'video' } as MediaStreamTrack;
  const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;
  const getUserMedia = vi.fn(async () => stream);
  const getDisplayMedia = vi.fn(async () => stream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia, getDisplayMedia } });
  return { getUserMedia, getDisplayMedia, track };
}

describe('acquireLocalStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for echo cancellation, noise suppression and gain control', async () => {
    const { getUserMedia } = stubMediaDevices();

    await acquireLocalStream({ video: true, audio: true });

    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'user' },
      audio: MICROPHONE_CONSTRAINTS,
    });
    expect(MICROPHONE_CONSTRAINTS).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  });

  it('asks for no audio at all when joining without a microphone', async () => {
    const { getUserMedia } = stubMediaDevices();

    await acquireLocalStream({ video: false, audio: false });

    expect(getUserMedia).toHaveBeenCalledWith({ video: false, audio: false });
  });
});

describe('acquireScreenTrack', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('leaves the screen\u2019s audio behind', async () => {
    const { getDisplayMedia } = stubMediaDevices();

    await acquireScreenTrack();

    expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false });
  });
});

describe('toggleTrack', () => {
  it('only touches the tracks of the kind it was given', () => {
    const audio = { enabled: true } as MediaStreamTrack;
    const video = { enabled: true } as MediaStreamTrack;
    const stream = {
      getAudioTracks: () => [audio],
      getVideoTracks: () => [video],
    } as unknown as MediaStream;

    toggleTrack(stream, 'audio', false);

    expect(audio.enabled).toBe(false);
    expect(video.enabled).toBe(true);
  });
});
