import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import * as Y from 'yjs';
import { REJECTION_MESSAGES } from '../../src/code/execution';
import { decodeUpdate, encodeUpdate } from '../../src/code/updates';
import type { MeetingAssistant } from '../../src/assistant/MeetingAssistant';
import { ExecutionService, createRunnerFromEnv } from './execution/ExecutionService';
import { acceptAssistantAsk, createMeetingAssistant, runAssistant } from './assistant/service';
import { attachmentPath, FileStore } from './files/FileStore';
import { normalizeChatDraft } from '../../src/chat/messages';
import type { FileAttachment } from '../../src/files/attachments';
import { normalizeTranscriptSegment, type TranscriptSegment } from '../../src/transcript/segments';
import {
  DEFAULT_ROOM_SETTINGS,
  INITIAL_PEER_STATE,
  type ChatMessage,
  type ClientToServerEvents,
  type PeerInfo,
  type PeerState,
  type RoomSettings,
  type ServerToClientEvents,
  type Stroke,
  type WaitingPeer,
} from '../../src/signaling/events';
import type { CodeLanguage } from '../../src/code/languages';

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
  /** Recent chat, kept so the assistant can read what the room said. */
  messages: ChatMessage[];
  /** Spoken turns so far; a late joiner gets the same log as everyone else. */
  transcript: TranscriptSegment[];
  /** Merged shared editor document, so a late joiner gets the current code. */
  code: Y.Doc;
  codeEdited: boolean;
  settings: RoomSettings;
  waiting: Map<string, WaitingPeer>;
  /** Sessions that passed the waiting room (or joined before it was enabled). */
  admitted: Set<string>;
  /** Sessions the host removed; they are out of the room and may not come back. */
  removed: Set<string>;
}

const rooms = new Map<string, RoomState>();

/**
 * Files shared in a room, owned here because they live and die with the room the
 * same way its strokes and its editor document do.
 */
export const files = new FileStore();

/**
 * Whether a session may still act in a room. The upload endpoint has no socket
 * to ask, and a participant the host removed must not be able to keep sending
 * files through the door the socket no longer opens.
 */
export function isAdmitted(roomId: string, sessionId: string): boolean {
  const room = rooms.get(roomId);
  return room !== undefined && room.admitted.has(sessionId) && !room.removed.has(sessionId);
}

/** Socket.IO channel grouping the participants of a room's breakout rooms. */
const breakoutChannel = (mainRoomId: string) => `${mainRoomId}:breakout`;

function roomOf(roomId: string, firstPeerId: string): RoomState {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      hostPeerId: firstPeerId,
      strokes: [],
      messages: [],
      transcript: [],
      code: new Y.Doc(),
      codeEdited: false,
      settings: DEFAULT_ROOM_SETTINGS,
      waiting: new Map(),
      admitted: new Set(),
      removed: new Set(),
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
    settings: room.settings,
    code: room.codeEdited ? encodeUpdate(Y.encodeStateAsUpdate(room.code)) : null,
    transcript: room.transcript,
  });
  socket.to(roomId).emit('peer:joined', { peerId: socket.id, displayName, joinedAt, state });
}

/**
 * Takes a participant out of the room rather than trusting them to leave when
 * told to: without this a removed client could keep sending chat, editor updates
 * or execution requests, since nothing but its own good manners stopped it.
 */
async function evict(
  io: CollabServer,
  room: RoomState,
  roomId: string,
  targetPeerId: string,
): Promise<void> {
  const target = io.sockets.sockets.get(targetPeerId);
  if (target?.data.roomId !== roomId) {
    return;
  }
  const { sessionId } = target.data;
  if (sessionId) {
    room.admitted.delete(sessionId);
    room.removed.add(sessionId);
  }
  target.emit('host:command', { action: 'remove' });
  target.data.roomId = undefined;
  await target.leave(roomId);
  io.to(roomId).emit('peer:left', targetPeerId);
  await handleLeave(io, roomId, targetPeerId);
}

async function handleLeave(io: CollabServer, roomId: string, peerId: string): Promise<void> {
  const room = rooms.get(roomId);
  const remaining = await listRoomPeers(io, roomId, peerId);
  if (remaining.length === 0) {
    room?.code.destroy();
    rooms.delete(roomId);
    files.clearRoom(roomId);
    return;
  }
  if (room && room.hostPeerId === peerId) {
    const [next] = [...remaining].sort((a, b) => a.joinedAt - b.joinedAt);
    room.hostPeerId = next.peerId;
    io.to(roomId).emit('room:host', next.peerId);
    notifyWaitingList(io, room);
  }
}

