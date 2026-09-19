import { afterEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_PEER_STATE } from '../signaling/events';
import { playPeerAudio } from './remotePlayback';
import { PeerConnectionManager } from './PeerConnectionManager';

vi.mock('./remotePlayback', () => ({
  playPeerAudio: vi.fn(),
  stopPeerAudio: vi.fn(),
  stopAllPeerAudio: vi.fn(),
}));

class FakeStream {
  constructor(private readonly tracks: { id: string; kind: string }[] = []) {}
  getTracks() {
    return this.tracks;
  }
  addTrack(track: { id: string; kind: string }) {
    this.tracks.push(track);
  }
}

class FakePeerConnection {
  connectionState = 'new';
  remoteDescription = null;
  readonly listeners = new Map<string, (event: unknown) => void>();
  readonly createOffer = vi.fn(async (options?: RTCOfferOptions) => ({
    type: 'offer' as const,
    sdp: options?.iceRestart ? 'restart' : 'offer',
  }));
  readonly setLocalDescription = vi.fn(async () => undefined);
  readonly addTransceiver = vi.fn(() => ({ sender: { replaceTrack: vi.fn() } }));
  readonly addTrack = vi.fn();
  readonly close = vi.fn();

  addEventListener(event: string, handler: (event: unknown) => void) {
    this.listeners.set(event, handler);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('PeerConnectionManager', () => {
  it('plays remote audio as soon as the track lands and restarts ICE once', async () => {
    const connection = new FakePeerConnection();
    vi.stubGlobal(
      'MediaStream',
      vi.fn(function MediaStream() {
        return new FakeStream();
      }),
    );
    vi.stubGlobal(
      'RTCPeerConnection',
      vi.fn(function RTCPeerConnection() {
        return connection;
      }),
    );

    const handlers = new Map<string, (payload: never) => void>();
    const signaling = {
      on: (event: string, handler: (payload: never) => void) => {
        handlers.set(event, handler);
      },
      emit: vi.fn(),
    };
    const manager = new PeerConnectionManager({
      signaling: signaling as never,
      localStream: new FakeStream() as unknown as MediaStream,
      onRemoteStream: vi.fn(),
      onPeerClosed: vi.fn(),
    });
    manager.start();

    handlers.get('room:joined')?.({
      selfPeerId: 'self',
      selfJoinedAt: 2,
      peers: [
        {
          peerId: 'peer-b',
          displayName: 'Bea',
          joinedAt: 1,
          state: INITIAL_PEER_STATE,
        },
      ],
    } as never);
    await Promise.resolve();

    const audio = { id: 'mic', kind: 'audio', enabled: false };
    connection.listeners.get('track')?.({ track: audio, streams: [] });
    connection.connectionState = 'failed';
    connection.listeners.get('connectionstatechange')?.(undefined);

    expect(audio.enabled).toBe(true);
    expect(playPeerAudio).toHaveBeenCalledWith('peer-b', expect.any(FakeStream));
    await vi.waitFor(() => {
      expect(connection.createOffer).toHaveBeenLastCalledWith({ iceRestart: true });
      expect(signaling.emit).toHaveBeenLastCalledWith('signal:offer', {
        targetPeerId: 'peer-b',
        description: { type: 'offer', sdp: 'restart' },
      });
    });
  });
});
