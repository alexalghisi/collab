import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachMediaStream, attachRemoteAudio, unlockAudioPlayback } from './attachMedia';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('attachMediaStream', () => {
  it('gives a video element only the camera tracks so a muted preview cannot silence the mic', () => {
    const videoTracks = [{ id: 'cam', kind: 'video' }];
    const playback = { id: 'preview' };
    vi.stubGlobal(
      'MediaStream',
      vi.fn(function MediaStream() {
        return playback;
      }),
    );
    const element = {
      tagName: 'VIDEO',
      srcObject: null as unknown,
      paused: true,
      play: vi.fn(async () => undefined),
    };
    const stream = {
      getVideoTracks: () => videoTracks,
      getAudioTracks: () => [{ id: 'mic', kind: 'audio' }],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaStream;

    attachMediaStream(element as unknown as HTMLMediaElement, stream);

    expect(MediaStream).toHaveBeenCalledWith(videoTracks);
    expect(element.srcObject).toBe(playback);
    expect(element.play).toHaveBeenCalledTimes(1);
  });

  it('rebinds and plays when a late video track lands on an already playing tile', () => {
    const listeners = new Map<string, () => void>();
    const playback = { id: 'preview' };
    vi.stubGlobal(
      'MediaStream',
      vi.fn(function MediaStream() {
        return playback;
      }),
    );
    const element = {
      tagName: 'VIDEO',
      srcObject: null as unknown,
      paused: false,
      play: vi.fn(async () => undefined),
    };
    const stream = {
      getVideoTracks: () => [{ id: 'cam' }],
      addEventListener: (event: string, handler: () => void) => listeners.set(event, handler),
      removeEventListener: (event: string) => listeners.delete(event),
    } as unknown as MediaStream;

    attachMediaStream(element as unknown as HTMLMediaElement, stream);
    element.play.mockClear();
    listeners.get('addtrack')?.();

    expect(element.srcObject).toBe(playback);
    expect(element.play).toHaveBeenCalledTimes(1);
  });

  it('retries play on the next click when the browser blocks autoplay', async () => {
    const listeners = new Map<string, () => void>();
    vi.stubGlobal('document', {
      addEventListener: (event: string, handler: () => void) => listeners.set(event, handler),
      removeEventListener: (event: string) => listeners.delete(event),
    });
    vi.stubGlobal(
      'MediaStream',
      vi.fn(function MediaStream() {
        return { id: 'preview' };
      }),
    );
    const element = {
      tagName: 'VIDEO',
      srcObject: null as unknown,
      paused: true,
      play: vi.fn<() => Promise<void>>(async () => {
        throw new Error('NotAllowedError');
      }),
    };
    const stream = {
      getVideoTracks: () => [{ id: 'cam' }],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaStream;

    attachMediaStream(element as unknown as HTMLMediaElement, stream);
    await Promise.resolve();
    element.play.mockImplementation(async () => undefined);
    listeners.get('keydown')?.();
    await Promise.resolve();

    expect(element.play).toHaveBeenCalledTimes(2);
  });

  it('gives an audio element its own stream so a muted video cannot hold the tracks', () => {
    const audioTracks = [{ id: 'mic', kind: 'audio' }];
    const playback = { id: 'voice' };
    vi.stubGlobal(
      'MediaStream',
      vi.fn(function MediaStream() {
        return playback;
      }),
    );
    const element = {
      tagName: 'AUDIO',
      srcObject: null as unknown,
      paused: true,
      muted: true,
      volume: 0,
      play: vi.fn(async () => undefined),
    };
    const stream = {
      getAudioTracks: () => audioTracks,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaStream;

    attachMediaStream(element as unknown as HTMLMediaElement, stream);

    expect(MediaStream).toHaveBeenCalledWith(audioTracks);
    expect(element.srcObject).toBe(playback);
    expect(element.muted).toBe(false);
    expect(element.volume).toBe(1);
    expect(element.play).toHaveBeenCalledTimes(1);
  });

  it('puts the remote speaker in the document so the tab can actually hear it', () => {
    const audio = {
      autoplay: false,
      setAttribute: vi.fn(),
      style: { cssText: '' },
      tagName: 'AUDIO',
      srcObject: null as unknown,
      muted: true,
      volume: 0,
      play: vi.fn(async () => undefined),
      remove: vi.fn(),
    };
    const body = { appendChild: vi.fn() };
    vi.stubGlobal('document', {
      createElement: () => audio,
      body,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal(
      'MediaStream',
      vi.fn(function MediaStream() {
        return { id: 'voice' };
      }),
    );
    const stream = {
      getAudioTracks: () => [{ id: 'mic' }],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaStream;

    const stop = attachRemoteAudio(stream);
    stop();

    expect(body.appendChild).toHaveBeenCalledWith(audio);
    expect(audio.autoplay).toBe(true);
    expect(audio.remove).toHaveBeenCalledTimes(1);
  });

  it('opens the audio context on the join click so a later remote track can play', () => {
    const start = vi.fn();
    const resume = vi.fn(async () => undefined);
    const createBufferSource = vi.fn(() => ({
      buffer: null as unknown,
      connect: vi.fn(),
      start,
    }));
    vi.stubGlobal('window', {
      AudioContext: vi.fn(function AudioContext() {
        return {
          resume,
          createBufferSource,
          createBuffer: vi.fn(() => ({})),
          destination: {},
        };
      }),
    });

    unlockAudioPlayback();

    expect(resume).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });
});
