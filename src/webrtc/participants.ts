import { INITIAL_PEER_STATE, type PeerInfo } from '../signaling/events';
import type { RemoteParticipant } from '../hooks/useCollabSession';

export function rememberRemoteStream(
  current: readonly RemoteParticipant[],
  peerId: string,
  stream: MediaStream,
): RemoteParticipant[] {
  const existing = current.find((participant) => participant.peerId === peerId);
  if (existing) {
    return current.map((participant) =>
      participant.peerId === peerId ? { ...participant, stream } : participant,
    );
  }
  return [
    ...current,
    {
      peerId,
      displayName: '',
      state: INITIAL_PEER_STATE,
      stream,
    },
  ];
}

export function syncRoomPeers(
  current: readonly RemoteParticipant[],
  peers: readonly PeerInfo[],
): RemoteParticipant[] {
  const listed = peers.map((peer) => {
    const existing = current.find((participant) => participant.peerId === peer.peerId);
    return {
      peerId: peer.peerId,
      displayName: peer.displayName,
      state: peer.state,
      stream: existing?.stream,
    };
  });
  const extras = current.filter(
    (participant) =>
      Boolean(participant.stream) && !listed.some((peer) => peer.peerId === participant.peerId),
  );
  return [...listed, ...extras];
}

export function joinRemotePeer(
  current: readonly RemoteParticipant[],
  peer: PeerInfo,
): RemoteParticipant[] {
  const existing = current.find((participant) => participant.peerId === peer.peerId);
  return [
    ...current.filter((participant) => participant.peerId !== peer.peerId),
    {
      peerId: peer.peerId,
      displayName: peer.displayName,
      state: peer.state,
      stream: existing?.stream,
    },
  ];
}
