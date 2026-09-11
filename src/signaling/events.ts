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
  readonly roomId: string;
  readonly displayName: string;
  readonly state: PeerState;
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
}

export interface RoomJoinedPayload {
  readonly selfPeerId: string;
  readonly selfJoinedAt: number;
  readonly hostPeerId: string;
  readonly peers: PeerInfo[];
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
  'chat:message': (text: string) => void;
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
}
