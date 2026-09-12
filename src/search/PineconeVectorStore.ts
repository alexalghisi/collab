import {
  DEFAULT_QUERY_LIMIT,
  type QueryOptions,
  type VectorHit,
  type VectorRecord,
  type VectorStore,
} from './VectorStore';

export interface PineconeMatch {
  readonly id: string;
  readonly score?: number;
  readonly metadata?: {
    readonly meetingId?: string;
    readonly roomId?: string;
    readonly source?: VectorHit['source'];
    readonly text?: string;
    readonly startMs?: number;
  };
}

/** The Pinecone index surface this store needs; the official SDK satisfies it. */
export interface PineconeIndex {
  upsert(
    vectors: Array<{ id: string; values: number[]; metadata: PineconeMatch['metadata'] }>,
  ): Promise<unknown>;
  query(args: {
    vector: number[];
    topK: number;
    includeMetadata: boolean;
    filter?: { meetingId?: { $eq: string } };
  }): Promise<{ matches?: PineconeMatch[] }>;
}

export class PineconeVectorStore implements VectorStore {
  constructor(private readonly index: PineconeIndex) {}

  async upsert(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }
    await this.index.upsert(
      records.map((record) => ({
        id: record.id,
        values: record.embedding,
        metadata: {
          meetingId: record.meetingId,
          roomId: record.roomId,
          source: record.source,
          text: record.text,
          startMs: record.startMs,
        },
      })),
    );
  }

  async query(embedding: number[], options: QueryOptions = {}): Promise<VectorHit[]> {
    const limit = options.limit ?? DEFAULT_QUERY_LIMIT;
    const result = await this.index.query({
      vector: embedding,
      topK: limit,
      includeMetadata: true,
      filter: options.meetingId ? { meetingId: { $eq: options.meetingId } } : undefined,
    });
    return (result.matches ?? [])
      .filter((match) => match.metadata?.text && match.metadata.meetingId && match.metadata.roomId)
      .map((match) => ({
        id: match.id,
        meetingId: match.metadata?.meetingId as string,
        roomId: match.metadata?.roomId as string,
        source: match.metadata?.source ?? 'transcript',
        text: match.metadata?.text as string,
        startMs: match.metadata?.startMs ?? 0,
        score: match.score ?? 0,
      }));
  }
}
