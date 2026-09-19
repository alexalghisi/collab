import { buildRtcConfiguration, type IceServerConfig } from './config';
import type { PeerInfo } from '../signaling/events';
import type { SignalingChannel } from '../signaling/SignalingChannel';
import { playPeerAudio, stopAllPeerAudio, stopPeerAudio } from './remotePlayback';
import { tuneAudioSender, tuneVideoSender, videoContentOf, withClearAudio } from './quality';

export interface PeerConnectionManagerOptions {
  readonly signaling: SignalingChannel;
  readonly localStream: MediaStream;
  readonly iceServers?: readonly IceServerConfig[];
  readonly onRemoteStream: (peerId: string, stream: MediaStream) => void;
  readonly onPeerClosed: (peerId: string) => void;
}

type MediaKind = 'audio' | 'video';

const MEDIA_KINDS: readonly MediaKind[] = ['audio', 'video'];

interface PeerEntry {
  readonly connection: RTCPeerConnection;
  /** One sender per kind, created up front so tracks can be swapped later. */
  readonly senders: Record<MediaKind, RTCRtpSender>;
  readonly remoteStream: MediaStream;
  /** Candidates that arrived before the remote description was applied. */
  readonly pendingCandidates: RTCIceCandidateInit[];
  offerer: boolean;
  restarted: boolean;
}

/**
 * Maintains one RTCPeerConnection per remote peer (full mesh). Offers are
 * glare-free: for any pair, only the peer that joined later initiates.
 *
 * Every connection negotiates an audio and a video sender even when the local
 * stream lacks a track for that kind (audio-only join, camera off). Turning the
 * camera on or sharing the screen is then a plain `replaceTrack` with no
 * renegotiation round trip.
 */
