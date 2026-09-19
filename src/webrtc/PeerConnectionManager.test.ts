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

class FakeSender {
  parameters: RTCRtpSendParameters = { encodings: [{}] } as RTCRtpSendParameters;
  readonly replaceTrack = vi.fn(async () => undefined);
  getParameters() {
    return this.parameters;
  }
  readonly setParameters = vi.fn(async (next: RTCRtpSendParameters) => {
    this.parameters = next;
  });
}

class FakePeerConnection {
  connectionState = 'new';
  remoteDescription: RTCSessionDescriptionInit | null = null;
  readonly listeners = new Map<string, (event: unknown) => void>();
  readonly createOffer = vi.fn(async (options?: RTCOfferOptions) => ({
    type: 'offer' as const,
    sdp: options?.iceRestart ? 'restart' : 'offer',
  }));
  readonly createAnswer = vi.fn(async () => ({ type: 'answer' as const, sdp: 'answer' }));
  readonly setLocalDescription = vi.fn(
    async (_description?: RTCSessionDescriptionInit) => undefined,
  );
  readonly setRemoteDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.remoteDescription = description;
  });
  readonly addIceCandidate = vi.fn(async () => undefined);
  readonly senders: FakeSender[] = [];
  readonly addTransceiver = vi.fn(() => {
    const sender = new FakeSender();
    this.senders.push(sender);
    return { sender };
  });
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

  it('offers tuned audio and caps the outgoing bitrates', async () => {
    const connection = new FakePeerConnection();
    connection.createOffer.mockImplementation(async () => ({
      type: 'offer' as const,
      sdp: 'v=0\r\na=rtpmap:111 opus/48000/2\r\n',
    }));
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

    handlers.get('peer:joined')?.({
      peerId: 'peer-b',
      displayName: 'Bea',
      joinedAt: -1,
      state: INITIAL_PEER_STATE,
    } as never);

    await vi.waitFor(() => {
      expect(signaling.emit).toHaveBeenCalledWith('signal:offer', {
        targetPeerId: 'peer-b',
        description: {
          type: 'offer',
          sdp: expect.stringContaining('a=fmtp:111 maxaveragebitrate=64000'),
        },
      });
      const bitrates = connection.senders.map(
        (sender) => sender.parameters.encodings?.[0]?.maxBitrate,
      );
      expect(bitrates).toEqual([64_000, 2_500_000]);
    });
  });

  it('falls back to the untouched offer when the stack refuses edited SDP', async () => {
    const connection = new FakePeerConnection();
    const original = { type: 'offer' as const, sdp: 'v=0\r\na=rtpmap:111 opus/48000/2\r\n' };
    connection.createOffer.mockImplementation(async () => original);
    connection.setLocalDescription.mockImplementation(async (description) => {
      if (description !== original) {
        throw new Error('munged sdp');
      }
    });
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

    handlers.get('peer:joined')?.({
      peerId: 'peer-b',
      displayName: 'Bea',
      joinedAt: -1,
      state: INITIAL_PEER_STATE,
    } as never);

    await vi.waitFor(() => {
      expect(signaling.emit).toHaveBeenCalledWith('signal:offer', {
        targetPeerId: 'peer-b',
        description: original,
      });
    });
  });

  it('keeps ICE that arrives before the answering peer connection exists', async () => {
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

    handlers.get('signal:ice')?.({
      fromPeerId: 'peer-b',
      candidate: { candidate: 'typ host', sdpMid: '0' },
    } as never);
    handlers.get('signal:offer')?.({
      fromPeerId: 'peer-b',
      description: { type: 'offer', sdp: 'offer' },
    } as never);
    await vi.waitFor(() => {
      expect(connection.addIceCandidate).toHaveBeenCalledWith({
        candidate: 'typ host',
        sdpMid: '0',
      });
    });
  });
});
