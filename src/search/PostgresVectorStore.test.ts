import { describe, expect, it } from 'vitest';
import { PostgresVectorStore, type SqlExecutor } from './PostgresVectorStore';
import type { VectorRecord } from './VectorStore';

class ScriptedSql implements SqlExecutor {
  readonly statements: string[] = [];
  rows: object[] = [];

  async query<T extends object>(text: string, _params?: unknown[]): Promise<{ rows: T[] }> {
    this.statements.push(text.replace(/\s+/g, ' ').trim());
    return { rows: this.rows as T[] };
  }
}

const record: VectorRecord = {
  id: 'p1',
  meetingId: 'm1',
  roomId: 'room',
  source: 'chat',
  text: 'Ship Thursday.',
  startMs: 0,
  embedding: [0.1, 0.2],
};

describe('PostgresVectorStore', () => {
  it('creates the extension and table before writing', async () => {
    const sql = new ScriptedSql();
    const store = new PostgresVectorStore(sql, 2);
    await store.upsert([record]);

    expect(sql.statements[0]).toContain('CREATE EXTENSION IF NOT EXISTS vector');
    expect(sql.statements[1]).toContain('CREATE TABLE IF NOT EXISTS meeting_chunks');
    expect(sql.statements[2]).toContain('ON CONFLICT (id) DO UPDATE');
  });

  it('filters by meeting when asked and maps the row back to a hit', async () => {
    const sql = new ScriptedSql();
    sql.rows = [
      {
        id: 'p1',
        meeting_id: 'm1',
        room_id: 'room',
        source: 'chat',
        text: 'Ship Thursday.',
        start_ms: '0',
        score: '0.91',
      },
    ];
    const store = new PostgresVectorStore(sql, 2);
    const hits = await store.query([0.1, 0.2], { meetingId: 'm1', limit: 3 });

    expect(sql.statements.at(-1)).toContain('AND meeting_id = $3');
    expect(hits).toEqual([
      {
        id: 'p1',
        meetingId: 'm1',
        roomId: 'room',
        source: 'chat',
        text: 'Ship Thursday.',
        startMs: 0,
        score: 0.91,
      },
    ]);
  });
});
