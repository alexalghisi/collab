import { describe, expect, it, vi } from 'vitest';
import { messagesToRing, playChatBell } from './bell';

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
  it('plays two tones, and skips a second chime that arrives immediately', () => {
    audio.started = [];
    audio.context = {
      currentTime: 0,
      resume: vi.fn(async () => undefined),
      destination: {},
      createGain: () => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      }),
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
    expect(audio.started).toHaveLength(2);
    expect(audio.context.resume).toHaveBeenCalled();
  });

  it('does nothing when this device has no audio context', () => {
    audio.context = null;
    expect(() => playChatBell(80_000)).not.toThrow();
  });
});
