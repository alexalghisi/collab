import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import * as Y from 'yjs';
import { decodeUpdate, encodeUpdate } from '../../src/code/updates';
import {
  DEFAULT_ROOM_SETTINGS,
  INITIAL_PEER_STATE,
  type ClientToServerEvents,
  type PeerInfo,
  type PeerState,
  type RoomSettings,
  type ServerToClientEvents,
  type Stroke,
  type WaitingPeer,
} from '../../src/signaling/events';

export interface SocketData {
  sessionId?: string;
  roomId?: string;
  displayName?: string;
  joinedAt?: number;
  state?: PeerState;
  /** Set while the socket sits in a waiting room instead of the room itself. */
  waitingFor?: string;
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
  /** Merged shared editor document, so a late joiner gets the current code. */
  code: Y.Doc;
  codeEdited: boolean;
  settings: RoomSettings;
  waiting: Map<string, WaitingPeer>;
  /** Sessions that passed the waiting room (or joined before it was enabled). */
  admitted: Set<string>;
}

const rooms = new Map<string, RoomState>();

/** Socket.IO channel grouping the participants of a room's breakout rooms. */
const breakoutChannel = (mainRoomId: string) => `${mainRoomId}:breakout`;

function roomOf(roomId: string, firstPeerId: string): RoomState {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      hostPeerId: firstPeerId,
      strokes: [],
      notes: '',
      code: new Y.Doc(),
      codeEdited: false,
      settings: DEFAULT_ROOM_SETTINGS,
      waiting: new Map(),
      admitted: new Set(),
    };
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

function notifyWaitingList(io: CollabServer, room: RoomState): void {
  io.to(room.hostPeerId).emit('waiting:update', [...room.waiting.values()]);
}

async function admit(io: CollabServer, socket: CollabServerSocket, roomId: string): Promise<void> {
  const joinedAt = Date.now();
  socket.data.joinedAt = joinedAt;
  socket.data.waitingFor = undefined;
  socket.data.roomId = roomId;
  const { displayName = 'Guest', state = INITIAL_PEER_STATE } = socket.data;

  const peers = await listRoomPeers(io, roomId, socket.id);
  await socket.join(roomId);
  const room = roomOf(roomId, socket.id);
  if (socket.data.sessionId) {
    room.admitted.add(socket.data.sessionId);
  }

  socket.emit('room:joined', {
    selfPeerId: socket.id,
    selfJoinedAt: joinedAt,
    hostPeerId: room.hostPeerId,
    peers,
    strokes: room.strokes,
    notes: room.notes,
    settings: room.settings,
    code: room.codeEdited ? encodeUpdate(Y.encodeStateAsUpdate(room.code)) : null,
  });
  socket.to(roomId).emit('peer:joined', { peerId: socket.id, displayName, joinedAt, state });
}

async function handleLeave(io: CollabServer, roomId: string, peerId: string): Promise<void> {
  const room = rooms.get(roomId);
  const remaining = await listRoomPeers(io, roomId, peerId);
  if (remaining.length === 0) {
    room?.code.destroy();
    rooms.delete(roomId);
    return;
  }
  if (room && room.hostPeerId === peerId) {
    const [next] = [...remaining].sort((a, b) => a.joinedAt - b.joinedAt);
    room.hostPeerId = next.peerId;
    io.to(roomId).emit('room:host', next.peerId);
    notifyWaitingList(io, room);
  }
}

function registerSocket(io: CollabServer, socket: CollabServerSocket): void {
  const currentRoom = (): RoomState | undefined =>
    socket.data.roomId ? rooms.get(socket.data.roomId) : undefined;
  const hostedRoom = (): RoomState | undefined => {
    const room = currentRoom();
    return room?.hostPeerId === socket.id ? room : undefined;
  };

  socket.on('room:join', async ({ sessionId, roomId, displayName, state, breakoutOf }) => {
    socket.data.sessionId = sessionId;
    socket.data.displayName = displayName;
    socket.data.state = state;
    if (breakoutOf) {
      await socket.join(breakoutChannel(breakoutOf));
    }

    const room = rooms.get(roomId);
    if (room && room.settings.waitingRoom && !room.admitted.has(sessionId)) {
      socket.data.waitingFor = roomId;
      room.waiting.set(socket.id, { peerId: socket.id, displayName });
      socket.emit('room:waiting');
      notifyWaitingList(io, room);
      return;
    }
    await admit(io, socket, roomId);
  });

  socket.on('waiting:decide', async ({ peerId, admit: shouldAdmit }) => {
    const room = hostedRoom();
    const target = io.sockets.sockets.get(peerId);
    if (!room || !socket.data.roomId || !room.waiting.delete(peerId) || !target) {
      return;
    }
    notifyWaitingList(io, room);
    if (shouldAdmit) {
      await admit(io, target, socket.data.roomId);
    } else {
      target.data.waitingFor = undefined;
      target.emit('room:denied');
    }
  });

  socket.on('room:settings', (settings) => {
    const room = hostedRoom();
    const roomId = socket.data.roomId;
    if (!room || !roomId) {
      return;
    }
    const closingBreakouts = room.settings.breakoutOpen && !settings.breakoutOpen;
    room.settings = settings;
    io.to(roomId).emit('room:settings', settings);
    if (closingBreakouts) {
      io.to(breakoutChannel(roomId)).emit('host:command', { action: 'move', roomId });
    }
  });

  socket.on('host:command', ({ targetPeerId, command }) => {
    const roomId = socket.data.roomId;
    if (!hostedRoom() || !roomId) {
      return;
    }
    if (targetPeerId === null) {
      socket.to(roomId).emit('host:command', command);
    } else {
      io.to(targetPeerId).emit('host:command', command);
    }
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

  socket.on('code:update', (update) => {
    const room = currentRoom();
    if (room && socket.data.roomId) {
      Y.applyUpdate(room.code, decodeUpdate(update));
      room.codeEdited = true;
      socket.to(socket.data.roomId).emit('code:update', update);
    }
  });

  // Cursors and selections are presence, not content: relayed, never stored.
  socket.on('code:awareness', (update) => {
    if (socket.data.roomId) {
      socket.to(socket.data.roomId).emit('code:awareness', update);
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
    const { roomId, waitingFor } = socket.data;
    const waitingRoom = waitingFor ? rooms.get(waitingFor) : undefined;
    if (waitingRoom?.waiting.delete(socket.id)) {
      notifyWaitingList(io, waitingRoom);
    }
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
