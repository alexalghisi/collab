import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MUTE_GRACE_MS,
  REOPEN_INTERVAL_MS,
  watchCapture,
  type CaptureSource,
} from './captureWatch';

/** Enough of a track to end, go quiet, and say so. */
class FakeTrack {
  readyState: 'live' | 'ended' = 'live';
  muted = false;
  enabled = true;
  stopped = false;
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(readonly kind: 'audio' | 'video') {}

  addEventListener(event: string, listener: () => void): void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
  }

  removeEventListener(event: string, listener: () => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  stop(): void {
    this.stopped = true;
    this.readyState = 'ended';
  }

  /** The device was taken away: the track ends and says so, as a phone does. */
  die(): void {
    this.readyState = 'ended';
    this.emit('ended');
  }

  /** The track survives but stops carrying sound, which iOS does on a call. */
  silence(): void {
    this.muted = true;
    this.emit('mute');
  }

  private emit(event: string): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      listener();
    }
  }
}

class FakeStream {
  constructor(private tracks: FakeTrack[]) {}

  getAudioTracks(): FakeTrack[] {
    return this.tracks.filter((track) => track.kind === 'audio');
  }

  getVideoTracks(): FakeTrack[] {
    return this.tracks.filter((track) => track.kind === 'video');
  }

  replace(previous: FakeTrack, next: FakeTrack): void {
    this.tracks = this.tracks.map((track) => (track === previous ? next : track));
  }
}

describe('watchCapture', () => {
  let resume: () => void;
  let unsubscribed: boolean;
  let stream: FakeStream;
  let microphone: FakeTrack;
  let opened: FakeTrack[];
  let adopted: FakeTrack[];
  let openFails: boolean;

  const onResume = (listener: () => void) => {
    resume = listener;
    return () => {
      unsubscribed = true;
    };
  };

  const source = (over: Partial<CaptureSource> = {}): CaptureSource => ({
    wanted: () => true,
    enabled: () => true,
    open: async () => {
      if (openFails) {
        throw new Error('denied');
      }
      const track = new FakeTrack('audio');
      opened.push(track);
      return track as unknown as MediaStreamTrack;
    },
    adopt: async (track) => {
      const fresh = track as unknown as FakeTrack;
      adopted.push(fresh);
      stream.replace(microphone, fresh);
      microphone = fresh;
    },
    ...over,
  });

  const watch = (over: Partial<Parameters<typeof watchCapture>[0]> = {}) =>
    watchCapture({
      stream: stream as unknown as MediaStream,
      microphone: source(),
      onResume,
      ...over,
    });

  beforeEach(() => {
    vi.useFakeTimers();
    resume = () => undefined;
    unsubscribed = false;
    microphone = new FakeTrack('audio');
    stream = new FakeStream([microphone]);
    opened = [];
    adopted = [];
    openFails = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the microphone again when the app comes back to a dead one', async () => {
    watch();
    microphone.readyState = 'ended';

    resume();
    await vi.runAllTimersAsync();

    expect(opened).toHaveLength(1);
    expect(adopted).toEqual(opened);
  });

  it('leaves a microphone that survived the trip alone', async () => {
    watch();

    resume();
    await vi.runAllTimersAsync();

    expect(opened).toEqual([]);
  });

  it('opens it again the moment another app takes it, without waiting to come back', async () => {
    watch();

    microphone.die();
    await vi.runAllTimersAsync();

    expect(opened).toHaveLength(1);
  });

  it('gives a track that only went quiet a moment to come back on its own', async () => {
    watch();
    const original = microphone;

    original.silence();
    await vi.advanceTimersByTimeAsync(MUTE_GRACE_MS - 1);
    expect(opened).toEqual([]);

    original.muted = false;
    await vi.runAllTimersAsync();
    expect(opened).toEqual([]);
  });

  it('replaces a track that is still silent once that moment has passed', async () => {
    watch();

    microphone.silence();
    await vi.advanceTimersByTimeAsync(MUTE_GRACE_MS);

    expect(opened).toHaveLength(1);
  });

  it('hands back a microphone as muted as its owner left it', async () => {
    watch({ microphone: source({ enabled: () => false }) });
    microphone.die();
    await vi.runAllTimersAsync();

    expect(opened[0].enabled).toBe(false);
  });

  it('never asks for a device the participant does not have', async () => {
    stream = new FakeStream([]);
    watch();

    resume();
    await vi.runAllTimersAsync();

    expect(opened).toEqual([]);
  });

  it('leaves the camera alone while the screen is being shared', async () => {
    const screen = new FakeTrack('video');
    stream = new FakeStream([microphone, screen]);
    const camera = source({ wanted: () => false });
    watch({ camera });

    screen.die();
    await vi.runAllTimersAsync();

    expect(opened).toEqual([]);
  });

  it('stops a device it opened for a call that ended while it was asking', async () => {
    let wanted = true;
    const stop = watch({ microphone: source({ wanted: () => wanted }) });
    microphone.die();
    wanted = false;
    stop();
    await vi.runAllTimersAsync();

    expect(opened).toHaveLength(1);
    expect(opened[0].stopped).toBe(true);
    expect(adopted).toEqual([]);
  });

  it('asks for nothing once the call is over', async () => {
    const stop = watch();
    stop();
    microphone.readyState = 'ended';

    resume();
    await vi.runAllTimersAsync();

    expect(opened).toEqual([]);
    expect(unsubscribed).toBe(true);
  });

  it('does not fight another app that is still holding the microphone', async () => {
    watch();
    microphone.die();
    await vi.runAllTimersAsync();
    expect(opened).toHaveLength(1);

    microphone.die();
    await vi.runAllTimersAsync();

    expect(opened).toHaveLength(1);
  });

  it('tries again once that app has had time to let go', async () => {
    watch();
    microphone.die();
    await vi.runAllTimersAsync();

    await vi.advanceTimersByTimeAsync(REOPEN_INTERVAL_MS);
    microphone.die();
    await vi.runAllTimersAsync();

    expect(opened).toHaveLength(2);
  });

  it('watches the track it just opened, so a second loss is noticed too', async () => {
    watch();
    microphone.die();
    await vi.runAllTimersAsync();
    await vi.advanceTimersByTimeAsync(REOPEN_INTERVAL_MS);

    microphone.die();
    await vi.runAllTimersAsync();

    expect(opened).toHaveLength(2);
    expect(adopted).toHaveLength(2);
  });

  it('says so when the device cannot be opened', async () => {
    const onFailed = vi.fn();
    const onRestored = vi.fn();
    openFails = true;
    watch({ onFailed, onRestored });

    microphone.die();
    await vi.runAllTimersAsync();

    expect(onFailed).toHaveBeenCalledWith('audio');
    expect(onRestored).not.toHaveBeenCalled();
  });

  it('says so when the device comes back', async () => {
    const onRestored = vi.fn();
    watch({ onRestored });

    microphone.die();
    await vi.runAllTimersAsync();

    expect(onRestored).toHaveBeenCalledWith('audio');
  });
});
