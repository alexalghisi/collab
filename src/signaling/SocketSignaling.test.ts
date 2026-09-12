import { createServer, type Server as HttpServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerSignalingHandlers, type CollabServer } from '../../server/src/SignalingServer';
import { INITIAL_PEER_STATE, type RoomJoinedPayload, type Stroke } from './events';
import { AdmissionDeniedError, SignalingUnavailableError } from './SignalingChannel';
import { createSocketSignaling } from './SocketSignaling';

const stroke: Stroke = {
  id: 'stroke-1',
  peerId: 'ignored',
  color: '#fff',
  width: 3,
  points: [0, 0, 0.5, 0.5],
};

describe('SocketSignaling against the signaling server', () => {
  let httpServer: HttpServer;
  let io: CollabServer;
  let url: string;
  let connect: ReturnType<typeof createSocketSignaling>;
  const open: Array<{ disconnect: () => void }> = [];

  const join = (sessionId: string, displayName: string, roomId = 'room') => {
    const channel = connect({
      sessionId,
      roomId,
      displayName,
      state: INITIAL_PEER_STATE,
    });
    open.push(channel);
    return channel;
  };

  beforeEach(async () => {
    httpServer = createServer();
    io = new Server(httpServer);
    registerSignalingHandlers(io);
    httpServer.listen(0);
    await once(httpServer, 'listening');
    url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
    connect = createSocketSignaling(url);
  });

  afterEach(async () => {
    for (const channel of open.splice(0)) {
      channel.disconnect();
    }
    await io.close();
  });

  it('reports the URL it dialled when no server answers', async () => {
    const dead = createSocketSignaling('http://localhost:1')({
      sessionId: 'a',
      roomId: 'room',
      displayName: 'Ada',
      state: INITIAL_PEER_STATE,
    });
    open.push(dead);

    const cause = await dead.connect().catch((error: unknown) => error);

    expect(cause).toBeInstanceOf(SignalingUnavailableError);
    expect((cause as SignalingUnavailableError).url).toBe('http://localhost:1');
    expect((cause as Error).message).toContain('http://localhost:1');
  });

  it('makes the first participant host and lists earlier peers to a joiner', async () => {
    const first = join('a', 'Ada');
    const firstJoined = new Promise<RoomJoinedPayload>((resolve) =>
      first.on('room:joined', resolve),
    );
    await first.connect();
    const host = (await firstJoined).selfPeerId;

    const second = join('b', 'Linus');
    const secondJoined = new Promise<RoomJoinedPayload>((resolve) =>
      second.on('room:joined', resolve),
    );
    await second.connect();
    const payload = await secondJoined;

    expect(payload.hostPeerId).toBe(host);
    expect(payload.peers.map((peer) => peer.displayName)).toEqual(['Ada']);
  });

  it('hands the host seat to the earliest remaining peer when the host leaves', async () => {
    const first = join('a', 'Ada');
    await first.connect();
    const second = join('b', 'Linus');
    const secondJoined = new Promise<RoomJoinedPayload>((resolve) =>
      second.on('room:joined', resolve),
    );
    await second.connect();
    const promoted = new Promise<string>((resolve) => second.on('room:host', resolve));

    first.disconnect();

    expect(await promoted).toBe((await secondJoined).selfPeerId);
  });

  it('replays the whiteboard to a late joiner', async () => {
    const first = join('a', 'Ada');
    await first.connect();
    first.emit('board:stroke', stroke);

    const second = join('b', 'Linus');
    const joined = new Promise<RoomJoinedPayload>((resolve) => second.on('room:joined', resolve));
    await second.connect();

    expect((await joined).strokes).toEqual([stroke]);
  });

  it('holds a joiner in the waiting room until the host decides', async () => {
    const host = join('a', 'Ada');
    await host.connect();
    host.emit('room:settings', { waitingRoom: true, breakoutOpen: false });
    const waiting = new Promise<Array<{ peerId: string }>>((resolve) =>
      host.on('waiting:update', resolve),
    );

    const guest = join('b', 'Linus');
    const held = new Promise<void>((resolve) => guest.on('room:waiting', resolve));
    const connecting = guest.connect();
    await held;

    const [pending] = await waiting;
    host.emit('waiting:decide', { peerId: pending.peerId, admit: true });

    await expect(connecting).resolves.toBeUndefined();
  });

  it('rejects the join of a denied guest', async () => {
    const host = join('a', 'Ada');
    await host.connect();
    host.emit('room:settings', { waitingRoom: true, breakoutOpen: false });
    const waiting = new Promise<Array<{ peerId: string }>>((resolve) =>
      host.on('waiting:update', resolve),
    );

    const guest = join('b', 'Linus');
    const connecting = guest.connect();
    const [pending] = await waiting;
    host.emit('waiting:decide', { peerId: pending.peerId, admit: false });

    await expect(connecting).rejects.toBeInstanceOf(AdmissionDeniedError);
  });

  it('lets an admitted session back in without queueing again', async () => {
    const host = join('a', 'Ada');
    await host.connect();
    host.emit('room:settings', { waitingRoom: true, breakoutOpen: false });
    const waiting = new Promise<Array<{ peerId: string }>>((resolve) =>
      host.on('waiting:update', resolve),
    );

    const guest = join('b', 'Linus');
    const firstAttempt = guest.connect();
    const [pending] = await waiting;
    host.emit('waiting:decide', { peerId: pending.peerId, admit: true });
    await firstAttempt;
    guest.disconnect();

    const returning = join('b', 'Linus');
    let held = false;
    returning.on('room:waiting', () => {
      held = true;
    });
    await returning.connect();

    expect(held).toBe(false);
  });
});
