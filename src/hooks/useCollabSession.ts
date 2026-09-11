import { useCallback, useRef, useState } from 'react';
import type { SignalingChannel, SignalingFactory } from '../signaling/SignalingChannel';
import { PeerConnectionManager } from '../webrtc/PeerConnectionManager';
import { acquireLocalStream } from '../webrtc/media';

export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface RemoteParticipant {
  readonly peerId: string;
  readonly displayName: string;
  readonly stream?: MediaStream;
}

export interface CollabSession {
  readonly status: SessionStatus;
  readonly localStream: MediaStream | null;
  readonly participants: RemoteParticipant[];
  join: (roomId: string, displayName: string) => Promise<void>;
  leave: () => void;
}

export function useCollabSession(createSignaling: SignalingFactory): CollabSession {
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<RemoteParticipant[]>([]);

  const signalingRef = useRef<SignalingChannel | null>(null);
  const managerRef = useRef<PeerConnectionManager | null>(null);

  const upsertParticipant = useCallback((next: RemoteParticipant) => {
    setParticipants((current) => {
      const others = current.filter((participant) => participant.peerId !== next.peerId);
      return [...others, next];
    });
  }, []);

  const attachStream = useCallback((peerId: string, stream: MediaStream) => {
    setParticipants((current) =>
      current.map((participant) =>
        participant.peerId === peerId ? { ...participant, stream } : participant,
      ),
    );
  }, []);

  const removeParticipant = useCallback((peerId: string) => {
    setParticipants((current) => current.filter((participant) => participant.peerId !== peerId));
  }, []);

  const leave = useCallback(() => {
    managerRef.current?.close();
    managerRef.current = null;

    signalingRef.current?.disconnect();
    signalingRef.current = null;

    setLocalStream((stream) => {
      stream?.getTracks().forEach((track) => track.stop());
      return null;
    });

    setParticipants([]);
    setStatus('idle');
  }, []);

  const join = useCallback(
    async (roomId: string, displayName: string) => {
      setStatus('connecting');

      const stream = await acquireLocalStream({ video: true, audio: true });
      setLocalStream(stream);

      const signaling = createSignaling({ roomId, displayName });
      signalingRef.current = signaling;

      signaling.on('room:joined', ({ peers }) => {
        for (const peer of peers) {
          upsertParticipant({ peerId: peer.peerId, displayName: peer.displayName });
        }
      });
      signaling.on('peer:joined', (peer) => {
        upsertParticipant({ peerId: peer.peerId, displayName: peer.displayName });
      });
      signaling.on('peer:left', removeParticipant);

      const manager = new PeerConnectionManager({
        signaling,
        localStream: stream,
        onRemoteStream: attachStream,
        onPeerClosed: removeParticipant,
      });
      manager.start();
      managerRef.current = manager;

      try {
        await signaling.connect();
        setStatus('connected');
      } catch {
        leave();
        setStatus('error');
      }
    },
    [createSignaling, upsertParticipant, attachStream, removeParticipant, leave],
  );

  return { status, localStream, participants, join, leave };
}
