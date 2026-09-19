import { afterEach, describe, expect, it, vi } from 'vitest';
import { playPeerAudio, stopAllPeerAudio, stopPeerAudio } from './remotePlayback';

afterEach(() => {
  stopAllPeerAudio();
  vi.unstubAllGlobals();
});

describe('playPeerAudio', () => {
  it('mounts one speaker per peer and removes it when they leave', () => {
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

    playPeerAudio('peer-b', stream);
    stopPeerAudio('peer-b');

    expect(body.appendChild).toHaveBeenCalledWith(audio);
    expect(audio.remove).toHaveBeenCalledTimes(1);
  });
});
