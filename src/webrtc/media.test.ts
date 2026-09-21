import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_CONSTRAINTS,
  CAMERA_CONSTRAINTS,
  acquireCameraTrack,
  acquireLocalStream,
  acquireScreenTrack,
} from './media';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('media capture', () => {
  it('asks the microphone to drop room noise, echo and gain swings', async () => {
    const getUserMedia = vi.fn(async () => ({
      getVideoTracks: () => [],
      getAudioTracks: () => [],
    }));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await acquireLocalStream({ video: true, audio: true });

    expect(getUserMedia).toHaveBeenCalledWith({
      video: CAMERA_CONSTRAINTS,
      audio: AUDIO_CONSTRAINTS,
    });
    expect(AUDIO_CONSTRAINTS).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      voiceIsolation: true,
      channelCount: 1,
      sampleRate: 48000,
    });
  });

  it('asks the camera for 720p at 30 fps', async () => {
    expect(CAMERA_CONSTRAINTS).toEqual({
      facingMode: 'user',
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 30, max: 30 },
    });
  });

  it('turns the camera on later with the resolution the join would have asked for', async () => {
    const track = { kind: 'video', contentHint: '' };
    const getUserMedia = vi.fn(async () => ({
      getVideoTracks: () => [track],
      getAudioTracks: () => [],
    }));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await acquireCameraTrack();

    expect(getUserMedia).toHaveBeenCalledWith({ video: CAMERA_CONSTRAINTS });
    expect(track.contentHint).toBe('motion');
  });

  it('labels the captured tracks so the encoder knows what it is sending', async () => {
    const audio = { kind: 'audio', contentHint: '' };
    const video = { kind: 'video', contentHint: '' };
    const getUserMedia = vi.fn(async () => ({
      getVideoTracks: () => [video],
      getAudioTracks: () => [audio],
    }));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await acquireLocalStream({ video: true, audio: true });

    expect(audio.contentHint).toBe('speech');
    expect(video.contentHint).toBe('motion');
  });

  it('opens any camera when the 720p ask is refused', async () => {
    const track = { kind: 'video', contentHint: '' };
    const getUserMedia = vi.fn(async (constraints: { video: unknown }) => {
      if (constraints.video === CAMERA_CONSTRAINTS) {
        throw new Error('OverconstrainedError');
      }
      return {
        getVideoTracks: () => [track],
        getAudioTracks: () => [],
      };
    });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await acquireLocalStream({ video: true, audio: true });
    const later = await acquireCameraTrack();

    expect(getUserMedia).toHaveBeenNthCalledWith(1, {
      video: CAMERA_CONSTRAINTS,
      audio: AUDIO_CONSTRAINTS,
    });
    expect(getUserMedia).toHaveBeenNthCalledWith(2, {
      video: true,
      audio: AUDIO_CONSTRAINTS,
    });
    expect(getUserMedia).toHaveBeenNthCalledWith(3, { video: CAMERA_CONSTRAINTS });
    expect(getUserMedia).toHaveBeenNthCalledWith(4, { video: true });
    expect(later).toBe(track);
    expect(track.contentHint).toBe('motion');
  });

  it('leaves the camera out when joining as audio only', async () => {
    const getUserMedia = vi.fn(async () => ({
      getVideoTracks: () => [],
      getAudioTracks: () => [],
    }));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await acquireLocalStream({ video: false, audio: true });

    expect(getUserMedia).toHaveBeenCalledWith({
      video: false,
      audio: AUDIO_CONSTRAINTS,
    });
  });

  it('shares the screen at full resolution and without tab audio', async () => {
    const track = { kind: 'video', contentHint: '' };
    const getDisplayMedia = vi.fn(async () => ({
      getVideoTracks: () => [track],
      getAudioTracks: () => [],
    }));
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia } });

    await acquireScreenTrack();

    expect(getDisplayMedia).toHaveBeenCalledWith({
      video: {
        width: { ideal: 1920, max: 2560 },
        height: { ideal: 1080, max: 1440 },
        frameRate: { ideal: 15, max: 30 },
      },
      audio: false,
    });
    expect(track.contentHint).toBe('detail');
  });
});
