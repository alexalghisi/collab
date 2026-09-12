import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MeetingAssistant } from './MeetingAssistant';
import { createHashEmbedder } from '../search/embed';
import { MemoryVectorStore } from '../search/MemoryVectorStore';
import { settle, startRoomServer, until, type RoomServer } from '../testing/roomServer';
import type { AssistantDone, AssistantFailure } from './types';

describe('the meeting assistant over the Socket.IO transport', () => {
  let server: RoomServer;

  beforeEach(async () => {
    const assistant = new MeetingAssistant(new MemoryVectorStore(), createHashEmbedder(16), {
      complete: async () => ({
        text: 'Ship Thursday.',
        actions: [{ type: 'decision', text: 'Ship Thursday', owner: null }],
      }),
    });
    server = await startRoomServer(undefined, assistant);
  });

  afterEach(async () => {
    await server.stop();
  });

  it('answers the room and attaches structured actions', async () => {
    const ada = await server.join('a', 'Ada');
    const linus = await server.join('b', 'Linus');
    const done = new Promise<AssistantDone>((resolve) =>
      linus.channel.on('assistant:done', resolve),
    );
    ada.channel.emit('assistant:ask', { requestId: 'q1', question: 'What did we decide?' });

    expect(await done).toEqual({
      requestId: 'q1',
      actions: [{ type: 'decision', text: 'Ship Thursday', owner: null }],
    });
  });

  it('tells only the sender when they are no longer in the room', async () => {
    const host = await server.join('a', 'Ada');
    const guest = await server.join('b', 'Linus');
    const errors: AssistantFailure[] = [];
    guest.channel.on('assistant:error', (payload) => errors.push(payload));
    host.channel.emit('host:command', {
      targetPeerId: guest.joined.selfPeerId,
      command: { action: 'remove' },
    });
    await settle();
    guest.channel.emit('assistant:ask', { requestId: 'q2', question: 'Still there?' });
    await until(() => errors.length === 1);

    expect(errors[0].error).toMatch(/no longer in this meeting/i);
  });
});
