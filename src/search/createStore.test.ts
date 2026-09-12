import { describe, expect, it } from 'vitest';
import { createVectorStore } from './createStore';
import { MemoryVectorStore } from './MemoryVectorStore';
import { PineconeVectorStore } from './PineconeVectorStore';
import { PostgresVectorStore } from './PostgresVectorStore';

describe('createVectorStore', () => {
  it('defaults to the in-process store', () => {
    expect(createVectorStore(undefined)).toBeInstanceOf(MemoryVectorStore);
    expect(createVectorStore('memory')).toBeInstanceOf(MemoryVectorStore);
  });

  it('refuses a hosted backend that was named without its client', () => {
    expect(() => createVectorStore('postgres')).toThrow(/DATABASE_URL/);
    expect(() => createVectorStore('pinecone')).toThrow(/Pinecone/);
    expect(() => createVectorStore('s3')).toThrow(/Unknown VECTOR_STORE/);
  });

  it('returns the named backend when its client is present', () => {
    const sql = { query: async () => ({ rows: [] }) };
    const pinecone = {
      upsert: async () => undefined,
      query: async () => ({ matches: [] }),
    };
    expect(createVectorStore('postgres', { sql })).toBeInstanceOf(PostgresVectorStore);
    expect(createVectorStore('pinecone', { pinecone })).toBeInstanceOf(PineconeVectorStore);
  });
});
