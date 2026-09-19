import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachMediaStream } from './attachMedia';

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('rebinds and plays when a late audio track lands on an already playing tile', () => {
    const listeners = new Map<string, () => void>();
    const element = {
      srcObject: null as MediaStream | null,
      paused: false,
      play: vi.fn(async () => undefined),
    };
    const stream = {
      addEventListener: (event: string, handler: () => void) => listeners.set(event, handler),
      removeEventListener: (event: string) => listeners.delete(event),
    } as unknown as MediaStream;

    attachMediaStream(element as unknown as HTMLMediaElement, stream);
    element.play.mockClear();
    listeners.get('addtrack')?.();

    expect(element.srcObject).toBe(stream);
    expect(element.play).toHaveBeenCalledTimes(1);
  });

  it('retries play on the next click when the browser blocks autoplay', async () => {
    const listeners = new Map<string, () => void>();
    vi.stubGlobal('document', {
      addEventListener: (event: string, handler: () => void) => listeners.set(event, handler),
      removeEventListener: (event: string) => listeners.delete(event),
    });
    const element = {
      srcObject: null as MediaStream | null,
      paused: true,
      play: vi.fn<() => Promise<void>>(async () => {
        throw new Error('NotAllowedError');
      }),
    };
    const stream = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaStream;

    attachMediaStream(element as unknown as HTMLMediaElement, stream);
    await Promise.resolve();
    element.play.mockImplementation(async () => undefined);
    listeners.get('pointerdown')?.();
    await Promise.resolve();

    expect(element.play).toHaveBeenCalledTimes(2);
  });
});
