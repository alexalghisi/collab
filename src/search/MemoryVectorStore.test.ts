import { describe, expect, it } from 'vitest';
import { createHashEmbedder } from './embed';
import { MemoryVectorStore } from './MemoryVectorStore';
import type { VectorRecord } from './VectorStore';

const embedder = createHashEmbedder(32);

async function record(id: string, text: string, meetingId = 'm1'): Promise<VectorRecord> {
  const [embedding] = await embedder.embed([text]);
  return {
    id,
    meetingId,
    roomId: 'room',
    source: 'transcript',
    text,
    startMs: 0,
    embedding,
  };
}

describe('MemoryVectorStore', () => {
  it('returns the nearest passage and hides a different meeting', async () => {
    const store = new MemoryVectorStore();
    await store.upsert([
      await record('a', 'We slipped the billing queue to Thursday.'),
      await record('b', 'The cafeteria is closed on Friday.'),
      await record('c', 'Billing is still the topic.', 'other'),
    ]);
    const [query] = await embedder.embed(['when is the billing queue']);
    const hits = await store.query(query, { limit: 2, meetingId: 'm1' });

    expect(hits).toHaveLength(2);
    expect(hits[0].id).toBe('a');
    expect(hits.every((hit) => hit.meetingId === 'm1')).toBe(true);
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it('replaces a record with the same id rather than growing duplicates', async () => {
    const store = new MemoryVectorStore();
    await store.upsert([await record('a', 'first draft')]);
    await store.upsert([await record('a', 'billing queue decision')]);
    const [query] = await embedder.embed(['billing queue']);
    const hits = await store.query(query, { limit: 5 });

    expect(hits).toHaveLength(1);
    expect(hits[0].text).toBe('billing queue decision');
  });
});
