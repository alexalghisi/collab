import { MemoryVectorStore } from './MemoryVectorStore';
import { PineconeVectorStore, type PineconeIndex } from './PineconeVectorStore';
import { PostgresVectorStore, type SqlExecutor } from './PostgresVectorStore';
import { DEFAULT_EMBEDDING_DIMENSIONS, type VectorStore } from './VectorStore';

export type VectorBackend = 'memory' | 'postgres' | 'pinecone';

export interface StoreDependencies {
  readonly sql?: SqlExecutor;
  readonly pinecone?: PineconeIndex;
  readonly dimensions?: number;
}

/**
 * Picks a store the way `createSignaling` picks a transport: one interface,
 * the backend named in VECTOR_STORE (memory when unset).
 */
export function createVectorStore(
  backend: VectorBackend | string | undefined,
  deps: StoreDependencies = {},
): VectorStore {
  const dimensions = deps.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
  switch (backend) {
    case 'postgres':
      if (!deps.sql) {
        throw new Error('VECTOR_STORE=postgres needs a SQL client (DATABASE_URL).');
      }
      return new PostgresVectorStore(deps.sql, dimensions);
    case 'pinecone':
      if (!deps.pinecone) {
        throw new Error('VECTOR_STORE=pinecone needs a Pinecone index.');
      }
      return new PineconeVectorStore(deps.pinecone);
    case 'memory':
    case undefined:
    case '':
      return new MemoryVectorStore();
    default:
      throw new Error(`Unknown VECTOR_STORE "${backend}". Use memory, postgres or pinecone.`);
  }
}
