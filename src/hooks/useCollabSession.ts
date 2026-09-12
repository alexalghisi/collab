import { useCallback, useEffect, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { SharedCodeDocument } from '../code/SharedCodeDocument';
import type { CodeLanguage } from '../code/languages';
import {
  DEFAULT_ROOM_SETTINGS,
  INITIAL_PEER_STATE,
  type ChatMessage,
  type HostCommand,
  type PeerInfo,
  type PeerState,
  type RoomSettings,
  type Stroke,
  type WaitingPeer,
} from '../signaling/events';
import {
  AdmissionDeniedError,
  SignalingUnavailableError,
  type SignalingChannel,
  type SignalingFactory,
} from '../signaling/SignalingChannel';
import { PeerConnectionManager } from '../webrtc/PeerConnectionManager';
import {
  acquireCameraTrack,
  acquireLocalStream,
  acquireScreenTrack,
  toggleTrack,
} from '../webrtc/media';

export type SessionStatus = 'idle' | 'connecting' | 'waiting' | 'connected' | 'error';

/** One execution of the shared document, as the room sees it. */
export interface CodeRun {
  readonly runId: string;
  readonly byPeerId: string;
  readonly byDisplayName: string;
  readonly language: CodeLanguage;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly error: string | null;
  readonly running: boolean;
}

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
  /** Shared code editor for this room; null outside a meeting. */
  readonly code: SharedCodeDocument | null;
  /** Executions of the shared document, oldest first, including running ones. */
  readonly runs: CodeRun[];
  readonly self: PeerState;
  readonly selfPeerId: string | null;
  readonly hostPeerId: string | null;
  readonly isHost: boolean;
  /** Room we are in (or moving to); null outside a meeting. */
  readonly roomId: string | null;
  /** Main room id while inside one of its breakout rooms. */
  readonly breakoutOf: string | null;
  readonly settings: RoomSettings;
  /** People held at the waiting room; only populated for the host. */
  readonly waiting: WaitingPeer[];
  /** Resolves to true once connected, false when media or signaling failed. */
  join: (options: JoinOptions) => Promise<boolean>;
  leave: () => void;
  returnToMain: () => void;
  toggleMic: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  toggleHand: () => void;
  sendReaction: (emoji: string) => void;
  sendMessage: (text: string) => void;
  addStroke: (stroke: Omit<Stroke, 'id' | 'peerId'>) => void;
  removeStrokes: (strokeIds: string[]) => void;
  updateNotes: (text: string) => void;
  /** Runs the shared document in the sandbox; output reaches the whole room. */
  runCode: (stdin: string) => void;
  // Host only.
  updateSettings: (patch: Partial<RoomSettings>) => void;
  admit: (peerId: string) => void;
  deny: (peerId: string) => void;
  /** null mutes everyone but the host. */
  muteParticipant: (peerId: string | null) => void;
  removeParticipant: (peerId: string) => void;
  /** Spreads the other participants round-robin over `count` breakout rooms. */
  openBreakoutRooms: (count: number) => void;
  closeBreakoutRooms: () => void;
}

const REACTION_VISIBLE_MS = 4000;
const NOTES_SYNC_DELAY_MS = 400;
const MEDIA_ERROR = 'Camera or microphone access was denied.';
const SIGNALING_ERROR = 'Unable to reach the signaling service.';
const DENIED_ERROR = 'The host did not let you in.';
const REMOVED_ERROR = 'You were removed from the meeting by the host.';

const breakoutRoomId = (mainRoomId: string, index: number) => `${mainRoomId}-b${index + 1}`;

