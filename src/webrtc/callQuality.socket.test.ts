import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_PEER_STATE } from '../signaling/events';
import type { SignalingChannel } from '../signaling/SignalingChannel';
import { startRoomServer, until, type RoomServer } from '../testing/roomServer';
import { PeerConnectionManager } from './PeerConnectionManager';

vi.mock('./remotePlayback', () => ({
  playPeerAudio: vi.fn(),
  stopPeerAudio: vi.fn(),
  stopAllPeerAudio: vi.fn(),
}));

const AUDIO_SDP = [
  'v=0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111',
  'a=rtpmap:111 opus/48000/2',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'm=video 9 UDP/TLS/RTP/SAVPF 96',
  'a=rtpmap:96 VP8/90000',
  '',
].join('\r\n');

class FakeStream {
  private readonly tracks: { id: string; kind: string }[] = [];
  getTracks() {
    return this.tracks;
  }
  addTrack(track: { id: string; kind: string }) {
    this.tracks.push(track);
  }
}

class FakeSender {
  parameters: RTCRtpSendParameters = { encodings: [{}] } as RTCRtpSendParameters;
  getParameters() {
    return this.parameters;
  }
  async setParameters(next: RTCRtpSendParameters) {
    this.parameters = next;
  }
  async replaceTrack() {}
}

class FakePeerConnection {
  remoteDescription: RTCSessionDescriptionInit | null = null;
  readonly senders: FakeSender[] = [];

  addEventListener() {}
  addTransceiver() {
    const sender = new FakeSender();
    this.senders.push(sender);
    return { sender };
  }
  async createOffer() {
    return { type: 'offer' as const, sdp: AUDIO_SDP };
  }
  async createAnswer() {
    return { type: 'answer' as const, sdp: AUDIO_SDP };
  }
  async setLocalDescription() {}
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
  }
  async addIceCandidate() {}
  close() {}
}

describe('call quality over the Socket.IO transport', () => {
  let server: RoomServer;
  const negotiated: FakePeerConnection[] = [];
  const managers: PeerConnectionManager[] = [];
  const channels: SignalingChannel[] = [];

  const join = async (sessionId: string, displayName: string) => {
    const channel = server.connect({
      sessionId,
      roomId: 'room',
      displayName,
      state: INITIAL_PEER_STATE,
    });
    channels.push(channel);
    const manager = new PeerConnectionManager({
      signaling: channel,
      localStream: new FakeStream() as unknown as MediaStream,
      onRemoteStream: () => {},
      onPeerClosed: () => {},
    });
    managers.push(manager);
    manager.start();
    await channel.connect();
    return manager;
  };

  const bothNegotiated = () =>
    negotiated.length === 2 && negotiated.every((peer) => peer.remoteDescription !== null);

  beforeEach(async () => {
    vi.stubGlobal(
      'MediaStream',
      vi.fn(function MediaStream() {
        return new FakeStream();
      }),
    );
    vi.stubGlobal(
      'RTCPeerConnection',
      vi.fn(function RTCPeerConnection() {
        const peer = new FakePeerConnection();
        negotiated.push(peer);
        return peer;
      }),
    );
    server = await startRoomServer();
  });

  afterEach(async () => {
    for (const manager of managers.splice(0)) {
      manager.close();
    }
    for (const channel of channels.splice(0)) {
      channel.disconnect();
    }
    negotiated.splice(0);
    vi.unstubAllGlobals();
    await server.stop();
  });

  it('commits both participants to fullband voice with loss recovery', async () => {
    await join('a', 'Ada');
    await join('b', 'Linus');
    await until(bothNegotiated);

    for (const peer of negotiated) {
      const sdp = peer.remoteDescription?.sdp ?? '';
      expect(sdp).toContain('maxaveragebitrate=64000');
      expect(sdp).toContain('maxplaybackrate=48000');
      expect(sdp).toContain('useinbandfec=1');
      expect(sdp).toContain('usedtx=0');
      expect(sdp).toContain('minptime=10');
    }
  });

  it('caps voice and picture on the senders of both participants', async () => {
    await join('a', 'Ada');
    await join('b', 'Linus');
    await until(bothNegotiated);
    await until(() =>
      negotiated.every((peer) =>
        peer.senders.every((sender) => sender.parameters.encodings[0].maxBitrate !== undefined),
      ),
    );

    for (const peer of negotiated) {
      const [audio, video] = peer.senders;
      expect(audio.parameters.encodings[0]).toEqual({
        maxBitrate: 64_000,
        networkPriority: 'high',
      });
      expect(video.parameters.encodings[0]).toEqual({
        maxBitrate: 2_500_000,
        maxFramerate: 30,
        networkPriority: 'medium',
      });
      expect(video.parameters.degradationPreference).toBe('maintain-framerate');
    }
  });
});
