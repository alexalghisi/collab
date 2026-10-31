import { useCallback, useEffect, useRef, useState } from 'react'
import { randomUUID } from 'expo-crypto';
import type { StructuredAction } from '../assistant/types';
import { mergeChatHistory } from '../chat/history';
import { type ChatDraft, withDeletedChatMessage, withEditedChatMessage } from '../chat/messages';
import {
  REJECTION_MESSAGES,
  validateExecutionRequest,
  type ExecutionRequest,
} from '../code/execution';
import { runOnHostedCompiler, serverHasNoSandbox } from '../code/hostedRun';
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
import {
  INITIAL_PROBLEM_SYNC,
  normalizeSharedProblem,
  reduceProblemSync,
  type ProblemSyncState,
} from '../collaborare/sync';
import { SIGNALING_URL } from '../signaling/config';
import { createSpeechCapture } from '../transcript/speech';
import { resumePlayback, retargetSpeakers, unlockAudioPlayback } from '../webrtc/attachMedia';
import { onAppResumed } from '../webrtc/appFocus';
import {
  cameraOn,
  cameraTogglePlan,
  describeMediaFailure,
  microphoneUnmuted,
  trackIsLive,
} from '../webrtc/captureState';
import { watchCapture } from '../webrtc/captureWatch';
import { listMediaDevices, watchDeviceChanges, type ListedDevice } from '../webrtc/devices';
import { loadIceServers } from '../webrtc/loadIceServers';
import type { IceServerConfig } from '../webrtc/config';
import { isLoopbackSignalingUrl, waitUntilSignalingReady } from '../signaling/wake';
import type { LinkQuality } from '../webrtc/linkQuality';
import { openNoiseSuppression } from '../webrtc/noiseSuppression';
import { nextAudioOutput, outputKindLabel } from '../webrtc/speakers';
import { joinRemotePeer, rememberRemoteStream, syncRoomPeers } from '../webrtc/participants';
import type { TranscriptSegment } from '../transcript/segments';
import { normalizeBoardFile } from '../whiteboard/boardFiles';
import {
  DEFAULT_ROOM_SETTINGS,
  INITIAL_PEER_STATE,
  normalizeRoomSettings,
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
  acquireLocalStream,
  acquireMicrophoneTrack,
  acquireScreenTrack,
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
  readonly stdin: string;
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
  /** Latest link grade for each remote peer. */
  readonly linkQuality: Readonly<Record<string, LinkQuality>>;
  readonly messages: ChatMessage[];
  readonly strokes: Stroke[];
  readonly boardFiles: BoardFile[];
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
  /** Host problem, plus whether this participant is following it. */
  readonly problemSync: ProblemSyncState;
  /** Picks a problem. The host shares it unless they are browsing on their own. */
  chooseProblem: (slug: string) => void;
  setFollowHost: (follow: boolean) => void;
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
  /** Asks again for the camera and microphone. Used after a denied or empty capture. */
  retryMedia: () => Promise<void>;
  readonly devices: ListedDevice[];
  readonly selectedDevices: { audioinput: string; videoinput: string; audiooutput: string };
  chooseDevice: (kind: ListedDevice['kind'], deviceId: string) => Promise<void>;
  /** RNNoise on the microphone we send. On unless this browser cannot run it. */
  readonly noiseSuppression: boolean;
  toggleNoiseSuppression: () => void;
  /** Switches playback between the speaker and headphones. */
  cycleSpeaker: () => Promise<void>;
  readonly speakerLabel: 'Speaker' | 'Headphones';
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
const MEDIA_ERROR = 'Camera or microphone access was denied.';
const SIGNALING_ERROR = 'Unable to reach the signaling service.';
const DENIED_ERROR = 'The host did not let you in.';
const REMOVED_ERROR = 'You were removed from the meeting by the host.';

function isMediaMessage(message: string | null): boolean {
  if (!message) {
    return false;
  }
  return (
    message === MEDIA_ERROR ||
    message.startsWith('Camera') ||
    message.startsWith('No camera') ||
    message.startsWith('The camera')
  );
}

function deviceSignature(listed: readonly ListedDevice[]): string {
  return listed
    .map((device) => `${device.kind}:${device.deviceId}`)
    .sort()
    .join('|');
}

function capturedDeviceId(track: MediaStreamTrack): string {
  try {
    return track.getSettings?.().deviceId ?? '';
  } catch {
    return '';
  }
}

function mediaTimedOut(cause: unknown): boolean {
  return cause instanceof Error && cause.message === 'media-timeout';
}

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
  const [devices, setDevices] = useState<ListedDevice[]>([]);
  const [selectedDevices, setSelectedDevices] = useState({
    audioinput: '',
    videoinput: '',
    audiooutput: '',
  });
  const [participants, setParticipants] = useState<RemoteParticipant[]>([]);
  const [linkQuality, setLinkQuality] = useState<Record<string, LinkQuality>>({});
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [boardFiles, setBoardFiles] = useState<BoardFile[]>([]);
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
  const [problemSync, setProblemSync] = useState<ProblemSyncState>(INITIAL_PROBLEM_SYNC);
  const problemSyncRef = useRef(problemSync);
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
  const speechRef = useRef(createSpeechCapture());
  const selfPeerIdRef = useRef<string | null>(null);
  const joinGenerationRef = useRef(0);
  const wantVideoRef = useRef(false);
  /** What the user asked for. The published flags also go off when a track dies. */
  const micEnabledRef = useRef(true);
  const camEnabledRef = useRef(false);
  const cameraBusyRef = useRef(false);
  const audioDeviceRef = useRef('');
  const videoDeviceRef = useRef('');
  const noiseOnRef = useRef(true);
  /** Microphone from getUserMedia. Kept alive while a processed copy is sent. */
  const rawMicRef = useRef<MediaStreamTrack | null>(null);
  const voiceProcessorRef = useRef<{ stop: () => void } | null>(null);
  const voiceGenerationRef = useRef(0);
  const voiceApplyRef = useRef<Promise<void>>(Promise.resolve());
  const deviceSignatureRef = useRef('');
  const pendingSubmissions = useRef<ExecutionRequest[]>([]);
  const submissionByRun = useRef(new Map<string, ExecutionRequest>());

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
    setLinkQuality((current) => {
      if (!(peerId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[peerId];
      return next;
    });
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

    settingsRef.current = DEFAULT_ROOM_SETTINGS;
    setParticipants([]);
    setLinkQuality({});
    setMessages([]);
    setStrokes([]);
    setBoardFiles([]);
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

      voiceProcessorRef.current?.stop();
      voiceProcessorRef.current = null;
      for (const track of [
        ...(streamRef.current?.getTracks() ?? []),
        rawMicRef.current,
        parkedCameraRef.current,
        screenTrackRef.current,
      ]) {
        track?.stop();
      }
      rawMicRef.current = null;
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

  /** ICE servers requested while the camera prompt was open, used once. */
  const icePrefetchRef = useRef<Promise<readonly IceServerConfig[]> | null>(null);
  const takeIceServers = useCallback(() => {
    const pending = icePrefetchRef.current ?? loadIceServers(SIGNALING_URL);
    icePrefetchRef.current = null;
    return pending;
  }, []);

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
      setTranscript(snapshot.transcript);
      setProblemSync(snapshot.problem);
      problemSyncRef.current = snapshot.problem;

      const sharedCode = new SharedCodeDocument(signaling, {
        peerId: sessionIdRef.current,
        displayName: displayNameRef.current,
      });
      codeRef.current = sharedCode;
      setCode(sharedCode);

      signaling.on('room:waiting', () => setStatus('waiting'));
      signaling.on('room:joined', (room) => {
        const joinedSettings = normalizeRoomSettings(room.settings);
        settingsRef.current = joinedSettings;
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
        const incoming = normalizeSharedProblem(room.problem);
        const remembered = problemSyncRef.current;
        const iAmHost = room.hostPeerId === room.selfPeerId;
        if (iAmHost && incoming.slug === null && remembered.host.slug) {
          signaling.emit('problem:select', remembered.host.slug);
        }
        const hostProblem = incoming.slug ? incoming : remembered.host;
        const nextProblem = reduceProblemSync(remembered, {
          type: 'host-state',
          problem: hostProblem,
        }).state;
        problemSyncRef.current = nextProblem;
        setProblemSync(nextProblem);
        saveRoomSnapshot(nextRoomId, { problem: nextProblem });
        setSettings(joinedSettings);
        setRoomId(nextRoomId);
        setBreakoutOf(mainRoomId ?? null);
      });
      signaling.on('room:host', setHostPeerId);
      signaling.on('problem:state', (problem) => {
        const next = reduceProblemSync(problemSyncRef.current, {
          type: 'host-state',
          problem: normalizeSharedProblem(problem),
        }).state;
        problemSyncRef.current = next;
        setProblemSync(next);
        saveRoomSnapshot(nextRoomId, { problem: next });
      });
      signaling.on('room:settings', (next) => {
        const settings = normalizeRoomSettings(next, settingsRef.current);
        settingsRef.current = settings;
        setSettings(settings);
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
      signaling.on('board:stroke', (stroke) => {
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
        if (run.byPeerId === selfPeerIdRef.current) {
          const request = pendingSubmissions.current.shift();
          if (request) {
            submissionByRun.current.set(run.runId, request);
          }
        }
        setRuns((current) => [
          ...current,
          {
            ...run,
            stdin: run.stdin ?? '',
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
        const submitted = submissionByRun.current.get(runId);
        submissionByRun.current.delete(runId);
        if (submitted && serverHasNoSandbox(error)) {
          setRuns((current) =>
            current.map((run) =>
              run.runId === runId ? { ...run, error: null, running: true } : run,
            ),
          );
          void runOnHostedCompiler(submitted).then((outcome) => {
            setRuns((current) =>
              current.map((run) =>
                run.runId === runId ? { ...run, ...outcome, running: false } : run,
              ),
            );
          });
          return;
        }
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
          iceServers: await takeIceServers(),
          // Relay credentials expire; a restart an hour in needs fresh ones.
          reloadIceServers: () => loadIceServers(SIGNALING_URL),
          onRemoteStream: (peerId, remoteStream) =>
            setParticipants((current) => rememberRemoteStream(current, peerId, remoteStream)),
          onPeerClosed: dropParticipant,
          onLinkQuality: (peerId, quality) => {
            setLinkQuality((current) =>
              current[peerId] === quality ? current : { ...current, [peerId]: quality },
            );
          },
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
    [createSignaling, patchParticipant, dropParticipant, leave, beginCaptions, takeIceServers],
  );

  const publishCapture = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) {
      return;
    }
    const audioMuted = !microphoneUnmuted(stream);
    const videoOff = selfRef.current.screenSharing ? false : !cameraOn(stream);
    if (audioMuted === selfRef.current.audioMuted && videoOff === selfRef.current.videoOff) {
      return;
    }
    console.info('[collab] capture state', { audioMuted, videoOff });
    updateSelf({ audioMuted, videoOff });
  }, [updateSelf]);

  const refreshDevices = useCallback(async () => {
    try {
      const listed = await listMediaDevices();
      deviceSignatureRef.current = deviceSignature(listed);
      setDevices(listed);
      console.info(
        '[collab] devices',
        listed.map((device) => `${device.kind}:${device.label}`),
      );
    } catch (cause) {
      console.info('[collab] enumerateDevices failed', cause);
    }
  }, []);

  const rememberDevice = useCallback((kind: 'audioinput' | 'videoinput', deviceId: string) => {
    if (!deviceId) {
      return;
    }
    if (kind === 'audioinput') {
      audioDeviceRef.current = deviceId;
    } else {
      videoDeviceRef.current = deviceId;
    }
    setSelectedDevices((current) =>
      current[kind] === deviceId ? current : { ...current, [kind]: deviceId },
    );
  }, []);

  const refreshLocalPreview = useCallback(() => {
    setSelf((current) => ({ ...current }));
  }, []);

  /**
   * Puts either the raw microphone or the RNNoise copy onto the local stream
   * and every peer connection. The raw track is never given to a speaker.
   */
  const applyVoice = useCallback(async () => {
    const generation = (voiceGenerationRef.current += 1);
    const raw = rawMicRef.current;
    const stream = streamRef.current;
    voiceProcessorRef.current?.stop();
    voiceProcessorRef.current = null;
    if (!raw || !stream || raw.readyState !== 'live') {
      return;
    }
    let outgoing: MediaStreamTrack = raw;
    if (noiseOnRef.current) {
      const processed = await openNoiseSuppression(raw);
      if (generation !== voiceGenerationRef.current) {
        processed?.stop();
        return;
      }
      if (processed) {
        voiceProcessorRef.current = processed;
        outgoing = processed.track;
      }
    }
    if (generation !== voiceGenerationRef.current || streamRef.current !== stream) {
      if (outgoing !== raw) {
        outgoing.stop();
      }
      return;
    }
    outgoing.enabled = micEnabledRef.current;
    for (const existing of [...stream.getAudioTracks()]) {
      if (existing === outgoing) {
        continue;
      }
      stream.removeTrack(existing);
      if (existing !== raw) {
        existing.stop();
      }
    }
    if (!stream.getAudioTracks().includes(outgoing)) {
      stream.addTrack(outgoing);
    }
    console.info('[collab] outgoing microphone', {
      noise: outgoing !== raw,
      id: outgoing.id,
    });
    await managerRef.current?.replaceAudioTrack(outgoing);
    refreshLocalPreview();
  }, [refreshLocalPreview]);

  const takeOpenedTracks = useCallback(
    (opened: MediaStream) => {
      const stream = streamRef.current;
      if (!stream) {
        opened.getTracks().forEach((track) => track.stop());
        return;
      }
      const sharing = selfRef.current.screenSharing;
      const kinds = new Set(opened.getTracks().map((track) => track.kind));
      if (kinds.has('audio')) {
        voiceProcessorRef.current?.stop();
        voiceProcessorRef.current = null;
        const nextRaw = opened.getAudioTracks()[0] ?? null;
        if (rawMicRef.current && rawMicRef.current !== nextRaw) {
          rawMicRef.current.stop();
        }
        rawMicRef.current = nextRaw;
      }
      if (sharing && kinds.has('video')) {
        const parked = opened.getVideoTracks()[0];
        if (parked) {
          parkedCameraRef.current?.stop();
          parkedCameraRef.current = parked;
          kinds.delete('video');
        }
      }
      for (const existing of stream.getTracks()) {
        if (!kinds.has(existing.kind)) {
          continue;
        }
        existing.stop();
        stream.removeTrack(existing);
      }
      for (const track of opened.getTracks()) {
        if (!kinds.has(track.kind) || stream.getTracks().includes(track)) {
          continue;
        }
        stream.addTrack(track);
        console.info('[collab] local track', {
          kind: track.kind,
          id: track.id,
          readyState: track.readyState,
          enabled: track.enabled,
          muted: track.muted,
        });
        if (track.kind === 'audio') {
          rememberDevice('audioinput', capturedDeviceId(track));
        } else {
          rememberDevice('videoinput', capturedDeviceId(track));
        }
      }
      const audio = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];
      if (kinds.has('audio')) {
        voiceApplyRef.current = applyVoice();
      } else if (audio) {
        void managerRef.current?.replaceAudioTrack(audio);
      }
      if (videoTrack && kinds.has('video') && !sharing) {
        void managerRef.current?.replaceVideoTrack(videoTrack);
      }
      publishCapture();
    },
    [applyVoice, publishCapture, rememberDevice],
  );

  const openMeetingMedia = useCallback(
    async (video: boolean) => {
      const generation = joinGenerationRef.current;
      const stillHere = (): boolean =>
        generation === joinGenerationRef.current && streamRef.current !== null;
      console.info('[collab] opening camera and microphone', { video, audio: true });
      const audioDeviceId = audioDeviceRef.current || undefined;
      const videoDeviceId = videoDeviceRef.current || undefined;
      let opened: MediaStream;
      try {
        opened = await acquireLocalStream({
          video,
          audio: true,
          videoDeviceId,
          audioDeviceId,
        });
      } catch (cause) {
        console.info('[collab] getUserMedia failed', cause);
        if (!stillHere()) {
          return;
        }
        if (video && !mediaTimedOut(cause)) {
          try {
            opened = await acquireLocalStream({ video: false, audio: true, audioDeviceId });
          } catch (audioCause) {
            console.info('[collab] getUserMedia failed', audioCause);
            if (stillHere()) {
              setError(describeMediaFailure(audioCause));
              publishCapture();
            }
            return;
          }
          if (!stillHere()) {
            opened.getTracks().forEach((track) => track.stop());
            return;
          }
          setError(describeMediaFailure(cause));
          takeOpenedTracks(opened);
          await voiceApplyRef.current;
          await refreshDevices();
          return;
        }
        setError(describeMediaFailure(cause));
        publishCapture();
        return;
      }
      if (!stillHere()) {
        opened.getTracks().forEach((track) => track.stop());
        return;
      }
      takeOpenedTracks(opened);
      await voiceApplyRef.current;
      setError((current) => (isMediaMessage(current) ? null : current));
      await refreshDevices();
    },
    [publishCapture, refreshDevices, takeOpenedTracks],
  );

  const join = useCallback(
    async ({ roomId: nextRoomId, displayName, video }: JoinOptions) => {
      unlockAudioPlayback();
      const generation = (joinGenerationRef.current += 1);
      wantVideoRef.current = video;
      camEnabledRef.current = video;
      micEnabledRef.current = true;
      setStatus('connecting');
      setError(null);

      const stream = new MediaStream();
      streamRef.current = stream;

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

      console.info('[collab] join', { roomId: nextRoomId, video, audio: true });
      // Wake the server and fetch relay servers while the camera prompt is up,
      // not after it: a sleeping Render instance takes about a minute to boot.
      if (!isLoopbackSignalingUrl(SIGNALING_URL)) {
        void waitUntilSignalingReady(SIGNALING_URL).catch(() => undefined);
      }
      icePrefetchRef.current = loadIceServers(SIGNALING_URL);
      await openMeetingMedia(video);
      if (generation !== joinGenerationRef.current || streamRef.current !== stream) {
        return false;
      }
      for (const track of stream.getAudioTracks()) {
        if (track.readyState === 'live') {
          track.enabled = true;
        }
      }
      const audioLive = microphoneUnmuted(stream);
      const videoLive = cameraOn(stream);
      const readyState: PeerState = {
        ...initialState,
        audioMuted: !audioLive,
        videoOff: video ? !videoLive : true,
      };
      selfRef.current = readyState;
      setSelf(readyState);
      console.info('[collab] capture ready', { audioLive, videoLive });
      setLocalStream(stream);
      return connectRoom(nextRoomId);
    },
    [connectRoom, openMeetingMedia],
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
    const track = stream.getAudioTracks()[0];
    // A live track stays ours, even when the OS reports it muted. `enabled` is
    // the mute switch. Opening a second capture while this one holds the
    // device hangs.
    if (track && track.readyState === 'live') {
      track.enabled = !track.enabled;
      micEnabledRef.current = track.enabled;
      console.info('[collab] microphone', { enabled: track.enabled, readyState: track.readyState });
      publishCapture();
      return;
    }
    micEnabledRef.current = true;
    const generation = joinGenerationRef.current;
    void (async () => {
      let opened: MediaStreamTrack;
      try {
        opened = await acquireMicrophoneTrack(audioDeviceRef.current || undefined);
      } catch (cause) {
        console.info('[collab] getUserMedia failed', cause);
        if (generation === joinGenerationRef.current) {
          setError(describeMediaFailure(cause));
        }
        return;
      }
      if (generation !== joinGenerationRef.current || streamRef.current !== stream) {
        opened.stop();
        return;
      }
      takeOpenedTracks(new MediaStream([opened]));
      setError((current) => (isMediaMessage(current) ? null : current));
    })();
  }, [publishCapture, takeOpenedTracks]);

  const releaseCameraTrack = useCallback((track: MediaStreamTrack | undefined) => {
    camEnabledRef.current = false;
    if (track && track.readyState !== 'ended') {
      track.enabled = false;
      track.stop();
    }
  }, []);

  const toggleCamera = useCallback(async () => {
    if (selfRef.current.screenSharing || cameraBusyRef.current) {
      return;
    }
    const stream = streamRef.current;
    if (!stream) {
      return;
    }
    const track = stream.getVideoTracks()[0];
    const plan = cameraTogglePlan(track);
    if (plan === 'enable' && track) {
      track.enabled = true;
      camEnabledRef.current = true;
      wantVideoRef.current = true;
      console.info('[collab] camera', { enabled: true, readyState: track.readyState });
      publishCapture();
      return;
    }
    if (plan === 'stop' && track) {
      wantVideoRef.current = false;
      releaseCameraTrack(track);
      stream.removeTrack(track);
      console.info('[collab] camera', { enabled: false, readyState: track.readyState });
      publishCapture();
      return;
    }
    // 'open' starts a camera that is not held. 'reopen' drops a muted track
    // first: a second getUserMedia while that track is live hangs, and the
    // button stays on Start video.
    cameraBusyRef.current = true;
    try {
      if (plan === 'reopen') {
        releaseCameraTrack(track);
      }
      camEnabledRef.current = true;
      wantVideoRef.current = true;
      let opened: MediaStreamTrack;
      try {
        opened = await acquireCameraTrack(videoDeviceRef.current || undefined);
      } catch (cause) {
        console.info('[collab] getUserMedia failed', cause);
        camEnabledRef.current = false;
        wantVideoRef.current = false;
        publishCapture();
        setError(describeMediaFailure(cause));
        return;
      }
      if (streamRef.current !== stream) {
        opened.stop();
        return;
      }
      const previous = stream.getVideoTracks();
      await swapLocalVideo(opened);
      previous.forEach((old) => {
        if (old !== opened) {
          old.stop();
        }
      });
      rememberDevice('videoinput', capturedDeviceId(opened));
      publishCapture();
      setError((current) => (isMediaMessage(current) ? null : current));
    } finally {
      cameraBusyRef.current = false;
    }
  }, [publishCapture, releaseCameraTrack, rememberDevice, swapLocalVideo]);

  const stopScreenShare = useCallback(async () => {
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;
    await swapLocalVideo(parkedCameraRef.current);
    parkedCameraRef.current = null;
    updateSelf({ screenSharing: false });
    publishCapture();
  }, [publishCapture, swapLocalVideo, updateSelf]);

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
    updateSelf({ screenSharing: true, videoOff: false });
  }, [stopScreenShare, swapLocalVideo, updateSelf]);

  /**
   * Leaving the app is not leaving the call. A phone takes the camera and the
   * microphone from whatever is not on screen, and another app that wants the
   * microphone — a call in a messenger — takes it even from the app in front.
   * Neither hands anything back, so without this the room hears silence from
   * someone who only went to read a message. Only hanging up ends capture.
   */
  useEffect(() => {
    if (!localStream) {
      return;
    }
    // Coming back to the app or back online is when a link that died while
    // nobody was looking gets noticed, so check every connection right then.
    const checkLinks = (): void => managerRef.current?.checkConnections();
    const stopResuming = onAppResumed(() => {
      resumePlayback();
      checkLinks();
    });
    const canWatchNetwork =
      typeof window !== 'undefined' && typeof window.addEventListener === 'function';
    if (canWatchNetwork) {
      window.addEventListener('online', checkLinks);
    }
    const stopWatching = watchCapture({
      stream: localStream,
      microphone: {
        wanted: () => streamRef.current !== null,
        open: () => acquireMicrophoneTrack(audioDeviceRef.current || undefined),
        adopt: async (track) => {
          const stream = streamRef.current;
          if (!stream) {
            track.stop();
            return;
          }
          for (const previous of stream.getAudioTracks()) {
            previous.stop();
            stream.removeTrack(previous);
          }
          stream.addTrack(track);
          rememberDevice('audioinput', capturedDeviceId(track));
          await managerRef.current?.replaceAudioTrack(track);
        },
        enabled: () => micEnabledRef.current,
      },
      camera: {
        wanted: () =>
          streamRef.current !== null && camEnabledRef.current && !selfRef.current.screenSharing,
        open: () => acquireCameraTrack(videoDeviceRef.current || undefined),
        adopt: async (track) => {
          const previous =
            streamRef.current?.getVideoTracks().filter((item) => item !== track) ?? [];
          await swapLocalVideo(track);
          previous.forEach((item) => item.stop());
          rememberDevice('videoinput', capturedDeviceId(track));
        },
        enabled: () => camEnabledRef.current,
      },
      onRestored: () => {
        publishCapture();
        setError((current) => (isMediaMessage(current) ? null : current));
      },
      onFailed: () => setError(describeMediaFailure(new Error('media-timeout'))),
    });
    return () => {
      stopResuming();
      stopWatching();
      if (canWatchNetwork) {
        window.removeEventListener('online', checkLinks);
      }
    };
  }, [localStream, publishCapture, rememberDevice, swapLocalVideo]);

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
      const stroke: Stroke = { ...draft, id: randomUUID(), peerId: selfPeerId ?? 'self' };
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
            stdin: payload.stdin,
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
      const signaling = signalingRef.current;
      if (!signaling) {
        return;
      }
      pendingSubmissions.current.push(checked.request);
      signaling.emit('code:run', checked.request);
    },
    [],
  );

  const updateWorkspaceFiles = useCallback((files: WorkspaceFile[]) => {
    setWorkspaceFiles(files);
    signalingRef.current?.emit('code:files', files);
  }, []);

  const persistProblem = useCallback((next: ProblemSyncState) => {
    problemSyncRef.current = next;
    setProblemSync(next);
    const id = roomIdRef.current;
    if (id) {
      saveRoomSnapshot(id, { problem: next });
    }
  }, []);

  const chooseProblem = useCallback(
    (slug: string) => {
      const isHost = selfPeerIdRef.current !== null && selfPeerIdRef.current === hostPeerId;
      const result = reduceProblemSync(problemSyncRef.current, {
        type: 'choose',
        slug,
        isHost,
        now: Date.now(),
      });
      persistProblem(result.state);
      if (result.broadcastSlug) {
        signalingRef.current?.emit('problem:select', result.broadcastSlug);
      }
    },
    [hostPeerId, persistProblem],
  );

  const setFollowHost = useCallback(
    (follow: boolean) => {
      persistProblem(
        reduceProblemSync(problemSyncRef.current, { type: 'follow', followHost: follow }).state,
      );
    },
    [persistProblem],
  );

  const updateSettings = useCallback((patch: Partial<RoomSettings>) => {
    const next = normalizeRoomSettings({ ...settingsRef.current, ...patch });
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

  const toggleNoiseSuppression = useCallback(() => {
    const next = !noiseOnRef.current;
    noiseOnRef.current = next;
    setNoiseSuppression(next);
    console.info('[collab] noise suppression', { enabled: next });
    voiceApplyRef.current = applyVoice();
  }, [applyVoice]);

  const cycleSpeaker = useCallback(async () => {
    const next = nextAudioOutput(devices, selectedDevices.audiooutput);
    if (!next) {
      console.info('[collab] speaker', 'default');
      return;
    }
    setSelectedDevices((current) => ({ ...current, audiooutput: next.deviceId }));
    await retargetSpeakers(next.deviceId);
    console.info('[collab] speaker', { label: next.label });
  }, [devices, selectedDevices.audiooutput]);

  const retryMedia = useCallback(async () => {
    unlockAudioPlayback();
    if (!streamRef.current) {
      streamRef.current = new MediaStream();
    }
    await openMeetingMedia(wantVideoRef.current);
    const stream = streamRef.current;
    if (stream) {
      setLocalStream(stream);
    }
  }, [openMeetingMedia]);

  const chooseDevice = useCallback(
    async (kind: ListedDevice['kind'], deviceId: string) => {
      setSelectedDevices((current) => ({ ...current, [kind]: deviceId }));
      if (kind === 'audiooutput') {
        await retargetSpeakers(deviceId);
        return;
      }
      if (kind === 'audioinput') {
        audioDeviceRef.current = deviceId;
        const current = streamRef.current?.getAudioTracks()[0];
        const keepEnabled = current ? current.enabled : true;
        micEnabledRef.current = keepEnabled;
        try {
          const track = await acquireMicrophoneTrack(deviceId);
          track.enabled = keepEnabled;
          if (!streamRef.current) {
            track.stop();
            return;
          }
          takeOpenedTracks(new MediaStream([track]));
        } catch (cause) {
          console.info('[collab] getUserMedia failed', cause);
          setError(describeMediaFailure(cause));
        }
        return;
      }
      videoDeviceRef.current = deviceId;
      if (selfRef.current.screenSharing) {
        try {
          const track = await acquireCameraTrack(deviceId);
          parkedCameraRef.current?.stop();
          parkedCameraRef.current = track;
        } catch (cause) {
          console.info('[collab] getUserMedia failed', cause);
          setError(describeMediaFailure(cause));
        }
        return;
      }
      const current = streamRef.current?.getVideoTracks()[0];
      const keepEnabled = current ? current.enabled : true;
      camEnabledRef.current = keepEnabled;
      wantVideoRef.current = keepEnabled || wantVideoRef.current;
      try {
        const track = await acquireCameraTrack(deviceId);
        track.enabled = keepEnabled;
        if (!streamRef.current) {
          track.stop();
          return;
        }
        const previous = streamRef.current.getVideoTracks();
        await swapLocalVideo(track);
        previous.forEach((item) => item.stop());
        rememberDevice('videoinput', capturedDeviceId(track) || deviceId);
        publishCapture();
      } catch (cause) {
        console.info('[collab] getUserMedia failed', cause);
        setError(describeMediaFailure(cause));
      }
    },
    [publishCapture, rememberDevice, swapLocalVideo, takeOpenedTracks],
  );

  useEffect(() => {
    const stream = localStream;
    if (!stream) {
      return;
    }
    const detach: Array<() => void> = [];
    const follow = (track: MediaStreamTrack): void => {
      const onEvent = (): void => {
        console.info('[collab] track event', {
          kind: track.kind,
          readyState: track.readyState,
          enabled: track.enabled,
          muted: track.muted,
          live: trackIsLive(track),
        });
        publishCapture();
      };
      track.addEventListener('ended', onEvent);
      track.addEventListener('mute', onEvent);
      track.addEventListener('unmute', onEvent);
      detach.push(() => {
        track.removeEventListener('ended', onEvent);
        track.removeEventListener('mute', onEvent);
        track.removeEventListener('unmute', onEvent);
      });
    };
    stream.getTracks().forEach(follow);
    const onAdd = (event: Event): void => {
      const track = (event as MediaStreamTrackEvent).track;
      if (track) {
        follow(track);
      }
      publishCapture();
    };
    const onRemove = (): void => publishCapture();
    stream.addEventListener('addtrack', onAdd);
    stream.addEventListener('removetrack', onRemove);
    return () => {
      detach.forEach((stop) => stop());
      stream.removeEventListener('addtrack', onAdd);
      stream.removeEventListener('removetrack', onRemove);
    };
  }, [localStream, publishCapture]);

  useEffect(() => {
    if (!localStream) {
      return;
    }
    return watchDeviceChanges(() => {
      void (async () => {
        let listed: ListedDevice[];
        try {
          listed = await listMediaDevices();
        } catch (cause) {
          console.info('[collab] enumerateDevices failed', cause);
          return;
        }
        const signature = deviceSignature(listed);
        setDevices(listed);
        console.info(
          '[collab] devicechange',
          listed.map((device) => device.label),
        );
        if (signature === deviceSignatureRef.current) {
          return;
        }
        deviceSignatureRef.current = signature;
        const stream = streamRef.current;
        if (!stream) {
          return;
        }
        const audioStill = (id: string) =>
          !id || listed.some((device) => device.kind === 'audioinput' && device.deviceId === id);
        const videoStill = (id: string) =>
          !id || listed.some((device) => device.kind === 'videoinput' && device.deviceId === id);
        if (!audioStill(audioDeviceRef.current)) {
          audioDeviceRef.current = '';
          setSelectedDevices((current) => ({ ...current, audioinput: '' }));
        }
        if (!videoStill(videoDeviceRef.current)) {
          videoDeviceRef.current = '';
          setSelectedDevices((current) => ({ ...current, videoinput: '' }));
        }
        const audio = stream.getAudioTracks()[0];
        const keepAudio = audio ? audio.enabled : micEnabledRef.current;
        try {
          const track = await acquireMicrophoneTrack(audioDeviceRef.current || undefined);
          track.enabled = keepAudio;
          if (streamRef.current !== stream) {
            track.stop();
          } else {
            takeOpenedTracks(new MediaStream([track]));
          }
        } catch (cause) {
          console.info('[collab] getUserMedia failed', cause);
          setError(describeMediaFailure(cause));
        }
        const sharing = selfRef.current.screenSharing;
        const video = sharing ? parkedCameraRef.current : stream.getVideoTracks()[0];
        if (!video && !wantVideoRef.current) {
          return;
        }
        const keepVideo = video ? video.enabled : camEnabledRef.current;
        try {
          const track = await acquireCameraTrack(videoDeviceRef.current || undefined);
          track.enabled = keepVideo;
          if (streamRef.current !== stream) {
            track.stop();
            return;
          }
          if (selfRef.current.screenSharing) {
            parkedCameraRef.current?.stop();
            parkedCameraRef.current = track;
            rememberDevice('videoinput', capturedDeviceId(track));
            return;
          }
          const previous = stream.getVideoTracks();
          await swapLocalVideo(track);
          previous.forEach((item) => item.stop());
          rememberDevice('videoinput', capturedDeviceId(track));
          publishCapture();
        } catch (cause) {
          console.info('[collab] getUserMedia failed', cause);
          setError(describeMediaFailure(cause));
        }
      })();
    });
  }, [localStream, publishCapture, rememberDevice, swapLocalVideo, takeOpenedTracks]);

  return {
    status,
    error,
    localStream,
    participants,
    linkQuality,
    messages,
    strokes,
    boardFiles,
    transcript,
    captionsOn,
    captionError,
    assistantTurns,
    code,
    runs,
    workspaceFiles,
    problemSync,
    chooseProblem,
    setFollowHost,
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
    retryMedia,
    devices,
    selectedDevices,
    chooseDevice,
    noiseSuppression,
    toggleNoiseSuppression,
    cycleSpeaker,
    speakerLabel: outputKindLabel(
      devices.find(
        (device) =>
          device.kind === 'audiooutput' && device.deviceId === selectedDevices.audiooutput,
      )?.label ?? '',
    ),
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