function joinErrorMessage(cause: unknown): string {
  if (cause instanceof AdmissionDeniedError) {
    return DENIED_ERROR;
  }
  if (cause instanceof SignalingUnavailableError) {
    return `${SIGNALING_ERROR} Tried ${cause.url}.`;
  }
  return SIGNALING_ERROR;
}

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
  const [code, setCode] = useState<SharedCodeDocument | null>(null);
  const [runs, setRuns] = useState<CodeRun[]>([]);
  const [self, setSelf] = useState<PeerState>(INITIAL_PEER_STATE);
  const [selfPeerId, setSelfPeerId] = useState<string | null>(null);
  const [hostPeerId, setHostPeerId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [breakoutOf, setBreakoutOf] = useState<string | null>(null);
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [waiting, setWaiting] = useState<WaitingPeer[]>([]);

  const signalingRef = useRef<SignalingChannel | null>(null);
  const codeRef = useRef<SharedCodeDocument | null>(null);
  const managerRef = useRef<PeerConnectionManager | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const selfRef = useRef<PeerState>(INITIAL_PEER_STATE);
  const settingsRef = useRef<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const displayNameRef = useRef('');
  const sessionIdRef = useRef('');
  /** Room handlers need APIs defined after them; the effect below keeps this current. */
  const commandRef = useRef<(command: HostCommand) => void>(() => {});
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

  const dropParticipant = useCallback((peerId: string) => {
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

  /** Leaves the current room but keeps local media, so we can enter another room. */
  const disconnectRoom = useCallback(() => {
    managerRef.current?.close();
    managerRef.current = null;

    codeRef.current?.destroy();
    codeRef.current = null;
    setCode(null);

    signalingRef.current?.disconnect();
    signalingRef.current = null;

    if (notesTimerRef.current) {
      clearTimeout(notesTimerRef.current);
      notesTimerRef.current = null;
    }

    settingsRef.current = DEFAULT_ROOM_SETTINGS;
    setParticipants([]);
    setMessages([]);
    setStrokes([]);
    setNotes('');
    setRuns([]);
    setSelfPeerId(null);
    setHostPeerId(null);
    setSettings(DEFAULT_ROOM_SETTINGS);
    setWaiting([]);
  }, []);

  const leave = useCallback(() => {
    disconnectRoom();

    if (reactionTimerRef.current) {
      clearTimeout(reactionTimerRef.current);
      reactionTimerRef.current = null;
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
    setSelf(INITIAL_PEER_STATE);
    setRoomId(null);
    setBreakoutOf(null);
    setStatus('idle');
  }, [disconnectRoom]);

  /** Connects the already acquired local media to `nextRoomId`. */
  const connectRoom = useCallback(
    async (nextRoomId: string, mainRoomId?: string) => {
      const stream = streamRef.current;
      if (!stream) {
        return false;
      }
      setStatus('connecting');
      setError(null);

      const signaling = createSignaling({
        sessionId: sessionIdRef.current,
        roomId: nextRoomId,
        displayName: displayNameRef.current,
        state: selfRef.current,
        breakoutOf: mainRoomId,
      });
      signalingRef.current = signaling;

      const sharedCode = new SharedCodeDocument(signaling, {
        peerId: sessionIdRef.current,
        displayName: displayNameRef.current,
      });
      codeRef.current = sharedCode;
      setCode(sharedCode);

      signaling.on('room:waiting', () => setStatus('waiting'));
      signaling.on('room:joined', (room) => {
        settingsRef.current = room.settings;
        setSelfPeerId(room.selfPeerId);
        setHostPeerId(room.hostPeerId);
        setParticipants(room.peers.map(toParticipant));
        setStrokes(room.strokes);
        setNotes(room.notes);
        if (room.code) {
          sharedCode.applyState(room.code);
        }
        setSettings(room.settings);
        setRoomId(nextRoomId);
        setBreakoutOf(mainRoomId ?? null);
      });
      signaling.on('room:host', setHostPeerId);
      signaling.on('room:settings', (next) => {
        settingsRef.current = next;
        setSettings(next);
      });
      signaling.on('waiting:update', setWaiting);
      signaling.on('host:command', (command) => commandRef.current(command));
      signaling.on('peer:joined', (peer) => {
        setParticipants((current) => [
          ...current.filter((participant) => participant.peerId !== peer.peerId),
          toParticipant(peer),
        ]);
      });
      signaling.on('peer:left', dropParticipant);
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
      signaling.on('code:run:started', (run) => {
        setRuns((current) => [
          ...current,
          {
            ...run,
            stdout: '',
            stderr: '',
            exitCode: null,
            timedOut: false,
            error: null,
            running: true,
          },
        ]);
      });
      signaling.on('code:output', ({ runId, stream, text }) => {
        setRuns((current) =>
          current.map((run) =>
            run.runId === runId ? { ...run, [stream]: run[stream] + text } : run,
          ),
        );
      });
      signaling.on('code:run:finished', ({ runId, exitCode, timedOut, error }) => {
        setRuns((current) =>
          current.map((run) =>
            run.runId === runId ? { ...run, exitCode, timedOut, error, running: false } : run,
          ),
        );
      });

      const manager = new PeerConnectionManager({
        signaling,
        localStream: stream,
        onRemoteStream: (peerId, remoteStream) =>
          patchParticipant(peerId, { stream: remoteStream }),
        onPeerClosed: dropParticipant,
      });
      manager.start();
      managerRef.current = manager;

      try {
        await signaling.connect();
        setStatus('connected');
        return true;
      } catch (cause) {
        leave();
        setError(joinErrorMessage(cause));
        setStatus('error');
        return false;
      }
    },
    [createSignaling, patchParticipant, dropParticipant, leave],
  );

  const join = useCallback(
    async ({ roomId: nextRoomId, displayName, video }: JoinOptions) => {
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
      displayNameRef.current = displayName;
      sessionIdRef.current = randomUUID();

      return connectRoom(nextRoomId);
    },
    [connectRoom],
  );

  const switchRoom = useCallback(
    (nextRoomId: string, mainRoomId?: string) => {
      disconnectRoom();
      void connectRoom(nextRoomId, mainRoomId);
    },
    [disconnectRoom, connectRoom],
  );

  const returnToMain = useCallback(() => {
    if (breakoutOf) {
      switchRoom(breakoutOf);
    }
  }, [breakoutOf, switchRoom]);

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

  const runCode = useCallback((stdin: string) => {
    const document = codeRef.current;
    if (!document) {
      return;
    }
    signalingRef.current?.emit('code:run', {
      language: document.language,
      code: document.text.toString(),
      stdin,
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<RoomSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    signalingRef.current?.emit('room:settings', next);
  }, []);

  const admit = useCallback((peerId: string) => {
    signalingRef.current?.emit('waiting:decide', { peerId, admit: true });
  }, []);

  const deny = useCallback((peerId: string) => {
    signalingRef.current?.emit('waiting:decide', { peerId, admit: false });
  }, []);

  const muteParticipant = useCallback((peerId: string | null) => {
    signalingRef.current?.emit('host:command', {
      targetPeerId: peerId,
      command: { action: 'mute' },
    });
  }, []);

  const removeParticipant = useCallback((peerId: string) => {
    signalingRef.current?.emit('host:command', {
      targetPeerId: peerId,
      command: { action: 'remove' },
    });
  }, []);

  const openBreakoutRooms = useCallback(
    (count: number) => {
      if (!roomId) {
        return;
      }
      updateSettings({ breakoutOpen: true });
      participants.forEach((participant, index) => {
        signalingRef.current?.emit('host:command', {
          targetPeerId: participant.peerId,
          command: {
            action: 'move',
            roomId: breakoutRoomId(roomId, index % count),
            breakoutOf: roomId,
          },
        });
      });
    },
    [roomId, participants, updateSettings],
  );

  const closeBreakoutRooms = useCallback(() => {
    updateSettings({ breakoutOpen: false });
  }, [updateSettings]);

  useEffect(() => {
    commandRef.current = (command) => {
      switch (command.action) {
        case 'mute':
          if (!selfRef.current.audioMuted) {
            toggleMic();
          }
          return;
        case 'remove':
          leave();
          setError(REMOVED_ERROR);
          setStatus('error');
          return;
        case 'move':
          switchRoom(command.roomId, command.breakoutOf);
      }
    };
  }, [toggleMic, leave, switchRoom]);

  return {
    status,
    error,
    localStream,
    participants,
    messages,
    strokes,
    notes,
    code,
    runs,
    self,
    selfPeerId,
    hostPeerId,
    isHost: selfPeerId !== null && selfPeerId === hostPeerId,
    roomId,
    breakoutOf,
    settings,
    waiting,
    join,
    leave,
    returnToMain,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    toggleHand,
    sendReaction,
    sendMessage,
    addStroke,
    removeStrokes,
    updateNotes,
    runCode,
    updateSettings,
    admit,
    deny,
    muteParticipant,
    removeParticipant,
    openBreakoutRooms,
    closeBreakoutRooms,
  };
}
