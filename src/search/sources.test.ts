import { describe, expect, it } from 'vitest';
import { createHashEmbedder } from './embed';
import { MemoryVectorStore } from './MemoryVectorStore';
import { indexMeeting, passagesFromMeeting } from './sources';

const corpus = {
  meetingId: 'm1',
  roomId: 'room',
  transcript: [
    {
      id: 's1',
      peerId: 'ada',
      displayName: 'Ada',
      text: 'We should slip the billing queue to Thursday.',
      startedAt: 12_000,
      endedAt: 16_000,
    },
  ],
  messages: [{ text: 'I will send the invite.', sentAt: 20_000 }],
};

describe('passagesFromMeeting', () => {
  it('keeps the speaker and the chat as separate passages', () => {
    const passages = passagesFromMeeting(corpus);
    expect(passages.map((passage) => passage.source)).toEqual(['transcript', 'chat']);
    expect(passages[0].text).toContain('Ada:');
    expect(passages[0].startMs).toBe(12_000);
    expect(passages[1].startMs).toBe(20_000);
  });

  it('skips a chat line that is only an attachment', () => {
    const passages = passagesFromMeeting({
      ...corpus,
      transcript: [],
      messages: [{ text: '', sentAt: 1 }],
    });
    expect(passages).toEqual([]);
  });
});

describe('indexMeeting', () => {
  it('writes embeddings a later query can retrieve', async () => {
    const store = new MemoryVectorStore();
    const embedder = createHashEmbedder(32);
    const written = await indexMeeting(store, embedder, corpus);
    const [query] = await embedder.embed(['billing queue Thursday']);
    const hits = await store.query(query, { meetingId: 'm1' });

    expect(written).toBeGreaterThan(0);
    expect(hits[0].text.toLowerCase()).toContain('billing');
  });
});
