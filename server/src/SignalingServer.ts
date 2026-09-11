import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  INITIAL_PEER_STATE,
  type ClientToServerEvents,
  type PeerInfo,
  type PeerState,
  type ServerToClientEvents,
  type Stroke,
} from '../../src/signaling/events';

export interface SocketData {
  roomId?: string;
  displayName?: string;
  joinedAt?: number;
  state?: PeerState;
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

/** Shared, non-media state of a room; dropped once the last participant leaves. */
interface RoomState {
  hostPeerId: string;
  strokes: Stroke[];
  notes: string;
}

const rooms = new Map<string, RoomState>();

function roomOf(roomId: string, firstPeerId: string): RoomState {
  let room = rooms.get(roomId);
  if (!room) {
    room = { hostPeerId: firstPeerId, strokes: [], notes: '' };
    rooms.set(roomId, room);
  }
  return room;
}

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
      state: peer.data.state ?? INITIAL_PEER_STATE,
    }));
}

async function handleLeave(io: CollabServer, roomId: string, peerId: string): Promise<void> {
  const room = rooms.get(roomId);
  const remaining = await listRoomPeers(io, roomId, peerId);
  if (remaining.length === 0) {
    rooms.delete(roomId);
    return;
  }
  if (room && room.hostPeerId === peerId) {
    const [next] = [...remaining].sort((a, b) => a.joinedAt - b.joinedAt);
    room.hostPeerId = next.peerId;
    io.to(roomId).emit('room:host', next.peerId);
  }
}

function registerSocket(io: CollabServer, socket: CollabServerSocket): void {
  const currentRoom = (): RoomState | undefined =>
    socket.data.roomId ? rooms.get(socket.data.roomId) : undefined;

  socket.on('room:join', async ({ roomId, displayName, state }) => {
    const joinedAt = Date.now();
    socket.data.roomId = roomId;
    socket.data.displayName = displayName;
    socket.data.joinedAt = joinedAt;
    socket.data.state = state;

    const peers = await listRoomPeers(io, roomId, socket.id);
    await socket.join(roomId);
    const room = roomOf(roomId, socket.id);

    socket.emit('room:joined', {
      selfPeerId: socket.id,
      selfJoinedAt: joinedAt,
      hostPeerId: room.hostPeerId,
      peers,
      strokes: room.strokes,
      notes: room.notes,
    });
    socket.to(roomId).emit('peer:joined', { peerId: socket.id, displayName, joinedAt, state });
  });

  socket.on('peer:state', (state) => {
    const { roomId } = socket.data;
    if (roomId) {
      socket.data.state = state;
      socket.to(roomId).emit('peer:state', { peerId: socket.id, state });
    }
  });

  socket.on('chat:message', (text) => {
    const { roomId, displayName } = socket.data;
    if (roomId) {
      io.to(roomId).emit('chat:message', {
        id: randomUUID(),
        peerId: socket.id,
        displayName: displayName ?? 'Guest',
        text,
        sentAt: Date.now(),
      });
    }
  });

  socket.on('board:stroke', (stroke) => {
    const room = currentRoom();
    if (room && socket.data.roomId) {
      room.strokes.push(stroke);
      socket.to(socket.data.roomId).emit('board:stroke', stroke);
    }
  });

  socket.on('board:remove', (strokeIds) => {
    const room = currentRoom();
    if (room && socket.data.roomId) {
      room.strokes = room.strokes.filter((stroke) => !strokeIds.includes(stroke.id));
      socket.to(socket.data.roomId).emit('board:remove', strokeIds);
    }
  });

  socket.on('notes:update', (text) => {
    const room = currentRoom();
    if (room && socket.data.roomId) {
      room.notes = text;
      socket.to(socket.data.roomId).emit('notes:update', text);
    }
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
    await handleLeave(io, roomId, socket.id);
  });
}

export function registerSignalingHandlers(io: CollabServer): void {
  io.on('connection', (socket) => {
    registerSocket(io, socket);
  });
}
