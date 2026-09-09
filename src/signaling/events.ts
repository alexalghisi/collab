export interface JoinRoomPayload {
  readonly roomId: string;
  readonly displayName: string;
}

export interface PeerInfo {
  readonly peerId: string;
  readonly displayName: string;
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
}

export interface ServerToClientEvents {
  'room:peers': (peers: PeerInfo[]) => void;
  'peer:joined': (peer: PeerInfo) => void;
  'peer:left': (peerId: string) => void;
  'signal:offer': (payload: IncomingSdpPayload) => void;
  'signal:answer': (payload: IncomingSdpPayload) => void;
  'signal:ice': (payload: IncomingIcePayload) => void;
}
