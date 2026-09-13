import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settle, startRoomServer, type RoomServer } from '../testing/roomServer';
import { SharedCodeDocument } from './SharedCodeDocument';

/** The document rides the same channel the call does, so it is tested that way. */
describe('shared code over the Socket.IO transport', () => {
  let server: RoomServer;
  const documents: SharedCodeDocument[] = [];

  const join = async (sessionId: string, displayName: string) => {
    const { channel, joined } = await server.join(sessionId, displayName);
    const document = new SharedCodeDocument(channel, { peerId: sessionId, displayName });
    documents.push(document);
    if (joined.code) {
      document.applyState(joined.code);
    }
    return { channel, document, payload: joined };
  };

  beforeEach(async () => {
    server = await startRoomServer();
  });

  afterEach(async () => {
    for (const document of documents.splice(0)) {
      document.destroy();
    }
    await server.stop();
  });

  it('replicates edits between two participants in the room', async () => {
    const ada = await join('a', 'Ada');
    const linus = await join('b', 'Linus');

    ada.document.text.insert(0, 'print("hello")');
    await settle();
    linus.document.text.insert(0, '# ');
    await settle();

    expect(linus.document.text.toString()).toBe('# print("hello")');
    expect(ada.document.text.toString()).toBe('# print("hello")');
  });

  it('converges when both participants edit before seeing each other', async () => {
    const ada = await join('a', 'Ada');
    const linus = await join('b', 'Linus');

    ada.document.text.insert(0, 'ada line\n');
    linus.document.text.insert(0, 'linus line\n');
    await settle();

    expect(ada.document.text.toString()).toBe(linus.document.text.toString());
    expect(ada.document.text.toString()).toContain('ada line');
    expect(ada.document.text.toString()).toContain('linus line');
  });

  it('serves the merged document to a participant who joins later', async () => {
    const ada = await join('a', 'Ada');
    ada.document.text.insert(0, 'package main');
    ada.document.setLanguage('go');
    await settle();

    const late = await join('c', 'Grace');

    expect(late.payload.code).not.toBeNull();
    expect(late.document.text.toString()).toBe('package main');
    expect(late.document.language).toBe('go');
  });

  it('reports no document to the first participant of an untouched room', async () => {
    const ada = await join('a', 'Ada');

    expect(ada.payload.code).toBeNull();
  });

  it('shows a remote cursor and withdraws it when the peer leaves', async () => {
    const ada = await join('a', 'Ada');
    const linus = await join('b', 'Linus');
    await settle();

    expect(ada.document.presence().map((entry) => entry.displayName)).toEqual(['Linus']);
    const [remote] = ada.document.presence();
    expect(remote.color).not.toBe(ada.document.color);

    linus.document.destroy();
    await settle();

    expect(ada.document.presence()).toEqual([]);
  });

  it('keeps the document after every participant has left it', async () => {
    const ada = await join('a', 'Ada');
    ada.document.text.insert(0, 'const kept = true;');
    await settle();
    const linus = await join('b', 'Linus');
    ada.document.destroy();
    ada.channel.disconnect();
    await settle();

    const returning = await join('a', 'Ada');

    expect(returning.document.text.toString()).toBe('const kept = true;');
    expect(linus.document.text.toString()).toBe('const kept = true;');
  });

  it('drops the room document once the room empties', async () => {
    const ada = await join('a', 'Ada');
    ada.document.text.insert(0, 'temporary');
    await settle();
    ada.document.destroy();
    ada.channel.disconnect();
    await settle();

    const fresh = await join('b', 'Linus');

    expect(fresh.payload.code).toBeNull();
    expect(fresh.document.text.toString()).toBe('');
  });
});
