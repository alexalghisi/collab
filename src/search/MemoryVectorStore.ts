import {
  DEFAULT_QUERY_LIMIT,
  cosineSimilarity,
  type QueryOptions,
  type VectorHit,
  type VectorRecord,
  type VectorStore,
} from './VectorStore';

export class MemoryVectorStore implements VectorStore {
  private readonly records = new Map<string, VectorRecord>();

  async upsert(records: VectorRecord[]): Promise<void> {
    for (const record of records) {
      this.records.set(record.id, record);
    }
  }

  async query(embedding: number[], options: QueryOptions = {}): Promise<VectorHit[]> {
    const limit = options.limit ?? DEFAULT_QUERY_LIMIT;
    const scored: VectorHit[] = [];
    for (const record of this.records.values()) {
      if (options.meetingId && record.meetingId !== options.meetingId) {
        continue;
      }
      scored.push({
        id: record.id,
        meetingId: record.meetingId,
        roomId: record.roomId,
        source: record.source,
        text: record.text,
        startMs: record.startMs,
        score: cosineSimilarity(embedding, record.embedding),
      });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
