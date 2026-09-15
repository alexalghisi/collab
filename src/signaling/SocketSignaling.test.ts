import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settle, startRoomServer, type RoomServer } from '../testing/roomServer';
import {
  INITIAL_PEER_STATE,
  type RoomJoinedPayload,
  type Stroke,
  type WaitingPeer,
} from './events';
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
  let server: RoomServer;

  /** Joins without waiting for admission, for the cases that are held back. */
  const knock = (sessionId: string, displayName: string) =>
    server.connect({ sessionId, roomId: 'room', displayName, state: INITIAL_PEER_STATE });

  beforeEach(async () => {
    server = await startRoomServer();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('reports the URL it dialled when no server answers', async () => {
    const dead = createSocketSignaling('http://localhost:1')({
      sessionId: 'a',
      roomId: 'room',
      displayName: 'Ada',
      state: INITIAL_PEER_STATE,
    });

    const cause = await dead.connect().catch((error: unknown) => error);
    dead.disconnect();

    expect(cause).toBeInstanceOf(SignalingUnavailableError);
    expect((cause as SignalingUnavailableError).url).toBe('http://localhost:1');
    expect((cause as Error).message).toContain('http://localhost:1');
  });

  it('makes the first participant host and lists earlier peers to a joiner', async () => {
    const host = await server.join('a', 'Ada');
    const guest = await server.join('b', 'Linus');

    expect(guest.joined.hostPeerId).toBe(host.joined.selfPeerId);
    expect(guest.joined.peers.map((peer) => peer.displayName)).toEqual(['Ada']);
  });

  it('hands the host seat to the earliest remaining peer when the host leaves', async () => {
    const host = await server.join('a', 'Ada');
    const guest = await server.join('b', 'Linus');
    const promoted = new Promise<string>((resolve) => guest.channel.on('room:host', resolve));

    host.channel.disconnect();

    expect(await promoted).toBe(guest.joined.selfPeerId);
  });

  it('replays the whiteboard to a late joiner', async () => {
    const host = await server.join('a', 'Ada');
    host.channel.emit('board:stroke', stroke);

    const late = await server.join('b', 'Linus');

    expect(late.joined.strokes).toEqual([stroke]);
  });

  it('replays a pasted file to a late joiner', async () => {
    const host = await server.join('a', 'Ada');
    const form = new FormData();
    form.append('roomId', 'room');
    form.append('sessionId', 'a');
    form.append('file', new Blob(['png'], { type: 'image/png' }), 'shot.png');
    const attachment = (await (
      await fetch(`${server.url}/files`, { method: 'POST', body: form })
    ).json()) as {
      id: string;
      name: string;
      mimeType: string;
      size: number;
      url: string;
    };
    host.channel.emit('board:file', {
      id: 'file-1',
      peerId: host.joined.selfPeerId,
      file: attachment,
      x: 0.1,
      y: 0.1,
      w: 0.3,
      h: 0.3,
    });
    await settle();

    const late = await server.join('b', 'Linus');

    expect(late.joined.boardFiles).toMatchObject([{ file: { name: 'shot.png' } }]);
  });

  it('replays chat to a late joiner', async () => {
    const host = await server.join('a', 'Ada');
    host.channel.emit('chat:message', { text: 'stay after refresh', file: null });
    await settle();

    const late = await server.join('b', 'Linus');

    expect(late.joined.messages.map((entry) => entry.text)).toEqual(['stay after refresh']);
  });

  it('holds a joiner in the waiting room until the host decides', async () => {
    const host = await server.join('a', 'Ada');
    host.channel.emit('room:settings', { waitingRoom: true, breakoutOpen: false });
    const waiting = new Promise<WaitingPeer[]>((resolve) =>
      host.channel.on('waiting:update', resolve),
    );

    const guest = knock('b', 'Linus');
    const held = new Promise<void>((resolve) => guest.on('room:waiting', resolve));
    const joined = new Promise<RoomJoinedPayload>((resolve) => guest.on('room:joined', resolve));
    const connecting = guest.connect();
    await held;

    const [pending] = await waiting;
    host.channel.emit('waiting:decide', { peerId: pending.peerId, admit: true });
    await connecting;

    expect((await joined).hostPeerId).toBe(host.joined.selfPeerId);
    guest.disconnect();
  });

  it('rejects the join of a denied guest', async () => {
    const host = await server.join('a', 'Ada');
    host.channel.emit('room:settings', { waitingRoom: true, breakoutOpen: false });
    const waiting = new Promise<WaitingPeer[]>((resolve) =>
      host.channel.on('waiting:update', resolve),
    );

    const guest = knock('b', 'Linus');
    const connecting = guest.connect();
    const [pending] = await waiting;
    host.channel.emit('waiting:decide', { peerId: pending.peerId, admit: false });

    await expect(connecting).rejects.toBeInstanceOf(AdmissionDeniedError);
    guest.disconnect();
  });

  it('lets an admitted session back in without queueing again', async () => {
    const host = await server.join('a', 'Ada');
    host.channel.emit('room:settings', { waitingRoom: true, breakoutOpen: false });
    const waiting = new Promise<WaitingPeer[]>((resolve) =>
      host.channel.on('waiting:update', resolve),
    );

    const guest = knock('b', 'Linus');
    const firstAttempt = guest.connect();
    const [pending] = await waiting;
    host.channel.emit('waiting:decide', { peerId: pending.peerId, admit: true });
    await firstAttempt;
    guest.disconnect();

    const returning = knock('b', 'Linus');
    let held = false;
    returning.on('room:waiting', () => {
      held = true;
    });
    await returning.connect();
    returning.disconnect();

    expect(held).toBe(false);
  });
});
