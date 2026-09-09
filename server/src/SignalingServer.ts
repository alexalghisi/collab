import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  PeerInfo,
  ServerToClientEvents,
} from '../../src/signaling/events';

export interface SocketData {
  roomId?: string;
  displayName?: string;
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
    }));
}

function registerSocket(io: CollabServer, socket: CollabServerSocket): void {
  socket.on('room:join', async ({ roomId, displayName }) => {
    socket.data.roomId = roomId;
    socket.data.displayName = displayName;

    const existingPeers = await listRoomPeers(io, roomId, socket.id);
    await socket.join(roomId);

    socket.emit('room:peers', existingPeers);
    socket.to(roomId).emit('peer:joined', { peerId: socket.id, displayName });
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

  socket.on('disconnect', () => {
    const { roomId } = socket.data;
    if (roomId) {
      socket.to(roomId).emit('peer:left', socket.id);
    }
  });
}

export function registerSignalingHandlers(io: CollabServer): void {
  io.on('connection', (socket) => {
    registerSocket(io, socket);
  });
}
