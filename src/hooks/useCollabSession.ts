import { useCallback, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import {
  INITIAL_PEER_STATE,
  type ChatMessage,
  type PeerInfo,
  type PeerState,
  type Stroke,
} from '../signaling/events';
import type { SignalingChannel, SignalingFactory } from '../signaling/SignalingChannel';
import { PeerConnectionManager } from '../webrtc/PeerConnectionManager';
import {
  acquireCameraTrack,
  acquireLocalStream,
  acquireScreenTrack,
  toggleTrack,
} from '../webrtc/media';

export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface RemoteParticipant {
  readonly peerId: string;
  readonly displayName: string;
  readonly state: PeerState;
  readonly stream?: MediaStream;
}

export interface JoinOptions {
  readonly roomId: string;
  readonly displayName: string;
  /** false joins as a voice call: microphone only, camera can be enabled later. */
  readonly video: boolean;
}

export interface CollabSession {
  readonly status: SessionStatus;
  readonly error: string | null;
  readonly localStream: MediaStream | null;
  readonly participants: RemoteParticipant[];
  readonly messages: ChatMessage[];
  readonly strokes: Stroke[];
  readonly notes: string;
  readonly self: PeerState;
  readonly selfPeerId: string | null;
  readonly hostPeerId: string | null;
  /** Resolves to true once connected, false when media or signaling failed. */
  join: (options: JoinOptions) => Promise<boolean>;
  leave: () => void;
  toggleMic: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  toggleHand: () => void;
  sendReaction: (emoji: string) => void;
  sendMessage: (text: string) => void;
  addStroke: (stroke: Omit<Stroke, 'id' | 'peerId'>) => void;
  removeStrokes: (strokeIds: string[]) => void;
  updateNotes: (text: string) => void;
}

const REACTION_VISIBLE_MS = 4000;
const NOTES_SYNC_DELAY_MS = 400;
const MEDIA_ERROR = 'Camera or microphone access was denied.';
const SIGNALING_ERROR = 'Unable to reach the signaling service.';

function toParticipant(peer: PeerInfo): RemoteParticipant {
  return { peerId: peer.peerId, displayName: peer.displayName, state: peer.state };
}

export function useCollabSession(createSignaling: SignalingFactory): CollabSession {
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<RemoteParticipant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [notes, setNotes] = useState('');
  const [self, setSelf] = useState<PeerState>(INITIAL_PEER_STATE);
  const [selfPeerId, setSelfPeerId] = useState<string | null>(null);
  const [hostPeerId, setHostPeerId] = useState<string | null>(null);

  const signalingRef = useRef<SignalingChannel | null>(null);
  const managerRef = useRef<PeerConnectionManager | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const selfRef = useRef<PeerState>(INITIAL_PEER_STATE);
  /** Camera track parked while the screen is being shared. */
  const parkedCameraRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const reactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateSelf = useCallback((patch: Partial<PeerState>) => {
    const next = { ...selfRef.current, ...patch };
    selfRef.current = next;
    setSelf(next);
    signalingRef.current?.emit('peer:state', next);
  }, []);

  const patchParticipant = useCallback((peerId: string, patch: Partial<RemoteParticipant>) => {
    setParticipants((current) =>
      current.map((participant) =>
        participant.peerId === peerId ? { ...participant, ...patch } : participant,
      ),
    );
  }, []);

  const removeParticipant = useCallback((peerId: string) => {
    setParticipants((current) => current.filter((participant) => participant.peerId !== peerId));
  }, []);

  /** Replaces the outgoing video track locally and on every peer connection. */
  const swapLocalVideo = useCallback(async (track: MediaStreamTrack | null) => {
    const stream = streamRef.current;
    if (!stream) {
      return;
    }
    for (const existing of stream.getVideoTracks()) {
      stream.removeTrack(existing);
    }
    if (track) {
      stream.addTrack(track);
    }
    await managerRef.current?.replaceVideoTrack(track);
  }, []);

  const leave = useCallback(() => {
    managerRef.current?.close();
    managerRef.current = null;

    signalingRef.current?.disconnect();
    signalingRef.current = null;

    for (const timer of [reactionTimerRef, notesTimerRef]) {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    }

    for (const track of [
      ...(streamRef.current?.getTracks() ?? []),
      parkedCameraRef.current,
      screenTrackRef.current,
    ]) {
      track?.stop();
    }
    streamRef.current = null;
    parkedCameraRef.current = null;
    screenTrackRef.current = null;
    selfRef.current = INITIAL_PEER_STATE;

    setLocalStream(null);
    setParticipants([]);
    setMessages([]);
    setStrokes([]);
    setNotes('');
    setSelf(INITIAL_PEER_STATE);
    setSelfPeerId(null);
    setHostPeerId(null);
    setStatus('idle');
  }, []);

  const join = useCallback(
    async ({ roomId, displayName, video }: JoinOptions) => {
      setStatus('connecting');
      setError(null);

      let stream: MediaStream;
      try {
        stream = await acquireLocalStream({ video, audio: true });
      } catch {
        setError(MEDIA_ERROR);
        setStatus('error');
        return false;
      }
      streamRef.current = stream;
      setLocalStream(stream);

      const initialState: PeerState = { ...INITIAL_PEER_STATE, videoOff: !video };
      selfRef.current = initialState;
      setSelf(initialState);

      const signaling = createSignaling({ roomId, displayName, state: initialState });
      signalingRef.current = signaling;

      signaling.on('room:joined', (room) => {
        setSelfPeerId(room.selfPeerId);
        setHostPeerId(room.hostPeerId);
        setParticipants(room.peers.map(toParticipant));
        setStrokes(room.strokes);
        setNotes(room.notes);
      });
      signaling.on('room:host', setHostPeerId);
      signaling.on('peer:joined', (peer) => {
        setParticipants((current) => [
          ...current.filter((participant) => participant.peerId !== peer.peerId),
          toParticipant(peer),
        ]);
      });
      signaling.on('peer:left', removeParticipant);
      signaling.on('peer:state', ({ peerId, state }) => patchParticipant(peerId, { state }));
      signaling.on('chat:message', (message) => {
        setMessages((current) => [...current, message]);
      });
      // Firestore echoes our own strokes back, so adding is keyed by id.
      signaling.on('board:stroke', (stroke) => {
        setStrokes((current) =>
          current.some((existing) => existing.id === stroke.id) ? current : [...current, stroke],
        );
      });
      signaling.on('board:remove', (strokeIds) => {
        setStrokes((current) => current.filter((stroke) => !strokeIds.includes(stroke.id)));
      });
      signaling.on('notes:update', setNotes);

      const manager = new PeerConnectionManager({
        signaling,
        localStream: stream,
        onRemoteStream: (peerId, remoteStream) =>
          patchParticipant(peerId, { stream: remoteStream }),
        onPeerClosed: removeParticipant,
      });
      manager.start();
      managerRef.current = manager;

      try {
        await signaling.connect();
        setStatus('connected');
        return true;
      } catch {
        leave();
        setError(SIGNALING_ERROR);
        setStatus('error');
        return false;
      }
    },
    [createSignaling, patchParticipant, removeParticipant, leave],
  );

  const toggleMic = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) {
      return;
    }
    const audioMuted = !selfRef.current.audioMuted;
    toggleTrack(stream, 'audio', !audioMuted);
    updateSelf({ audioMuted });
  }, [updateSelf]);

  const toggleCamera = useCallback(async () => {
    if (!selfRef.current.videoOff) {
      streamRef.current?.getVideoTracks().forEach((track) => track.stop());
      await swapLocalVideo(null);
      updateSelf({ videoOff: true });
      return;
    }
    let track: MediaStreamTrack;
    try {
      track = await acquireCameraTrack();
    } catch {
      return;
    }
    await swapLocalVideo(track);
    updateSelf({ videoOff: false });
  }, [swapLocalVideo, updateSelf]);

  const stopScreenShare = useCallback(async () => {
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;
    await swapLocalVideo(parkedCameraRef.current);
    parkedCameraRef.current = null;
    updateSelf({ screenSharing: false });
  }, [swapLocalVideo, updateSelf]);

  const toggleScreenShare = useCallback(async () => {
    if (selfRef.current.screenSharing) {
      await stopScreenShare();
      return;
    }
    let track: MediaStreamTrack;
    try {
      track = await acquireScreenTrack();
    } catch {
      // The user dismissed the picker.
      return;
    }
    // Fired when sharing is stopped from the browser's own UI.
    track.addEventListener('ended', () => void stopScreenShare());
    parkedCameraRef.current = streamRef.current?.getVideoTracks()[0] ?? null;
    screenTrackRef.current = track;
    await swapLocalVideo(track);
    updateSelf({ screenSharing: true });
  }, [stopScreenShare, swapLocalVideo, updateSelf]);

  const toggleHand = useCallback(() => {
    updateSelf({ handRaised: !selfRef.current.handRaised });
  }, [updateSelf]);

  const sendReaction = useCallback(
    (emoji: string) => {
      if (reactionTimerRef.current) {
        clearTimeout(reactionTimerRef.current);
      }
      updateSelf({ reaction: emoji });
      reactionTimerRef.current = setTimeout(() => {
        reactionTimerRef.current = null;
        updateSelf({ reaction: null });
      }, REACTION_VISIBLE_MS);
    },
    [updateSelf],
  );

  const sendMessage = useCallback((text: string) => {
    signalingRef.current?.emit('chat:message', text);
  }, []);

  const addStroke = useCallback(
    (draft: Omit<Stroke, 'id' | 'peerId'>) => {
      const stroke: Stroke = { ...draft, id: randomUUID(), peerId: selfPeerId ?? 'self' };
      setStrokes((current) => [...current, stroke]);
      signalingRef.current?.emit('board:stroke', stroke);
    },
    [selfPeerId],
  );

  const removeStrokes = useCallback((strokeIds: string[]) => {
    setStrokes((current) => current.filter((stroke) => !strokeIds.includes(stroke.id)));
    signalingRef.current?.emit('board:remove', strokeIds);
  }, []);

  /** Shows the change at once and sends it after a short pause in typing. */
  const updateNotes = useCallback((text: string) => {
    setNotes(text);
    if (notesTimerRef.current) {
      clearTimeout(notesTimerRef.current);
    }
    notesTimerRef.current = setTimeout(() => {
      notesTimerRef.current = null;
      signalingRef.current?.emit('notes:update', text);
    }, NOTES_SYNC_DELAY_MS);
  }, []);

  return {
    status,
    error,
    localStream,
    participants,
    messages,
    strokes,
    notes,
    self,
    selfPeerId,
    hostPeerId,
    join,
    leave,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    toggleHand,
    sendReaction,
    sendMessage,
    addStroke,
    removeStrokes,
    updateNotes,
  };
}
