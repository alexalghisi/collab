import type { ChatDraft } from '../chat/messages';
import type {
  ExecutionRequest,
  RunFinished,
  RunOutput,
  RunStarted,
  WorkspaceFile,
} from '../code/execution';
import type { FileAttachment } from '../files/attachments';
import type {
  AssistantAsk,
  AssistantDone,
  AssistantFailure,
  AssistantToken,
} from '../assistant/types';
import type { TranscriptSegment } from '../transcript/segments';

/** Presence flags every participant broadcasts to the room. */
export interface PeerState {
  readonly audioMuted: boolean;
  readonly videoOff: boolean;
  readonly handRaised: boolean;
  readonly screenSharing: boolean;
  /** Emoji shown on the tile for a few seconds, null when none. */
  readonly reaction: string | null;
}

export const INITIAL_PEER_STATE: PeerState = {
  audioMuted: false,
  videoOff: false,
  handRaised: false,
  screenSharing: false,
  reaction: null,
};

export interface JoinRoomPayload {
  /** Stable for the whole meeting, across breakout moves; an admitted session is not held again. */
  readonly sessionId: string;
  readonly roomId: string;
  readonly displayName: string;
  readonly state: PeerState;
  /** Set when `roomId` is a breakout room; the main room's id, so "close rooms" can bring us back. */
  readonly breakoutOf?: string;
}

