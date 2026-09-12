import { describe, expect, it } from 'vitest';
import { PineconeVectorStore, type PineconeIndex } from './PineconeVectorStore';
import type { VectorRecord } from './VectorStore';

class ScriptedIndex implements PineconeIndex {
  upserted: Parameters<PineconeIndex['upsert']>[0] = [];
  lastQuery: Parameters<PineconeIndex['query']>[0] | null = null;
  matches: Awaited<ReturnType<PineconeIndex['query']>>['matches'] = [];

  async upsert(vectors: Parameters<PineconeIndex['upsert']>[0]): Promise<void> {
    this.upserted = vectors;
  }

  async query(args: Parameters<PineconeIndex['query']>[0]) {
    this.lastQuery = args;
    return { matches: this.matches };
  }
}

const record: VectorRecord = {
  id: 'p1',
  meetingId: 'm1',
  roomId: 'room',
  source: 'chat',
  text: 'Invite the design team.',
  startMs: 40,
  embedding: [0.2, 0.1],
};

describe('PineconeVectorStore', () => {
  it('writes values and metadata the index can filter on', async () => {
    const index = new ScriptedIndex();
    const store = new PineconeVectorStore(index);
    await store.upsert([record]);

    expect(index.upserted).toEqual([
      {
        id: 'p1',
        values: [0.2, 0.1],
        metadata: {
          meetingId: 'm1',
          roomId: 'room',
          source: 'chat',
          text: 'Invite the design team.',
          startMs: 40,
        },
      },
    ]);
  });

  it('drops a match that has no text and filters by meeting', async () => {
    const index = new ScriptedIndex();
    index.matches = [
      { id: 'empty', score: 0.99, metadata: { meetingId: 'm1' } },
      {
        id: 'p1',
        score: 0.8,
        metadata: {
          meetingId: 'm1',
          roomId: 'room',
          source: 'chat',
          text: 'Invite the design team.',
          startMs: 40,
        },
      },
    ];
    const store = new PineconeVectorStore(index);
    const hits = await store.query([0.2, 0.1], { meetingId: 'm1', limit: 4 });

    expect(index.lastQuery?.filter).toEqual({ meetingId: { $eq: 'm1' } });
    expect(hits).toEqual([
      {
        id: 'p1',
        meetingId: 'm1',
        roomId: 'room',
        source: 'chat',
        text: 'Invite the design team.',
        startMs: 40,
        score: 0.8,
      },
    ]);
  });
});
