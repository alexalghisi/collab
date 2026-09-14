export const MEETING_SOURCES = ['transcript', 'chat'] as const;
export type MeetingSource = (typeof MEETING_SOURCES)[number];

export interface VectorRecord {
  readonly id: string;
  readonly meetingId: string;
  readonly roomId: string;
  readonly source: MeetingSource;
  readonly text: string;
  readonly startMs: number;
  readonly embedding: number[];
}

export interface VectorHit {
  readonly id: string;
  readonly meetingId: string;
  readonly roomId: string;
  readonly source: MeetingSource;
  readonly text: string;
  readonly startMs: number;
  readonly score: number;
}

export interface QueryOptions {
  readonly limit?: number;
  readonly meetingId?: string;
}

/**
 * One interface, two hosted backends plus an in-process store — the same
 * split SignalingChannel uses for Firestore vs Socket.IO.
 */
export interface VectorStore {
  upsert(records: VectorRecord[]): Promise<void>;
  query(embedding: number[], options?: QueryOptions): Promise<VectorHit[]>;
}

export interface Embedder {
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export const DEFAULT_QUERY_LIMIT = 8;
export const DEFAULT_EMBEDDING_DIMENSIONS = 64;

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let left = 0;
  let right = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    left += a[index] * a[index];
    right += b[index] * b[index];
  }
  if (left === 0 || right === 0) {
    return 0;
  }
  return dot / Math.sqrt(left * right);
}
