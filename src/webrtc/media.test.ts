import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_CONSTRAINTS,
  CAMERA_CONSTRAINTS,
  acquireCameraTrack,
  acquireJoinStream,
  acquireLocalStream,
  acquireMicrophoneTrack,
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
    });
  });

  it('asks the camera for 1080p (up to 4K) at 30–60 fps', async () => {
    expect(CAMERA_CONSTRAINTS).toEqual({
      facingMode: 'user',
      width: { ideal: 1920, max: 3840 },
      height: { ideal: 1080, max: 2160 },
      frameRate: { ideal: 30, max: 60 },
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

    expect(getUserMedia).toHaveBeenCalledWith({ video: CAMERA_CONSTRAINTS, audio: false });
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

  it('opens any camera when the 1080p ask is refused', async () => {
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
    expect(getUserMedia).toHaveBeenNthCalledWith(3, { video: CAMERA_CONSTRAINTS, audio: false });
    expect(getUserMedia).toHaveBeenNthCalledWith(4, { video: true, audio: false });
    expect(later).toBe(track);
    expect(track.contentHint).toBe('motion');
  });

  it('pins the chosen camera and microphone', async () => {
    const getUserMedia = vi.fn(async () => ({
      getVideoTracks: () => [],
      getAudioTracks: () => [],
    }));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await acquireLocalStream({
      video: true,
      audio: true,
      videoDeviceId: 'cam-1',
      audioDeviceId: 'mic-1',
    });

    expect(getUserMedia).toHaveBeenCalledWith({
      video: { ...CAMERA_CONSTRAINTS, deviceId: { exact: 'cam-1' } },
      audio: { ...AUDIO_CONSTRAINTS, deviceId: { exact: 'mic-1' } },
    });
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

  it('gives up when the permission prompt never answers', async () => {
    const getUserMedia = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await expect(acquireLocalStream({ video: true, audio: true }, 20)).rejects.toThrow(
      'media-timeout',
    );
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('stops a late grant after the join wait has already moved on', async () => {
    let grant!: (stream: { getTracks: () => { stop: ReturnType<typeof vi.fn> }[] }) => void;
    const stop = vi.fn();
    const getUserMedia = vi.fn(
      () =>
        new Promise<{ getTracks: () => { stop: ReturnType<typeof vi.fn> }[] }>((resolve) => {
          grant = resolve;
        }),
    );
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await expect(acquireLocalStream({ video: false, audio: true }, 20)).rejects.toThrow(
      'media-timeout',
    );
    grant({ getTracks: () => [{ stop }] });
    await Promise.resolve();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('joins without devices when the browser never answers the prompt', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn(() => new Promise(() => undefined)) },
    });

    const stream = await acquireJoinStream(true, 20);

    expect(stream.getTracks()).toEqual([]);
    expect(stream.getVideoTracks()).toEqual([]);
    expect(stream.getAudioTracks()).toEqual([]);
  });

  it('falls back to the microphone when only the camera is refused', async () => {
    const mic = { kind: 'audio', contentHint: '', stop: vi.fn() };
    const getUserMedia = vi.fn(async (constraints: { video: unknown }) => {
      if (constraints.video) {
        throw new DOMException('Permission denied', 'NotAllowedError');
      }
      return {
        getTracks: () => [mic],
        getVideoTracks: () => [],
        getAudioTracks: () => [mic],
      };
    });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    const stream = await acquireJoinStream(true, 50);

    expect(stream.getAudioTracks()).toEqual([mic]);
    expect(getUserMedia).toHaveBeenCalledTimes(3);
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

  it('never runs two captures at once, so unmuting while the camera opens does not hang', async () => {
    let active = 0;
    let maxActive = 0;
    const getUserMedia = vi.fn(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { getVideoTracks: () => [], getAudioTracks: () => [{ kind: 'audio' }] };
    });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await Promise.all([acquireLocalStream({ video: true, audio: true }), acquireMicrophoneTrack()]);

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
  });
});
