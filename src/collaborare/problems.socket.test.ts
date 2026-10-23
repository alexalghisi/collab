import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SharedCodeDocument } from '../code/SharedCodeDocument';
import type { SharedProblem } from '../signaling/events';
import { settle, startRoomServer, until, type RoomServer } from '../testing/roomServer';
import { problemStarter } from './starter';

describe('a shared problem across two clients', () => {
  let server: RoomServer;
  const documents: SharedCodeDocument[] = [];

  beforeEach(async () => {
    server = await startRoomServer();
  });

  afterEach(async () => {
    for (const document of documents.splice(0)) {
      document.destroy();
    }
    await server.stop();
  });

  it('shows the host problem to the guest and to someone who joins later', async () => {
    const host = await server.join('host', 'Ada');
    const guest = await server.join('guest', 'Linus');
    const seen: SharedProblem[] = [];
    guest.channel.on('problem:state', (problem) => seen.push(problem));

    guest.channel.emit('problem:select', 'suma');
    host.channel.emit('problem:select', 'bucati');
    await until(() => seen.some((problem) => problem.slug === 'bucati'));

    expect(seen.some((problem) => problem.slug === 'suma')).toBe(false);
    expect(seen.at(-1)).toMatchObject({ slug: 'bucati', history: ['bucati'] });

    const late = await server.join('late', 'Grace');
    expect(late.joined.problem.slug).toBe('bucati');
  });

  it('puts the starter into the shared editor', async () => {
    const host = await server.join('host', 'Ada');
    const guest = await server.join('guest', 'Linus');
    const hostDoc = new SharedCodeDocument(host.channel, { peerId: 'host', displayName: 'Ada' });
    const guestDoc = new SharedCodeDocument(guest.channel, {
      peerId: 'guest',
      displayName: 'Linus',
    });
    documents.push(hostDoc, guestDoc);
    const starter = problemStarter('cpp', 'Bucăți crescătoare');

    host.channel.emit('problem:select', 'bucati');
    hostDoc.setLanguage('cpp');
    hostDoc.replaceText(starter);
    await until(() => guestDoc.text.toString() === starter);

    expect(guestDoc.language).toBe('cpp');
    expect(guestDoc.text.toString()).toContain('int main()');
    await settle();
  });
});
