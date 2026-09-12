import {
  DEFAULT_QUERY_LIMIT,
  type QueryOptions,
  type VectorHit,
  type VectorRecord,
  type VectorStore,
} from './VectorStore';

/** The handful of SQL calls the store makes; a `pg` Pool satisfies this. */
export interface SqlExecutor {
  query<T extends object>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface ChunkRow {
  readonly id: string;
  readonly meeting_id: string;
  readonly room_id: string;
  readonly source: VectorHit['source'];
  readonly text: string;
  readonly start_ms: number | string;
  readonly score: number | string;
}

/**
 * pgvector backend. The table is created on first use so a fresh Postgres
 * does not need a separate migration step to answer a query.
 */
export class PostgresVectorStore implements VectorStore {
  constructor(
    private readonly sql: SqlExecutor,
    private readonly dimensions: number,
  ) {}

  async upsert(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }
    await this.ensureTable();
    for (const record of records) {
      await this.sql.query(
        `INSERT INTO meeting_chunks (id, meeting_id, room_id, source, text, start_ms, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
         ON CONFLICT (id) DO UPDATE SET
           meeting_id = EXCLUDED.meeting_id,
           room_id = EXCLUDED.room_id,
           source = EXCLUDED.source,
           text = EXCLUDED.text,
           start_ms = EXCLUDED.start_ms,
           embedding = EXCLUDED.embedding`,
        [
          record.id,
          record.meetingId,
          record.roomId,
          record.source,
          record.text,
          record.startMs,
          formatVector(record.embedding),
        ],
      );
    }
  }

  async query(embedding: number[], options: QueryOptions = {}): Promise<VectorHit[]> {
    await this.ensureTable();
    const limit = options.limit ?? DEFAULT_QUERY_LIMIT;
    const params: unknown[] = [formatVector(embedding), limit];
    const meetingFilter = options.meetingId
      ? (params.push(options.meetingId), 'AND meeting_id = $3')
      : '';
    const result = await this.sql.query<ChunkRow>(
      `SELECT id, meeting_id, room_id, source, text, start_ms,
              1 - (embedding <=> $1::vector) AS score
       FROM meeting_chunks
       WHERE 1 = 1 ${meetingFilter}
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      params,
    );
    return result.rows.map((row) => ({
      id: row.id,
      meetingId: row.meeting_id,
      roomId: row.room_id,
      source: row.source,
      text: row.text,
      startMs: Number(row.start_ms),
      score: Number(row.score),
    }));
  }

  private async ensureTable(): Promise<void> {
    await this.sql.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.sql.query(
      `CREATE TABLE IF NOT EXISTS meeting_chunks (
         id TEXT PRIMARY KEY,
         meeting_id TEXT NOT NULL,
         room_id TEXT NOT NULL,
         source TEXT NOT NULL,
         text TEXT NOT NULL,
         start_ms BIGINT NOT NULL,
         embedding vector(${this.dimensions}) NOT NULL
       )`,
    );
  }
}

function formatVector(values: number[]): string {
  return `[${values.join(',')}]`;
}
