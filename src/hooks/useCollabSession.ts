import { useCallback, useEffect, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import type { StructuredAction } from '../assistant/types';
import { mergeChatHistory } from '../chat/history';
import { type ChatDraft, withDeletedChatMessage, withEditedChatMessage } from '../chat/messages';
import { REJECTION_MESSAGES, validateExecutionRequest } from '../code/execution';
import { programSource } from '../code/programSource';
import { mergeWorkspaceFiles, type WorkspaceFile } from '../code/workspaceFiles';
import { SharedCodeDocument } from '../code/SharedCodeDocument';
import type { CodeLanguage } from '../code/languages';
import type { FileAttachment } from '../files/attachments';
import { AttachmentError, type UploadableFile, type UploadProgress } from '../files/upload';
import { InviteError, type ParsedContact } from '../meeting/contact';
import { buildInviteLink } from '../meeting/invite';
import { clearLiveMeeting, readLiveMeeting, writeLiveMeeting } from '../meeting/resume';
import {
  loadRoomSnapshot,
  mergeStrokes,
  mergeTranscript,
  saveRoomSnapshot,
} from '../meeting/snapshot';
import { SIGNALING_URL } from '../signaling/config';
import { createSpeechCapture } from '../transcript/speech';
import { unlockAudioPlayback } from '../webrtc/attachMedia';
import { loadIceServers } from '../webrtc/loadIceServers';
import { joinRemotePeer, rememberRemoteStream, syncRoomPeers } from '../webrtc/participants';
import type { TranscriptSegment } from '../transcript/segments';
import { normalizeBoardFile } from '../whiteboard/boardFiles';
import { sanitizeStroke } from '../whiteboard/marks';
import {
  DEFAULT_ROOM_SETTINGS,
  INITIAL_PEER_STATE,
  type BoardFile,
  type ChatMessage,
  type HostCommand,
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
  acquireMicrophoneTrack,
  acquireScreenTrack,
  toggleTrack,
} from '../webrtc/media';

export type SessionStatus = 'idle' | 'connecting' | 'waiting' | 'connected' | 'error';

/** One execution of the shared document, as the room sees it. */
export interface AssistantThread {
  readonly requestId: string;
  readonly question: string;
  readonly text: string;
  readonly actions: StructuredAction[];
  readonly error: string | null;
  readonly pending: boolean;
}

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
  readonly files: WorkspaceFile[];
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
  readonly boardFiles: BoardFile[];
  readonly notes: string;
  /** Spoken turns in this room, oldest first. */
  readonly transcript: TranscriptSegment[];
  /** True while this participant's recognizer is running. */
  readonly captionsOn: boolean;
  readonly captionError: string | null;
  readonly assistantTurns: AssistantThread[];
  /** Shared code editor for this room; null outside a meeting. */
  readonly code: SharedCodeDocument | null;
  /** Executions of the shared document, oldest first, including running ones. */
  readonly runs: CodeRun[];
  /** Extra files next to the shared program (`date.in`, `date.out`, …). */
  readonly workspaceFiles: WorkspaceFile[];
  readonly self: PeerState;
  readonly selfPeerId: string | null;
  readonly sessionId: string | null;
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
  /** `keepLive` leaves media so a refresh can put this participant back in the same room. */
  leave: (options?: { keepLive?: boolean }) => void;
  returnToMain: () => void;
  toggleMic: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  toggleHand: () => void;
  sendReaction: (emoji: string) => void;
  sendMessage: (draft: ChatDraft) => void;
  editMessage: (id: string, text: string) => void;
  deleteMessage: (id: string) => void;
  /** Uploads a picked file through the transport and describes where it landed. */
  shareFile: (file: UploadableFile, onProgress: UploadProgress) => Promise<FileAttachment>;
  /** Delivers an email or SMS invite for this meeting. */
  sendInvite: (input: string) => Promise<ParsedContact>;
  addStroke: (stroke: Omit<Stroke, 'id' | 'peerId'>) => void;
  addBoardFile: (item: Omit<BoardFile, 'id' | 'peerId'>) => void;
  removeStrokes: (strokeIds: string[]) => void;
  removeBoardFiles: (ids: string[]) => void;
  updateNotes: (text: string) => void;
  /** Starts or stops live captions for this participant. */
  toggleCaptions: () => void;
  askAssistant: (question: string) => void;
  /** Runs the shared document in the sandbox; output reaches the whole room. */
  runCode: (stdin: string, files?: readonly WorkspaceFile[], source?: string) => void;
  updateWorkspaceFiles: (files: WorkspaceFile[]) => void;
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

export function useCollabSession(createSignaling: SignalingFactory): CollabSession {
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<RemoteParticipant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [boardFiles, setBoardFiles] = useState<BoardFile[]>([]);
  const [notes, setNotes] = useState('');
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [assistantTurns, setAssistantTurns] = useState<AssistantThread[]>([]);
  const [code, setCode] = useState<SharedCodeDocument | null>(null);
  const [runs, setRuns] = useState<CodeRun[]>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [self, setSelf] = useState<PeerState>(INITIAL_PEER_STATE);
  const [selfPeerId, setSelfPeerId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
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
  const roomIdRef = useRef<string | null>(null);
  /** Room handlers need APIs defined after them; the effect below keeps this current. */
  const commandRef = useRef<(command: HostCommand) => void>(() => {});
  /** Camera track parked while the screen is being shared. */
  const parkedCameraRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const reactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechRef = useRef(createSpeechCapture());
  const selfPeerIdRef = useRef<string | null>(null);
  const joinGenerationRef = useRef(0);

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
    setBoardFiles([]);
    setNotes('');
    setTranscript([]);
    setCaptionError(null);
    setAssistantTurns([]);
    speechRef.current.stop();
    setCaptionsOn(false);
    setRuns([]);
    setWorkspaceFiles([]);
    setSelfPeerId(null);
    setHostPeerId(null);
    setSettings(DEFAULT_ROOM_SETTINGS);
    setWaiting([]);
    selfPeerIdRef.current = null;
  }, []);

  const beginCaptions = useCallback(() => {
    const capture = speechRef.current;
    if (!capture.available) {
      setCaptionError('Live captions are not available in this browser.');
      setCaptionsOn(false);
      return;
    }
    setCaptionError(null);
    capture.start(
      (text, span) => {
        signalingRef.current?.emit('transcript:segment', {
          id: randomUUID(),
          peerId: selfPeerIdRef.current ?? sessionIdRef.current,
          displayName: displayNameRef.current,
          text,
          startedAt: span.startedAt,
          endedAt: span.endedAt,
        });
      },
      (message) => {
        setCaptionError(message);
        setCaptionsOn(false);
      },
    );
    setCaptionsOn(true);
  }, []);

  const leave = useCallback(
    (options?: { keepLive?: boolean }) => {
      joinGenerationRef.current += 1;
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
      roomIdRef.current = null;
      setBreakoutOf(null);
      setStatus('idle');
      if (!options?.keepLive) {
        clearLiveMeeting();
        setSessionId(null);
      }
    },
    [disconnectRoom],
  );

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
      roomIdRef.current = nextRoomId;
      writeLiveMeeting({
        roomId: nextRoomId,
        sessionId: sessionIdRef.current,
        displayName: displayNameRef.current,
        video: !selfRef.current.videoOff,
      });
      const snapshot = loadRoomSnapshot(nextRoomId);
      setMessages(snapshot.messages);
      setStrokes(snapshot.strokes);
      setNotes(snapshot.notes);
      setTranscript(snapshot.transcript);

      const sharedCode = new SharedCodeDocument(signaling, {
        peerId: sessionIdRef.current,
        displayName: displayNameRef.current,
      });
      codeRef.current = sharedCode;
      setCode(sharedCode);

      signaling.on('room:waiting', () => setStatus('waiting'));
      signaling.on('room:joined', (room) => {
        settingsRef.current = room.settings;
        selfPeerIdRef.current = room.selfPeerId;
        setSelfPeerId(room.selfPeerId);
        setHostPeerId(room.hostPeerId);
        setParticipants((current) => syncRoomPeers(current, room.peers ?? []));
        setStrokes((current) => {
          const next = mergeStrokes(current, room.strokes);
          saveRoomSnapshot(nextRoomId, { strokes: next });
          return next;
        });
        setBoardFiles(room.boardFiles ?? []);
        setWorkspaceFiles(room.workspaceFiles ?? []);
        setNotes((current) => {
          const next = room.notes && room.notes.length > 0 ? room.notes : current;
          saveRoomSnapshot(nextRoomId, { notes: next });
          return next;
        });
        setTranscript((current) => {
          const next = mergeTranscript(current, room.transcript);
          saveRoomSnapshot(nextRoomId, { transcript: next });
          return next;
        });
        setMessages((current) => {
          const next = mergeChatHistory(current, room.messages);
          saveRoomSnapshot(nextRoomId, { messages: next });
          return next;
        });
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
      signaling.on('session:replaced', () => {
        leave({ keepLive: true });
        setError('This meeting is already open in another window.');
        setStatus('error');
      });
      signaling.on('peer:joined', (peer) => {
        setParticipants((current) => joinRemotePeer(current, peer));
      });
      signaling.on('peer:left', dropParticipant);
      signaling.on('peer:state', ({ peerId, state }) => patchParticipant(peerId, { state }));
      const applyChatUpdate = (message: ChatMessage) => {
        setMessages((current) => {
          const next = mergeChatHistory(current, [message]);
          saveRoomSnapshot(nextRoomId, { messages: next });
          return next;
        });
      };
      signaling.on('chat:message', applyChatUpdate);
      signaling.on('chat:edited', applyChatUpdate);
      signaling.on('chat:deleted', applyChatUpdate);
      // Firestore echoes our own strokes back, so adding is keyed by id.
      signaling.on('board:stroke', (incoming) => {
        const stroke = sanitizeStroke(incoming);
        if (!stroke) {
          return;
        }
        setStrokes((current) => {
          if (current.some((existing) => existing.id === stroke.id)) {
            return current;
          }
          const next = [...current, stroke];
          saveRoomSnapshot(nextRoomId, { strokes: next });
          return next;
        });
      });
      signaling.on('board:file', (item) => {
        setBoardFiles((current) =>
          current.some((existing) => existing.id === item.id) ? current : [...current, item],
        );
      });
      signaling.on('board:remove', (ids) => {
        setStrokes((current) => {
          const next = current.filter((stroke) => !ids.includes(stroke.id));
          saveRoomSnapshot(nextRoomId, { strokes: next });
          return next;
        });
        setBoardFiles((current) => current.filter((item) => !ids.includes(item.id)));
      });
      signaling.on('notes:update', (text) => {
        setNotes(text);
        saveRoomSnapshot(nextRoomId, { notes: text });
      });
      signaling.on('transcript:segment', (segment) => {
        setTranscript((current) => {
          if (current.some((existing) => existing.id === segment.id)) {
            return current;
          }
          const next = [...current, segment];
          saveRoomSnapshot(nextRoomId, { transcript: next });
          return next;
        });
      });
      signaling.on('assistant:token', ({ requestId, text }) => {
        setAssistantTurns((current) =>
          current.map((turn) =>
            turn.requestId === requestId ? { ...turn, text: turn.text + text } : turn,
          ),
        );
      });
      signaling.on('assistant:done', ({ requestId, actions }) => {
        setAssistantTurns((current) =>
          current.map((turn) =>
            turn.requestId === requestId ? { ...turn, actions, pending: false } : turn,
          ),
        );
      });
      signaling.on('assistant:error', ({ requestId, error }) => {
        setAssistantTurns((current) =>
          current.map((turn) =>
            turn.requestId === requestId ? { ...turn, error, pending: false } : turn,
          ),
        );
      });
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
            files: [],
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
      signaling.on('code:run:finished', ({ runId, exitCode, timedOut, error, files }) => {
        const generated = files ?? [];
        setRuns((current) =>
          current.map((run) =>
            run.runId === runId
              ? { ...run, exitCode, timedOut, error, running: false, files: generated }
              : run,
          ),
        );
        if (generated.length > 0) {
          setWorkspaceFiles((current) => mergeWorkspaceFiles(current, generated));
        }
      });
      signaling.on('code:files', (files) => setWorkspaceFiles([...files]));

      try {
        const manager = new PeerConnectionManager({
          signaling,
          localStream: stream,
          iceServers: await loadIceServers(SIGNALING_URL),
          onRemoteStream: (peerId, remoteStream) =>
            setParticipants((current) => rememberRemoteStream(current, peerId, remoteStream)),
          onPeerClosed: dropParticipant,
        });
        manager.start();
        managerRef.current = manager;

        await signaling.connect();
        setStatus('connected');
        beginCaptions();
        return true;
      } catch (cause) {
        leave({ keepLive: true });
        setError(joinErrorMessage(cause));
        setStatus('error');
        return false;
      }
    },
    [createSignaling, patchParticipant, dropParticipant, leave, beginCaptions],
  );

  const join = useCallback(
    async ({ roomId: nextRoomId, displayName, video }: JoinOptions) => {
      unlockAudioPlayback();
      joinGenerationRef.current += 1;
      setStatus('connecting');
      setError(null);

      const stream = new MediaStream();
      streamRef.current = stream;
      setLocalStream(stream);

      const initialState: PeerState = {
        ...INITIAL_PEER_STATE,
        videoOff: true,
        audioMuted: true,
      };
      selfRef.current = initialState;
      setSelf(initialState);
      displayNameRef.current = displayName;
      const live = readLiveMeeting();
      sessionIdRef.current = live?.roomId === nextRoomId ? live.sessionId : randomUUID();
      setSessionId(sessionIdRef.current);
      writeLiveMeeting({
        roomId: nextRoomId,
        sessionId: sessionIdRef.current,
        displayName,
        video,
      });

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
    unlockAudioPlayback();
    const stream = streamRef.current;
    if (!stream) {
      return;
    }
    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) {
      const generation = joinGenerationRef.current;
      void (async () => {
        let track: MediaStreamTrack;
        try {
          track = await acquireMicrophoneTrack();
        } catch {
          if (generation === joinGenerationRef.current) {
            setError(MEDIA_ERROR);
          }
          return;
        }
        if (generation !== joinGenerationRef.current || streamRef.current !== stream) {
          track.stop();
          return;
        }
        stream.addTrack(track);
        await managerRef.current?.replaceAudioTrack(track);
        updateSelf({ audioMuted: false });
      })();
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
      setError(MEDIA_ERROR);
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

  const sendMessage = useCallback((draft: ChatDraft) => {
    signalingRef.current?.emit('chat:message', draft);
  }, []);

  const editMessage = useCallback((id: string, text: string) => {
    setMessages((current) => {
      const next = mergeChatHistory(current, withEditedChatMessage(current, id, text, Date.now()));
      const room = roomIdRef.current;
      if (room) {
        saveRoomSnapshot(room, { messages: next });
      }
      return next;
    });
    signalingRef.current?.emit('chat:edit', { id, text });
  }, []);

  const deleteMessage = useCallback((id: string) => {
    setMessages((current) => {
      const next = mergeChatHistory(current, withDeletedChatMessage(current, id, Date.now()));
      const room = roomIdRef.current;
      if (room) {
        saveRoomSnapshot(room, { messages: next });
      }
      return next;
    });
    signalingRef.current?.emit('chat:delete', { id });
  }, []);

  const shareFile = useCallback(
    (file: UploadableFile, onProgress: UploadProgress): Promise<FileAttachment> => {
      const signaling = signalingRef.current;
      if (!signaling) {
        return Promise.reject(new AttachmentError('You are no longer in this meeting.'));
      }
      return signaling.upload(file, onProgress);
    },
    [],
  );

  const sendInvite = useCallback(
    (input: string): Promise<ParsedContact> => {
      const signaling = signalingRef.current;
      const inviteRoomId = breakoutOf ?? roomId;
      if (!signaling || !inviteRoomId) {
        return Promise.reject(new InviteError('You are no longer in this meeting.'));
      }
      return signaling.sendInvite(
        input,
        displayNameRef.current,
        buildInviteLink(inviteRoomId),
        inviteRoomId,
      );
    },
    [breakoutOf, roomId],
  );

  const addStroke = useCallback(
    (draft: Omit<Stroke, 'id' | 'peerId'>) => {
      const stroke = sanitizeStroke({ ...draft, id: randomUUID(), peerId: selfPeerId ?? 'self' });
      if (!stroke) {
        return;
      }
      setStrokes((current) => {
        const next = [...current, stroke];
        const id = roomIdRef.current;
        if (id) {
          saveRoomSnapshot(id, { strokes: next });
        }
        return next;
      });
      signalingRef.current?.emit('board:stroke', stroke);
    },
    [selfPeerId],
  );

  const addBoardFile = useCallback(
    (draft: Omit<BoardFile, 'id' | 'peerId'>) => {
      const item = normalizeBoardFile(
        { ...draft, id: randomUUID() },
        draft.file,
        selfPeerId ?? 'self',
      );
      if (!item) {
        return;
      }
      setBoardFiles((current) => [...current, item]);
      signalingRef.current?.emit('board:file', item);
    },
    [selfPeerId],
  );

  const removeFromBoard = useCallback((ids: string[]) => {
    setStrokes((current) => {
      const next = current.filter((stroke) => !ids.includes(stroke.id));
      const id = roomIdRef.current;
      if (id) {
        saveRoomSnapshot(id, { strokes: next });
      }
      return next;
    });
    setBoardFiles((current) => current.filter((item) => !ids.includes(item.id)));
    signalingRef.current?.emit('board:remove', ids);
  }, []);

  /** Shows the change at once and sends it after a short pause in typing. */
  const updateNotes = useCallback((text: string) => {
    setNotes(text);
    const id = roomIdRef.current;
    if (id) {
      saveRoomSnapshot(id, { notes: text });
    }
    if (notesTimerRef.current) {
      clearTimeout(notesTimerRef.current);
    }
    notesTimerRef.current = setTimeout(() => {
      notesTimerRef.current = null;
      signalingRef.current?.emit('notes:update', text);
    }, NOTES_SYNC_DELAY_MS);
  }, []);

  const askAssistant = useCallback((question: string) => {
    const text = question.trim();
    if (!text) {
      return;
    }
    const requestId = randomUUID();
    setAssistantTurns((current) => [
      ...current,
      { requestId, question: text, text: '', actions: [], error: null, pending: true },
    ]);
    signalingRef.current?.emit('assistant:ask', { requestId, question: text });
  }, []);

  const toggleCaptions = useCallback(() => {
    if (captionsOn) {
      speechRef.current.stop();
      setCaptionsOn(false);
      return;
    }
    beginCaptions();
  }, [captionsOn, beginCaptions]);

  const runCode = useCallback(
    (stdin: string, files: readonly WorkspaceFile[] = [], source?: string) => {
      const document = codeRef.current;
      if (!document) {
        return;
      }
      const payload = {
        language: document.language,
        code: programSource(source, document.text.toString()),
        stdin,
        files: [...files],
      };
      const checked = validateExecutionRequest(payload);
      if (!checked.ok) {
        setRuns((current) => [
          ...current,
          {
            runId: randomUUID(),
            byPeerId: selfPeerIdRef.current ?? sessionIdRef.current,
            byDisplayName: displayNameRef.current,
            language: payload.language,
            stdout: '',
            stderr: '',
            exitCode: null,
            timedOut: false,
            error: REJECTION_MESSAGES[checked.reason],
            running: false,
            files: [],
          },
        ]);
        return;
      }
      signalingRef.current?.emit('code:run', checked.request);
    },
    [],
  );

  const updateWorkspaceFiles = useCallback((files: WorkspaceFile[]) => {
    setWorkspaceFiles(files);
    signalingRef.current?.emit('code:files', files);
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
    boardFiles,
    notes,
    transcript,
    captionsOn,
    captionError,
    assistantTurns,
    code,
    runs,
    workspaceFiles,
    self,
    selfPeerId,
    sessionId,
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
    editMessage,
    deleteMessage,
    shareFile,
    sendInvite,
    addStroke,
    addBoardFile,
    removeStrokes: removeFromBoard,
    removeBoardFiles: removeFromBoard,
    updateNotes,
    toggleCaptions,
    askAssistant,
    runCode,
    updateWorkspaceFiles,
    updateSettings,
    admit,
    deny,
    muteParticipant,
    removeParticipant,
    openBreakoutRooms,
    closeBreakoutRooms,
  };
}
