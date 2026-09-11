import { buildRtcConfiguration, type IceServerConfig } from './config';
import type { PeerInfo } from '../signaling/events';
import type { SignalingChannel } from '../signaling/SignalingChannel';

export interface PeerConnectionManagerOptions {
  readonly signaling: SignalingChannel;
  readonly localStream: MediaStream;
  readonly iceServers?: readonly IceServerConfig[];
  readonly onRemoteStream: (peerId: string, stream: MediaStream) => void;
  readonly onPeerClosed: (peerId: string) => void;
}

interface PeerEntry {
  readonly connection: RTCPeerConnection;
  /** Candidates that arrived before the remote description was applied. */
  readonly pendingCandidates: RTCIceCandidateInit[];
}

/**
 * Maintains one RTCPeerConnection per remote peer (full mesh). Offers are
 * glare-free: for any pair, only the peer that joined later initiates.
 */
export class PeerConnectionManager {
  private readonly signaling: SignalingChannel;
  private readonly localStream: MediaStream;
  private readonly configuration: RTCConfiguration;
  private readonly onRemoteStream: (peerId: string, stream: MediaStream) => void;
  private readonly onPeerClosed: (peerId: string) => void;
  private readonly peers = new Map<string, PeerEntry>();
  private selfPeerId = '';
  private selfJoinedAt = 0;

  constructor(options: PeerConnectionManagerOptions) {
    this.signaling = options.signaling;
    this.localStream = options.localStream;
    this.configuration = buildRtcConfiguration(options.iceServers);
    this.onRemoteStream = options.onRemoteStream;
    this.onPeerClosed = options.onPeerClosed;
  }

  start(): void {
    this.signaling.on('room:joined', ({ selfPeerId, selfJoinedAt, peers }) => {
      this.selfPeerId = selfPeerId;
      this.selfJoinedAt = selfJoinedAt;
      for (const peer of peers) {
        if (this.shouldInitiate(peer)) {
          void this.callPeer(peer.peerId);
        }
      }
    });

    this.signaling.on('peer:joined', (peer) => {
      if (this.shouldInitiate(peer)) {
        void this.callPeer(peer.peerId);
      }
    });

    this.signaling.on('signal:offer', ({ fromPeerId, description }) => {
      void this.answerPeer(fromPeerId, description);
    });

    this.signaling.on('signal:answer', ({ fromPeerId, description }) => {
      const entry = this.peers.get(fromPeerId);
      if (entry) {
        void this.applyRemoteDescription(entry, description);
      }
    });

    this.signaling.on('signal:ice', ({ fromPeerId, candidate }) => {
      const entry = this.peers.get(fromPeerId);
      if (!entry) {
        return;
      }
      if (entry.connection.remoteDescription) {
        void entry.connection.addIceCandidate(candidate);
      } else {
        entry.pendingCandidates.push(candidate);
      }
    });

    this.signaling.on('peer:left', (peerId) => {
      this.closePeer(peerId);
    });
  }

  close(): void {
    for (const peerId of [...this.peers.keys()]) {
      this.closePeer(peerId);
    }
  }

  private shouldInitiate(peer: PeerInfo): boolean {
    if (peer.joinedAt === this.selfJoinedAt) {
      return peer.peerId < this.selfPeerId;
    }
    return peer.joinedAt < this.selfJoinedAt;
  }

  private createEntry(peerId: string): PeerEntry {
    const connection = new RTCPeerConnection(this.configuration);

    for (const track of this.localStream.getTracks()) {
      connection.addTrack(track, this.localStream);
    }

    connection.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        this.signaling.emit('signal:ice', {
          targetPeerId: peerId,
          candidate: event.candidate.toJSON(),
        });
      }
    });

    connection.addEventListener('track', (event) => {
      const stream = event.streams[0];
      if (stream) {
        this.onRemoteStream(peerId, stream);
      }
    });

    connection.addEventListener('connectionstatechange', () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        this.closePeer(peerId);
      }
    });

    const entry: PeerEntry = { connection, pendingCandidates: [] };
    this.peers.set(peerId, entry);
    return entry;
  }

  private async applyRemoteDescription(
    entry: PeerEntry,
    description: RTCSessionDescriptionInit,
  ): Promise<void> {
    await entry.connection.setRemoteDescription(description);
    for (const candidate of entry.pendingCandidates.splice(0)) {
      await entry.connection.addIceCandidate(candidate);
    }
  }

  private async callPeer(peerId: string): Promise<void> {
    const { connection } = this.createEntry(peerId);
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    this.signaling.emit('signal:offer', { targetPeerId: peerId, description: offer });
  }

  private async answerPeer(peerId: string, description: RTCSessionDescriptionInit): Promise<void> {
    const entry = this.peers.get(peerId) ?? this.createEntry(peerId);
    await this.applyRemoteDescription(entry, description);
    const answer = await entry.connection.createAnswer();
    await entry.connection.setLocalDescription(answer);
    this.signaling.emit('signal:answer', { targetPeerId: peerId, description: answer });
  }

  private closePeer(peerId: string): void {
    const entry = this.peers.get(peerId);
    if (!entry) {
      return;
    }
    entry.connection.close();
    this.peers.delete(peerId);
    this.onPeerClosed(peerId);
  }
}