function registerSocket(
  io: CollabServer,
  socket: CollabServerSocket,
  execution: ExecutionService,
  assistant: MeetingAssistant,
): void {
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
    if (room?.removed.has(sessionId)) {
      socket.emit('room:denied');
      return;
    }
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

  socket.on('host:command', async ({ targetPeerId, command }) => {
    const room = hostedRoom();
    const roomId = socket.data.roomId;
    if (!room || !roomId) {
      return;
    }
    if (targetPeerId === null) {
      socket.to(roomId).emit('host:command', command);
      return;
    }
    if (command.action === 'remove') {
      await evict(io, room, roomId, targetPeerId);
      return;
    }
    io.to(targetPeerId).emit('host:command', command);
  });

  socket.on('peer:state', (state) => {
    const { roomId } = socket.data;
    if (roomId) {
      socket.data.state = state;
      socket.to(roomId).emit('peer:state', { peerId: socket.id, state });
    }
  });

  socket.on('chat:message', (draft) => {
    const { roomId, displayName, sessionId } = socket.data;
    const message = normalizeChatDraft(draft);
    if (!roomId || !message) {
      return;
    }
    // The sender describes its own attachment, so the description is replaced
    // with the store's: a client could otherwise put any name, size or url on
    // somebody else's file, or on a file from another room.
    let file: FileAttachment | null = null;
    if (message.file) {
      const stored = files.get(message.file.id);
      if (!stored || stored.roomId !== roomId || stored.uploadedBy !== sessionId) {
        return;
      }
      file = {
        id: stored.id,
        name: stored.name,
        mimeType: stored.mimeType,
        size: stored.bytes.byteLength,
        url: attachmentPath(stored.id),
      };
    }
    const entry: ChatMessage = {
      id: randomUUID(),
      peerId: socket.id,
      displayName: displayName ?? 'Guest',
      text: message.text,
      file,
      sentAt: Date.now(),
    };
    const room = currentRoom();
    if (room) {
      room.messages.push(entry);
      if (room.messages.length > 200) {
        room.messages.splice(0, room.messages.length - 200);
      }
    }
    io.to(roomId).emit('chat:message', entry);
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

  socket.on('code:run', async (payload) => {
    const roomId = socket.data.roomId;
    const runId = `${socket.id}:${randomUUID()}`;
    const displayName = socket.data.displayName ?? 'Guest';
    const accepted = execution.accept(
      payload,
      [`room:${roomId}`, `peer:${socket.id}`],
      Boolean(roomId),
    );

    if (!accepted.ok) {
      // Only the sender hears about a refusal; the room never saw a run start.
      socket.emit('code:run:started', {
        runId,
        byPeerId: socket.id,
        byDisplayName: displayName,
        language: (payload as { language?: CodeLanguage })?.language ?? 'javascript',
      });
      socket.emit('code:run:finished', {
        runId,
        exitCode: null,
        timedOut: false,
        error: REJECTION_MESSAGES[accepted.reason],
      });
      return;
    }

    const { request } = accepted;
    const room = io.to(roomId as string);
    room.emit('code:run:started', {
      runId,
      byPeerId: socket.id,
      byDisplayName: displayName,
      language: request.language,
    });
    try {
      const result = await execution.run(request, (chunk) => {
        room.emit('code:output', { runId, ...chunk });
      });
      room.emit('code:run:finished', { runId, ...result, error: null });
    } catch (cause) {
      room.emit('code:run:finished', {
        runId,
        exitCode: null,
        timedOut: false,
        error: (cause as Error).message,
      });
    }
  });

  socket.on('assistant:ask', async ({ requestId, question }) => {
    const roomId = socket.data.roomId;
    const room = currentRoom();
    const context = {
      meetingId: roomId ?? '',
      roomId: roomId ?? '',
      question,
      transcript:
        room?.transcript.map((turn) => ({
          displayName: turn.displayName,
          text: turn.text,
          startedAt: turn.startedAt,
        })) ?? [],
      messages:
        room?.messages.map((message) => ({ text: message.text, sentAt: message.sentAt })) ?? [],
    };
    const accepted = acceptAssistantAsk(
      context,
      [`room:${roomId}`, `peer:${socket.id}`],
      Boolean(roomId && room),
    );
    if (!accepted.ok) {
      socket.emit('assistant:error', { requestId, error: accepted.error });
      return;
    }
    const events = await runAssistant(assistant, context);
    const target = io.to(roomId as string);
    for (const event of events) {
      if (event.type === 'token') {
        target.emit('assistant:token', { requestId, text: event.text });
      } else if (event.type === 'done') {
        target.emit('assistant:done', { requestId, actions: event.actions });
      } else {
        target.emit('assistant:error', { requestId, error: event.error });
      }
    }
  });

  socket.on('transcript:segment', (payload) => {
    const room = currentRoom();
    const draft = (payload ?? {}) as Partial<TranscriptSegment>;
    const segment = normalizeTranscriptSegment({
      ...draft,
      peerId: socket.id,
      displayName: socket.data.displayName ?? 'Guest',
    });
    if (!room || !socket.data.roomId || !segment) {
      return;
    }
    room.transcript.push(segment);
    io.to(socket.data.roomId).emit('transcript:segment', segment);
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

export function registerSignalingHandlers(
  io: CollabServer,
  execution = new ExecutionService(createRunnerFromEnv()),
  assistant?: MeetingAssistant,
): void {
  const helper = assistant ?? createMeetingAssistant();
  io.on('connection', (socket) => {
    registerSocket(io, socket, execution, helper);
  });
}
