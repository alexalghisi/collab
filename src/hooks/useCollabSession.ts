import { useCallback, useRef, useState } from 'react';
import { createSignalingClient, type CollabSocket } from '../signaling/SignalingClient';
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

export function useCollabSession(signalingUrl: string): CollabSession {
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<RemoteParticipant[]>([]);

  const socketRef = useRef<CollabSocket | null>(null);
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

    socketRef.current?.disconnect();
    socketRef.current = null;

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

      const socket = createSignalingClient(signalingUrl);
      socketRef.current = socket;

      socket.on('room:peers', (peers) => {
        for (const peer of peers) {
          upsertParticipant({ peerId: peer.peerId, displayName: peer.displayName });
        }
      });

      socket.on('peer:joined', (peer) => {
        upsertParticipant({ peerId: peer.peerId, displayName: peer.displayName });
      });

      socket.on('peer:left', removeParticipant);
      socket.on('connect', () => setStatus('connected'));
      socket.on('connect_error', () => setStatus('error'));

      const manager = new PeerConnectionManager({
        socket,
        localStream: stream,
        onRemoteStream: attachStream,
        onPeerClosed: removeParticipant,
      });
      manager.start();
      managerRef.current = manager;

      socket.connect();
      socket.emit('room:join', { roomId, displayName });
    },
    [signalingUrl, upsertParticipant, attachStream, removeParticipant],
  );

  return { status, localStream, participants, join, leave };
}
