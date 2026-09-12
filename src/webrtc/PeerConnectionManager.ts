import { buildRtcConfiguration, type IceServerConfig } from './config';
import type { CollabSocket } from '../signaling/SignalingClient';

export interface PeerConnectionManagerOptions {
  readonly socket: CollabSocket;
  readonly localStream: MediaStream;
  readonly iceServers?: readonly IceServerConfig[];
  readonly onRemoteStream: (peerId: string, stream: MediaStream) => void;
  readonly onPeerClosed: (peerId: string) => void;
}

export class PeerConnectionManager {
  private readonly socket: CollabSocket;
  private readonly localStream: MediaStream;
  private readonly configuration: RTCConfiguration;
  private readonly onRemoteStream: (peerId: string, stream: MediaStream) => void;
  private readonly onPeerClosed: (peerId: string) => void;
  private readonly peers = new Map<string, RTCPeerConnection>();

  constructor(options: PeerConnectionManagerOptions) {
    this.socket = options.socket;
    this.localStream = options.localStream;
    this.configuration = buildRtcConfiguration(options.iceServers);
    this.onRemoteStream = options.onRemoteStream;
    this.onPeerClosed = options.onPeerClosed;
  }

  start(): void {
    this.socket.on('room:peers', (peers) => {
      for (const peer of peers) {
        void this.callPeer(peer.peerId);
      }
    });

    this.socket.on('signal:offer', ({ fromPeerId, description }) => {
      void this.answerPeer(fromPeerId, description);
    });

    this.socket.on('signal:answer', ({ fromPeerId, description }) => {
      const connection = this.peers.get(fromPeerId);
      if (connection) {
        void connection.setRemoteDescription(description);
      }
    });

    this.socket.on('signal:ice', ({ fromPeerId, candidate }) => {
      const connection = this.peers.get(fromPeerId);
      if (connection) {
        void connection.addIceCandidate(candidate);
      }
    });

    this.socket.on('peer:left', (peerId) => {
      this.closePeer(peerId);
    });
  }

  close(): void {
    for (const peerId of [...this.peers.keys()]) {
      this.closePeer(peerId);
    }
  }

  private createConnection(peerId: string): RTCPeerConnection {
    const connection = new RTCPeerConnection(this.configuration);

    for (const track of this.localStream.getTracks()) {
      connection.addTrack(track, this.localStream);
    }

    connection.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        this.socket.emit('signal:ice', {
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

    this.peers.set(peerId, connection);
    return connection;
  }

  private async callPeer(peerId: string): Promise<void> {
    const connection = this.createConnection(peerId);
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    this.socket.emit('signal:offer', { targetPeerId: peerId, description: offer });
  }

  private async answerPeer(peerId: string, description: RTCSessionDescriptionInit): Promise<void> {
    const connection = this.peers.get(peerId) ?? this.createConnection(peerId);
    await connection.setRemoteDescription(description);
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    this.socket.emit('signal:answer', { targetPeerId: peerId, description: answer });
  }

  private closePeer(peerId: string): void {
    const connection = this.peers.get(peerId);
    if (!connection) {
      return;
    }
    connection.close();
    this.peers.delete(peerId);
    this.onPeerClosed(peerId);
  }
}