export class PeerConnectionManager {
  private readonly signaling: SignalingChannel;
  private readonly localStream: MediaStream;
  private readonly configuration: RTCConfiguration;
  private readonly onRemoteStream: (peerId: string, stream: MediaStream) => void;
  private readonly onPeerClosed: (peerId: string) => void;
  private readonly peers = new Map<string, PeerEntry>();
  private readonly earlyIce = new Map<string, RTCIceCandidateInit[]>();
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
        const queued = this.earlyIce.get(fromPeerId) ?? [];
        queued.push(candidate);
        this.earlyIce.set(fromPeerId, queued);
        return;
      }
      if (entry.connection.remoteDescription) {
        void this.addCandidate(entry, candidate);
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
    stopAllPeerAudio();
  }

  /** Swaps the outgoing video (camera, screen, or nothing) on every connection. */
  async replaceVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    const content = videoContentOf(track);
    await Promise.all(
      [...this.peers.values()].map(async (entry) => {
        await entry.senders.video.replaceTrack(track);
        // A screen needs a different bitrate split than a face does.
        await tuneVideoSender(entry.senders.video, content);
      }),
    );
  }

  private shouldInitiate(peer: PeerInfo): boolean {
    if (peer.joinedAt === this.selfJoinedAt) {
      return peer.peerId < this.selfPeerId;
    }
    return peer.joinedAt < this.selfJoinedAt;
  }

  private createEntry(peerId: string): PeerEntry {
    const existing = this.peers.get(peerId);
    if (existing) {
      return existing;
    }
    const connection = new RTCPeerConnection(this.configuration);
    const remoteStream = new MediaStream();

    const senders = Object.fromEntries(
      MEDIA_KINDS.map((kind) => {
        const track = this.localStream.getTracks().find((candidate) => candidate.kind === kind);
        const sender = track
          ? connection.addTrack(track, this.localStream)
          : connection.addTransceiver(kind, { direction: 'sendrecv', streams: [this.localStream] })
              .sender;
        return [kind, sender];
      }),
    ) as Record<MediaKind, RTCRtpSender>;

    void tuneAudioSender(senders.audio);
    void tuneVideoSender(
      senders.video,
      videoContentOf(this.localStream.getTracks().find((track) => track.kind === 'video') ?? null),
    );

    connection.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        this.signaling.emit('signal:ice', {
          targetPeerId: peerId,
          candidate: event.candidate.toJSON(),
        });
      }
    });

    connection.addEventListener('track', (event) => {
      event.track.enabled = true;
      const inbound = event.streams[0] ?? remoteStream;
      if (!inbound.getTracks().some((track) => track.id === event.track.id)) {
        inbound.addTrack(event.track);
      }
      if (event.track.kind === 'audio') {
        playPeerAudio(peerId, inbound);
      }
      this.onRemoteStream(peerId, inbound);
    });

    connection.addEventListener('connectionstatechange', () => {
      if (connection.connectionState === 'failed') {
        void this.recover(peerId);
      }
      if (connection.connectionState === 'closed') {
        this.closePeer(peerId);
      }
    });

    const entry: PeerEntry = {
      connection,
      senders,
      remoteStream,
      pendingCandidates: [],
      offerer: false,
      restarted: false,
    };
    const queued = this.earlyIce.get(peerId);
    if (queued) {
      entry.pendingCandidates.push(...queued);
      this.earlyIce.delete(peerId);
    }
    this.peers.set(peerId, entry);
    return entry;
  }

  private async addCandidate(entry: PeerEntry, candidate: RTCIceCandidateInit): Promise<void> {
    try {
      await entry.connection.addIceCandidate(candidate);
    } catch {
      return;
    }
  }

  private async applyRemoteDescription(
    entry: PeerEntry,
    description: RTCSessionDescriptionInit,
  ): Promise<void> {
    await entry.connection.setRemoteDescription(description);
    for (const candidate of entry.pendingCandidates.splice(0)) {
      await this.addCandidate(entry, candidate);
    }
  }

  /**
   * Applies our voice preferences before the description leaves this peer, so
   * the answer we get back commits the other side to sending clean audio.
   */
  private async publishLocalDescription(
    entry: PeerEntry,
    peerId: string,
    event: 'signal:offer' | 'signal:answer',
    description: RTCSessionDescriptionInit,
  ): Promise<void> {
    const tuned = withClearAudio(description);
    let published = tuned;
    try {
      await entry.connection.setLocalDescription(tuned);
    } catch {
      // A stack that refuses edited SDP still gets to make the call.
      published = description;
      await entry.connection.setLocalDescription(description);
    }
    this.signaling.emit(event, { targetPeerId: peerId, description: published });
  }

  private async recover(peerId: string): Promise<void> {
    const entry = this.peers.get(peerId);
    if (!entry?.offerer || entry.restarted) {
      return;
    }
    entry.restarted = true;
    try {
      const offer = await entry.connection.createOffer({ iceRestart: true });
      await this.publishLocalDescription(entry, peerId, 'signal:offer', offer);
    } catch {
      this.closePeer(peerId);
    }
  }

  private async callPeer(peerId: string): Promise<void> {
    if (this.peers.has(peerId)) {
      return;
    }
    const entry = this.createEntry(peerId);
    entry.offerer = true;
    const offer = await entry.connection.createOffer();
    await this.publishLocalDescription(entry, peerId, 'signal:offer', offer);
  }

  private async answerPeer(peerId: string, description: RTCSessionDescriptionInit): Promise<void> {
    const entry = this.peers.get(peerId) ?? this.createEntry(peerId);
    await this.applyRemoteDescription(entry, description);
    const answer = await entry.connection.createAnswer();
    await this.publishLocalDescription(entry, peerId, 'signal:answer', answer);
  }

  private closePeer(peerId: string): void {
    const entry = this.peers.get(peerId);
    if (!entry) {
      return;
    }
    entry.connection.close();
    this.peers.delete(peerId);
    this.earlyIce.delete(peerId);
    stopPeerAudio(peerId);
    this.onPeerClosed(peerId);
  }
}
