import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  PeerInfo,
  ServerToClientEvents,
} from '../../src/signaling/events';

export interface SocketData {
  roomId?: string;
  displayName?: string;
  joinedAt?: number;
}

export type CollabServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

type CollabServerSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

const hosts = new Map<string, string>();

async function listRoomPeers(
  io: CollabServer,
  roomId: string,
  excludeId: string,
): Promise<PeerInfo[]> {
  const sockets = await io.in(roomId).fetchSockets();
  return sockets
    .filter((peer) => peer.id !== excludeId)
    .map((peer) => ({
      peerId: peer.id,
      displayName: peer.data.displayName ?? 'Guest',
      joinedAt: peer.data.joinedAt ?? 0,
    }));
}

async function reassignHost(io: CollabServer, roomId: string): Promise<void> {
  const remaining = await listRoomPeers(io, roomId, '');
  if (remaining.length === 0) {
    hosts.delete(roomId);
    return;
  }
  const [next] = [...remaining].sort((a, b) => a.joinedAt - b.joinedAt);
  hosts.set(roomId, next.peerId);
  io.to(roomId).emit('room:host', next.peerId);
}

function registerSocket(io: CollabServer, socket: CollabServerSocket): void {
  socket.on('room:join', async ({ roomId, displayName }) => {
    const joinedAt = Date.now();
    socket.data.roomId = roomId;
    socket.data.displayName = displayName;
    socket.data.joinedAt = joinedAt;

    const peers = await listRoomPeers(io, roomId, socket.id);
    await socket.join(roomId);

    const hostPeerId = hosts.get(roomId) ?? socket.id;
    hosts.set(roomId, hostPeerId);

    socket.emit('room:joined', {
      selfPeerId: socket.id,
      selfJoinedAt: joinedAt,
      hostPeerId,
      peers,
    });
    socket.to(roomId).emit('peer:joined', { peerId: socket.id, displayName, joinedAt });
  });

  socket.on('signal:offer', ({ targetPeerId, description }) => {
    io.to(targetPeerId).emit('signal:offer', { fromPeerId: socket.id, description });
  });

  socket.on('signal:answer', ({ targetPeerId, description }) => {
    io.to(targetPeerId).emit('signal:answer', { fromPeerId: socket.id, description });
  });

  socket.on('signal:ice', ({ targetPeerId, candidate }) => {
    io.to(targetPeerId).emit('signal:ice', { fromPeerId: socket.id, candidate });
  });

  socket.on('disconnect', async () => {
    const { roomId } = socket.data;
    if (!roomId) {
      return;
    }
    socket.to(roomId).emit('peer:left', socket.id);
    if (hosts.get(roomId) === socket.id) {
      await reassignHost(io, roomId);
    }
  });
}

export function registerSignalingHandlers(io: CollabServer): void {
  io.on('connection', (socket) => {
    registerSocket(io, socket);
  });
}
