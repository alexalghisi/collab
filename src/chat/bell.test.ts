import { describe, expect, it, vi } from 'vitest';
import { CHAT_BELL_VOLUME, messagesToRing, playChatBell } from './bell';

const audio = vi.hoisted(() => ({
  context: null as null | {
    currentTime: number;
    resume: ReturnType<typeof vi.fn>;
    createGain: () => {
      gain: {
        setValueAtTime: ReturnType<typeof vi.fn>;
        exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
      };
      connect: ReturnType<typeof vi.fn>;
    };
    createOscillator: () => {
      type: string;
      frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
      connect: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    };
    destination: object;
  },
  started: [] as ReturnType<typeof vi.fn>[],
}));

vi.mock('../webrtc/attachMedia', () => ({
  playbackAudioContext: () => audio.context,
  unlockAudioPlayback: vi.fn(),
}));

const message = {
  id: 'm1',
  peerId: 'guest',
  sentAt: 1_000,
};

describe('messagesToRing', () => {
  it('rings for a message that just arrived from someone else', () => {
    expect(messagesToRing([], [message], ['host'], 1_500)).toEqual([message]);
  });

  it('stays quiet for your own message, history, and edits', () => {
    expect(messagesToRing([], [message], ['guest'], 1_500)).toEqual([]);
    expect(messagesToRing([{ id: 'm1' }], [message], ['host'], 1_500)).toEqual([]);
    expect(messagesToRing([], [{ ...message, deletedAt: 2 }], ['host'], 1_500)).toEqual([]);
    expect(messagesToRing([], [message], ['host'], message.sentAt + 60_000)).toEqual([]);
  });
});

describe('playChatBell', () => {
  it('plays a loud three-tone chime, and skips a second chime that arrives immediately', () => {
    audio.started = [];
    const ramps: ReturnType<typeof vi.fn>[] = [];
    audio.context = {
      currentTime: 0,
      resume: vi.fn(async () => undefined),
      destination: {},
      createGain: () => {
        const exponentialRampToValueAtTime = vi.fn();
        ramps.push(exponentialRampToValueAtTime);
        return {
          gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime },
          connect: vi.fn(),
        };
      },
      createOscillator: () => {
        const start = vi.fn();
        audio.started.push(start);
        return {
          type: 'sine',
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start,
          stop: vi.fn(),
        };
      },
    };
    playChatBell(10_000);
    playChatBell(10_100);
    expect(audio.started).toHaveLength(3);
    expect(ramps[0]).toHaveBeenCalledWith(CHAT_BELL_VOLUME, expect.any(Number));
    expect(CHAT_BELL_VOLUME).toBeGreaterThanOrEqual(0.8);
    expect(audio.context.resume).toHaveBeenCalled();
  });

  it('does nothing when this device has no audio context', () => {
    audio.context = null;
    expect(() => playChatBell(80_000)).not.toThrow();
  });
});
