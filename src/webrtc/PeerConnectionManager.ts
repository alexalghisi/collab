import { buildRtcConfiguration, type IceServerConfig } from './config';
import { qualityFromStats, type LinkQuality } from './linkQuality';
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
  /**
   * Fetches fresh ICE servers before a restart. Relay credentials are
   * short-lived, so a call that drops after an hour cannot reuse the old ones.
   */
  readonly reloadIceServers?: () => Promise<readonly IceServerConfig[]>;
  readonly onLinkQuality?: (peerId: string, quality: LinkQuality) => void;
}

/** How long a `disconnected` link may stay down before we restart ICE. */
export const DISCONNECT_GRACE_MS = 2500;
/** Delay between ICE restarts while a link keeps failing; caps at the last value. */
export const RESTART_BACKOFF_MS: readonly number[] = [0, 2000, 5000, 10_000];
/**
 * Extra wait before the answering side restarts ICE itself. The caller goes
 * first; this only kicks in when the caller cannot (its tab is asleep, its
 * restart offer was lost), so a dead link never depends on one side alone.
 */
export const POLITE_RESTART_DELAY_MS = 4000;
/** How often each link is graded from packet loss and round-trip time. */
export const QUALITY_SAMPLE_MS = 2000;

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
  polite: boolean;
  offerAgain: boolean;
  /** Restarts attempted since the link was last connected. */
  restarts: number;
  recoveryTimer: ReturnType<typeof setTimeout> | null;
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
  private readonly onRemoteStream: (peerId: string, stream: MediaStream) => void;
  private readonly onPeerClosed: (peerId: string) => void;
  private readonly reloadIceServers?: () => Promise<readonly IceServerConfig[]>;
  private readonly onLinkQuality?: (peerId: string, quality: LinkQuality) => void;
  private qualityTimer: ReturnType<typeof setInterval> | null = null;
  private configuration: RTCConfiguration;
  private readonly peers = new Map<string, PeerEntry>();
  private readonly earlyIce = new Map<string, RTCIceCandidateInit[]>();
  private readonly offerQueue = new Map<string, Promise<void>>();
  private selfPeerId = '';
  private selfJoinedAt = 0;

  constructor(options: PeerConnectionManagerOptions) {
    this.signaling = options.signaling;
    this.localStream = options.localStream;
    this.configuration = buildRtcConfiguration(options.iceServers);
    this.onRemoteStream = options.onRemoteStream;
    this.onPeerClosed = options.onPeerClosed;
    this.reloadIceServers = options.reloadIceServers;
    this.onLinkQuality = options.onLinkQuality;
  }

  start(): void {
    this.signaling.on('room:joined', ({ selfPeerId, selfJoinedAt, peers }) => {
      if (this.selfPeerId !== '' && this.selfPeerId !== selfPeerId) {
        // The signaling socket reconnected under a new id. Everyone else has
        // already dropped the old one, so these links lead nowhere: drop them
        // without telling the UI (the room list just arrived) and dial again.
        this.resetPeers();
      }
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
      void this.enqueue(fromPeerId, () => this.answerPeer(fromPeerId, description));
    });

    this.signaling.on('signal:answer', ({ fromPeerId, description }) => {
      void this.enqueue(fromPeerId, async () => {
        const entry = this.peers.get(fromPeerId);
        if (!entry) {
          return;
        }
        await this.applyRemoteDescription(entry, description);
        await this.flushOffer(entry, fromPeerId);
      });
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

    if (this.qualityTimer === null) {
      const timer = setInterval(() => {
        void this.sampleQuality();
      }, QUALITY_SAMPLE_MS);
      (timer as { unref?: () => void }).unref?.();
      this.qualityTimer = timer;
    }
  }

  close(): void {
    if (this.qualityTimer) {
      clearInterval(this.qualityTimer);
      this.qualityTimer = null;
    }
    for (const peerId of [...this.peers.keys()]) {
      this.closePeer(peerId);
    }
    stopAllPeerAudio();
  }

  /**
   * Restarts ICE on every link that is not currently connected. Call it when
   * the device comes back online or the app returns to the foreground: the
   * network under the call may have changed while nobody was looking.
   */
  checkConnections(): void {
    for (const [peerId, entry] of this.peers) {
      const state = entry.connection.connectionState;
      if (state === 'disconnected' || state === 'failed') {
        this.scheduleRecovery(peerId, entry, 0);
      }
    }
  }

  async replaceAudioTrack(track: MediaStreamTrack | null): Promise<void> {
    await Promise.all(
      [...this.peers.entries()].map(([peerId, entry]) =>
        this.enqueue(peerId, () => this.publishTrack(entry, peerId, 'audio', track)),
      ),
    );
  }

  /** Swaps the outgoing video (camera, screen, or nothing) on every connection. */
  async replaceVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    await Promise.all(
      [...this.peers.entries()].map(([peerId, entry]) =>
        this.enqueue(peerId, () => this.publishTrack(entry, peerId, 'video', track)),
      ),
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
        console.info('[collab] addTrack', {
          peerId,
          kind,
          readyState: track?.readyState ?? 'none',
        });
        const sender = track
          ? connection.addTrack(track, this.localStream)
          : connection.addTransceiver(kind, { direction: 'sendrecv', streams: [this.localStream] })
              .sender;
        return [kind, sender];
      }),
    ) as Record<MediaKind, RTCRtpSender>;

    connection.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        console.info('[collab] ice candidate', {
          peerId,
          type: event.candidate.type,
          protocol: event.candidate.protocol,
        });
        this.signaling.emit('signal:ice', {
          targetPeerId: peerId,
          candidate: event.candidate.toJSON(),
        });
      }
    });

    connection.addEventListener('iceconnectionstatechange', () => {
      const ice = connection.iceConnectionState;
      console.info('[collab] ice state', { peerId, ice });
      const current = this.peers.get(peerId);
      if (!current) {
        return;
      }
      if (ice === 'connected' || ice === 'completed') {
        current.restarts = 0;
        this.clearRecovery(current);
        return;
      }
      if (ice === 'disconnected' || ice === 'failed') {
        this.scheduleRecovery(peerId, current, ice === 'failed' ? 0 : DISCONNECT_GRACE_MS);
      }
    });

    connection.addEventListener('track', (event) => {
      event.track.enabled = true;
      console.info('[collab] remote track', {
        peerId,
        kind: event.track.kind,
        readyState: event.track.readyState,
        muted: event.track.muted,
      });
      for (const existing of [...remoteStream.getTracks()]) {
        if (existing === event.track) {
          continue;
        }
        // One live track per kind: a renegotiated camera arrives as a new track,
        // and tiles render getVideoTracks()[0], so the old one must go.
        if (
          existing.readyState === 'ended' ||
          existing.id === event.track.id ||
          existing.kind === event.track.kind
        ) {
          remoteStream.removeTrack(existing);
        }
      }
      if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }
      if (event.track.kind === 'audio') {
        playPeerAudio(peerId, remoteStream);
      }
      this.onRemoteStream(peerId, remoteStream);
    });

    connection.addEventListener('connectionstatechange', () => {
      const entry = this.peers.get(peerId);
      if (!entry || entry.connection !== connection) {
        return;
      }
      switch (connection.connectionState) {
        case 'connected':
          entry.restarts = 0;
          this.clearRecovery(entry);
          break;
        case 'disconnected':
          // Often heals by itself within a second or two; if it does not, the
          // browser can sit here for ~30s before declaring `failed`, which is
          // the "we stopped hearing each other" gap. Restart sooner.
          this.scheduleRecovery(peerId, entry, DISCONNECT_GRACE_MS);
          break;
        case 'failed':
          this.scheduleRecovery(peerId, entry, this.backoff(entry));
          break;
        case 'closed':
          this.closePeer(peerId);
          break;
        default:
          break;
      }
    });

    const entry: PeerEntry = {
      connection,
      senders,
      remoteStream,
      pendingCandidates: [],
      offerer: false,
      polite: true,
      offerAgain: false,
      restarts: 0,
      recoveryTimer: null,
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
    if (description.type === 'offer') {
      await this.bindSendersToOffer(entry);
    }
    for (const candidate of entry.pendingCandidates.splice(0)) {
      await this.addCandidate(entry, candidate);
    }
  }

  /**
   * A sender made with addTransceiver (no camera/mic yet) is never reused by
   * setRemoteDescription(offer), so the offer's m-line got a fresh transceiver
   * and our later replaceTrack went to an unnegotiated one: the other side
   * never saw our camera. Move each kind onto the negotiated transceiver.
   */
  private async bindSendersToOffer(entry: PeerEntry): Promise<void> {
    const transceivers = entry.connection.getTransceivers?.() ?? [];
    for (const kind of MEDIA_KINDS) {
      const current = entry.senders[kind];
      const own = transceivers.find((t) => t.sender === current);
      if (own?.mid != null) {
        continue;
      }
      const negotiated = transceivers.find(
        (t) => t.mid != null && t.receiver.track?.kind === kind && t !== own && t.currentDirection !== 'stopped',
      );
      if (!negotiated) {
        continue;
      }
      negotiated.direction = 'sendrecv';
      if (current.track) {
        await negotiated.sender.replaceTrack(current.track);
      }
      try {
        negotiated.sender.setStreams?.(this.localStream);
      } catch {
        // Older stacks; the track still flows.
      }
      entry.senders[kind] = negotiated.sender;
      try {
        own?.stop();
      } catch {
        // Already gone.
      }
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
    await this.tuneSenders(entry);
    this.signaling.emit(event, { targetPeerId: peerId, description: published });
  }

  private tuneSenders(entry: PeerEntry): Promise<void> {
    const videoTrack =
      this.localStream.getTracks().find((track) => track.kind === 'video') ??
      entry.senders.video.track;
    return Promise.all([
      tuneAudioSender(entry.senders.audio),
      tuneVideoSender(entry.senders.video, videoContentOf(videoTrack)),
    ]).then(() => undefined);
  }

  private enqueue(peerId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.offerQueue.get(peerId) ?? Promise.resolve();
    const run = previous.then(task, task);
    this.offerQueue.set(
      peerId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  private async publishTrack(
    entry: PeerEntry,
    peerId: string,
    kind: MediaKind,
    track: MediaStreamTrack | null,
  ): Promise<void> {
    const sender = entry.senders[kind];
    const hadTrack = sender.track != null;
    console.info('[collab] replaceTrack', {
      peerId,
      kind,
      readyState: track?.readyState ?? 'none',
    });
    await sender.replaceTrack(track);
    if (kind === 'audio') {
      await tuneAudioSender(sender);
    } else {
      await tuneVideoSender(sender, videoContentOf(track));
    }
    if (hadTrack !== (track != null)) {
      await this.offerNow(entry, peerId);
    }
  }

  private async offerNow(entry: PeerEntry, peerId: string): Promise<void> {
    if (!this.peers.has(peerId)) {
      return;
    }
    const state = entry.connection.signalingState;
    if (state && state !== 'stable') {
      entry.offerAgain = true;
      return;
    }
    entry.offerer = true;
    try {
      const offer = await entry.connection.createOffer();
      await this.publishLocalDescription(entry, peerId, 'signal:offer', offer);
    } catch {
      return;
    }
  }

  private async flushOffer(entry: PeerEntry, peerId: string): Promise<void> {
    if (!entry.offerAgain) {
      return;
    }
    entry.offerAgain = false;
    await this.offerNow(entry, peerId);
  }

  private backoff(entry: PeerEntry): number {
    const last = RESTART_BACKOFF_MS.length - 1;
    return RESTART_BACKOFF_MS[Math.min(entry.restarts, last)] ?? 0;
  }

  private clearRecovery(entry: PeerEntry): void {
    if (entry.recoveryTimer !== null) {
      clearTimeout(entry.recoveryTimer);
      entry.recoveryTimer = null;
    }
  }

  private scheduleRecovery(peerId: string, entry: PeerEntry, baseDelayMs: number): void {
    if (entry.recoveryTimer !== null) {
      return;
    }
    const delayMs = baseDelayMs + (entry.polite ? POLITE_RESTART_DELAY_MS : 0);
    const run = (): void => {
      entry.recoveryTimer = null;
      void this.enqueue(peerId, () => this.recover(peerId));
    };
    if (delayMs <= 0) {
      run();
      return;
    }
    entry.recoveryTimer = setTimeout(run, delayMs);
  }

  /**
   * Restarts ICE for as long as the peer is in the room and the link is down.
   * The original caller (`polite === false`) goes first; the answering side
   * follows a few seconds later only if the link is still down. Should both
   * restart offers cross, the usual glare rules settle it: the polite side
   * rolls its own back and answers. If a restart offer is lost, the next
   * state change or backoff tick tries again.
   */
  private async recover(peerId: string): Promise<void> {
    const entry = this.peers.get(peerId);
    if (!entry) {
      return;
    }
    if (!this.linkDown(entry)) {
      return;
    }
    entry.restarts += 1;
    await this.refreshIceServers(entry);
    if (entry.connection.signalingState !== 'stable') {
      // An earlier offer never got its answer (it was lost with the link):
      // drop it so the restart can go out.
      try {
        await entry.connection.setLocalDescription({ type: 'rollback' });
      } catch {
        // Nothing to roll back on this stack; try the restart anyway.
      }
    }
    entry.offerer = true;
    try {
      const offer = await entry.connection.createOffer({ iceRestart: true });
      await this.publishLocalDescription(entry, peerId, 'signal:offer', offer);
    } catch {
      // Keep the peer; the backoff below gives it another go.
    }
    // Re-arm in case this restart goes unanswered and the state never changes.
    this.scheduleRecovery(peerId, entry, this.backoff(entry) || RESTART_BACKOFF_MS[1] || 2000);
  }

  private linkDown(entry: PeerEntry): boolean {
    const state = entry.connection.connectionState;
    const ice = entry.connection.iceConnectionState;
    return (
      state === 'disconnected' || state === 'failed' || ice === 'disconnected' || ice === 'failed'
    );
  }

  private async sampleQuality(): Promise<void> {
    for (const [peerId, entry] of this.peers) {
      if (this.linkDown(entry)) {
        this.onLinkQuality?.(peerId, 'down');
        continue;
      }
      if (typeof entry.connection.getStats !== 'function') {
        continue;
      }
      try {
        const stats = await entry.connection.getStats();
        let lost = 0;
        let received = 0;
        let rttMs = 0;
        stats.forEach((report) => {
          const row = report as {
            type?: string;
            kind?: string;
            packetsLost?: number;
            packetsReceived?: number;
            state?: string;
            nominated?: boolean;
            currentRoundTripTime?: number;
          };
          if (row.type === 'inbound-rtp' && row.kind === 'video') {
            lost += row.packetsLost ?? 0;
            received += row.packetsReceived ?? 0;
          }
          if (row.type === 'candidate-pair' && row.state === 'succeeded' && row.nominated) {
            rttMs = (row.currentRoundTripTime ?? 0) * 1000;
          }
        });
        const total = received + lost;
        const quality = qualityFromStats(total > 0 ? lost / total : 0, rttMs);
        console.info('[collab] link', { peerId, quality, rttMs });
        this.onLinkQuality?.(peerId, quality);
      } catch {
        // Stats are optional. The call keeps going.
      }
    }
  }

  private async refreshIceServers(entry: PeerEntry): Promise<void> {
    if (!this.reloadIceServers) {
      return;
    }
    try {
      this.configuration = buildRtcConfiguration(await this.reloadIceServers());
      entry.connection.setConfiguration?.(this.configuration);
    } catch {
      // Keep the servers we had.
    }
  }

  private async callPeer(peerId: string): Promise<void> {
    if (this.peers.has(peerId)) {
      return;
    }
    const entry = this.createEntry(peerId);
    entry.offerer = true;
    entry.polite = false;
    await this.enqueue(peerId, async () => {
      const offer = await entry.connection.createOffer();
      await this.publishLocalDescription(entry, peerId, 'signal:offer', offer);
    });
  }

  private async answerPeer(peerId: string, description: RTCSessionDescriptionInit): Promise<void> {
    const entry = this.peers.get(peerId) ?? this.createEntry(peerId);
    if (entry.connection.signalingState === 'have-local-offer') {
      if (!entry.polite) {
        entry.offerAgain = true;
        return;
      }
      await entry.connection.setLocalDescription({ type: 'rollback' });
    }
    await this.applyRemoteDescription(entry, description);
    const answer = await entry.connection.createAnswer();
    await this.publishLocalDescription(entry, peerId, 'signal:answer', answer);
    await this.flushOffer(entry, peerId);
  }

  /** Tears every link down quietly, for a rejoin under a new peer id. */
  private resetPeers(): void {
    for (const [peerId, entry] of [...this.peers]) {
      this.clearRecovery(entry);
      this.peers.delete(peerId);
      entry.connection.close();
      stopPeerAudio(peerId);
    }
    this.earlyIce.clear();
    this.offerQueue.clear();
  }

  private closePeer(peerId: string): void {
    const entry = this.peers.get(peerId);
    if (!entry) {
      return;
    }
    this.clearRecovery(entry);
    this.peers.delete(peerId);
    this.earlyIce.delete(peerId);
    this.offerQueue.delete(peerId);
    // Without this the link to someone who left keeps its ports, its relay
    // allocation and its decoder running for the rest of the call.
    if (entry.connection.connectionState !== 'closed') {
      entry.connection.close();
    }
    stopPeerAudio(peerId);
    this.onPeerClosed(peerId);
  }
}
