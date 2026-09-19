import { describe, expect, it, vi } from 'vitest';
import { attachMediaStream } from './attachMedia';

describe('attachMediaStream', () => {
  it('assigns the stream and calls play so remote audio is not stuck', () => {
    const element = {
      srcObject: null as MediaStream | null,
      paused: true,
      play: vi.fn(async () => undefined),
    };
    const stream = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaStream;

    attachMediaStream(element as unknown as HTMLMediaElement, stream);

    expect(element.srcObject).toBe(stream);
    expect(element.play).toHaveBeenCalledTimes(1);
  });

  it('plays again when a late audio track is added', () => {
    const listeners = new Map<string, () => void>();
    const element = {
      srcObject: null as MediaStream | null,
      paused: true,
      play: vi.fn(async () => undefined),
    };
    const stream = {
      addEventListener: (event: string, handler: () => void) => listeners.set(event, handler),
      removeEventListener: (event: string) => listeners.delete(event),
    } as unknown as MediaStream;

    attachMediaStream(element as unknown as HTMLMediaElement, stream);
    element.play.mockClear();
    listeners.get('addtrack')?.();

    expect(element.play).toHaveBeenCalledTimes(1);
  });
});