/** Room-wide options only the host may change. */
export interface RoomSettings {
  readonly waitingRoom: boolean;
  readonly breakoutOpen: boolean;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = { waitingRoom: false, breakoutOpen: false };

export type HostCommand =
  | { readonly action: 'mute' }
  | { readonly action: 'remove' }
  | { readonly action: 'move'; readonly roomId: string; readonly breakoutOf?: string };

export interface HostCommandPayload {
  /** null addresses everyone in the room except the host. */
  readonly targetPeerId: string | null;
  readonly command: HostCommand;
}

export interface WaitingPeer {
  readonly peerId: string;
  readonly displayName: string;
}

export interface WaitingDecision {
  readonly peerId: string;
  readonly admit: boolean;
}

export interface PeerInfo {
  readonly peerId: string;
  readonly displayName: string;
  /** Epoch milliseconds; the later joiner initiates the WebRTC offer. */
  readonly joinedAt: number;
  readonly state: PeerState;
}

export interface PeerStatePayload {
  readonly peerId: string;
  readonly state: PeerState;
}

export interface ChatMessage {
  readonly id: string;
  readonly peerId: string;
  readonly displayName: string;
  readonly text: string;
  readonly sentAt: number;
  /** A file the sender shared with the room, alongside the text or on its own. */
  readonly file: FileAttachment | null;
  /** Present after the author changed the text. */
  readonly editedAt?: number;
  /** Tombstone so a later snapshot cannot bring a removed message back. */
  readonly deletedAt?: number;
}

export interface ChatEditPayload {
  readonly id: string;
  readonly text: string;
}

export interface ChatDeletePayload {
  readonly id: string;
}

/** One freehand line on the shared whiteboard. */
export interface Stroke {
  readonly id: string;
  readonly peerId: string;
  readonly color: string;
  readonly width: number;
  /** Flat x,y pairs normalised to 0..1 so every screen size renders the same drawing. */
  readonly points: number[];
}

export interface BoardFile {
  readonly id: string;
  readonly peerId: string;
  readonly file: FileAttachment;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface RoomJoinedPayload {
  readonly selfPeerId: string;
  readonly selfJoinedAt: number;
  readonly hostPeerId: string;
  readonly peers: PeerInfo[];
  /** Whiteboard content so far; transports that stream strokes send an empty list here. */
  readonly strokes: Stroke[];
  readonly notes: string;
  readonly settings: RoomSettings;
  /**
   * Merged state of the shared code document, base64-encoded, or null when the
   * room has none yet. Transports that stream updates instead send null.
   */
  readonly code: string | null;
  /**
   * Spoken turns so far; transports that stream segments send an empty list
   * here, the way they do for whiteboard strokes.
   */
  readonly transcript: TranscriptSegment[];
  readonly messages: ChatMessage[];
  readonly boardFiles: BoardFile[];
  /** Extra files next to the shared program (`date.in`, `date.out`, …). */
  readonly workspaceFiles: WorkspaceFile[];
}

export interface OutgoingSdpPayload {
  readonly targetPeerId: string;
  readonly description: RTCSessionDescriptionInit;
}

export interface OutgoingIcePayload {
  readonly targetPeerId: string;
  readonly candidate: RTCIceCandidateInit;
}

export interface IncomingSdpPayload {
  readonly fromPeerId: string;
  readonly description: RTCSessionDescriptionInit;
}

export interface IncomingIcePayload {
  readonly fromPeerId: string;
  readonly candidate: RTCIceCandidateInit;
}

export interface ClientToServerEvents {
  'room:join': (payload: JoinRoomPayload) => void;
  'signal:offer': (payload: OutgoingSdpPayload) => void;
  'signal:answer': (payload: OutgoingSdpPayload) => void;
  'signal:ice': (payload: OutgoingIcePayload) => void;
  'peer:state': (state: PeerState) => void;
  'chat:message': (draft: ChatDraft) => void;
  'chat:edit': (payload: ChatEditPayload) => void;
  'chat:delete': (payload: ChatDeletePayload) => void;
  'board:stroke': (stroke: Stroke) => void;
  'board:file': (item: BoardFile) => void;
  'board:remove': (strokeIds: string[]) => void;
  'notes:update': (text: string) => void;
  /** Base64-encoded Yjs document update for the shared code editor. */
  'code:update': (update: string) => void;
  /** Base64-encoded Yjs awareness update: cursors, selections and editor presence. */
  'code:awareness': (update: string) => void;
  /** Runs the submitted code in the sandbox and reports back to the whole room. */
  'code:run': (request: ExecutionRequest) => void;
  'code:files': (files: readonly WorkspaceFile[]) => void;
  /** One final spoken turn from this participant. */
  'transcript:segment': (segment: TranscriptSegment) => void;
  /** Asks the meeting assistant; the reply is streamed to the whole room. */
  'assistant:ask': (ask: AssistantAsk) => void;
  'room:settings': (settings: RoomSettings) => void;
  'host:command': (payload: HostCommandPayload) => void;
  'waiting:decide': (decision: WaitingDecision) => void;
}

export interface ServerToClientEvents {
  'room:joined': (payload: RoomJoinedPayload) => void;
  'room:host': (hostPeerId: string) => void;
  'peer:joined': (peer: PeerInfo) => void;
  'peer:left': (peerId: string) => void;
  'peer:state': (payload: PeerStatePayload) => void;
  'signal:offer': (payload: IncomingSdpPayload) => void;
  'signal:answer': (payload: IncomingSdpPayload) => void;
  'signal:ice': (payload: IncomingIcePayload) => void;
  'chat:message': (message: ChatMessage) => void;
  'chat:edited': (message: ChatMessage) => void;
  'chat:deleted': (message: ChatMessage) => void;
  'board:stroke': (stroke: Stroke) => void;
  'board:file': (item: BoardFile) => void;
  'board:remove': (strokeIds: string[]) => void;
  'notes:update': (text: string) => void;
  'code:update': (update: string) => void;
  'code:awareness': (update: string) => void;
  'code:run:started': (payload: RunStarted) => void;
  'code:output': (payload: RunOutput) => void;
  'code:run:finished': (payload: RunFinished) => void;
  'code:files': (files: readonly WorkspaceFile[]) => void;
  'transcript:segment': (segment: TranscriptSegment) => void;
  'assistant:token': (payload: AssistantToken) => void;
  'assistant:done': (payload: AssistantDone) => void;
  'assistant:error': (payload: AssistantFailure) => void;
  'room:settings': (settings: RoomSettings) => void;
  /** The room has a waiting room; the host has been asked to let us in. */
  'room:waiting': () => void;
  'room:denied': () => void;
  /** Sent to the host whenever the waiting list changes. */
  'waiting:update': (peers: WaitingPeer[]) => void;
  'host:command': (command: HostCommand) => void;
  /** This session took a seat already held by an older socket of the same person. */
  'session:replaced': () => void;
}
